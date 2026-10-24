// src/services/manager-service.mjs
// Unified Domain Service Layer for OpenCode Manager (shared by HTTP REST API and MCP Server)

import fs from 'node:fs';
import path from 'node:path';
import {
  loadNodes,
  saveNodes,
  getNode,
  getNodePaths,
  runNodeCmd,
  readNodeFile,
  writeNodeFile,
  deleteNodeFile,
  runDbHelperOnNode
} from '../core/node-transport.mjs';
import {
  parseJsonc,
  parseAgentMarkdown,
  serializeAgentMarkdown,
  parseTrimTools,
  serializeTrimTools,
  MGR_SCOPE_HELPER_CODE,
  stripMgrScopeWrapper,
  applyMgrScopeWrapper,
  extractPluginSummary
} from '../core/parsers.mjs';

/**
 * Helper to atomically read, parse, mutate, and write opencode.jsonc on a node
 */
async function updateNodeJsonc(node, mutatorFn) {
  const { cfgFile } = getNodePaths(node);
  const raw = await readNodeFile(node, cfgFile);
  const parsed = parseJsonc(raw) || {};
  await mutatorFn(parsed);
  await writeNodeFile(node, cfgFile, JSON.stringify(parsed, null, 2) + '\n');
  return parsed;
}

// ============================================================================
// 1. Node Management Service
// ============================================================================

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

// ============================================================================
// 2. Session & SQLite Database Service
// ============================================================================

export async function getSessionStats(nodeId = 'local') {
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['stats']);
}

export async function listSessions(nodeId = 'local', workspace = 'all') {
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['sessions', workspace || 'all']);
}

export async function getSessionDetail(nodeId = 'local', sessionId) {
  if (!sessionId) throw new Error('Missing session id');
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['detail', sessionId]);
}

export async function deleteSession(nodeId = 'local', sessionId) {
  if (!sessionId) throw new Error('Missing session id');
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['delete', sessionId]);
}

export async function cleanSession(nodeId = 'local', sessionId, options = 'errors,reasoning,outputs,files,steps') {
  if (!sessionId) throw new Error('Missing session id');
  const node = getNode(nodeId);
  const optsStr = Array.isArray(options) ? options.join(',') : String(options || 'errors,reasoning,outputs,files,steps');
  return await runDbHelperOnNode(node, ['clean', sessionId, optsStr]);
}

export async function vacuumDatabase(nodeId = 'local') {
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['vacuum']);
}

// ============================================================================
// 3. Full Node Configuration Snapshot Service
// ============================================================================

