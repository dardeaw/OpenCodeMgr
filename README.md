# OpenCodeMgr (v1.7.0)

> Complete Cross-Platform GUI & MCP Management Suite for **OpenCode (`opencode-ai`)** — Native **Specialized Skills Management (`skills/*/SKILL.md`)**, **Multi-Host Environment Network Replication & Snapshot Backup**, **Models & Providers Visual Configuration**, **Per-Agent Plugin Routing (`plugin/*.js`)**, **Custom Agent Roles (`agent/*.md`)**, **23 Built-in MCP Tools**, and **Deep SQLite Session Maintenance**.

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [Changelog](CHANGELOG.md)

---

## Why OpenCodeMgr?

**OpenCode** is one of the most powerful agentic coding assistants available in the terminal. However, as power users scale their daily usage across multiple workstations, GPU inference servers, and custom agent configurations, several critical maintenance bottlenecks arise:

1. **Skills Are Hard to Manage**: OpenCode natively supports `skills/*/SKILL.md` (following the `agentskills.io` standard), but managing them requires manual terminal navigation, markdown editing, and repetitive cross-server copying without a visual overview or validation.
2. **Multi-Host Environment Sync is Error-Prone**: Replicating provider endpoints, authentication keys, custom agents, skills, and plugins between dev machines (Windows backslashes) and remote Linux GPU boxes (forward slashes) frequently breaks paths and local network BaseURLs.
3. **SQLite Database (`opencode.db`) Bloat**: Extensive multi-turn agent debugging, large tool dumps, reasoning chains (`<think>`), and file snapshots bloat the SQLite database into gigabytes, causing startup latency.
4. **Manual `opencode.jsonc` Edits Risk Syntax Errors**: A single trailing comma or bracket mismatch can break OpenCode's entire configuration.

**OpenCodeMgr** delivers a zero-dependency, local-first interactive dark-themed GUI (`http://127.0.0.1:5210`) alongside a standard **Model Context Protocol (MCP) Server** (`mcp-server.mjs`), resolving these friction points in one unified cockpit.

---

## Key Features & Capabilities

### 1. ⚡ Specialized Skills Management (`skills/*/SKILL.md`, agentskills.io Standard)

