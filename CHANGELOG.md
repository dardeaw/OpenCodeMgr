# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

---

## [1.4.0] - 2026-10-25

### Added
- **Models & Providers Management (`🧠 Models & Providers`)**:
  - Full management support for **OpenCode Zen (`opencode`)**, **OpenCode Go (`opencode-go`)**, custom OpenAI-compatible inference servers (`@ai-sdk/openai-compatible`), and cloud providers.
  - Added **Keyword Fuzzy-Search Combobox Dropdowns** across all 7 global and agent model inputs (`global-primary-model`, `global-small-model`, `global-title-model`, `global-compaction-model`, `agent-model`, `compaction-model`, `title-model`), grouped by Configured Models, OpenCode Zen, OpenCode Go, and Connected Providers.
  - Added `~/.local/share/opencode/auth.json` credential manager (`/connect` parity) alongside `opencode.jsonc` provider options (`baseURL`, `apiKey`, `whitelist`, `blacklist`).
  - Added **Official Models.dev Catalog Browser Modal** reading `~/.cache/opencode/models.json` with instant keyword filtering, one-click model spec import, and sub-model parameter tuning (`limit.context`, `limit.input`, `limit.output`, `temperature`, `reasoningEffort`, `attachment`, `modalities`).
- **Plugin Management & Per-Agent Role Scoping (`🧩 Plugins`)**:
  - Added full lifecycle management for `plugin/*.js` scripts and `opencode.jsonc` `"plugin"` mount array (enable/disable, load order `↑`/`↓`, live JS source editor, and deletion).
  - Added **Per-Agent Role Assignment (`all` / `include` / `exclude`)** with two-way synchronization between the **🧩 Plugins** tab and the **🤖 Agents** editor.
  - Added automatic `plugin-scopes.json` persistence and non-invasive `plugin/_mgr_scope.js` runtime hook wrapper (`__mgrWithAgentScope`).
- **Built-in Model Context Protocol (MCP) Server (`mcp-server.mjs` & `POST /mcp`)**:
  - Packaged a zero-dependency MCP Server supporting both **Stdio JSON-RPC 2.0** (newline-delimited and `Content-Length` framed) and **Streamable HTTP (`POST /mcp`)**.
  - Exposed **16 MCP tools (`opencodemgr_*`)** covering host nodes, session stats/lists/details/pruning, models & providers, custom agents, plugins & per-agent scopes, and MCP server configuration, plus dynamic MCP resources (`opencodemgr://nodes` and `opencodemgr://config/{node}`).
- **Decoupled Modular Architecture**:
  - Refactored the monolithic `server.mjs` into clean layers: `src/core/node-transport.mjs`, `src/core/parsers.mjs`, `src/services/manager-service.mjs`, `src/api/router.mjs`, `src/mcp/mcp-server.mjs`, and standalone frontend static assets (`public/index.html`, `public/styles.css`, `public/app.js`).

### Changed
- **Complete 4-Language Localization Overhaul (`i18n.mjs`)**:
  - Expanded and audited all **322 localization keys** across Traditional Chinese (`zh-TW`), Simplified Chinese (`zh-CN`), English (`en-US`), and Japanese (`ja-JP`) with zero missing keys.
  - Removed cluttered mixed-language parentheticals from `zh-TW` and `zh-CN` labels.
  - Updated `changeLanguage()` to immediately re-render all dynamic views, cards, tables, modals, and fuzzy-search comboboxes without requiring a page reload.
- **Native Windows Launcher (`Launcher.cs` & `app.mjs`)**:
  - Decoupled background daemon mode (`--server-only`) from GUI window spawning and enforced Win32 window maximization (`SW_MAXIMIZE` + `SetForegroundWindow`).

### Fixed
- Fixed `stripJsonComments()` corrupting URLs containing `//` (`http://` / `https://`) when parsing `opencode.jsonc`.
- Implemented the missing `POST /api/save-tools` backend route and `serializeTrimTools()` serializer for `plugin/trim-tools.js`.
- Replaced fragile regex replacements in `save-mcp`, `delete-mcp`, `save-core-agent`, and `save-permissions` with structured JSONC AST updates (`updateNodeJsonc`).
- Fixed backup file naming (`${filePath}.bak-${ts}`) so backup files never pollute `agent/*.md` or `plugin/*.js` directory scans.

---

## [1.0.0] - 2026-10-24

### Added
- Internationalization (i18n) Engine for English, Traditional Chinese, Simplified Chinese, and Japanese.
- Session Tree Aggregation connecting root sessions with their subagent executions.
- Deep Session Pruning System (errors, reasoning `<think>`, large tool outputs, file snapshots, empty step markers, and SQLite `VACUUM`).
- Multi-Host Fleet Management for localhost, direct Paramiko SSH, and jump-host SSH connections.
- Visual Editors for system instructions (`AGENTS.local.md`, `SSH_WORKFLOW.md`, `AGENTS.md`), custom agents, MCP servers, tool descriptions, and `opencode.jsonc`.