export async function getNodeConfigSnapshot(nodeId = 'local') {
  const node = getNode(nodeId);
  const {
    sep,
    cfgFile,
    promptLocal,
    promptGlobal,
    promptSsh,
    agentDir,
    pluginDir,
    pluginScopesFile,
    trimTools
  } = getNodePaths(node);

  let rawJsonc = '';
  let localPrompt = '';
  let globalPrompt = '';
  let sshPrompt = '';
  const agentList = [];
  const rawPluginFiles = {};
  let pluginScopes = {};
  let tools = {};

  if (node.type === 'local') {
    rawJsonc = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, 'utf-8') : '';
    localPrompt = fs.existsSync(promptLocal) ? fs.readFileSync(promptLocal, 'utf-8') : '';
    globalPrompt = fs.existsSync(promptGlobal) ? fs.readFileSync(promptGlobal, 'utf-8') : '';
    sshPrompt = fs.existsSync(promptSsh) ? fs.readFileSync(promptSsh, 'utf-8') : '';

    if (fs.existsSync(agentDir)) {
      const files = fs.readdirSync(agentDir);
      for (const f of files) {
        if (f.endsWith('.md') && !f.includes('.bak')) {
          const c = fs.readFileSync(path.join(agentDir, f), 'utf-8');
          agentList.push(parseAgentMarkdown(c, f));
        }
      }
    }

    if (fs.existsSync(pluginScopesFile)) {
      try {
        pluginScopes = JSON.parse(fs.readFileSync(pluginScopesFile, 'utf-8'));
      } catch {}
    }

    if (fs.existsSync(pluginDir)) {
      const pFiles = fs.readdirSync(pluginDir);
      for (const pf of pFiles) {
        if ((pf.endsWith('.js') || pf.endsWith('.mjs')) && pf !== '_mgr_scope.js' && !pf.includes('.bak')) {
          rawPluginFiles[pf] = fs.readFileSync(path.join(pluginDir, pf), 'utf-8');
        }
      }
    }

    const toolsContent = fs.existsSync(trimTools) ? fs.readFileSync(trimTools, 'utf-8') : '';
    tools = parseTrimTools(toolsContent);
  } else {
    rawJsonc = await readNodeFile(node, cfgFile);
    localPrompt = await readNodeFile(node, promptLocal);
    globalPrompt = await readNodeFile(node, promptGlobal);
    sshPrompt = await readNodeFile(node, promptSsh);

    const scopesRaw = await readNodeFile(node, pluginScopesFile);
    if (scopesRaw && scopesRaw.trim()) {
      try {
        pluginScopes = JSON.parse(scopesRaw);
      } catch {}
    }

    const agentFilesRaw = await runNodeCmd(node, `ls -1 "${agentDir}"/*.md 2>/dev/null || true`);
    const agentFiles = agentFilesRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const f of agentFiles) {
      const filename = f.split('/').pop().split('\\').pop();
      if (filename && !filename.includes('.bak')) {
        const c = await readNodeFile(node, f);
        agentList.push(parseAgentMarkdown(c, filename));
      }
    }

    const pFilesRaw = await runNodeCmd(node, `ls -1 "${pluginDir}"/*.js 2>/dev/null || true`);
    const pFiles = pFilesRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const pfPath of pFiles) {
      const pf = pfPath.split('/').pop().split('\\').pop();
      if (pf && pf !== '_mgr_scope.js' && !pf.includes('.bak')) {
        rawPluginFiles[pf] = await readNodeFile(node, pfPath);
      }
    }

    const remoteTrimContent = rawPluginFiles['trim-tools.js'] || '';
    if (remoteTrimContent) {
      tools = parseTrimTools(remoteTrimContent);
    }
  }

  const parsed = parseJsonc(rawJsonc) || {};
  const enabledPluginPaths = Array.isArray(parsed.plugin) ? parsed.plugin : [];
  const enabledFilenamesOrder = enabledPluginPaths.map(p => String(p).split('/').pop().split('\\').pop());

  const allPluginNames = new Set([
    ...enabledFilenamesOrder.filter(f => f && f !== '_mgr_scope.js' && !f.includes('.bak')),
    ...Object.keys(rawPluginFiles)
  ]);

  const pluginList = [];
  for (const filename of allPluginNames) {
    const rawCode = rawPluginFiles[filename] || '';
    const cleanCode = stripMgrScopeWrapper(rawCode);
    const orderIdx = enabledFilenamesOrder.indexOf(filename);
    const enabled = orderIdx !== -1;
    const fullPath = `${pluginDir}${sep}${filename}`;
    const scope = pluginScopes[filename] || { mode: 'all', agents: [] };
    pluginList.push({
      filename,
      fullPath,
      enabled,
      order: enabled ? orderIdx : 999,
      description: extractPluginSummary(cleanCode, filename),
      content: cleanCode,
      scope
    });
  }
  pluginList.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.filename.localeCompare(b.filename)));

  let providersMeta = { auth: {}, catalog: {} };
  try {
    providersMeta = await runDbHelperOnNode(node, ['providers-meta']);
  } catch (e) {
    console.warn(`[manager-service] providers-meta fetch failed on ${node.id}:`, e.message);
  }

  return {
    node: node.id,
    name: node.name,
    ip: node.ip,
    config: parsed,
    rawJsonc,
    providersMeta,
    systemPrompts: {
      local: { name: 'AGENTS.local.md', content: localPrompt },
      global: { name: 'AGENTS.md', content: globalPrompt },
      ssh: { name: 'SSH_WORKFLOW.md', content: sshPrompt }
    },
    agents: agentList,
    plugins: pluginList,
    pluginScopes,
    tools
  };
}

// ============================================================================
// 4. System Prompts Service
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
// 5. Models, Providers, Catalog & Auth Service
// ============================================================================

export async function getCatalogModels(nodeId = 'local', providerId = 'opencode') {
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['catalog-models', providerId || 'opencode']);
}

