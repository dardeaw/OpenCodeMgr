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
  runDbHelperOnNode
} from '../core/node-transport.mjs';
import {
  parseAgentMarkdown,
  parseTrimTools,
  stripMgrScopeWrapper,
  extractPluginSummary
} from '../core/parsers.mjs';
import { readNodeJsonc, readPluginScopes } from './shared-config.mjs';

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
  const { sep, promptLocal, promptGlobal, promptSsh, agentDir, pluginDir, trimTools } = getNodePaths(node);

  const { raw: rawJsonc, parsed } = await readNodeJsonc(node);
  const localPrompt = await readNodeFile(node, promptLocal);
  const globalPrompt = await readNodeFile(node, promptGlobal);
  const sshPrompt = node.type === 'local' ? null : await readNodeFile(node, promptSsh);

  // Agents
  const agentList = [];
  if (node.type === 'local') {
    if (fs.existsSync(agentDir)) {
      const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(agentDir, f), 'utf-8');
        agentList.push(parseAgentMarkdown(content, f));
      }
    }
  } else {
    const lsOut = await runNodeCmd(node, `ls -1 "${agentDir}"/*.md 2>/dev/null || true`);
    const files = lsOut.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const fullPath of files) {
      const f = fullPath.split('/').pop();
      const content = await readNodeFile(node, fullPath);
      agentList.push(parseAgentMarkdown(content, f));
    }
  }

  // Trim-tools descriptions
  const trimToolsRaw = await readNodeFile(node, trimTools);
  const tools = parseTrimTools(trimToolsRaw);

  // Plugin scopes
  const pluginScopes = await readPluginScopes(node);

  // Plugins
  const configuredPlugins = Array.isArray(parsed.plugin) ? parsed.plugin : [];
  const enabledPluginFiles = configuredPlugins.map(p => String(p).split('/').pop().split('\\').pop());

  const pluginList = [];
  const rawPluginFiles = [];
  if (node.type === 'local') {
    if (fs.existsSync(pluginDir)) {
      for (const f of fs.readdirSync(pluginDir)) {
        if ((f.endsWith('.js') || f.endsWith('.mjs')) && f !== '_mgr_scope.js' && !f.includes('.bak')) {
          rawPluginFiles.push({ name: f, fullPath: path.join(pluginDir, f) });
        }
      }
    }
  } else {
    const lsP = await runNodeCmd(node, `ls -1 "${pluginDir}"/*.js "${pluginDir}"/*.mjs 2>/dev/null || true`);
    for (const fp of lsP.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
      const fn = fp.split('/').pop();
      if (fn !== '_mgr_scope.js' && !fn.includes('.bak')) {
        rawPluginFiles.push({ name: fn, fullPath: fp });
      }
    }
  }

  for (const pf of rawPluginFiles) {
    const rawCode = await readNodeFile(node, pf.fullPath);
    const cleanCode = stripMgrScopeWrapper(rawCode);
    const enabledIdx = enabledPluginFiles.indexOf(pf.name);
    const scopeObj = pluginScopes[pf.name] || { mode: 'all', agents: [] };
    pluginList.push({
      id: pf.name.replace(/\.(m?js)$/, ''),
      filename: pf.name,
      enabled: enabledIdx !== -1,
      order: enabledIdx !== -1 ? enabledIdx : 999,
      scope: scopeObj,
      description: extractPluginSummary(cleanCode, pf.name),
      content: cleanCode
    });
  }
  pluginList.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.filename.localeCompare(b.filename)));

  let providersMeta = { auth: {}, catalog: {} };
  try {
    providersMeta = await runDbHelperOnNode(node, ['providers-meta']);
  } catch (e) {
    console.warn(`[node-service] providers-meta fetch failed on ${node.id}:`, e.message);
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
