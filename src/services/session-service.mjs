// src/services/session-service.mjs
// Session & SQLite Database Maintenance Service

import { getNode, runDbHelperOnNode } from '../core/node-transport.mjs';

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
