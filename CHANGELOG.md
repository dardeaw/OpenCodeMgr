# Changelog

All notable changes to **OpenCodeMgr** will be documented in this file.

---

## [v1.5.0] - 2026-10-25

### ✨ New Features & Sync Enhancements
- **Native OpenCode Model Visibility Toggle Switches & Two-Way Sync (`opencode.global.dat`)**:
  - Replaced legacy Whitelist/Blacklist text inputs with an OpenCode-style **Manage Models (`管理模型`)** iOS toggle switch panel featuring real-time keyword filtering, active/total model counter badge, and a provider-level master switch (`全開 / 全關`).
  - Added two-way synchronization with OpenCode Desktop's `opencode.global.dat` (`~/AppData/Roaming/ai.opencode.desktop/opencode.global.dat` / `~/.local/share/ai.opencode.desktop/opencode.global.dat` / `~/Library/Application Support/ai.opencode.desktop/opencode.global.dat`) as well as `opencode.jsonc` (`whitelist` / `blacklist`).
  - Toggling any model or master switch saves immediately via `/api/save-model-visibility` without requiring a manual Save click.
- **Active-Only Model Catalog Filtering (Live OpenCode Zen Sync)**:
  - Filtered out historical models marked `"status": "deprecated"` in `~/.cache/opencode/models.json`.
  - Added live intersection with `https://opencode.ai/zen/v1/models` (with local 10-minute cache at `~/.cache/opencode/zen_live_ids.json` and offline fallback) so `opencode` (OpenCode Zen) only lists currently active models (e.g., 8 active `-free` models instead of 44 historical entries).
- **Dedicated Global Model Assignment Tab (`🎯 全域模型指派` / `#global-models`)**:
  - Extracted Global Default Model Assignment (`model`, `small_model`, `agent.title.model`, `agent.compaction.model`) and Built-in Core Agent Settings (`build`, `plan`, `general`, `explore`) into a dedicated top-level navigation tab (`🎯 全域模型指派` / `🎯 Global Models`).

### 🎨 UI/UX & Split-View Layout Overhaul
- **Two-Column Split Layout for Provider Editor (`#models`)**:
  - **Left Column**: Provider ID, Display Name, AI SDK npm package, Base URL, `opencode.jsonc` API Key, `/connect auth.json` Global Key, and Sub-Models parameter specification table & inline editor.
  - **Right Column**: Full-height `管理模型` (`.oc-model-toggles-box`) visibility switch list with independent scrolling.
- **Two-Column Split Layout for Agent Role Editor (`#agents`)**:
  - **Left Column**: Full-height System Prompt (`#agent-prompt`) editor.
  - **Right Column**: Multi-line Role Description (`#agent-desc`), 3×2 Dedicated Tool Permission Matrix, and Per-Agent Plugin Scope checkboxes.
- **Single-Layer Scroll Architecture & Frozen Top Headers**:
  - Eliminated nested double scrollbars across `#sessions`, `#models`, `#agents`, `#plugins`, `#tools`, and `#raw-json`.
  - Locked top selection card zones (`.sticky-selector-zone` with 2-row `340px` card grid) and table headers (`position: sticky; top: 0`) so only the target content area (session list, plugin code editor, raw JSONC editor, tool matrix, or model list) scrolls.
- **Auto-Select First Card on Load & Tab Switch**:
  - Automatically selects the first card and expands the detail editor panel in `#agents`, `#mcp`, `#plugins`, and `#models`.
- **Header Button Single-Line Fix**:
  - Fixed global `select { width: 100% }` override on `.node-select` and added `white-space: nowrap; flex-shrink: 0;` to `.btn` and `.badge` so `⚙️ 管理主機` and `🔄 重新整理` never wrap across lines.

---

## [v1.4.0] - 2026-10-25

### ✨ Features
- **Modular Architecture**: Refactored backend and frontend into `src/core/`, `src/services/`, `src/api/`, `src/mcp/`, and `public/`.
- **Models & Providers Management (`#models`)**: Full GUI for OpenCode Zen (`opencode`), OpenCode Go (`opencode-go`), custom providers, `auth.json` credentials, and `Models.dev` catalog import with Fuzzy-Search Comboboxes.
- **Plugin Management & Per-Agent Role Scoping (`#plugins`)**: Manage `plugin/*.js` load order, source code, and per-agent role inclusion/exclusion (`plugin-scopes.json` + `plugin/_mgr_scope.js`).
- **Built-in MCP Server (`mcp-server.mjs` & `POST /mcp`)**: Exposed 16 `opencodemgr_*` tools and MCP resources over Stdio and Streamable HTTP.
- **Full 4-Language i18n**: Complete localization across `zh-TW`, `zh-CN`, `en-US`, and `ja-JP`.