export async function saveGlobalModels(nodeId = 'local', data = {}) {
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (data.primaryModel !== undefined) parsed.model = data.primaryModel;
    if (data.smallModel !== undefined) parsed.small_model = data.smallModel;
    if (!parsed.agent) parsed.agent = {};
    if (data.titleModel !== undefined) {
      if (!parsed.agent.title) parsed.agent.title = { disable: false };
      parsed.agent.title.model = data.titleModel;
    }
    if (data.compactionModel !== undefined) {
      if (!parsed.agent.compaction) parsed.agent.compaction = {};
      parsed.agent.compaction.model = data.compactionModel;
    }
  });
  return { ok: true };
}

export async function saveProvider(nodeId = 'local', providerId, providerConfig) {
  if (!providerId) throw new Error('Missing provider id');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!parsed.provider) parsed.provider = {};
    parsed.provider[providerId] = providerConfig || {};
  });
  return { ok: true, id: providerId };
}

export async function deleteProvider(nodeId = 'local', providerId) {
  if (!providerId) throw new Error('Missing provider id');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (parsed.provider && parsed.provider[providerId]) {
      delete parsed.provider[providerId];
    }
  });
  return { ok: true, id: providerId };
}

export async function saveProviderAuth(nodeId = 'local', providerId, key = '', type = 'api') {
  if (!providerId) throw new Error('Missing provider id');
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['set-auth', providerId, key || '', type || 'api']);
}

// ============================================================================
// 6. Agents & Per-Agent Plugin Assignment Service
// ============================================================================

export async function saveAgent(nodeId = 'local', data = {}) {
  if (!data.id) throw new Error('Missing agent id');
  const node = getNode(nodeId);
  const { sep, agentDir, pluginDir, pluginScopesFile } = getNodePaths(node);
  const target = `${agentDir}${sep}${data.id}.md`;

  const fileContent = serializeAgentMarkdown(data);
  await writeNodeFile(node, target, fileContent);

  // Sync per-agent plugin assignments in plugin-scopes.json if provided
  if (data.pluginStates && typeof data.pluginStates === 'object') {
    let scopes = {};
    const scopesRaw = await readNodeFile(node, pluginScopesFile);
    if (scopesRaw && scopesRaw.trim()) {
      try {
        scopes = JSON.parse(scopesRaw);
      } catch {}
    }

    let anyRestricted = false;
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
      if (rule.mode !== 'all' && rule.agents.length > 0) anyRestricted = true;

      const pFile = `${pluginDir}${sep}${pFilename}`;
      const pRaw = await readNodeFile(node, pFile);
      if (pRaw) {
        const wrapped = applyMgrScopeWrapper(pRaw, pFilename, rule);
        if (wrapped !== pRaw) await writeNodeFile(node, pFile, wrapped);
      }
    }

    if (anyRestricted) {
      await writeNodeFile(node, `${pluginDir}${sep}_mgr_scope.js`, MGR_SCOPE_HELPER_CODE, false);
    }
    await writeNodeFile(node, pluginScopesFile, JSON.stringify(scopes, null, 2) + '\n', false);
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

export async function saveCoreAgents(nodeId = 'local', data = {}) {
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!parsed.agent) parsed.agent = {};
    if (!parsed.agent.compaction) parsed.agent.compaction = {};
    if (data.compactionModel !== undefined) {
      parsed.agent.compaction.model = data.compactionModel;
    }
    if (data.compactionPrompt !== undefined) {
      parsed.agent.compaction.prompt = data.compactionPrompt;
    }
    if (data.titleModel !== undefined) {
      if (!parsed.agent.title) parsed.agent.title = { disable: false };
      parsed.agent.title.model = data.titleModel;
    }
  });
  return { ok: true };
}

// ============================================================================
// 7. MCP Servers Service
// ============================================================================

export async function saveMcpServer(nodeId = 'local', data = {}) {
  if (!data.id) throw new Error('Missing MCP server id');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!parsed.mcp) parsed.mcp = {};
    const entry = {
      type: data.type || 'local',
      command: data.command,
      enabled: data.enabled !== false
    };
    if (data.timeout) entry.timeout = data.timeout;
    if (data.url) entry.url = data.url;
    if (data.environment) entry.environment = data.environment;
    parsed.mcp[data.id] = entry;
  });
  return { ok: true, id: data.id };
}

export async function deleteMcpServer(nodeId = 'local', mcpId) {
  if (!mcpId) throw new Error('Missing MCP server id');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (parsed.mcp && parsed.mcp[mcpId]) {
      delete parsed.mcp[mcpId];
    }
  });
  return { ok: true, id: mcpId };
}

