// src/services/node-service.mjs
// Node Fleet Management & Full Node Configuration Snapshot Service

import fs from 'node:fs';
import path from 'node:path';
import {
  loadNodes,
  saveNodes,
  getNode,
  getNodePaths,
  runNodeCmd,
  readNodeFile,
  runDbHelperOnNode,
  detectNodeOpenCodeVersion
} from '../core/node-transport.mjs';
import {
  parseAgentMarkdown,
  parseTrimTools,
  stripMgrScopeWrapper,
  extractPluginSummary
} from '../core/parsers.mjs';
import { readNodeJsonc, readPluginScopes } from './shared-config.mjs';
import { listSkills } from './skill-service.mjs';

export function listNodes() {
  return loadNodes();
}

export function getNodeById(nodeId = 'local') {
  return getNode(nodeId);
}

export async function testNode(nodeId = 'local') {
  const targetNode = getNode(nodeId);
  try {
    if (targetNode.type === 'local') {
      return { ok: true, node: targetNode.id };
    }
    await runNodeCmd(targetNode, 'echo ping');
    return { ok: true, node: targetNode.id };
  } catch (err) {
    return { ok: false, node: targetNode.id, error: err.message };
  }
}

export function upsertNode(data) {
  if (!data || !data.id) throw new Error('Missing node id');
  const nodes = loadNodes();
  const idx = nodes.findIndex(n => n.id === data.id);
  if (idx >= 0) {
    nodes[idx] = { ...nodes[idx], ...data };
  } else {
    nodes.push(data);
  }
  saveNodes(nodes);
  return { ok: true, node: data.id };
}

export function removeNode(nodeId) {
  if (!nodeId || nodeId === 'local') {
    throw new Error('Cannot delete local node');
  }
  const nodes = loadNodes().filter(n => n.id !== nodeId || n.id === 'local');
  saveNodes(nodes);
  return { ok: true };
}

