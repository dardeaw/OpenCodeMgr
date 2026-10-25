// src/services/clone-service.mjs
// Environment Bundle Export, Import, Network Clone & Cross-Platform Path Translation Service

import path from 'node:path';
import {
  getNode,
  getNodePaths,
  readNodeFile,
  writeNodeFile,
  backupNodeFile,
  runDbHelperOnNode
} from '../core/node-transport.mjs';
import {
  readNodeJsonc,
  updateNodeJsonc,
  readPluginScopes,
  writePluginScopes
} from './shared-config.mjs';
import { getNodeConfigSnapshot } from './node-service.mjs';

/**
 * Smart Cross-Platform Path Translation
 * Replaces source node's config directory paths with target node's config directory,
 * properly adjusting path separators (Windows \ vs Linux /)
 */
export function translatePathString(str, sourceInfo, targetInfo) {
  if (!str || typeof str !== 'string' || !sourceInfo || !targetInfo) return str;
  const srcDir = sourceInfo.configDir;
  const tgtDir = targetInfo.configDir;
  if (!srcDir || !tgtDir || srcDir === tgtDir) return str;

  // Build variants of srcDir with / and \
  const srcFwd = srcDir.replace(/\\/g, '/');
  const srcBack = srcDir.replace(/\//g, '\\');
  const tgtFwd = tgtDir.replace(/\\/g, '/');
  const tgtBack = tgtDir.replace(/\//g, '\\');

  const tgtStandard = targetInfo.isWindows ? tgtBack : tgtFwd;

  let out = str;
  if (out.includes(srcBack)) {
    out = out.split(srcBack).join(tgtStandard);
  }
  if (out.includes(srcFwd)) {
    out = out.split(srcFwd).join(tgtStandard);
  }
  return out;
}

/**
 * Deep-translate all path strings within an arbitrary object or array
 */
export function deepTranslatePaths(obj, sourceInfo, targetInfo) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return translatePathString(obj, sourceInfo, targetInfo);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepTranslatePaths(item, sourceInfo, targetInfo));
  }
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = deepTranslatePaths(v, sourceInfo, targetInfo);
    }
    return res;
  }
  return obj;
}

/**
 * Export full OpenCode environment bundle from a source node
 */
export async function exportEnvironmentBundle(sourceNodeId = 'local', requestedModules = null) {
  const node = getNode(sourceNodeId);
  const paths = getNodePaths(node);
  const snapshot = await getNodeConfigSnapshot(sourceNodeId);

  const modules = requestedModules || [
    'providers',
    'models_visibility',
    'auth',
    'agents',
    'plugins',
    'prompts',
    'mcp',
    'tools',
    'permissions'
  ];

  const cfg = snapshot.config || {};
  const providersMeta = snapshot.providersMeta || {};

  const bundle = {
    format: 'opencode-env-bundle',
    version: '1.5.0',
    exportedAt: new Date().toISOString(),
    source: {
      id: node.id,
      name: node.name,
      type: node.type,
      ip: node.ip,
      isWindows: paths.isWindows,
      configDir: paths.configDir,
      sep: paths.sep
    },
    modules,
    components: {}
  };

  // 1. Providers & Global Model assignments
  if (modules.includes('providers')) {
    bundle.components.providers = {
      model: cfg.model || '',
      small_model: cfg.small_model || '',
      agent: cfg.agent || {},
      provider: cfg.provider || {}
    };
  }

  // 2. Desktop Model Visibility
  if (modules.includes('models_visibility')) {
    bundle.components.modelVisibility = providersMeta.model_visibility || {};
  }

  // 3. Auth credentials
  if (modules.includes('auth')) {
    bundle.components.auth = providersMeta.auth || {};
  }

  // 4. Custom Agents (agent/*.md)
  if (modules.includes('agents')) {
    bundle.components.agents = (snapshot.agents || []).map(a => ({
      id: a.id,
      filename: a.filename,
      content: a.fullContent || ''
    }));
  }

  // 5. Plugins (plugin/*.js) & Scopes
  if (modules.includes('plugins')) {
    bundle.components.plugins = (snapshot.plugins || []).map(p => ({
      id: p.id,
      filename: p.filename,
      enabled: p.enabled,
      order: p.order,
      content: p.content || '',
      scope: p.scope || { mode: 'all', agents: [] }
    }));
    bundle.components.pluginScopes = snapshot.pluginScopes || {};
  }

  // 6. System Prompts
  if (modules.includes('prompts')) {
    const sp = snapshot.systemPrompts || {};
    bundle.components.prompts = {
      local: sp.local ? sp.local.content : '',
      global: sp.global ? sp.global.content : '',
      ssh: sp.ssh ? sp.ssh.content : ''
    };
  }

  // 7. MCP Servers
  if (modules.includes('mcp')) {
    bundle.components.mcp = cfg.mcp || {};
  }

  // 8. Trim Tools
  if (modules.includes('tools')) {
    const trimToolsRaw = await readNodeFile(node, paths.trimTools);
    bundle.components.tools = {
      parsed: snapshot.tools || {},
      rawFile: trimToolsRaw || ''
    };
  }

  // 9. Bash Permissions
  if (modules.includes('permissions')) {
    bundle.components.permissions = (cfg.permission && cfg.permission.bash) || {};
  }

  return bundle;
}

