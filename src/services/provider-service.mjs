// src/services/provider-service.mjs
// Models, Providers, Catalog, Live Endpoint Probing & Auth Service

import { getNode, runDbHelperOnNode } from '../core/node-transport.mjs';
import { updateNodeJsonc } from './shared-config.mjs';

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
