// src/services/shared-config.mjs
// Shared Configuration & Plugin Scope Helpers for OpenCode Manager Services

import {
  getNodePaths,
  readNodeFile,
  writeNodeFile
} from '../core/node-transport.mjs';
import {
  parseJsonc,
  MGR_SCOPE_HELPER_CODE
} from '../core/parsers.mjs';

/**
 * Read and parse a node's opencode.jsonc safely
 */
export async function readNodeJsonc(node) {
  const { cfgFile } = getNodePaths(node);
  const raw = await readNodeFile(node, cfgFile);
  return {
    raw,
    parsed: parseJsonc(raw) || {},
    cfgFile
  };
}

/**
 * Read, mutate, and persist a node's opencode.jsonc safely
 */
export async function updateNodeJsonc(node, mutator) {
  const { parsed, cfgFile } = await readNodeJsonc(node);
  await mutator(parsed);
  await writeNodeFile(node, cfgFile, JSON.stringify(parsed, null, 2) + '\n');
  return parsed;
}

/**
 * Read plugin-scopes.json from a node
 */
export async function readPluginScopes(node) {
  const { pluginScopesFile } = getNodePaths(node);
  const raw = await readNodeFile(node, pluginScopesFile);
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/**
 * Persist plugin-scopes.json and ensure _mgr_scope.js runtime wrapper exists if any scope is restricted
 */
export async function writePluginScopes(node, scopes) {
  const { sep, pluginDir, pluginScopesFile } = getNodePaths(node);
  const hasRestricted = Object.values(scopes || {}).some(
    r => r && r.mode && r.mode !== 'all' && Array.isArray(r.agents) && r.agents.length > 0
  );
  if (hasRestricted) {
    await writeNodeFile(node, `${pluginDir}${sep}_mgr_scope.js`, MGR_SCOPE_HELPER_CODE, false);
  }
  await writeNodeFile(node, pluginScopesFile, JSON.stringify(scopes || {}, null, 2) + '\n', false);
}
