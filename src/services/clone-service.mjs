// src/services/clone-service.mjs
// Environment Bundle Export, Import, Network Clone & Cross-Platform Path Translation Service

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import {
  getNode,
  getNodePaths,
  readNodeFile,
  writeNodeFile,
  backupNodeFile,
  runDbHelperOnNode,
  runNodeCmd,
  uploadToNode,
  downloadFromNode
} from '../core/node-transport.mjs';
import {
  readNodeJsonc,
  updateNodeJsonc,
  readPluginScopes,
  writePluginScopes
} from './shared-config.mjs';
import { getNodeConfigSnapshot } from './node-service.mjs';
import { listSkills, saveSkill } from './skill-service.mjs';

/**
 * Flush SQLite WAL journal into database file
 */
export async function checkpointNodeDb(node) {
  try {
    await runDbHelperOnNode(node, ['checkpoint']);
  } catch (e) {
    console.warn(`[clone-service] Checkpoint failed on ${node.id}:`, e.message);
  }
}

/**
 * Extract node's opencode.db to a local destination file path
 */
export async function extractNodeDbToLocalFile(node, localDestPath) {
  await checkpointNodeDb(node);
  const srcPath = node.dbPath;
  if (!srcPath) throw new Error(`Node ${node.id} has no dbPath configured.`);

  if (node.type === 'local') {
    if (!fs.existsSync(srcPath)) throw new Error(`Local SQLite db not found: ${srcPath}`);
    fs.copyFileSync(srcPath, localDestPath);
  } else {
    const ok = await downloadFromNode(node, srcPath, localDestPath);
    if (!ok || !fs.existsSync(localDestPath)) {
      throw new Error(`Failed to download remote SQLite db from node ${node.id} (${srcPath})`);
    }
  }
}

/**
 * Restore a local db file into a target node's opencode.db
 */
