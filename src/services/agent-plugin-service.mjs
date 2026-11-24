// src/services/agent-plugin-service.mjs
// System Prompts, Custom Agents, Core Agents, MCP Servers, Plugins, Tools & Raw JSONC Service

import {
  getNode,
  getNodePaths,
  runNodeCmd,
  readNodeFile,
  writeNodeFile,
  deleteNodeFile,
  renameNodeFile,
  nodeFileExists,
  ensureNodeDir,
  detectNodeOpenCodeVersion
} from '../core/node-transport.mjs';
import {
  parseJsonc,
  serializeAgentMarkdown,
  serializeTrimTools,
  applyMgrScopeWrapper
} from '../core/parsers.mjs';
import {
  updateNodeJsonc,
  readNodeJsonc,
  readPluginScopes,
  writePluginScopes
} from './shared-config.mjs';

// ============================================================================
// 1. System Prompts
// ============================================================================

export async function saveSystemPrompt(nodeId = 'local', type = 'local', content = '') {
  const node = getNode(nodeId);
  const { promptLocal, promptGlobal, promptSsh } = getNodePaths(node);
  let target = promptLocal;
  if (type === 'global') target = promptGlobal;
  else if (type === 'ssh') target = promptSsh;

  await writeNodeFile(node, target, String(content ?? ''));
  return { ok: true, type };
}

// ============================================================================
// 2. Agents & Core Agent Settings
// ============================================================================

export async function saveAgent(nodeId = 'local', data = {}) {
  if (!data.id) throw new Error('Missing agent id');
  const node = getNode(nodeId);
  const { sep, agentDir, pluginDir } = getNodePaths(node);
  const target = `${agentDir}${sep}${data.id}.md`;
  const content = serializeAgentMarkdown(data);
  await writeNodeFile(node, target, content);

  // Sync per-agent plugin states if provided
  if (data.pluginStates && typeof data.pluginStates === 'object') {
    const scopes = await readPluginScopes(node);

    for (const [pFilename, isAllowed] of Object.entries(data.pluginStates)) {
      let rule = scopes[pFilename] || { mode: 'all', agents: [] };
      const agList = new Set(Array.isArray(rule.agents) ? rule.agents : []);
      if (rule.mode === 'all') {
        if (!isAllowed) {
          rule = { mode: 'exclude', agents: [data.id] };
        }
      } else if (rule.mode === 'exclude') {
        if (isAllowed) agList.delete(data.id);
        else agList.add(data.id);
        rule.agents = Array.from(agList);
        if (rule.agents.length === 0) rule.mode = 'all';
      } else if (rule.mode === 'include') {
        if (isAllowed) agList.add(data.id);
        else agList.delete(data.id);
        rule.agents = Array.from(agList);
      }
      scopes[pFilename] = rule;

      const pFile = `${pluginDir}${sep}${pFilename}`;
      const pRaw = await readNodeFile(node, pFile);
      if (pRaw) {
        const wrapped = applyMgrScopeWrapper(pRaw, pFilename, rule);
        if (wrapped !== pRaw) await writeNodeFile(node, pFile, wrapped);
      }
    }

    await writePluginScopes(node, scopes);
  }

  return { ok: true, id: data.id };
}

export async function deleteAgent(nodeId = 'local', agentId) {
  if (!agentId) throw new Error('Missing agent id');
  const node = getNode(nodeId);
  const { sep, agentDir } = getNodePaths(node);
  const target = `${agentDir}${sep}${agentId}.md`;
  await deleteNodeFile(node, target);
  return { ok: true, id: agentId };
}

// ============================================================================
// 3. MCP Servers
// ============================================================================

