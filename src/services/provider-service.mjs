// src/services/provider-service.mjs
// Models, Providers, Catalog, Live Endpoint Probing & Auth Service

import { getNode, runDbHelperOnNode, detectNodeOpenCodeVersion } from '../core/node-transport.mjs';
import { updateNodeJsonc, setCoreAgentField } from './shared-config.mjs';

export async function getCatalogModels(nodeId = 'local', providerId = 'opencode') {
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['catalog-models', providerId || 'opencode']);
}

export async function probeProviderModels(nodeId = 'local', baseUrl = '', apiKey = '') {
  if (!baseUrl || !String(baseUrl).trim()) return { models: [] };
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['probe-models', String(baseUrl).trim(), String(apiKey || '').trim()]);
}

export async function saveGlobalModels(nodeId = 'local', data = {}) {
  const node = getNode(nodeId);
  let isV2 = false;
  try { isV2 = (await detectNodeOpenCodeVersion(node)).isV2; } catch {}
  await updateNodeJsonc(node, (parsed) => {
    if (data.primaryModel !== undefined) parsed.model = data.primaryModel;
    // v2 has no top-level small_model: it folds into the title agent's model.
    // A v2 node writing small_model would emit an "unsupported" diagnostic.
    if (!isV2 && data.smallModel !== undefined) parsed.small_model = data.smallModel;
    if (data.titleModel !== undefined) setCoreAgentField(parsed, isV2, 'title', 'model', data.titleModel);
    if (data.compactionModel !== undefined) setCoreAgentField(parsed, isV2, 'compaction', 'model', data.compactionModel);
    // Compaction system prompt + hidden-agent enable/disable toggles
    // (absorbed from the retired saveCoreAgents endpoint — single writer now).
    if (data.compactionPrompt !== undefined) setCoreAgentField(parsed, isV2, 'compaction', 'system', data.compactionPrompt);
    if (data.titleEnabled !== undefined) setCoreAgentField(parsed, isV2, 'title', 'enabled', data.titleEnabled);
    if (data.compactionEnabled !== undefined) setCoreAgentField(parsed, isV2, 'compaction', 'enabled', data.compactionEnabled);
  });
  return { ok: true, isV2 };
}

export async function saveProvider(nodeId = 'local', providerId, providerConfig, modelVisibility = null) {
  if (!providerId) throw new Error('Missing provider id');
  const node = getNode(nodeId);
  await updateNodeJsonc(node, (parsed) => {
    if (!parsed.provider) parsed.provider = {};
    parsed.provider[providerId] = providerConfig || {};
  });
  if (modelVisibility && typeof modelVisibility === 'object') {
    try {
      await runDbHelperOnNode(node, ['set-model-visibility', providerId, JSON.stringify(modelVisibility)]);
    } catch (e) {
      console.warn(`[provider-service] set-model-visibility failed on ${node.id}:`, e.message);
    }
  }
  return { ok: true, id: providerId };
}

export async function saveProviderModelVisibility(nodeId = 'local', providerId, modelVisibility = {}) {
  if (!providerId) throw new Error('Missing provider id');
  const node = getNode(nodeId);
  const res = await runDbHelperOnNode(node, ['set-model-visibility', providerId, JSON.stringify(modelVisibility || {})]);
  return { ok: true, id: providerId, ...res };
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

export async function saveProviderAuth(nodeId = 'local', providerId, keyVal, authType = 'api') {
  if (!providerId) throw new Error('Missing provider id');
  const node = getNode(nodeId);
  return await runDbHelperOnNode(node, ['set-auth', providerId, keyVal ?? '', authType || 'api']);
}