export async function restoreLocalFileToNodeDb(targetNode, localSrcPath, doBackup = true) {
  const targetDbPath = targetNode.dbPath;
  if (!targetDbPath) throw new Error(`Target node ${targetNode.id} has no dbPath configured.`);

  if (doBackup) {
    await backupNodeFile(targetNode, targetDbPath);
  }

  if (targetNode.type === 'local') {
    const dir = path.dirname(targetDbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Clear WAL and SHM to avoid database corruption or old locks
    if (fs.existsSync(`${targetDbPath}-wal`)) fs.unlinkSync(`${targetDbPath}-wal`);
    if (fs.existsSync(`${targetDbPath}-shm`)) fs.unlinkSync(`${targetDbPath}-shm`);
    fs.copyFileSync(localSrcPath, targetDbPath);
  } else {
    await runNodeCmd(targetNode, `rm -f "${targetDbPath}-wal" "${targetDbPath}-shm" || true`);
    await uploadToNode(targetNode, localSrcPath, targetDbPath);
  }
}

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
    'skills',
    'plugins',
    'prompts',
    'mcp',
    'tools',
    'permissions',
    'sqlite'
  ];

  const cfg = snapshot.config || {};
  const providersMeta = snapshot.providersMeta || {};

  const bundle = {
    format: 'opencode-env-bundle',
    version: '1.8.0',
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

  // 4.5 Skills (skills/*/SKILL.md)
  if (modules.includes('skills')) {
    try {
      const skills = await listSkills(sourceNodeId);
      bundle.components.skills = skills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        content: s.content || '',
        raw: s.raw || ''
      }));
    } catch (sErr) {
      console.warn(`[clone-service] Exporting skills failed for ${sourceNodeId}:`, sErr.message);
    }
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

  // 10. OpenCode 2.0 CLI Configuration (cli.json)
  if (modules.includes('cli_config')) {
    try {
      const rawCli = await readNodeFile(node, paths.cliFile);
      if (rawCli) {
        bundle.components.cliConfig = { raw: rawCli };
      }
    } catch (e) {
      console.warn(`[clone-service] Export cli.json failed for ${sourceNodeId}:`, e.message);
    }
  }

  // 11. OpenCode 1.x TUI Configuration (tui.json, Backward Compatible)
  if (modules.includes('tui_config')) {
    try {
      const rawTui = await readNodeFile(node, paths.tuiFile);
      if (rawTui) {
        bundle.components.tuiConfig = { raw: rawTui };
      }
    } catch (e) {
      console.warn(`[clone-service] Export tui.json failed for ${sourceNodeId}:`, e.message);
    }
  }

  // 12. SQLite Database (opencode.db)
  if (modules.includes('sqlite')) {
    const tempDb = path.join(os.tmpdir(), `oc_exp_db_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    const tempGz = `${tempDb}.gz`;
    try {
      await extractNodeDbToLocalFile(node, tempDb);
      const stat = fs.statSync(tempDb);

      await pipeline(
        fs.createReadStream(tempDb),
        zlib.createGzip({ level: 1 }),
        fs.createWriteStream(tempGz)
      );

      const gzBuf = fs.readFileSync(tempGz);
      bundle.components.sqlite = {
        size: stat.size,
        compressedSize: gzBuf.length,
        gzipBase64: gzBuf.toString('base64'),
        dbPath: node.dbPath || ''
      };
    } catch (dbErr) {
      console.warn(`[clone-service] Exporting sqlite failed for ${sourceNodeId}:`, dbErr.message);
    } finally {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
      if (fs.existsSync(tempGz)) fs.unlinkSync(tempGz);
    }
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

  // 4.5 Skills (skills/*/SKILL.md)
  if (selectedModules.includes('skills') && Array.isArray(bundle.components.skills)) {
    for (const sk of bundle.components.skills) {
      if (!sk || !sk.id) continue;
      try {
        await saveSkill(targetNode.id, {
          id: sk.id,
          name: sk.name,
          description: sk.description,
          content: tr(sk.content)
        });
      } catch (sErr) {
        console.warn(`[clone-service] Restoring skill ${sk.id} failed on ${targetNode.id}:`, sErr.message);
      }
    }
    appliedSummary.appliedModules.push('skills');
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

  // 10. OpenCode 2.0 CLI Configuration (cli.json)
  if (selectedModules.includes('cli_config') && bundle.components.cliConfig && bundle.components.cliConfig.raw) {
    try {
      await writeNodeFile(targetNode, targetPaths.cliFile, tr(bundle.components.cliConfig.raw), backupTarget);
      appliedSummary.appliedModules.push('cli_config');
    } catch (e) {
      console.warn(`[clone-service] Restoring cli.json failed on ${targetNodeId}:`, e.message);
    }
  }

  // 11. OpenCode 1.x TUI Configuration (tui.json, Backward Compatible)
  if (selectedModules.includes('tui_config') && bundle.components.tuiConfig && bundle.components.tuiConfig.raw) {
    try {
      await writeNodeFile(targetNode, targetPaths.tuiFile, tr(bundle.components.tuiConfig.raw), backupTarget);
      appliedSummary.appliedModules.push('tui_config');
    } catch (e) {
      console.warn(`[clone-service] Restoring tui.json failed on ${targetNodeId}:`, e.message);
    }
  }

  // 12. SQLite Database (opencode.db)
  if (selectedModules.includes('sqlite') && bundle.components.sqlite && bundle.components.sqlite.gzipBase64) {
    const tempGz = path.join(os.tmpdir(), `oc_imp_gz_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.gz`);
    const tempDb = path.join(os.tmpdir(), `oc_imp_db_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    try {
      const gzBuf = Buffer.from(bundle.components.sqlite.gzipBase64, 'base64');
      fs.writeFileSync(tempGz, gzBuf);

      await pipeline(
        fs.createReadStream(tempGz),
        zlib.createGunzip(),
        fs.createWriteStream(tempDb)
      );

      await restoreLocalFileToNodeDb(targetNode, tempDb, backupTarget);
      appliedSummary.appliedModules.push('sqlite');
    } catch (dbErr) {
      console.warn(`[clone-service] Restoring sqlite failed for ${targetNodeId}:`, dbErr.message);
    } finally {
      if (fs.existsSync(tempGz)) fs.unlinkSync(tempGz);
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    }
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

  const sourceNode = getNode(sourceNodeId);
  const requestedModules = options.modules || null;
  const cloneSqlite = !requestedModules || requestedModules.includes('sqlite');

  // If cloning sqlite, extract source db once to local temp file to avoid giant base64 serialization in JSON bundle
  let tempCloneSourceDb = null;
  if (cloneSqlite) {
    tempCloneSourceDb = path.join(os.tmpdir(), `oc_clone_src_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);
    try {
      await extractNodeDbToLocalFile(sourceNode, tempCloneSourceDb);
    } catch (dbExtractErr) {
      console.warn(`[clone-service] Extracting source sqlite db failed for ${sourceNodeId}:`, dbExtractErr.message);
      tempCloneSourceDb = null;
    }
  }

  try {
    // 1. Export configuration bundle (excluding sqlite from JSON since we stream/transfer directly)
    const configModules = requestedModules ? requestedModules.filter(m => m !== 'sqlite') : null;
    const bundle = await exportEnvironmentBundle(sourceNodeId, configModules);

    // 2. Apply to each target node sequentially
    const results = [];
    for (const tid of targets) {
      try {
        const targetNode = getNode(tid);
        const res = await applyEnvironmentBundle(tid, bundle, options);

        // If sqlite is selected and extracted, restore directly to target
        if (cloneSqlite && tempCloneSourceDb && fs.existsSync(tempCloneSourceDb)) {
          try {
            await restoreLocalFileToNodeDb(targetNode, tempCloneSourceDb, options.backupTarget !== false);
            if (!res.summary.appliedModules.includes('sqlite')) {
              res.summary.appliedModules.push('sqlite');
            }
          } catch (dbRestoreErr) {
            console.warn(`[clone-service] Restoring sqlite to ${tid} failed:`, dbRestoreErr.message);
          }
        }

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
  } finally {
    if (tempCloneSourceDb && fs.existsSync(tempCloneSourceDb)) {
      try { fs.unlinkSync(tempCloneSourceDb); } catch {}
    }
  }
}