/**
 * Apply an OpenCode environment bundle onto a target node
 */
export async function applyEnvironmentBundle(targetNodeId, bundle, options = {}) {
  if (!bundle || !bundle.components) {
    throw new Error('Invalid environment bundle: missing components payload');
  }

  const targetNode = getNode(targetNodeId);
  const targetPaths = getNodePaths(targetNode);
  const sourceInfo = bundle.source || { isWindows: false, configDir: '' };
  const targetInfo = {
    isWindows: targetPaths.isWindows,
    configDir: targetPaths.configDir,
    sep: targetPaths.sep
  };

  const smartPathTranslate = options.smartPathTranslate !== false;
  const preserveBaseUrls = options.preserveBaseUrls !== false;
  const backupTarget = options.backupTarget !== false;
  const selectedModules = options.modules || bundle.modules || Object.keys(bundle.components);

  const appliedSummary = {
    targetNode: targetNode.id,
    timestamp: new Date().toISOString(),
    appliedModules: [],
    backupCreated: backupTarget
  };

  // Pre-backup target's opencode.jsonc
  if (backupTarget) {
    await backupNodeFile(targetNode, targetPaths.cfgFile);
  }

  // Helper to translate content if enabled
  const tr = (val) => (smartPathTranslate ? deepTranslatePaths(val, sourceInfo, targetInfo) : val);

  // 1. Providers & Global Model assignments
  if (selectedModules.includes('providers') && bundle.components.providers) {
    const incoming = tr(bundle.components.providers);
    await updateNodeJsonc(targetNode, (parsed) => {
      if (incoming.model) parsed.model = incoming.model;
      if (incoming.small_model) parsed.small_model = incoming.small_model;
      if (incoming.agent) {
        if (!parsed.agent) parsed.agent = {};
        if (incoming.agent.title) parsed.agent.title = incoming.agent.title;
        if (incoming.agent.compaction) parsed.agent.compaction = incoming.agent.compaction;
      }
      if (incoming.provider && typeof incoming.provider === 'object') {
        if (!parsed.provider) parsed.provider = {};
        for (const [pid, pObj] of Object.entries(incoming.provider)) {
          const existing = parsed.provider[pid];
          const newObj = { ...pObj };
          // Preserve target's existing baseURL if requested (e.g. strata tunnel vs direct IP)
          if (preserveBaseUrls && existing && existing.options && existing.options.baseURL) {
            if (!newObj.options) newObj.options = {};
            newObj.options.baseURL = existing.options.baseURL;
          }
          parsed.provider[pid] = newObj;
        }
      }
    });
    appliedSummary.appliedModules.push('providers');
  }

  // 2. Desktop Model Visibility
  if (selectedModules.includes('models_visibility') && bundle.components.modelVisibility) {
    for (const [pid, visMap] of Object.entries(bundle.components.modelVisibility)) {
      if (visMap && typeof visMap === 'object') {
        try {
          await runDbHelperOnNode(targetNode, ['set-model-visibility', pid, JSON.stringify(visMap)]);
        } catch (e) {
          console.warn(`[clone-service] set-model-visibility failed for ${pid} on ${targetNode.id}:`, e.message);
        }
      }
    }
    appliedSummary.appliedModules.push('models_visibility');
  }

  // 3. Auth credentials
  if (selectedModules.includes('auth') && bundle.components.auth) {
    for (const [pid, authObj] of Object.entries(bundle.components.auth)) {
      if (authObj && authObj.key) {
        try {
          await runDbHelperOnNode(targetNode, ['set-auth', pid, authObj.key, authObj.type || 'api']);
        } catch (e) {
          console.warn(`[clone-service] set-auth failed for ${pid} on ${targetNode.id}:`, e.message);
        }
      }
    }
    appliedSummary.appliedModules.push('auth');
  }

  // 4. Custom Agents (agent/*.md)
  if (selectedModules.includes('agents') && Array.isArray(bundle.components.agents)) {
    const { sep, agentDir } = targetPaths;
    for (const ag of bundle.components.agents) {
      if (!ag || !ag.filename || !ag.content) continue;
      const targetAgentFile = `${agentDir}${sep}${ag.filename}`;
      const finalContent = tr(ag.content);
      await writeNodeFile(targetNode, targetAgentFile, finalContent, backupTarget);
    }
    appliedSummary.appliedModules.push('agents');
  }

  // 5. Plugins & Scopes
  if (selectedModules.includes('plugins') && Array.isArray(bundle.components.plugins)) {
    const { sep, pluginDir } = targetPaths;
    const scopes = await readPluginScopes(targetNode);
    const bundleScopes = bundle.components.pluginScopes || {};

    const pluginsToEnable = [];
    for (const p of bundle.components.plugins) {
      if (!p || !p.filename) continue;
      const targetPluginFile = `${pluginDir}${sep}${p.filename}`;
      if (p.content) {
        const finalCode = tr(p.content);
        await writeNodeFile(targetNode, targetPluginFile, finalCode, backupTarget);
      }
      if (bundleScopes[p.filename]) {
        scopes[p.filename] = bundleScopes[p.filename];
      } else if (p.scope) {
        scopes[p.filename] = p.scope;
      }
      if (p.enabled) {
        pluginsToEnable.push(p.filename);
      }
    }

    await writePluginScopes(targetNode, scopes);

    // Update target's opencode.jsonc "plugin" array
    await updateNodeJsonc(targetNode, (parsed) => {
      if (!Array.isArray(parsed.plugin)) parsed.plugin = [];
      for (const fn of pluginsToEnable) {
        const relRef = `./plugin/${fn}`;
        const has = parsed.plugin.some(p => String(p).split('/').pop().split('\\').pop() === fn);
        if (!has) parsed.plugin.push(relRef);
      }
    });

    appliedSummary.appliedModules.push('plugins');
  }

  // 6. System Prompts
  if (selectedModules.includes('prompts') && bundle.components.prompts) {
    const pr = bundle.components.prompts;
    if (pr.global !== undefined) {
      await writeNodeFile(targetNode, targetPaths.promptGlobal, tr(pr.global), backupTarget);
    }
    if (pr.local !== undefined) {
      await writeNodeFile(targetNode, targetPaths.promptLocal, tr(pr.local), backupTarget);
    }
    if (pr.ssh !== undefined && targetNode.type !== 'local') {
      await writeNodeFile(targetNode, targetPaths.promptSsh, tr(pr.ssh), backupTarget);
    }
    appliedSummary.appliedModules.push('prompts');
  }

  // 7. MCP Servers
  if (selectedModules.includes('mcp') && bundle.components.mcp) {
    const incomingMcp = tr(bundle.components.mcp);
    await updateNodeJsonc(targetNode, (parsed) => {
      if (!parsed.mcp) parsed.mcp = {};
      for (const [mId, mObj] of Object.entries(incomingMcp)) {
        parsed.mcp[mId] = mObj;
      }
    });
    appliedSummary.appliedModules.push('mcp');
  }

  // 8. Trim Tools
  if (selectedModules.includes('tools') && bundle.components.tools) {
    if (bundle.components.tools.rawFile) {
      await writeNodeFile(targetNode, targetPaths.trimTools, tr(bundle.components.tools.rawFile), backupTarget);
    }
    appliedSummary.appliedModules.push('tools');
  }

  // 9. Bash Permissions
  if (selectedModules.includes('permissions') && bundle.components.permissions) {
    const incomingBash = bundle.components.permissions;
    await updateNodeJsonc(targetNode, (parsed) => {
      if (!parsed.permission) parsed.permission = {};
      parsed.permission.bash = { ...(parsed.permission.bash || {}), ...incomingBash };
    });
    appliedSummary.appliedModules.push('permissions');
  }

  return { ok: true, summary: appliedSummary };
}

/**
 * Execute node-to-node clone across network (one source to one or multiple targets)
 */
export async function cloneNodeToNode(sourceNodeId, targetNodeIds, options = {}) {
  if (!sourceNodeId) throw new Error('Missing sourceNodeId for clone');
  const targets = (Array.isArray(targetNodeIds) ? targetNodeIds : [targetNodeIds]).filter(id => id && id !== sourceNodeId);
  if (targets.length === 0) {
    throw new Error('No valid destination target nodes specified');
  }

  // 1. Export bundle from source node
  const bundle = await exportEnvironmentBundle(sourceNodeId, options.modules || null);

  // 2. Apply to each target node sequentially
  const results = [];
  for (const tid of targets) {
    try {
      const res = await applyEnvironmentBundle(tid, bundle, options);
      results.push({ targetNode: tid, ok: true, ...res.summary });
    } catch (err) {
      results.push({ targetNode: tid, ok: false, error: err.message });
    }
  }

  return {
    ok: results.every(r => r.ok),
    sourceNode: sourceNodeId,
    results
  };
}