// ============================================================================
// 3. MCP Servers
// ============================================================================
// NOTE (v1.13.0 audit): opencode v2 ignores the legacy `enabled` flag on flat
// `mcp.<id>` entries entirely (verified on v2.1.4: `enabled:false` still shows
// "connected" in `opencode mcp list`). v2 requires the native shape
// `mcp.servers.<id>.disabled`. This writer is version-aware: v1 keeps the
// legacy flat shape, v2 writes the native shape and drops the legacy twin so
// both shapes never coexist for the same server id.

export async function saveMcpServer(nodeId = 'local', data = {}) {
  if (!data.id) throw new Error('Missing MCP server id');
  const node = getNode(nodeId);
  let isV2 = false;
  try { isV2 = (await detectNodeOpenCodeVersion(node)).isV2; } catch {}
  await updateNodeJsonc(node, (parsed) => {
    if (!parsed.mcp || typeof parsed.mcp !== 'object') parsed.mcp = {};
    if (isV2) {
      if (!parsed.mcp.servers || typeof parsed.mcp.servers !== 'object') parsed.mcp.servers = {};
      const { node: _node, id: _id, action: _action, enabled, ...rest } = data;
      const entry = { ...rest };
      if (entry.enabled !== undefined) delete entry.enabled;
      if (entry.disabled === undefined) entry.disabled = enabled === false;
      if (!entry.type) entry.type = 'local';
      parsed.mcp.servers[data.id] = entry;
      if (parsed.mcp[data.id] && typeof parsed.mcp[data.id] === 'object') {
        delete parsed.mcp[data.id];
      }
    } else {
      const entry = {
        type: data.type || 'local',
        command: data.command,
        enabled: data.enabled !== false
      };
      if (data.timeout) entry.timeout = data.timeout;
      if (data.url) entry.url = data.url;
      if (data.environment) entry.environment = data.environment;
      parsed.mcp[data.id] = entry;
    }
  });
  return { ok: true, id: data.id, isV2, needRestart: true };
}

export async function deleteMcpServer(nodeId = 'local', mcpId) {
  if (!mcpId) throw new Error('Missing MCP server id');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (parsed.mcp && parsed.mcp[mcpId]) {
      delete parsed.mcp[mcpId];
    }
    if (parsed.mcp && parsed.mcp.servers && parsed.mcp.servers[mcpId]) {
      delete parsed.mcp.servers[mcpId];
    }
  });
  return { ok: true, id: mcpId, needRestart: true };
}

// ============================================================================
// 4. Plugins & Per-Agent Scope
// ============================================================================
// NOTE (v1.13.0 audit): merely removing a plugin from the `plugin` array in
// opencode.jsonc does NOT unload it. Verified on opencode v2.1.4: every
// `*.js`/`*.mjs` under `plugin/` (and `plugins/`) is loaded at opencode
// startup regardless of list membership (an unlisted ps-guard.js kept
// intercepting tool calls in a session started after its removal), and new
// files are not hot-loaded. Real disable therefore = rename the file to
// `<name>.js.disabled` (opencode only loads *.js/*.mjs) + restart opencode.
// The `plugin` array is kept in sync as load ORDER metadata only.

// Suffix that unloads a plugin file: opencode only loads *.js / *.mjs.
export const DISABLED_SUFFIX = '.disabled';

function canonicalPluginName(filename) {
  let fn = String(filename || '').split('/').pop().split('\\').pop().trim();
  if (fn.endsWith(DISABLED_SUFFIX)) fn = fn.slice(0, -DISABLED_SUFFIX.length);
  return fn;
}

function pluginListRef(filename) {
  return `./plugin/${filename}`;
}

function syncPluginListRef(parsed, filename, enabled) {
  if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
  const idx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
  if (enabled && idx === -1) {
    parsed.plugin.push(pluginListRef(filename));
  } else if (!enabled && idx !== -1) {
    parsed.plugin.splice(idx, 1);
  }
}

/**
 * Locate a plugin's live files on a node. Returns canonical filename, the
 * directory holding it, and which variants exist.
 */
