// src/mcp/mcp-server.mjs
// Model Context Protocol (MCP) Server for OpenCode Manager
// Zero-dependency JSON-RPC 2.0 stdio server (supports both newline-delimited JSON and Content-Length framing)

import * as managerService from '../services/manager-service.mjs';

export const MCP_SERVER_INFO = {
  name: 'opencodemgr-mcp',
  version: '1.7.0'
};

export const MCP_TOOLS = [
  {
    name: 'opencodemgr_list_nodes',
    description: 'List all managed OpenCode host nodes (local, SSH, Jump SSH) configured in OpenCode Manager.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'opencodemgr_test_node',
    description: 'Test connectivity and health of a specific OpenCode host node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (e.g. "local", "remote55", "remote67", "remote146"). Defaults to "local".' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_get_config',
    description: 'Get full OpenCode configuration snapshot for a node, including active models, providers, custom agents, plugins & per-agent scopes, MCP servers, and system prompts.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_session_stats',
    description: 'Get OpenCode SQLite database statistics (DB size, WAL size, session/message/part counts, and workspace list) on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_list_sessions',
    description: 'List OpenCode conversation sessions on a node, optionally filtered by workspace directory.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        workspace: { type: 'string', description: 'Workspace path or "all" (default: "all").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_get_session_detail',
    description: 'Get full conversation messages, reasoning blocks, and tool call outputs for a specific OpenCode session.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        sessionId: { type: 'string', description: 'Session ID (e.g. "ses_...").' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'opencodemgr_clean_session',
    description: 'Prune redundant data (errors, reasoning/CoT, large tool outputs, file snapshots, step markers) from an OpenCode session and optionally VACUUM the SQLite DB.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        sessionId: { type: 'string', description: 'Session ID to clean.' },
        options: {
          type: 'string',
          description: 'Comma-separated prune targets: "errors,reasoning,outputs,files,steps" (default: all five).'
        },
        vacuum: { type: 'boolean', description: 'Whether to run SQLite VACUUM after cleaning (default: false).' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'opencodemgr_delete_session',
    description: 'Permanently delete a conversation session from a node SQLite database.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        sessionId: { type: 'string', description: 'Session ID to delete.' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'opencodemgr_list_providers',
    description: 'List all configured providers (opencode.jsonc), authenticated providers (auth.json), and built-in providers (opencode Zen / opencode-go) on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_set_global_models',
    description: 'Assign global active models (primary model, small_model, title model, compaction model) on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        primaryModel: { type: 'string', description: 'Primary model in provider/model format (e.g. "gufo/gufo-qwen3.8-flash-next").' },
        smallModel: { type: 'string', description: 'Small helper model in provider/model format.' },
        titleModel: { type: 'string', description: 'Title generation model in provider/model format.' },
        compactionModel: { type: 'string', description: 'Context compaction model in provider/model format.' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_save_provider',
    description: 'Create or update a model provider and its sub-models in opencode.jsonc on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        providerId: { type: 'string', description: 'Provider key (e.g. "gufo", "strata", "opencode").' },
        providerConfig: {
          type: 'object',
          description: 'Provider configuration object (npm, name, options.baseURL, options.apiKey, models, whitelist, blacklist).'
        }
      },
      required: ['providerId', 'providerConfig']
    }
  },
  {
    name: 'opencodemgr_list_agents',
    description: 'List all custom agents (agent/*.md) and their tool permissions and plugin assignments on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_save_agent',
    description: 'Create or update a custom agent (agent/*.md), including model override, tool permissions, and per-agent plugin assignments.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        id: { type: 'string', description: 'Agent ID (filename without .md, e.g. "llm-engineer").' },
        mode: { type: 'string', description: '"all", "subagent", or "primary".' },
        model: { type: 'string', description: 'Optional model override (provider/model).' },
        description: { type: 'string', description: 'Agent description for routing.' },
        prompt: { type: 'string', description: 'Agent system prompt markdown body.' },
        permissions: { type: 'object', description: 'Tool permissions map (edit, bash, read, grep, glob, task, websearch, webfetch).' },
        pluginStates: { type: 'object', description: 'Optional map of { "plugin.js": true/false } for per-agent plugin scoping.' }
      },
      required: ['id']
    }
  },
  {
    name: 'opencodemgr_list_skills',
    description: 'List all OpenCode skills (skills/*/SKILL.md) configured on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_get_skill',
    description: 'Get details and instructions of a specific OpenCode skill.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        id: { type: 'string', description: 'Skill ID / folder name (e.g. "git-release").' }
      },
      required: ['id']
    }
  },
  {
    name: 'opencodemgr_save_skill',
    description: 'Create or update an OpenCode skill (skills/<id>/SKILL.md).',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        id: { type: 'string', description: 'Skill folder identifier (e.g. "docker-deploy").' },
        name: { type: 'string', description: 'Skill display name.' },
        description: { type: 'string', description: 'Short description displayed to AI agent.' },
        content: { type: 'string', description: 'Markdown instructions body of SKILL.md.' }
      },
      required: ['id']
    }
  },
  {
    name: 'opencodemgr_delete_skill',
    description: 'Delete an OpenCode skill folder (skills/<id>/) from a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        id: { type: 'string', description: 'Skill folder identifier (e.g. "git-release").' }
      },
      required: ['id']
    }
  },
  {
    name: 'opencodemgr_list_plugins',
    description: 'List all installed plugins (plugin/*.js), mount status, execution order, and per-agent role assignment scopes on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_configure_plugin',
    description: 'Enable/disable a plugin, update its per-agent role scope (all / include / exclude), or save its JS code on a node.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        filename: { type: 'string', description: 'Plugin filename (e.g. "codegraph-first.js").' },
        enabled: { type: 'boolean', description: 'Whether the plugin is mounted in opencode.jsonc.' },
        scopeMode: { type: 'string', enum: ['all', 'include', 'exclude'], description: 'Per-agent scope mode: "all", "include" (only specified agents), or "exclude" (bypass on specified agents).' },
        scopeAgents: { type: 'array', items: { type: 'string' }, description: 'List of agent names for include/exclude scope mode.' },
        content: { type: 'string', description: 'Optional JS source code if creating or updating plugin code.' }
      },
      required: ['filename']
    }
  },
  {
    name: 'opencodemgr_manage_mcp',
    description: 'Add, update, or delete an MCP server entry in a node opencode.jsonc.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Node ID (default: "local").' },
        action: { type: 'string', enum: ['save', 'delete'], description: '"save" or "delete".' },
        id: { type: 'string', description: 'MCP server ID (e.g. "codegraph", "docgraph").' },
        type: { type: 'string', description: '"local" or "remote" (default: "local").' },
        command: { type: 'array', items: { type: 'string' }, description: 'Command array for local MCP server.' },
        enabled: { type: 'boolean', description: 'Whether enabled (default: true).' },
        timeout: { type: 'number', description: 'Timeout in ms (default: 60000).' }
      },
      required: ['action', 'id']
    }
  },
  {
    name: 'opencodemgr_export_env',
    description: 'Export a portable OpenCode environment bundle from a node (providers, models, auth, agents, plugins, scopes, prompts, MCP, tools, permissions, sqlite).',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Source node ID (default: "local").' },
        modules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional subset of modules to export (e.g. ["providers", "agents", "plugins", "auth", "sqlite"]). Defaults to all.'
        }
      },
      required: []
    }
  },
  {
    name: 'opencodemgr_import_env',
    description: 'Import and apply a portable OpenCode environment bundle onto a target node with automatic backup and cross-platform path translation.',
    inputSchema: {
      type: 'object',
      properties: {
        node: { type: 'string', description: 'Target node ID to restore onto.' },
        bundle: { type: 'object', description: 'The environment bundle object created by export.' },
        smartPathTranslate: { type: 'boolean', description: 'Automatically translate file paths between Windows and Linux. Default true.' },
        preserveBaseUrls: { type: 'boolean', description: 'Preserve existing provider baseURL on target node. Default true.' },
        backupTarget: { type: 'boolean', description: 'Create .bak backup on target node before applying. Default true.' }
      },
      required: ['node', 'bundle']
    }
  },
  {
    name: 'opencodemgr_clone_env',
    description: 'Clone an OpenCode environment directly across the network from a source node to one or more target nodes with auto-backup and smart path translation.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceNode: { type: 'string', description: 'Source node ID (e.g. "local").' },
        targetNodes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of target node IDs to clone onto (e.g. ["remote55"]).'
        },
        modules: { type: 'array', items: { type: 'string' }, description: 'Subset of modules to clone. Defaults to all.' },
        smartPathTranslate: { type: 'boolean', description: 'Automatically rewrite Windows/Linux config paths. Default true.' },
        preserveBaseUrls: { type: 'boolean', description: 'Keep existing provider baseURL on targets. Default true.' }
      },
      required: ['sourceNode', 'targetNodes']
    }
  }
];