// ============================================================================
// 8. Plugins & Per-Agent Scope Service
// ============================================================================

export async function savePlugin(nodeId = 'local', data = {}) {
  let filename = String(data.filename || '').trim();
  if (!filename) throw new Error('Missing plugin filename');
  if (!filename.endsWith('.js') && !filename.endsWith('.mjs')) filename += '.js';

  const node = getNode(nodeId);
  const { sep, pluginDir, pluginScopesFile } = getNodePaths(node);
  const fullPluginPath = `${pluginDir}${sep}${filename}`;

  if (node.type !== 'local') {
    await runNodeCmd(node, `mkdir -p "${pluginDir}"`);
  }

  let scopes = {};
  const rawS = await readNodeFile(node, pluginScopesFile);
  if (rawS && rawS.trim()) {
    try {
      scopes = JSON.parse(rawS);
    } catch {}
  }

  const scopeRule = data.scope || { mode: 'all', agents: [] };
  if (!scopeRule.mode || scopeRule.mode === 'all' || !Array.isArray(scopeRule.agents) || scopeRule.agents.length === 0) {
    scopes[filename] = { mode: 'all', agents: [] };
  } else {
    scopes[filename] = scopeRule;
    await writeNodeFile(node, `${pluginDir}${sep}_mgr_scope.js`, MGR_SCOPE_HELPER_CODE, false);
  }
  await writeNodeFile(node, pluginScopesFile, JSON.stringify(scopes, null, 2) + '\n', false);

  if (data.content !== undefined) {
    const finalCode = applyMgrScopeWrapper(data.content, filename, scopes[filename]);
    await writeNodeFile(node, fullPluginPath, finalCode);
  } else {
    const existingRaw = await readNodeFile(node, fullPluginPath);
    if (existingRaw) {
      const finalCode = applyMgrScopeWrapper(existingRaw, filename, scopes[filename]);
      if (finalCode !== existingRaw) {
        await writeNodeFile(node, fullPluginPath, finalCode);
      }
    }
  }

  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
    const existingIdx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
    if (data.enabled !== false) {
      if (existingIdx === -1) parsed.plugin.push(fullPluginPath);
    } else {
      if (existingIdx !== -1) parsed.plugin.splice(existingIdx, 1);
    }
  });

  return { ok: true, filename };
}

export async function togglePlugin(nodeId = 'local', filename, enabled) {
  if (!filename) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  const { sep, pluginDir } = getNodePaths(node);
  const fullPluginPath = `${pluginDir}${sep}${filename}`;

  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
    const existingIdx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
    if (enabled) {
      if (existingIdx === -1) parsed.plugin.push(fullPluginPath);
    } else {
      if (existingIdx !== -1) parsed.plugin.splice(existingIdx, 1);
    }
  });

  return { ok: true, filename, enabled: Boolean(enabled) };
}

export async function reorderPlugin(nodeId = 'local', filename, delta = 0) {
  if (!filename) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);

  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) return;
    const idx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
    const targetIdx = idx + Number(delta || 0);
    if (idx !== -1 && targetIdx >= 0 && targetIdx < parsed.plugin.length) {
      const tmp = parsed.plugin[idx];
      parsed.plugin[idx] = parsed.plugin[targetIdx];
      parsed.plugin[targetIdx] = tmp;
    }
  });

  return { ok: true, filename };
}

export async function deletePlugin(nodeId = 'local', filename) {
  if (!filename) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  const { sep, pluginDir } = getNodePaths(node);
  const fullPluginPath = `${pluginDir}${sep}${filename}`;

  await deleteNodeFile(node, fullPluginPath);

  await updateNodeJsonc(node, (parsed) => {
    if (Array.isArray(parsed.plugin)) {
      parsed.plugin = parsed.plugin.filter(p => String(p).split('/').pop().split('\\').pop() !== filename);
    }
  });

  return { ok: true, filename };
}

// ============================================================================
// 9. Tools & Permissions Service
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

// ============================================================================
// 10. Raw JSONC Service
// ============================================================================

export async function saveRawJsonc(nodeId = 'local', content = '') {
  const node = getNode(nodeId);
  const { cfgFile } = getNodePaths(node);
  if (!parseJsonc(content)) {
    throw new Error('Invalid JSON / JSONC syntax');
  }
  await writeNodeFile(node, cfgFile, content);
  return { ok: true };
}
