# OpenCodeMgr (v1.6.0)

Cross-Platform GUI & MCP Management Suite for **OpenCode** — managing Environment Cloning & Snapshot Backups, Models & Providers (`OpenCode Zen` / `OpenCode Go` / `Models.dev` / Custom), Per-Agent Plugins (`plugin/*.js`), Custom Agent Roles (`agent/*.md`), System Prompts, MCP Servers, Multi-Host SSH Nodes, and Deep SQLite Session Maintenance.

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [Changelog](CHANGELOG.md)

---

## Overview

**OpenCodeMgr** is a zero-dependency, full-featured desktop and web management control center built for **OpenCode** (`opencode-ai`). It provides both an interactive dark-themed GUI dashboard (`http://127.0.0.1:5210`) and a compliant **Model Context Protocol (MCP) Server** (`mcp-server.mjs` / `POST /mcp`) so both developers and AI agents can inspect, configure, clone, and optimize local and remote OpenCode instances.

---

## Key Features

### 1. 🧬 Environment Clone, Network Replication & Snapshot Backup
- **Node-to-Node Live Network Clone**: Direct replication from any source node to one or multiple remote OpenCode nodes across the local network with sequential multi-node execution and live progress reporting.
- **Portable Snapshot Export & Import**: Export configuration snapshots as `.opencode-env.json` bundles with one-click browser download, or restore bundles from file uploads with JSON validation and preview.
- **Smart Cross-Platform Path Translation**: Automatically translates paths between Windows (`C:\Users\馮\.config\opencode\...`) and Linux (`/home/dardeaw/.config/opencode/...`), normalizing path separators (`\` vs `/`) and user directories.
- **Target BaseURL Preservation**: Preserves target-specific endpoints (e.g. local SSH tunnel `127.0.0.1:18200` vs tailnet `100.103.82.28:18200`) so network cloning never breaks model inference.
- **Pre-Execution Safe Auto-Backup**: Creates `.bak-YYYYMMDD_HHMMSS` backups on the target host before applying any file changes.
- **10-Component Granular Selection**: Pick and choose exactly what to clone or export: Providers & Options, Models Visibility, Provider Credentials (`auth.json`), Custom Agents (`agent/*.md`), Plugins (`plugin/*.js`), Plugin Scopes, System Prompts, MCP Servers, Tools, and Bash Permissions.

### 2. 🧠 Models & Providers Management (`/models` & `/connect` Parity)
- **Global Model Assignment**: Configure `model` (Primary), `small_model` (Lightweight helper), `agent.title.model` (Auto-title), and `agent.compaction.model` (Context compaction) with instant **Keyword Fuzzy-Search Combobox Dropdowns**.
- **Built-in & Custom Providers**: First-class support for **OpenCode Zen** (`opencode`), **OpenCode Go** (`opencode-go`), custom local/remote inference servers (`@ai-sdk/openai-compatible` for `llama.cpp`, `vLLM`, `gufo`, `strata`, `lemonade`), and official cloud SDKs.
- **Unified Credential Management**: Manage both `~/.local/share/opencode/auth.json` (`/connect` keys) and `opencode.jsonc` provider options (`baseURL`, `apiKey`, `whitelist`, `blacklist`).
- **Official Models.dev Catalog Browser**: Browse and one-click import model specifications (context/output limits, modalities, reasoning effort, temperature) directly from `~/.cache/opencode/models.json`.

### 3. 🧩 Plugin Management & Per-Agent Role Assignment
- **Lifecycle & Load Order Control**: Discover all `plugin/*.js` scripts on any node, mount/unmount them in `opencode.jsonc` `"plugin"`, adjust execution order (`↑` / `↓`), and edit JavaScript ESM hook code live.
- **Per-Agent Role Scoping (`by Agent Role`)**: Assign each plugin to run on **All Agents (`all`)**, **Only Selected Agents (`include`)**, or **Bypass Selected Agents (`exclude`)**.
- **Two-Way Sync & Runtime Hook Wrapper**: Configure plugin scopes from either the **🧩 Plugins** tab or the **🤖 Agents** editor; automatically generates `plugin-scopes.json` and the non-invasive `plugin/_mgr_scope.js` runtime wrapper.

### 4. 🤖 Custom Agents & Dedicated Tool Permissions
- Manage `agent/*.md` profiles (`mode: all | subagent | primary`, `model` override, routing `description`, and Markdown system prompt).
- Visual per-agent tool permission matrix (`edit`, `bash`, `read`, `grep`/`glob`, `task`, `websearch`/`webfetch`) with one-click **Read-Only Audit** and **Full Dev** presets.

### 5. 💬 Session Tree Aggregation & Deep SQLite Pruning
- **Subagent Tree View**: Automatically groups child subagent executions under their parent root conversations with cumulative size and token statistics.
- **Selective Session Pruning**: Reclaim 40%–60% of `opencode.db` disk space by pruning failed tool calls, `<think>` reasoning chains, oversized tool outputs (`>1500` chars), temporary file snapshots, and empty step markers, followed by one-click SQLite `VACUUM`.

### 6. 🌐 Multi-Host Fleet Management & 4-Language i18n
- Seamlessly switch between **Localhost**, **Direct SSH Nodes**, and **Jump-Host SSH Nodes** with automatic path detection (`~/.config/opencode` and `~/.local/share/opencode/opencode.db`).
- **100% Localized UI (322 keys × 4 languages)**: Instant live switching between **English (`en-US`)**, **Traditional Chinese (`zh-TW`)**, **Simplified Chinese (`zh-CN`)**, and **Japanese (`ja-JP`)**.

### 7. 🔌 Built-in MCP Server (Stdio & Streamable HTTP)
- Exposes **19 MCP Tools (`opencodemgr_*`)** and dynamic resources (`opencodemgr://nodes`, `opencodemgr://config/{node}`) over both `stdio` and `POST http://127.0.0.1:5210/mcp`.

---

## Modular Architecture

```text
OpenCodeMgr/
├── app.mjs                      # Desktop App Window & Server Launcher (--server-only supported)
├── server.mjs                   # Lightweight HTTP Server Entry Point (Port 5210)
├── mcp-server.mjs               # Standalone Stdio MCP Server Entry Point (JSON-RPC 2.0)
├── i18n.mjs                     # 4-Language Localization Dictionary (322 keys: zh-TW, zh-CN, en-US, ja-JP)
├── db_helper.py                 # Cross-platform Python SQLite & Models.dev Catalog Engine
├── Launcher.cs                  # Native Windows .exe Launcher Source (Maximized Edge/Chrome App Mode)
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # Local FS, Paramiko SSH, Jump SSH & Safe File Backup Layer
│   │   └── parsers.mjs          # JSONC Parser, Agent Frontmatter, trim-tools & Plugin Scope Wrapper
│   ├── services/
│   │   ├── clone-service.mjs    # Environment Export, Import, Cross-Platform Translation & Clone
│   │   ├── node-service.mjs     # Multi-Host Node Registry, SSH Command Execution & Health
│   │   ├── provider-service.mjs # Providers, Models Catalog, and Desktop Model Visibility Sync
│   │   ├── agent-plugin-service.mjs # Agents Frontmatter, Plugin Scoping & System Prompts
│   │   ├── session-service.mjs  # SQLite Session Tree Aggregation, Pruning & Vacuum
│   │   ├── shared-config.mjs    # Shared Node FS & Config Path Resolvers
│   │   └── manager-service.mjs  # Unified Business Logic Facade (REST API & MCP Server)
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*), Streamable MCP (/mcp) & Asset Router
│   └── mcp/
│       └── mcp-server.mjs       # MCP Tool Definitions (19 tools), Resource Handlers & Stdio Framing
└── public/
    ├── index.html               # Decoupled Dashboard HTML Structure & Modals
    ├── styles.css               # Responsive Dark Theme & Split-View Styles
    ├── app.js                   # Main Frontend Application Controller
    └── js/
        └── modules/
            └── env-clone.js     # Environment Clone, Export & Import Modal Controller
```

---

## Quick Start

### Prerequisites
- **Node.js** `>= 18.0.0`
- **Python** `>= 3.8`

### 1. Clone & Configure Nodes
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
cp nodes.example.json nodes.json
```

### 2. Launch GUI Application
```bash
# Launch Server + Native Maximized App Window
npm start

# Launch Background HTTP Server Only (http://127.0.0.1:5210)
npm run server
```
On Windows, you can also double-click **`OpenCode Manager.exe`** directly.

### 3. Mount as an MCP Server in `opencode.jsonc`
```json
{
  "mcp": {
    "opencodemgr": {
      "type": "local",
      "command": ["node", "/path/to/OpenCodeMgr/mcp-server.mjs"],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
