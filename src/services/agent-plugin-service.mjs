// src/services/agent-plugin-service.mjs
// System Prompts, Custom Agents, Core Agents, MCP Servers, Plugins, Tools & Raw JSONC Service

import {
  getNode,
  getNodePaths,
  runNodeCmd,
  readNodeFile,
  writeNodeFile,
  deleteNodeFile
} from '../core/node-transport.mjs';
import {
  parseJsonc,
  serializeAgentMarkdown,
  serializeTrimTools,
  applyMgrScopeWrapper
} from '../core/parsers.mjs';
import {
  updateNodeJsonc,
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
// 3. MCP Servers
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
// 4. Plugins & Per-Agent Scope
// ============================================================================

export async function savePlugin(nodeId = 'local', data = {}) {
  let filename = String(data.filename || '').trim();
  if (!filename) throw new Error('Missing plugin filename');
  if (!filename.endsWith('.js') && !filename.endsWith('.mjs')) filename += '.js';

  const node = getNode(nodeId);
  const { sep, pluginDir } = getNodePaths(node);
  const fullPluginPath = `${pluginDir}${sep}${filename}`;

  if (node.type !== 'local') {
    await runNodeCmd(node, `mkdir -p "${pluginDir}"`);
  }

  const scopes = await readPluginScopes(node);
  const scopeRule = data.scope || { mode: 'all', agents: [] };
  if (!scopeRule.mode || scopeRule.mode === 'all' || !Array.isArray(scopeRule.agents) || scopeRule.agents.length === 0) {
    scopes[filename] = { mode: 'all', agents: [] };
  } else {
    scopes[filename] = scopeRule;
  }
  await writePluginScopes(node, scopes);

  if (data.content !== undefined) {
    const finalCode = applyMgrScopeWrapper(data.content, filename, scopes[filename]);
    await writeNodeFile(node, fullPluginPath, finalCode);
  } else {
    const existingCode = await readNodeFile(node, fullPluginPath);
    if (existingCode) {
      const finalCode = applyMgrScopeWrapper(existingCode, filename, scopes[filename]);
      await writeNodeFile(node, fullPluginPath, finalCode);
    }
  }

  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
    const relRef = `./plugin/${filename}`;
    const existingIdx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
    if (data.enabled !== false) {
      if (existingIdx === -1) parsed.plugin.push(relRef);
    } else if (existingIdx !== -1) {
      parsed.plugin.splice(existingIdx, 1);
    }
  });

  return { ok: true, filename };
}

export async function togglePlugin(nodeId = 'local', filename, enabled = true) {
  if (!filename) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
    const relRef = `./plugin/${filename}`;
    const idx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
    if (enabled && idx === -1) {
      parsed.plugin.push(relRef);
    } else if (!enabled && idx !== -1) {
      parsed.plugin.splice(idx, 1);
    }
  });
  return { ok: true, filename, enabled };
}

export async function reorderPlugin(nodeId = 'local', filename, delta = 0) {
  if (!filename) throw new Error('Missing plugin filename');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
    const idx = parsed.plugin.findIndex(p => String(p).split('/').pop().split('\\').pop() === filename);
    if (idx !== -1) {
      const targetIdx = idx + Number(delta || 0);
      if (targetIdx >= 0 && targetIdx < parsed.plugin.length) {
        const tmp = parsed.plugin[idx];
        parsed.plugin[idx] = parsed.plugin[targetIdx];
        parsed.plugin[targetIdx] = tmp;
      }
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