async function resolvePluginFiles(node, filename) {
  const canonical = canonicalPluginName(filename);
  if (!canonical) throw new Error('Missing plugin filename');
  const { sep, pluginDir, pluginDirAlt } = getNodePaths(node);
  const dirs = [pluginDir];
  if (pluginDirAlt && pluginDirAlt !== pluginDir) dirs.push(pluginDirAlt);
  let dir = pluginDir;
  let activeExists = false;
  let disabledExists = false;
  for (const d of dirs) {
    const a = `${d}${sep}${canonical}`;
    const x = `${a}${DISABLED_SUFFIX}`;
    const [hasA, hasX] = await Promise.all([nodeFileExists(node, a), nodeFileExists(node, x)]);
    if (hasA || hasX) {
      dir = d;
      activeExists = hasA;
      disabledExists = hasX;
      break;
    }
  }
  return {
    canonical,
    dir,
    sep,
    activePath: `${dir}${sep}${canonical}`,
    disabledPath: `${dir}${sep}${canonical}${DISABLED_SUFFIX}`,
    activeExists,
    disabledExists
  };
}

/**
 * Single writer for file-level enable/disable. Enable: rename
 * `<name>.js.disabled` back to `<name>.js`. Disable: rename `<name>.js` to
 * `<name>.js.disabled`. The jsonc `plugin` array is synced as order metadata.
 * Takes effect after an opencode restart (plugins load at startup).
 */
async function setPluginEnabled(node, canonical, enabled) {
  const r = await resolvePluginFiles(node, canonical);
  if (enabled) {
    if (r.disabledExists) {
      await renameNodeFile(node, r.disabledPath, r.activePath);
    }
  } else {
    if (r.activeExists) {
      await renameNodeFile(node, r.activePath, r.disabledPath);
    }
  }
  await updateNodeJsonc(node, (parsed) => {
    syncPluginListRef(parsed, r.canonical, enabled);
  });
  return r;
}

export async function savePlugin(nodeId = 'local', data = {}) {
  let filename = canonicalPluginName(data.filename);
  if (!filename) throw new Error('Missing plugin filename');
  if (!filename.endsWith('.js') && !filename.endsWith('.mjs')) filename += '.js';

  const node = getNode(nodeId);
  const { sep, pluginDir } = getNodePaths(node);

  await ensureNodeDir(node, pluginDir);

  const scopes = await readPluginScopes(node);
  const scopeRule = data.scope || { mode: 'all', agents: [] };
  if (!scopeRule.mode || scopeRule.mode === 'all' || !Array.isArray(scopeRule.agents) || scopeRule.agents.length === 0) {
    scopes[filename] = { mode: 'all', agents: [] };
  } else {
    scopes[filename] = scopeRule;
  }
  await writePluginScopes(node, scopes);

  const enabled = data.enabled !== false;
  const r = await resolvePluginFiles(node, filename);
  // Target path follows the enabled flag: disabled content lives in the
  // `.disabled` file so a save can never silently re-activate a plugin.
  const targetPath = enabled ? r.activePath : r.disabledPath;
  if (data.content !== undefined) {
    const finalCode = applyMgrScopeWrapper(data.content, filename, scopes[filename]);
    await writeNodeFile(node, targetPath, finalCode);
  } else {
    const existingCode = (r.activeExists && enabled)
      ? await readNodeFile(node, r.activePath)
      : (r.disabledExists ? await readNodeFile(node, r.disabledPath) : '');
    if (existingCode) {
      const finalCode = applyMgrScopeWrapper(existingCode, filename, scopes[filename]);
      await writeNodeFile(node, targetPath, finalCode);
    }
  }
  // Rename AFTER writing so no window exists where the file is missing, and
  // sync the jsonc order list.
  await setPluginEnabled(node, filename, enabled);

  return { ok: true, filename, enabled, needRestart: true };
}