export async function executeMcpTool(name, args = {}) {
  const nodeId = args.node || 'local';

  switch (name) {
    case 'opencodemgr_list_nodes':
      return managerService.listNodes();

    case 'opencodemgr_test_node':
      return await managerService.testNode(nodeId);

    case 'opencodemgr_get_config':
      return await managerService.getNodeConfigSnapshot(nodeId);

    case 'opencodemgr_session_stats':
      return await managerService.getSessionStats(nodeId);

    case 'opencodemgr_list_sessions':
      return await managerService.listSessions(nodeId, args.workspace || 'all');

    case 'opencodemgr_get_session_detail':
      return await managerService.getSessionDetail(nodeId, args.sessionId);

    case 'opencodemgr_clean_session': {
      const res = await managerService.cleanSession(nodeId, args.sessionId, args.options);
      if (args.vacuum) {
        await managerService.vacuumDatabase(nodeId);
      }
      return res;
    }

    case 'opencodemgr_delete_session':
      return await managerService.deleteSession(nodeId, args.sessionId);

    case 'opencodemgr_list_providers': {
      const snap = await managerService.getNodeConfigSnapshot(nodeId);
      return {
        node: snap.node,
        activeGlobalModels: {
          primaryModel: snap.config?.model || '',
          smallModel: snap.config?.small_model || '',
          titleModel: snap.config?.agent?.title?.model || '',
          compactionModel: snap.config?.agent?.compaction?.model || ''
        },
        configuredProviders: snap.config?.provider || {},
        authenticatedProviders: snap.providersMeta?.auth || {},
        builtinProviders: {
          opencode: snap.providersMeta?.catalog?.['opencode'] || null,
          'opencode-go': snap.providersMeta?.catalog?.['opencode-go'] || null
        }
      };
    }

    case 'opencodemgr_set_global_models':
      return await managerService.saveGlobalModels(nodeId, args);

    case 'opencodemgr_save_provider':
      return await managerService.saveProvider(nodeId, args.providerId, args.providerConfig);

    case 'opencodemgr_list_agents': {
      const snap = await managerService.getNodeConfigSnapshot(nodeId);
      return {
        node: snap.node,
        agents: snap.agents,
        pluginScopes: snap.pluginScopes
      };
    }

    case 'opencodemgr_save_agent':
      return await managerService.saveAgent(nodeId, args);

    case 'opencodemgr_list_skills':
      return await managerService.listSkills(nodeId);

    case 'opencodemgr_get_skill':
      return await managerService.getSkill(nodeId, args.id);

    case 'opencodemgr_save_skill':
      return await managerService.saveSkill(nodeId, args);

    case 'opencodemgr_delete_skill':
      return await managerService.deleteSkill(nodeId, args.id);

    case 'opencodemgr_list_plugins': {
      const snap = await managerService.getNodeConfigSnapshot(nodeId);
      return {
        node: snap.node,
        plugins: snap.plugins.map(p => ({
          filename: p.filename,
          enabled: p.enabled,
          order: p.order,
          description: p.description,
          scope: p.scope
        }))
      };
    }

    case 'opencodemgr_configure_plugin': {
      const snap = await managerService.getNodeConfigSnapshot(nodeId);
      const existing = (snap.plugins || []).find(p => p.filename === args.filename);
      const scope = args.scopeMode
        ? { mode: args.scopeMode, agents: Array.isArray(args.scopeAgents) ? args.scopeAgents : [] }
        : (existing?.scope || { mode: 'all', agents: [] });
      const enabled = args.enabled !== undefined ? args.enabled : (existing ? existing.enabled : true);
      const content = args.content !== undefined ? args.content : existing?.content;
      return await managerService.savePlugin(nodeId, {
        filename: args.filename,
        enabled,
        scope,
        content
      });
    }

    case 'opencodemgr_manage_mcp': {
      if (args.action === 'delete') {
        return await managerService.deleteMcpServer(nodeId, args.id);
      }
      return await managerService.saveMcpServer(nodeId, args);
    }

    case 'opencodemgr_export_env':
      return await managerService.exportEnvironmentBundle(nodeId, args.modules);

    case 'opencodemgr_import_env':
      return await managerService.applyEnvironmentBundle(args.node, args.bundle, {
        smartPathTranslate: args.smartPathTranslate,
        preserveBaseUrls: args.preserveBaseUrls,
        backupTarget: args.backupTarget
      });

    case 'opencodemgr_clone_env':
      return await managerService.cloneNodeToNode(args.sourceNode, args.targetNodes, {
        modules: args.modules,
        smartPathTranslate: args.smartPathTranslate,
        preserveBaseUrls: args.preserveBaseUrls
      });

    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

export async function handleJsonRpcMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;

  // Notifications have no id and expect no response
  if (id === undefined || id === null) {
    return null;
  }

  try {
    switch (method) {
      case 'initialize': {
        const clientVersion = params?.protocolVersion || '2024-11-05';
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: clientVersion,
            capabilities: {
              tools: {},
              resources: {}
            },
            serverInfo: MCP_SERVER_INFO
          }
        };
      }

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS
          }
        };

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        try {
          const data = await executeMcpTool(toolName, toolArgs);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(data, null, 2)
                }
              ],
              isError: false
            }
          };
        } catch (toolErr) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: toolErr.message }, null, 2)
                }
              ],
              isError: true
            }
          };
        }
      }

      case 'resources/list': {
        const nodes = managerService.listNodes();
        const resources = [
          {
            uri: 'opencodemgr://nodes',
            name: 'OpenCode Managed Host Nodes',
            mimeType: 'application/json',
            description: 'List of all OpenCode host nodes configured in OpenCode Manager'
          },
          ...nodes.map(n => ({
            uri: `opencodemgr://config/${n.id}`,
            name: `OpenCode Config Snapshot (${n.name})`,
            mimeType: 'application/json',
            description: `Full OpenCode configuration snapshot for node ${n.id} (${n.ip})`
          }))
        ];
        return {
          jsonrpc: '2.0',
          id,
          result: { resources }
        };
      }

      case 'resources/read': {
        const uri = String(params?.uri || '');
        if (uri === 'opencodemgr://nodes') {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(managerService.listNodes(), null, 2)
                }
              ]
            }
          };
        }
        if (uri.startsWith('opencodemgr://config/')) {
          const nodeId = uri.slice('opencodemgr://config/'.length) || 'local';
          const snap = await managerService.getNodeConfigSnapshot(nodeId);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(snap, null, 2)
                }
              ]
            }
          };
        }
        throw new Error(`Unknown resource URI: ${uri}`);
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: err.message
      }
    };
  }
}

