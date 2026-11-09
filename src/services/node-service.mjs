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

  // Agents (support both agent/ and agents/ layouts)
  const agentList = [];
  const agentDirs = [agentDir, paths.agentDirAlt].filter(Boolean);
  if (node.type === 'local') {
    for (const dir of agentDirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        agentList.push(parseAgentMarkdown(content, f));
      }
    }
  } else {
    const lsCmds = agentDirs.map(d => `ls -1 "${d}"/*.md 2>/dev/null || true`).join('; ');
    const lsOut = await runNodeCmd(node, lsCmds);
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
  const seenPlugin = new Set();
  const pluginDirs = [pluginDir, paths.pluginDirAlt].filter(Boolean);
  if (node.type === 'local') {
    for (const dir of pluginDirs) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if ((f.endsWith('.js') || f.endsWith('.mjs')) && f !== '_mgr_scope.js' && !f.includes('.bak') && !seenPlugin.has(f)) {
          seenPlugin.add(f);
          rawPluginFiles.push({ name: f, fullPath: path.join(dir, f) });
        }
      }
    }
  } else {
    const lsCmds = pluginDirs.map(d => `ls -1 "${d}"/*.js "${d}"/*.mjs 2>/dev/null || true`).join('; ');
    const lsP = await runNodeCmd(node, lsCmds);
    for (const fp of lsP.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
      const fn = fp.split('/').pop();
      if (fn !== '_mgr_scope.js' && !fn.includes('.bak') && !seenPlugin.has(fn)) {
        seenPlugin.add(fn);
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

  let opencodeVersionInfo = { version: '1.19.4', isV2: false, v2Ready: true };
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