export async function togglePlugin(nodeId = 'local', filename, enabled = true) {
  if (!canonicalPluginName(filename)) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  const r = await setPluginEnabled(node, canonicalPluginName(filename), !!enabled);
  return { ok: true, filename: r.canonical, enabled: !!enabled, needRestart: true };
}

export async function reorderPlugin(nodeId = 'local', filename, delta = 0) {
  const canonical = canonicalPluginName(filename);
  if (!canonical) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
    const idx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === canonical);
    if (idx !== -1) {
      const targetIdx = idx + Number(delta || 0);
      if (targetIdx >= 0 && targetIdx < parsed.plugin.length) {
        const tmp = parsed.plugin[idx];
        parsed.plugin[idx] = parsed.plugin[targetIdx];
        parsed.plugin[targetIdx] = tmp;
      }
    }
  });
  return { ok: true, filename: canonical };
}

export async function deletePlugin(nodeId = 'local', filename) {
  const canonical = canonicalPluginName(filename);
  if (!canonical) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  const r = await resolvePluginFiles(node, canonical);

  if (r.activeExists) await deleteNodeFile(node, r.activePath);
  if (r.disabledExists) await deleteNodeFile(node, r.disabledPath);

  await updateNodeJsonc(node, (parsed) => {
    if (Array.isArray(parsed.plugin)) {
      parsed.plugin = parsed.plugin.filter(p => String(p).split('/').pop().split('\\').pop() !== canonical);
    }
  });

  return { ok: true, filename: canonical };
}

// ============================================================================
// 5. Tools, Bash Permissions & Raw JSONC
// ============================================================================

export async function saveTrimTools(nodeId = 'local', toolsMap = {}) {
  const node = getNode(nodeId);
  const { trimTools } = getNodePaths(node);
  const orig = await readNodeFile(node, trimTools);
  const updatedContent = serializeTrimTools(orig, toolsMap);
  await writeNodeFile(node, trimTools, updatedContent);
  return { ok: true };
}

export async function saveBashPermissions(nodeId = 'local', denyList = [], askList = []) {
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!parsed.permission) parsed.permission = {};
    const newBash = {};
    for (const k of denyList) {
      if (k && k.trim()) newBash[k.trim()] = 'deny';
    }
    for (const k of askList) {
      if (k && k.trim()) newBash[k.trim()] = 'ask';
    }
    parsed.permission.bash = newBash;
  });
  return { ok: true };
}

export async function saveRawJsonc(nodeId = 'local', content = '') {
  const node = getNode(nodeId);
  const { cfgFile } = getNodePaths(node);
  if (!parseJsonc(content)) {
    throw new Error('Invalid JSON / JSONC syntax');
  }
  await writeNodeFile(node, cfgFile, content);
  return { ok: true };
}

// ============================================================================
// 7. Global Advanced Settings (logLevel / snapshots / shell / instructions /
//    attachment.image / permission.doom_loop / compaction policy)
// ----------------------------------------------------------------------------
// These are top-level opencode.jsonc keys that previously had NO structured UI
// (only the raw text editor). This section reads/patches them surgically via
// updateNodeJsonc so unrelated config is preserved untouched.
// ============================================================================

/** Read the 7 advanced global settings for display. */
export async function getAdvancedSettings(nodeId = 'local') {
  const node = getNode(nodeId);
  const { parsed } = await readNodeJsonc(node);
  const comp = (parsed.compaction && typeof parsed.compaction === 'object') ? parsed.compaction : {};
  const img = (parsed.attachment && parsed.attachment.image && typeof parsed.attachment.image === 'object')
    ? parsed.attachment.image : {};
  return {
    logLevel: parsed.logLevel || '',
    snapshots: parsed.snapshots === undefined ? null : !!parsed.snapshots,
    shell: parsed.shell || '',
    instructions: Array.isArray(parsed.instructions) ? parsed.instructions.slice() : [],
    attachmentImage: {
      auto_resize: img.auto_resize === undefined ? null : !!img.auto_resize,
      max_width: img.max_width ?? null,
      max_height: img.max_height ?? null,
      max_base64_bytes: img.max_base64_bytes ?? null
    },
    doomLoop: (parsed.permission && typeof parsed.permission === 'object') ? (parsed.permission.doom_loop || '') : '',
    compactionPolicy: {
      auto: comp.auto === undefined ? null : !!comp.auto,
      tail_turns: comp.tail_turns ?? null,
      prune: comp.prune === undefined ? null : !!comp.prune,
      reserved: comp.reserved ?? null
    }
  };
}

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const SHELLS = ['powershell', 'bash', 'zsh', 'cmd'];
const PERM_MODES = ['allow', 'ask', 'deny'];