export async function getNodeConfigSnapshot(nodeId = 'local') {
  const node = getNode(nodeId);
  const paths = getNodePaths(node);
  const { sep, promptLocal, promptGlobal, promptSsh, agentDir, pluginDir, trimTools, cliFile, tuiFile } = paths;

  const { raw: rawJsonc, parsed } = await readNodeJsonc(node);
  const localPrompt = await readNodeFile(node, promptLocal);
  const globalPrompt = await readNodeFile(node, promptGlobal);
  const sshPrompt = node.type === 'local' ? null : await readNodeFile(node, promptSsh);
  const cliRaw = await readNodeFile(node, cliFile);
  const tuiRaw = await readNodeFile(node, tuiFile);

  // Agents (support both agent/ and agents/ layouts, plus inline opencode.jsonc "agent" definitions)
  const agentList = [];
  const seenAgentIds = new Set();
  const agentDirs = [agentDir, paths.agentDirAlt].filter(Boolean);
  if (node.type === 'local') {
    for (const dir of agentDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        const agent = parseAgentMarkdown(content, f);
        seenAgentIds.add(agent.id);
        agentList.push(agent);
      }
    }
  } else {
    const lsCmds = agentDirs.map(d => `ls -1 "${d}"/*.md 2>/dev/null || true`).join('; ');
    const lsOut = await runNodeCmd(node, lsCmds);
    const files = lsOut.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const fullPath of files) {
      const f = fullPath.split('/').pop();
      const content = await readNodeFile(node, fullPath);
      const agent = parseAgentMarkdown(content, f);
      seenAgentIds.add(agent.id);
      agentList.push(agent);
    }
  }

  // Inline agent roles defined in opencode.jsonc. v2 uses the plural `agents`
  // map with renamed fields (prompt->system, disable->disabled); pre-v2 uses
  // the singular `agent`. Merge both so a mid-migration file shows every role.
  const jsoncAgents = {};
  for (const [aid, spec] of Object.entries(parsed && typeof parsed.agent === 'object' && parsed.agent !== null ? parsed.agent : {})) {
    jsoncAgents[aid] = { legacy: true, ...(spec && typeof spec === 'object' ? spec : {}) };
  }
  for (const [aid, spec] of Object.entries(parsed && typeof parsed.agents === 'object' && parsed.agents !== null ? parsed.agents : {})) {
    jsoncAgents[aid] = { legacy: false, ...(spec && typeof spec === 'object' ? spec : {}) };
  }
  for (const [aid, specObj] of Object.entries(jsoncAgents)) {
    if (seenAgentIds.has(aid)) continue;
    let description = String(specObj.description || '');
    let prompt = '';
    // v2 stores the system prompt under `system`; v1 under `prompt`.
    const rawPrompt = String((specObj.legacy ? specObj.prompt : specObj.system) || '');
    const fileRef = rawPrompt.match(/^\{file:([^}]+)\}$/);
    if (fileRef) {
      try {
        const refPath = path.isAbsolute(fileRef[1]) ? fileRef[1] : path.join(configDir, fileRef[1]);
        prompt = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf-8') : rawPrompt;
      } catch {
        prompt = rawPrompt;
      }
    } else {
      prompt = rawPrompt;
    }
    // disabled(v2) / disable(v1) -> enabled flag for the UI.
    const disabledFlag = specObj.legacy ? specObj.disable : specObj.disabled;
    agentList.push({
      id: aid,
      filename: `${aid} (opencode.jsonc)`,
      inline: true,
      mode: String(specObj.mode || 'all'),
      model: String(specObj.model || ''),
      enabled: disabledFlag === undefined ? true : !disabledFlag,
      description,
      prompt,
      permissions: specObj.permission && typeof specObj.permission === 'object' ? specObj.permission : {},
      limit: specObj.limit || null
    });
  }

  // Trim-tools descriptions
  const trimToolsRaw = await readNodeFile(node, trimTools);
  const tools = parseTrimTools(trimToolsRaw);

  // Plugin scopes
  const pluginScopes = await readPluginScopes(node);

  // Plugins
  // v1.13.0: opencode loads every *.js/*.mjs in the plugin dirs at startup
  // regardless of jsonc list membership (verified on v2.1.4), and a rename to
  // `*.js.disabled` unloads the file after restart. The snapshot therefore
  // reports file-level truth: a `.disabled` variant (with no active twin)
  // means disabled; an active file on a v2 node means enabled even when it
  // is absent from the jsonc order list (auto-loaded). On pre-v2 nodes the
  // legacy semantic (enabled == listed) is kept.
  let nodeIsV2 = false;
  try { nodeIsV2 = (await detectNodeOpenCodeVersion(node)).isV2; } catch {}
  const configuredPlugins = Array.isArray(parsed.plugin) ? parsed.plugin : [];
  const enabledPluginFiles = configuredPlugins.map(p => String(p).split('/').pop().split('\\').pop());

  const stripDisabledSuffix = (fn) => fn.endsWith('.disabled') ? fn.slice(0, -'.disabled'.length) : fn;
  const isDisabledFile = (fn) => fn.endsWith('.disabled');
  const pluginList = [];
  // canonical name -> { fullPath, disabledVariant, twin }; an active *.js
  // twin always wins over a stale *.js.disabled twin when both exist (twin
  // flags the ambiguity for the upgrade calibration report).
  const seenPlugin = new Map();
  const notePluginFile = (canonical, fullPath, disabledVariant) => {
    const prev = seenPlugin.get(canonical);
    if (!prev) {
      seenPlugin.set(canonical, { fullPath, disabledVariant, twin: false });
    } else if (prev.disabledVariant !== disabledVariant) {
      // Both variants exist: keep the active file for content, flag the twin.
      if (!disabledVariant) {
        seenPlugin.set(canonical, { fullPath, disabledVariant, twin: true });
      } else {
        prev.twin = true;
      }
    }
  };
  const pluginDirs = [pluginDir, paths.pluginDirAlt].filter(Boolean);
  if (node.type === 'local') {
    for (const dir of pluginDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f === '_mgr_scope.js' || f.includes('.bak')) continue;
        if (!(f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.disabled'))) continue;
        notePluginFile(stripDisabledSuffix(f), path.join(dir, f), isDisabledFile(f));
      }
    }
  } else if (node.type !== 'local' && paths.isWindows) {
    // Windows remote over ssh (cmd.exe): list candidates, filter by
    // extension in JS since `dir` also reports its own "File Not Found".
    const lsCmds = pluginDirs.map(d => `dir /b "${d}\\*.js" "${d}\\*.mjs" "${d}\\*.disabled" 2>nul`).join(' & ');
    const lsP = await runNodeCmd(node, lsCmds);
    for (const fp of lsP.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
      if (!fp.endsWith('.js') && !fp.endsWith('.mjs') && !fp.endsWith('.disabled')) continue;
      const fn = fp.split('\\').pop().split('/').pop();
      if (fn === '_mgr_scope.js' || fn.includes('.bak')) continue;
      // dir /b prints bare names: re-anchor under the scanned dir.
      const dir = pluginDirs.find(d => fp.toLowerCase().includes(d.toLowerCase())) || pluginDirs[0];
      const full = fp.includes(':') || fp.startsWith('\\\\') ? fp : `${dir}${paths.sep}${fn}`;
      notePluginFile(stripDisabledSuffix(fn), full, isDisabledFile(fn));
    }
  } else {
    const lsCmds = pluginDirs.map(d => `ls -1 "${d}"/*.js "${d}"/*.mjs "${d}"/*.disabled 2>/dev/null || true`).join('; ');
    const lsP = await runNodeCmd(node, lsCmds);
    for (const fp of lsP.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
      const fn = fp.split('/').pop();
      if (fn === '_mgr_scope.js' || fn.includes('.bak')) continue;
      notePluginFile(stripDisabledSuffix(fn), fp, isDisabledFile(fn));
    }
  }

  for (const [canonical, pf] of seenPlugin) {
    const rawCode = await readNodeFile(node, pf.fullPath);
    const cleanCode = stripMgrScopeWrapper(rawCode);
    const enabledIdx = enabledPluginFiles.indexOf(canonical);
    const listed = enabledIdx !== -1;
    // A lone `.disabled` file is always off. An active file on v2 is on
    // (auto-loaded at startup); on v1 it follows the jsonc list.
    const enabled = pf.disabledVariant ? false : (nodeIsV2 ? true : listed);
    const scopeObj = pluginScopes[canonical] || { mode: 'all', agents: [] };
    pluginList.push({
      id: canonical.replace(/\.(m?js)$/, ''),
      filename: canonical,
      enabled,
      listed,
      disabledFile: pf.disabledVariant,
      twin: !!pf.twin,
      order: listed ? enabledIdx : 999,
      scope: scopeObj,
      description: cleanCode ? extractPluginSummary(cleanCode, canonical) : '',
      content: cleanCode
    });
  }
  pluginList.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.filename.localeCompare(b.filename)));

  let skillList = [];
  try {
    skillList = await listSkills(node.id);
  } catch (e) {
    console.warn(`[node-service] skill list fetch failed on ${node.id}:`, e.message);
  }

  let providersMeta = { auth: {}, catalog: {} };
  try {
    providersMeta = await runDbHelperOnNode(node, ['providers-meta']);
  } catch (e) {
    console.warn(`[node-service] providers-meta fetch failed on ${node.id}:`, e.message);
  }

  let opencodeVersionInfo = { version: '1.19.4', isV2: nodeIsV2, v2Ready: true };
  try {
    opencodeVersionInfo = await detectNodeOpenCodeVersion(node);
  } catch {}

  return {
    node: node.id,
    name: node.name,
    ip: node.ip,
    opencodeVersion: opencodeVersionInfo.version,
    isV2: opencodeVersionInfo.isV2,
    v2Ready: true,
    config: parsed,
    rawJsonc,
    cliConfig: cliRaw ? { raw: cliRaw } : null,
    tuiConfig: tuiRaw ? { raw: tuiRaw } : null,
    providersMeta,
    systemPrompts: {
      local: { name: 'AGENTS.local.md', content: localPrompt },
      global: { name: 'AGENTS.md', content: globalPrompt },
      ssh: { name: 'SSH_WORKFLOW.md', content: sshPrompt }
    },
    agents: agentList,
    skills: skillList,
    plugins: pluginList,
    pluginScopes,
    tools
  };
}