export function startMcpStdioServer() {
  let useContentLength = false;
  let buffer = Buffer.alloc(0);
  let isProcessing = false;
  let stdinEnded = false;

  function sendResponse(obj) {
    if (!obj) return;
    const payload = JSON.stringify(obj);
    if (useContentLength) {
      const byteLen = Buffer.byteLength(payload, 'utf8');
      process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${payload}`);
    } else {
      process.stdout.write(payload + '\n');
    }
  }

  async function processBuffer() {
    if (isProcessing) return;
    isProcessing = true;
    try {
      while (buffer.length > 0) {
        const strPreview = buffer.toString('utf8', 0, Math.min(buffer.length, 64));
        if (strPreview.startsWith('Content-Length:')) {
          useContentLength = true;
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd === -1) break;
          const headerStr = buffer.toString('utf8', 0, headerEnd);
          const match = headerStr.match(/Content-Length:\s*(\d+)/i);
          if (!match) {
            buffer = buffer.subarray(headerEnd + 4);
            continue;
          }
          const contentLen = parseInt(match[1], 10);
          const totalLen = headerEnd + 4 + contentLen;
          if (buffer.length < totalLen) break;
          const bodyStr = buffer.toString('utf8', headerEnd + 4, totalLen);
          buffer = buffer.subarray(totalLen);
          try {
            const msg = JSON.parse(bodyStr);
            const resp = await handleJsonRpcMessage(msg);
            if (resp) sendResponse(resp);
          } catch (e) {
            process.stderr.write(`[opencodemgr-mcp] JSON parse error: ${e.message}\n`);
          }
        } else {
          const nlIdx = buffer.indexOf('\n');
          if (nlIdx === -1) break;
          const line = buffer.toString('utf8', 0, nlIdx).trim();
          buffer = buffer.subarray(nlIdx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            const resp = await handleJsonRpcMessage(msg);
            if (resp) sendResponse(resp);
          } catch (e) {
            process.stderr.write(`[opencodemgr-mcp] Line JSON parse error: ${e.message}\n`);
          }
        }
      }
    } finally {
      isProcessing = false;
      if (stdinEnded && buffer.length === 0) {
        process.exit(0);
      }
    }
  }

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });

  process.stdin.on('end', () => {
    stdinEnded = true;
    if (!isProcessing && buffer.length === 0) {
      process.exit(0);
    } else {
      processBuffer();
    }
  });
}