OpenCode implements the open [agentskills.io](https://agentskills.io) standard for specialized procedural workflows. OpenCodeMgr provides a dedicated visual management hub:

```text
~/.config/opencode/skills/
├── git-release/
│   └── SKILL.md            # YAML Frontmatter (name, description) + Procedural Workflow
├── code-refactor/
│   └── SKILL.md
└── sqlite-optimizer/
    └── SKILL.md
```

- **How OpenCode Skills Work**:
  When OpenCode boots, it automatically discovers and parses all `skills/*/SKILL.md` directories. It reads the top YAML frontmatter (`name` and `description`) into the model's global awareness. When a user prompt matches a skill's activation trigger, the agent automatically ingests the entire `SKILL.md` body and executes the exact procedure step-by-step.
- **SKILL.md Specification Example**:
  ```markdown
  ---
  name: git-release
  description: Automated SemVer version bump, changelog generation, git commit/tag, and push workflows
  ---

  # Git Release Workflow
  When the user requests a version release, strictly execute the following SOP:
  1. Verify working tree cleanliness with git status and run syntax checks.
  2. Determine version increment (Patch / Minor / Major) according to SemVer.
  3. Prepend new release section to CHANGELOG.md.
  4. Stage changes, commit with standard message, and create signed/annotated git tag.
  5. Push commits and tags to origin repository.
  ```
- **Visual Dual-Pane GUI Workflow**:
  - **Sticky Top Card Selector**: Instant real-time fuzzy search across skill IDs, display names, and trigger descriptions.
  - **Full-Height Vertical Markdown Editor**: Dedicated monospace code editor with an independent scrollbar and auto-expanding layout.
  - **Pre-Execution Safety**: Automatic `.bak` backup creation before any skill modification or folder deletion.
- **3 Bundled Production Demonstration Skills**:
  1. `git-release`: Automated SemVer progression, changelog generation, git commit/tag, and push workflow.
  2. `code-refactor`: Single Responsibility Principle (SRP), clean architectural layering, syntax check, and zero-temp file discipline.
  3. `sqlite-optimizer`: SQLite WAL checkpoint truncate, conversation history pruning, and database `VACUUM`.
- **4 Dedicated Skill MCP Automation Tools**:
  AI agents can self-manage and query skills via `opencodemgr_list_skills`, `opencodemgr_get_skill`, `opencodemgr_save_skill`, and `opencodemgr_delete_skill`.

---

### 2. 🧬 Multi-Host Environment Clone & Snapshot Backup

- **Live Node-to-Node Network Replication**:
  Directly push your active OpenCode setup from your local machine to one or multiple remote Linux/macOS host nodes across your LAN with sequential execution and granular per-node progress reporting.
- **Portable Snapshot Bundles (Export & Import)**:
  Pack your entire configuration into a portable `.opencode-env.json` bundle with one-click browser download (`GET /api/env-export?download=1`). Restore it onto any host with full JSON schema validation and component previews.
- **Smart Cross-Platform Path Translation**:
  Intelligently converts paths between Windows (`C:\Users\馮\.config\opencode\...`) and Linux (`/home/dardeaw/.config/opencode/...`), normalizing path separators (`\` vs `/`) and user directories without dead links.
- **Target BaseURL Preservation**:
  Optionally preserves destination-specific provider endpoints (e.g. local SSH tunnel `127.0.0.1:18200` vs tailnet IP `100.103.82.28:18200`), ensuring model connectivity never breaks after cloning.
- **12-Component Granular Selection Matrix**:
  Independently toggle what to clone or export:
  1. Providers & Model Specs (`opencode.jsonc` provider configuration)
  2. Model Visibility Toggles (`opencode.global.dat`)
  3. Provider Credentials (`auth.json`)
  4. Custom Agent Roles (`agent/*.md`)
  5. **Specialized Skills (`skills/*/SKILL.md`)**
  6. Plugins (`plugin/*.js`)
  7. Per-Agent Plugin Scopes (`plugin-scopes.json`)
  8. System Prompts & Global Instructions (`AGENTS.md`)
  9. MCP Server Registrations (`opencode.jsonc` mcp)
  10. System Prompt Trimming Rules (`plugin/trim-tools.js`)
  11. Bash Execution Permissions (`permission.bash`)
  12. **SQLite Session Database (`opencode.db`)** (with WAL checkpoint flush and streaming gzip compression)

---

### 3. 🧠 Models & Providers Management (Parity with `/models` & `/connect`)

- **Global Active Model Assignment**:
  Configure Primary Model (`model`), Lightweight Model (`small_model`), Title Model (`agent.title.model`), and Compaction Model (`agent.compaction.model`) using **Keyword Fuzzy-Search Combobox Dropdowns**.
- **Live OpenCode Zen Sync**:
  Live intersection with `https://opencode.ai/zen/v1/models` filters out deprecated entries, displaying only currently active recommended models.
- **Official Models.dev Catalog Browser**:
  Browse and one-click import 40+ providers and hundreds of models directly from `~/.cache/opencode/models.json` with context limits, modality flags, and reasoning effort parameters.
- **Custom Local Inference Servers**:
  First-class support for `@ai-sdk/openai-compatible` endpoints (`llama.cpp`, `vLLM`, `gufo`, `strata`, `lemonade`) and major official cloud providers.

---

### 4. 🧩 Plugin Management & Per-Agent Role Scoping

- **Lifecycle & Execution Ordering**:
  Discover all `plugin/*.js` scripts on any node, mount/unmount in `opencode.jsonc`, adjust load order (`↑` / `↓`), and edit JavaScript ESM hook code live.
- **Role-Based Scope Delegation**:
  - `all`: Universal plugin execution across all agents.
  - `include`: Runs exclusively for selected agent roles (bypassed for unchecked roles).
  - `exclude`: Excludes selected agent roles (runs for everyone else).
- **Non-Invasive Runtime Wrapper**:
  OpenCodeMgr automatically maintains `plugin-scopes.json` and the transparent `plugin/_mgr_scope.js` runtime interceptor without modifying your original plugin code.

---

### 5. 🤖 Custom Agent Roles & Dedicated Tool Permissions

- Visually edit `agent/*.md` profiles (`mode: all | subagent | primary`, model overrides, description triggers, and system prompts).
- **6-Tool Permission Matrix**: Interactively assign per-role permissions for `edit`, `bash`, `read`, `grep`/`glob`, `task`, and `websearch`/`webfetch` with one-click **Read-Only Audit** and **Full Dev** presets.

---

### 6. 💬 Session Tree Aggregation & Deep SQLite Pruning

- **Subagent Hierarchical Tree View**: Automatically groups child subagent tasks beneath their root conversation with token and storage statistics.
- **Deep Pruning Engine**:
  - Prunes failed tool execution dumps
  - Strips oversized tool outputs (customizable threshold, e.g. >1500 chars)
  - Clears reasoning chain tokens (`<think>` blocks)
  - Removes intermediate file edit snapshots
  - Executes SQLite `VACUUM` to reclaim **40% to 60%** of disk space on `opencode.db`.

---

### 7. 🔌 23 Built-in MCP Tools Reference

OpenCodeMgr includes a standard Model Context Protocol (MCP) server supporting Stdio and Streamable HTTP (`POST http://127.0.0.1:5210/mcp`):

| Category | Tool Name | Description |
|---|---|---|
| **Host Fleet** | `opencodemgr_list_nodes` | Enumerate all configured nodes (local, SSH, jump host) |
| | `opencodemgr_test_node` | Test connectivity and latency to a target node |
| | `opencodemgr_get_config` | Fetch a complete configuration snapshot of a node |
| **Sessions & DB** | `opencodemgr_session_stats` | Inspect SQLite DB size, WAL cache, and message counts |
| | `opencodemgr_list_sessions` | List conversations grouped by workspace |
| | `opencodemgr_get_session_detail`| Retrieve full conversation message history and parts |
| | `opencodemgr_clean_session` | Prune oversized outputs and thinking tokens from a session |
| | `opencodemgr_delete_session` | Delete a specific conversation and all subagent branches |
| **Models & Providers**| `opencodemgr_list_providers` | List all configured providers and sub-models |
| | `opencodemgr_set_global_models`| Set primary, small, title, and compaction models |
| | `opencodemgr_save_provider` | Create or update a provider and its credentials |
| **Agents** | `opencodemgr_list_agents` | Enumerate custom agents and tool permission matrices |
| | `opencodemgr_save_agent` | Create or update custom agent markdown profiles |
| **Specialized Skills**| `opencodemgr_list_skills` | **Enumerate all `skills/*/SKILL.md` procedures on a node** |
| | `opencodemgr_get_skill` | **Read frontmatter metadata and full Markdown instructions** |
| | `opencodemgr_save_skill` | **Create or update skills with automated backup and folder init** |
| | `opencodemgr_delete_skill` | **Safely delete skill folders with automatic .bak preservation** |
| **Plugins & Scopes** | `opencodemgr_list_plugins` | List installed plugins, load order, and per-agent scopes |
| | `opencodemgr_configure_plugin`| Enable/disable plugins, adjust agent scopes, or edit code |
| **MCP Management** | `opencodemgr_manage_mcp` | Add, update, or remove MCP server registrations |
| **Environment Sync** | `opencodemgr_export_env` | Export portable OpenCode snapshot bundles (.json) |
| | `opencodemgr_import_env` | Restore environment bundle with path translation & backup |
| | `opencodemgr_clone_env` | Live node-to-node network replication across multiple targets |

---

## Modular Architecture

```text
OpenCodeMgr/
├── app.mjs                      # Desktop App Launcher & Server (--server-only supported)
├── server.mjs                   # Lightweight HTTP Server Entry Point (Port 5210)
├── mcp-server.mjs               # Standalone Stdio MCP Server Entry Point (JSON-RPC 2.0)
├── i18n.mjs                     # 4-Language Localization Dictionary (340+ keys: zh-TW, zh-CN, en-US, ja-JP)
├── db_helper.py                 # Cross-platform Python SQLite & Models.dev Catalog Engine
├── Launcher.cs                  # Native Windows .exe Launcher Source (Maximized Edge/Chrome App Mode)
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # Local FS, Paramiko SSH, Jump SSH & Safe File Backup Layer
│   │   └── parsers.mjs          # JSONC Parser, Agent/Skill Frontmatter & Plugin Scope Wrapper
│   ├── services/
│   │   ├── clone-service.mjs    # Environment Export, Import, Cross-Platform Translation & Clone
│   │   ├── skill-service.mjs    # OpenCode Skills CRUD, Validation & Directory Management
│   │   ├── node-service.mjs     # Multi-Host Node Registry, SSH Command Execution & Health
│   │   ├── provider-service.mjs # Providers, Models Catalog, and Desktop Model Visibility Sync
│   │   ├── agent-plugin-service.mjs # Agents Frontmatter, Plugin Scoping & System Prompts
│   │   ├── session-service.mjs  # SQLite Session Tree Aggregation, Pruning & Vacuum
│   │   ├── shared-config.mjs    # Shared Node FS & Config Path Resolvers
│   │   └── manager-service.mjs  # Unified Business Logic Facade (REST API & MCP Server)
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*), Streamable MCP (/mcp) & Asset Router
│   └── mcp/
│       └── mcp-server.mjs       # MCP Tool Definitions (23 tools), Resource Handlers & Stdio Framing
└── public/
    ├── index.html               # Decoupled Dashboard HTML Structure & Modals
    ├── styles.css               # Responsive Dark Theme & Split-View Styles
    ├── app.js                   # Main Frontend Application Controller
    └── js/
        ├── core.js              # State Management, i18n DOM Engine & Shared API Client
        ├── components/
        │   └── fuzzy-combobox.js# Keyword Fuzzy-Search Combobox Component
        └── modules/
            ├── sessions.js      # Sessions Tree, Details & Database Maintenance
            ├── providers.js     # Providers, Sub-Models & Models.dev Catalog Browser
            ├── agents-plugins.js# Agents, Per-Agent Plugins, MCP, Prompts & JSONC
            ├── skills.js        # OpenCode Skills Card Grid & Vertical Markdown Editor
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
Edit `nodes.json` with your local and remote SSH host IP addresses.

### 2. Launch GUI Application
```bash
# Launch Server + Native Maximized App Window
npm start

# Launch Headless Background Server Only (http://127.0.0.1:5210)
npm run server
```
On Windows, you can double-click **`OpenCode Manager.exe`** directly.

### 3. Mount as an MCP Server in `opencode.jsonc`
Add the following to your `~/.config/opencode/opencode.jsonc`:
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

MIT License. See [LICENSE](LICENSE) for details. Community feedback, issues, and PRs are warmly welcomed!
