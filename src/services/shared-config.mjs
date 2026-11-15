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

// ============================================================================
// Version-aware core-agent (title / compaction) helpers
// ----------------------------------------------------------------------------
// OpenCode v2 renamed the config surface: `agent` -> `agents`, per-agent
// `disable` -> `disabled`, `prompt` -> `system`. v2 still auto-migrates legacy
// keys at load time, but writing BOTH shapes makes normalize() emit a "conflict"
// diagnostic ("retained native value over legacy"), so on a v2 node we must
// operate ONLY on the native `agents` map and drop the legacy `agent` entry for
// any role we touch. On pre-v2 nodes we keep the legacy `agent` path unchanged.
// ============================================================================

/** The native (v2) agents container, creating it only when needed. */
export function ensureAgentsContainer(parsed) {
  if (!parsed.agents || typeof parsed.agents !== 'object') parsed.agents = {};
  return parsed.agents;
}

/** Drop the legacy singular `agent.<role>` entry once its native twin exists. */
export function dropLegacyAgent(parsed, role) {
  if (parsed.agent && typeof parsed.agent === 'object' && Object.hasOwn(parsed.agent, role)) {
    delete parsed.agent[role];
    if (Object.keys(parsed.agent).length === 0) delete parsed.agent;
  }
}

/**
 * Return the writable agent object for `role` on a v2 node, migrating from the
 * legacy `agent.<role>` shape when present (disable->disabled, prompt->system).
 */
export function ensureNativeAgent(parsed, role) {
  const agents = ensureAgentsContainer(parsed);
  if (agents[role] && typeof agents[role] === 'object') return agents[role];
  const legacy = parsed.agent && typeof parsed.agent === 'object' ? parsed.agent[role] : undefined;
  const native = {};
  if (legacy && typeof legacy === 'object') {
    if (legacy.model !== undefined) native.model = legacy.model;
    if (legacy.disable !== undefined) native.disabled = legacy.disable;
    if (legacy.prompt !== undefined) native.system = legacy.prompt;
    if (legacy.description !== undefined) native.description = legacy.description;
    if (legacy.mode !== undefined) native.mode = legacy.mode;
    if (legacy.hidden !== undefined) native.hidden = legacy.hidden;
    if (legacy.color !== undefined) native.color = legacy.color;
    if (legacy.steps !== undefined) native.steps = legacy.steps;
  }
  agents[role] = native;
  dropLegacyAgent(parsed, role);
  return native;
}

/**
 * Set a core-agent field on either config generation.
 *   kind: 'model' | 'enabled' | 'system'
 * For v2 `enabled:false` writes `disabled:true`; enabling removes the key.
 */
export function setCoreAgentField(parsed, isV2, role, kind, value) {
  if (isV2) {
    const agent = ensureNativeAgent(parsed, role);
    if (kind === 'model') agent.model = value;
    else if (kind === 'system') {
      if (value === undefined || value === '') delete agent.system;
      else agent.system = value;
    } else if (kind === 'enabled') {
      if (value === false) agent.disabled = true;
      else delete agent.disabled;
    }
    return;
  }
  if (!parsed.agent || typeof parsed.agent !== 'object') parsed.agent = {};
  if (!parsed.agent[role] || typeof parsed.agent[role] !== 'object') parsed.agent[role] = {};
  const agent = parsed.agent[role];
  if (kind === 'model') agent.model = value;
  else if (kind === 'system') {
    if (value === undefined || value === '') delete agent.prompt;
    else agent.prompt = value;
  } else if (kind === 'enabled') {
    if (value === false) agent.disable = true;
    else delete agent.disable;
  }
}

/** Read a core-agent model for display, preferring the native v2 entry. */
export function readCoreAgentModel(parsed, role) {
  if (parsed.agents && typeof parsed.agents === 'object' && parsed.agents[role]) {
    return parsed.agents[role].model;
  }
  if (parsed.agent && typeof parsed.agent === 'object' && parsed.agent[role]) {
    return parsed.agent[role].model;
  }
  return undefined;
}

/** Read whether a core agent is enabled, honoring disabled(v2)/disable(v1). */
export function readCoreAgentEnabled(parsed, role) {
  const src = (parsed.agents && typeof parsed.agents === 'object' && parsed.agents[role])
    ? parsed.agents[role]
    : (parsed.agent && typeof parsed.agent === 'object' && parsed.agent[role])
      ? parsed.agent[role]
      : null;
  if (!src) return true;
  if (src.disabled !== undefined) return !src.disabled;
  if (src.disable !== undefined) return !src.disable;
  return true;
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