function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Patch only the provided advanced-global keys; leave everything else intact. */
export async function saveAdvancedSettings(nodeId = 'local', adv = {}) {
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    // logLevel
    if (adv.logLevel !== undefined) {
      if (LOG_LEVELS.includes(adv.logLevel)) parsed.logLevel = adv.logLevel;
      else delete parsed.logLevel;
    }
    // snapshots
    if (adv.snapshots !== undefined && adv.snapshots !== null && adv.snapshots !== '') {
      parsed.snapshots = !!adv.snapshots;
    }
    // shell
    if (adv.shell !== undefined) {
      const sh = String(adv.shell).trim();
      if (sh) parsed.shell = sh; else delete parsed.shell;
    }
    // instructions (array of paths)
    if (adv.instructions !== undefined) {
      const list = Array.isArray(adv.instructions)
        ? adv.instructions.map(s => String(s).trim()).filter(Boolean)
        : [];
      if (list.length) parsed.instructions = list; else delete parsed.instructions;
    }
    // attachment.image
    if (adv.attachmentImage !== undefined) {
      const ai = adv.attachmentImage || {};
      const next = {};
      if (ai.auto_resize !== undefined && ai.auto_resize !== null && ai.auto_resize !== '') next.auto_resize = !!ai.auto_resize;
      const mw = toIntOrNull(ai.max_width); if (mw !== null) next.max_width = mw;
      const mh = toIntOrNull(ai.max_height); if (mh !== null) next.max_height = mh;
      const mb = toIntOrNull(ai.max_base64_bytes); if (mb !== null) next.max_base64_bytes = mb;
      if (Object.keys(next).length) {
        parsed.attachment = Object.assign({}, parsed.attachment || {}, { image: next });
      } else if (parsed.attachment) {
        delete parsed.attachment.image;
        if (!Object.keys(parsed.attachment).length) delete parsed.attachment;
      }
    }
    // permission.doom_loop
    if (adv.doomLoop !== undefined) {
      if (PERM_MODES.includes(adv.doomLoop)) {
        parsed.permission = Object.assign({}, parsed.permission || {}, { doom_loop: adv.doomLoop });
      } else if (parsed.permission) {
        delete parsed.permission.doom_loop;
        if (!Object.keys(parsed.permission).length) delete parsed.permission;
      }
    }
    // compaction policy (preserve model/system/disabled etc.)
    if (adv.compactionPolicy !== undefined) {
      const cp = adv.compactionPolicy || {};
      const next = Object.assign({}, (parsed.compaction && typeof parsed.compaction === 'object') ? parsed.compaction : {});
      if (cp.auto !== undefined && cp.auto !== null && cp.auto !== '') next.auto = !!cp.auto;
      const tt = toIntOrNull(cp.tail_turns); if (tt !== null) next.tail_turns = tt;
      if (cp.prune !== undefined && cp.prune !== null && cp.prune !== '') next.prune = !!cp.prune;
      const rs = toIntOrNull(cp.reserved); if (rs !== null) next.reserved = rs;
      if (Object.keys(next).length) parsed.compaction = next; else delete parsed.compaction;
    }
  });
  return { ok: true };
}
