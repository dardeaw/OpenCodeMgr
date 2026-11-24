// src/services/calibration-service.mjs
// First-Launch-Upgrade Calibration Service (v1.14.0)
//
// Problem: users upgrade the manager across versions that change what a
// "disable" means (v1.13 file-level plugins, v2-native MCP shape). Legacy
// settings keep working by accident on some setups and silently break on
// others (a flat `mcp.<id>.enabled:false` is ignored by opencode v2 while
// its twin `mcp.servers.<id>.disabled` is honored).
//
// This service runs once per manager version at server startup (and on
// demand via /api/recalibrate): it audits every reachable node and
// auto-migrates ONLY unambiguous dead settings, reporting everything else.
// It never deletes user files: twins and dangling refs are reported, not
// removed. All jsonc writes go through updateNodeJsonc (automatic .bak).

import fs from 'node:fs';
import path from 'node:path';
import {
  MANAGER_ROOT_DIR,
  getNode,
  loadNodes,
  detectNodeOpenCodeVersion
} from '../core/node-transport.mjs';
import { getNodeConfigSnapshot, testNode } from './node-service.mjs';
import { updateNodeJsonc } from './shared-config.mjs';

const STATE_FILE = path.join(MANAGER_ROOT_DIR, '.mgr-calibration.json');

export function managerVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MANAGER_ROOT_DIR, 'package.json'), 'utf-8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.warn('[calibration] Failed to persist state:', err.message);
  }
}

/**
 * Audit one node. Returns a per-node entry for the report.
 */
async function calibrateNode(node) {
  const entry = { ok: false, version: null, isV2: null };
  if (node.type !== 'local') {
    const t = await testNode(node.id);
    if (!t || !t.ok) {
      entry.skipped = 'unreachable';
      return entry;
    }
  }
  const { version, isV2 } = await detectNodeOpenCodeVersion(node);
  entry.version = version;
  entry.isV2 = isV2;

  const snap = await getNodeConfigSnapshot(node.id);
  const plugins = Array.isArray(snap.plugins) ? snap.plugins : [];
  entry.plugins = {
    total: plugins.length,
    twins: plugins.filter(p => p.twin).map(p => p.filename),
    unlistedActive: plugins.filter(p => p.enabled && !p.listed).length,
    disabled: plugins.filter(p => !p.enabled).length,
    dangling: []
  };
  const seenFiles = new Set(plugins.map(p => p.filename));
  const configured = Array.isArray(snap.config && snap.config.plugin) ? snap.config.plugin : [];
  for (const ref of configured) {
    const base = String(ref).split('/').pop().split('\\').pop();
    const canon = base.endsWith('.disabled') ? base.slice(0, -'.disabled'.length) : base;
    if (canon && !seenFiles.has(canon)) entry.plugins.dangling.push(String(ref));
  }

  entry.mcp = { migrated: [], conflicts: [] };
  entry.needRestart = false;
  if (isV2) {
    const mcp = (snap.config && snap.config.mcp && typeof snap.config.mcp === 'object') ? snap.config.mcp : {};
    const todos = [];
    for (const [id, spec] of Object.entries(mcp)) {
      if (id === 'servers' || id === 'timeout') continue;
      if (!spec || typeof spec !== 'object') continue;
      if (spec.enabled === false || spec.disabled === true) todos.push(id);
    }
    if (todos.length > 0) {
      await updateNodeJsonc(getNode(node.id), (parsed) => {
        if (!parsed.mcp || typeof parsed.mcp !== 'object') parsed.mcp = {};
        if (!parsed.mcp.servers || typeof parsed.mcp.servers !== 'object') parsed.mcp.servers = {};
        for (const id of todos) {
          const legacy = (parsed.mcp && parsed.mcp[id] && typeof parsed.mcp[id] === 'object') ? parsed.mcp[id] : {};
          if (parsed.mcp.servers[id] && typeof parsed.mcp.servers[id] === 'object') {
            // Both shapes present: the native entry is what opencode reads,
            // so keep it and drop the inert flat twin.
            entry.mcp.conflicts.push(id);
          } else {
            const { enabled: _e, disabled: _d, node: _n, id: _i, action: _a, ...rest } = legacy;
            parsed.mcp.servers[id] = { ...rest, disabled: true };
            entry.mcp.migrated.push(id);
          }
          delete parsed.mcp[id];
        }
      });
      entry.needRestart = true;
    }
  }
  entry.ok = true;
  return entry;
}

/**
 * Run calibration across all nodes. Nodes are calibrated in parallel so one
 * hanging ssh target cannot stall the whole fleet; each node additionally
 * gets an overall timeout and is reported as timeout instead of hanging the
 * report. Unreachable remotes are skipped (not failed).
 */
export async function runCalibration(opts = {}) {
  const t0 = Date.now();
  const nodes = loadNodes();
  const NODE_TIMEOUT_MS = Number(opts.nodeTimeoutMs || 120000);
  const jobs = nodes.map((node) => (async () => {
    try {
      const entry = await Promise.race([
        calibrateNode(node),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error(`node calibration timeout after ${NODE_TIMEOUT_MS}ms`)),
          NODE_TIMEOUT_MS
        ))
      ]);
      return [node.id, entry];
    } catch (err) {
      const msg = String((err && err.message) || err).slice(0, 300);
      // Timeouts are transient reachability issues, not config errors:
      // report them as skipped so the UI banner doesn't cry wolf.
      if (/timeout after \d+ms/.test(msg)) {
        return [node.id, { ok: false, skipped: 'timeout', error: msg }];
      }
      return [node.id, { ok: false, error: msg }];
    }
  })());
  const settled = await Promise.all(jobs);
  const report = {
    managerVersion: managerVersion(),
    ranAt: new Date().toISOString(),
    forced: !!opts.force,
    nodes: {}
  };
  for (const [id, entry] of settled) report.nodes[id] = entry;
  report.durationMs = Date.now() - t0;
  writeState({ version: report.managerVersion, ranAt: report.ranAt, report });
  return report;
}

/**
 * Startup entry: calibrate once per manager version. Never throws and never
 * blocks server boot; a failed run is NOT stamped so it retries next launch.
 */
export async function maybeRunStartupCalibration() {
  try {
    const v = managerVersion();
    const st = readState();
    if (st && st.version === v && st.report) {
      return { ran: false, reason: 'up-to-date', version: v };
    }
    console.log(`[calibration] First launch of v${v}: auditing nodes...`);
    const report = await runCalibration();
    const pending = Object.values(report.nodes || {}).filter(
      n => n && !n.skipped && (n.error || (n.plugins && n.plugins.twins && n.plugins.twins.length > 0))
    ).length;
    console.log(`[calibration] Done in ${report.durationMs}ms, nodes with attention: ${pending}`);
    return { ran: true, version: v, report };
  } catch (err) {
    console.warn('[calibration] Startup calibration failed (will retry next launch):', err.message);
    return { ran: false, error: String((err && err.message) || err).slice(0, 200) };
  }
}

/**
 * Last calibration state for the UI banner (no audit performed here).
 */
export async function getCalibrationReport() {
  const st = readState();
  return {
    version: managerVersion(),
    calibratedVersion: (st && st.version) || null,
    ranAt: (st && st.ranAt) || null,
    report: (st && st.report) || null
  };
}
