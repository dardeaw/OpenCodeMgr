// src/api/router.mjs
// Extracted HTTP REST API & Static Asset Router for OpenCode Manager

import fs from 'node:fs';
import path from 'node:path';
import { I18N } from '../../i18n.mjs';
import { MANAGER_ROOT_DIR } from '../core/node-transport.mjs';
import * as managerService from '../services/manager-service.mjs';
import { handleJsonRpcMessage, MCP_TOOLS, MCP_SERVER_INFO } from '../mcp/mcp-server.mjs';

const PUBLIC_DIR = path.join(MANAGER_ROOT_DIR, 'public');

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendStaticFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }
  const content = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(content);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

export async function handleHttpRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const { pathname, searchParams } = url;

  // ==========================================================================
  // 1. Static Frontend Assets
  // ==========================================================================
  if (req.method === 'GET') {
    if (pathname === '/' || pathname === '/index.html') {
      return sendStaticFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    }
    if (pathname === '/styles.css') {
      return sendStaticFile(res, path.join(PUBLIC_DIR, 'styles.css'), 'text/css; charset=utf-8');
    }
    if (pathname === '/app.js') {
      return sendStaticFile(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
    }
    if (pathname.startsWith('/js/') && pathname.endsWith('.js')) {
      const candidate = path.resolve(PUBLIC_DIR, '.' + pathname);
      if (candidate.startsWith(PUBLIC_DIR)) {
        return sendStaticFile(res, candidate, 'application/javascript; charset=utf-8');
      }
    }
    if (pathname === '/i18n.js') {
      const osLocale = Intl.DateTimeFormat().resolvedOptions().locale || 'zh-TW';
      const jsPayload = `window.I18N = ${JSON.stringify(I18N)};\nwindow.SERVER_DETECTED_LOCALE = ${JSON.stringify(osLocale)};\nconst I18N = window.I18N;\n`;
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      return res.end(jsPayload);
    }
  }

  // ==========================================================================
  // 2. REST API GET Endpoints
  // ==========================================================================
  if (req.method === 'GET' && pathname.startsWith('/api/')) {
    const nodeId = searchParams.get('node') || 'local';
    try {
      switch (pathname) {
        case '/api/nodes':
          return sendJson(res, 200, managerService.listNodes());

        case '/api/session-stats':
          return sendJson(res, 200, await managerService.getSessionStats(nodeId));

        case '/api/sessions': {
          const workspace = searchParams.get('workspace') || 'all';
          return sendJson(res, 200, await managerService.listSessions(nodeId, workspace));
        }

        case '/api/session-detail': {
          const sessionId = searchParams.get('id') || '';
          return sendJson(res, 200, await managerService.getSessionDetail(nodeId, sessionId));
        }

        case '/api/catalog-models': {
          const providerId = searchParams.get('provider') || 'opencode';
          return sendJson(res, 200, await managerService.getCatalogModels(nodeId, providerId));
        }

        case '/api/probe-provider-models': {
          const baseUrl = searchParams.get('baseURL') || '';
          const apiKey = searchParams.get('apiKey') || '';
          return sendJson(res, 200, await managerService.probeProviderModels(nodeId, baseUrl, apiKey));
        }

        case '/api/config':
          return sendJson(res, 200, await managerService.getNodeConfigSnapshot(nodeId));

        case '/api/skills':
          return sendJson(res, 200, await managerService.listSkills(nodeId));

        case '/api/env-export': {
          const rawModules = searchParams.get('modules');
          const modules = rawModules ? rawModules.split(',').map(s => s.trim()).filter(Boolean) : null;
          const bundle = await managerService.exportEnvironmentBundle(nodeId, modules);
          const dl = searchParams.get('download');
          if (dl === '1') {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `opencode-env-${nodeId}-${ts}.json`;
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="${filename}"`
            });
            return res.end(JSON.stringify(bundle, null, 2));
          }
          return sendJson(res, 200, bundle);
        }

        case '/api/mcp-tools':
          return sendJson(res, 200, { server: MCP_SERVER_INFO, tools: MCP_TOOLS });

        default:
          return sendJson(res, 404, { error: `Unknown GET endpoint: ${pathname}` });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // ==========================================================================
  // 2.5 Streamable HTTP MCP Endpoint (POST /mcp)
  // ==========================================================================
  if (req.method === 'POST' && pathname === '/mcp') {
    const rpcBody = await readJsonBody(req);
    const rpcResp = await handleJsonRpcMessage(rpcBody);
    if (!rpcResp) {
      res.writeHead(202);
      return res.end();
    }
    return sendJson(res, 200, rpcResp);
  }

  // ==========================================================================
  // 3. REST API POST Endpoints
  // ==========================================================================
  if (req.method === 'POST' && pathname.startsWith('/api/')) {
    const data = await readJsonBody(req);
    const nodeId = data.node || 'local';

    try {
      switch (pathname) {
        // Node Management
        case '/api/test-node':
          return sendJson(res, 200, await managerService.testNode(data.id || nodeId));

        case '/api/save-node':
          return sendJson(res, 200, managerService.upsertNode(data));

        case '/api/delete-node':
          return sendJson(res, 200, managerService.removeNode(data.id));

        // Session & SQLite DB Management
        case '/api/delete-session':
          return sendJson(res, 200, await managerService.deleteSession(nodeId, data.id));

        case '/api/clean-session':
          return sendJson(res, 200, await managerService.cleanSession(nodeId, data.id, data.options));

        case '/api/vacuum-db':
          return sendJson(res, 200, await managerService.vacuumDatabase(nodeId));

        // System Prompts
        case '/api/save-system-prompt':
          return sendJson(res, 200, await managerService.saveSystemPrompt(nodeId, data.type, data.content));

        // Agents
        case '/api/save-agent':
          return sendJson(res, 200, await managerService.saveAgent(nodeId, data));

        case '/api/delete-agent':
          return sendJson(res, 200, await managerService.deleteAgent(nodeId, data.id));

        case '/api/save-core-agent':
          return sendJson(res, 200, await managerService.saveCoreAgents(nodeId, data));

        // Skills (skills/*/SKILL.md)
        case '/api/save-skill':
          return sendJson(res, 200, await managerService.saveSkill(nodeId, data));

        case '/api/delete-skill':
          return sendJson(res, 200, await managerService.deleteSkill(nodeId, data.id));

        // MCP Servers
        case '/api/save-mcp':
          return sendJson(res, 200, await managerService.saveMcpServer(nodeId, data));

        case '/api/delete-mcp':
          return sendJson(res, 200, await managerService.deleteMcpServer(nodeId, data.id));

        // Tools & Bash Permissions
        case '/api/save-tools': {
          const toolsPayload = data.tools && typeof data.tools === 'object' ? data.tools : data;
          return sendJson(res, 200, await managerService.saveTrimTools(nodeId, toolsPayload));
        }

        case '/api/save-permissions':
          return sendJson(res, 200, await managerService.saveBashPermissions(nodeId, data.deny, data.ask));

        // Models, Providers & Auth
        case '/api/save-global-models':
          return sendJson(res, 200, await managerService.saveGlobalModels(nodeId, data));

        case '/api/save-provider':
          return sendJson(res, 200, await managerService.saveProvider(nodeId, data.id, data.providerConfig, data.modelVisibility));

        case '/api/save-model-visibility':
          return sendJson(res, 200, await managerService.saveProviderModelVisibility(nodeId, data.id, data.modelVisibility));

        case '/api/delete-provider':
          return sendJson(res, 200, await managerService.deleteProvider(nodeId, data.id));

        case '/api/save-auth':
          return sendJson(res, 200, await managerService.saveProviderAuth(nodeId, data.id, data.key, data.type));

        // Plugins & Per-Agent Role Scopes
        case '/api/save-plugin':
          return sendJson(res, 200, await managerService.savePlugin(nodeId, data));

        case '/api/toggle-plugin':
          return sendJson(res, 200, await managerService.togglePlugin(nodeId, data.filename, data.enabled));

        case '/api/reorder-plugin':
          return sendJson(res, 200, await managerService.reorderPlugin(nodeId, data.filename, data.delta));

        case '/api/delete-plugin':
          return sendJson(res, 200, await managerService.deletePlugin(nodeId, data.filename));

        // Raw opencode.jsonc
        case '/api/save-raw-jsonc':
          return sendJson(res, 200, await managerService.saveRawJsonc(nodeId, data.content));

        // Environment Clone, Export & Import
        case '/api/env-import':
          return sendJson(res, 200, await managerService.applyEnvironmentBundle(data.node || nodeId, data.bundle, data.options || {}));

        case '/api/env-clone':
          return sendJson(res, 200, await managerService.cloneNodeToNode(data.sourceNode, data.targetNodes, data.options || {}));

        default:
          return sendJson(res, 404, { error: `Unknown POST endpoint: ${pathname}` });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}
