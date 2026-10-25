# Changelog

All notable changes to **OpenCodeMgr** will be documented in this file.

---

## [v1.7.0] - 2026-10-25

### ⚡ Specialized Skills Management (`skills/*/SKILL.md`)
- **Native OpenCode Skill Support (agentskills.io Standard)**:
  - Added full management for OpenCode skills stored in `<configDir>/skills/<id>/SKILL.md` with YAML frontmatter (`name`, `description`) and Markdown execution procedures.
  - Positioned navigation tab (`⚡ 技能管理` / `⚡ Skills`) immediately following **🤖 角色管理** (`#agents`).
- **Interactive Sticky Card Selector & Dedicated Editor**:
  - Real-time instant search input filtering by skill ID, display name, and capability description.
  - Fixed-height top sticky card grid with clean badges and selection indicators.
  - Full-height vertical Markdown editor with monospace font, independent scroll area, and single-click save/delete.
- **Built-in Exemplary Production Skills**:
  - Included 3 battle-tested demonstration skills:
    1. `git-release`: Automated SemVer version bump, changelog generation, git commit/tag, and push workflows.
    2. `code-refactor`: Single Responsibility Principle (SRP), clean architectural layering, and zero-residual temp script verification.
    3. `sqlite-optimizer`: SQLite WAL checkpoint truncate (`PRAGMA wal_checkpoint(TRUNCATE)`), session pruning, and database `VACUUM`.

### 🔌 New Skill MCP Tools (23 MCP Tools Total)
- Expanded the built-in MCP server to 23 tools, adding 4 dedicated skill tools:
  - `opencodemgr_list_skills`: Enumerate all skills on local or remote nodes.
  - `opencodemgr_get_skill`: Retrieve skill metadata, frontmatter, and full instructions body.
  - `opencodemgr_save_skill`: Create or update skills with automatic folder creation and file backups.
  - `opencodemgr_delete_skill`: Delete skill directories with automated `.bak` pre-deletion backups.

### 🧬 Environment Clone & Backup Integration
- Added `skills` (`⚡ 專業技能庫 skills/*/SKILL.md`) to the 12-component clone matrix.
- Direct network cloning (`opencodemgr_clone_env`) and portable snapshot bundles (`opencodemgr_export_env` / `opencodemgr_import_env`) now replicate and restore skills seamlessly across Windows and Linux nodes.

### 🌐 Pure 4-Language Localization (i18n)
- 100% authentic localization across **Traditional Chinese (`zh-TW`)**, **Simplified Chinese (`zh-CN`)**, **English (`en-US`)**, and **Japanese (`ja-JP`)**.
- Completely eliminated mixed bilingual pseudo-translations across the clone modal and skill management interface.

### 🎨 UI Bug Fixes & Layout Architecture
- Fixed `#skill-editor` layout squishing by adding flex-direction column and container height constraints to `public/styles.css` and `public/js/modules/skills.js`.

---

## [v1.6.0] - 2026-10-25

### 🧬 OpenCode Environment Clone, Network Replication & Snapshot Backup
- **Node-to-Node Live Network Clone (`跨機網路對拷`)**:
  - Replicate full or modular OpenCode environments directly from a source node (e.g. Local `.102`, Fedora `.55`, Nobara `.67`) to one or multiple destination nodes across the local network with sequential execution and granular per-node progress/error reporting.
- **Portable Snapshot Export & Import (`環境快照匯出/還原備份`)**:
  - Export OpenCode configuration snapshots as portable `.opencode-env.json` bundle files with one-click browser download (`GET /api/env-export?download=1`).
  - Restore bundles onto any node with interactive JSON schema validation, detailed bundle metadata inspector (source platform, timestamp, modules count), and selective override controls (`POST /api/env-import`).
- **Smart Cross-Platform Path Translation (`跨平台智慧路徑轉譯`)**:
  - Automatically translates configuration and file paths between Windows (`C:\Users\馮\.config\opencode\...`) and Linux (`/home/dardeaw/.config/opencode/...`), normalizing path separators (`\` vs `/`) and user directories without broken references.
- **Target BaseURL Preservation (`保留目標主機專屬 BaseURL`)**:
  - Intelligent preservation mode ensures target-specific provider endpoints (e.g. local SSH tunnel `127.0.0.1:18200` vs tailnet `100.103.82.28:18200`) remain functional after cloning or restoring configurations.
- **Pre-Execution Safe Auto-Backup (`自動備份安全防護`)**:
  - Automatically creates timestamped backups (`.bak-YYYYMMDD_HHMMSS`) of `opencode.jsonc` and `auth.json` on the destination node before writing changes, preventing any accidental data loss.
- **Granular 11-Component Module Matrix (including SQLite opencode.db)**:
  - Full modular checkboxes to independently clone/export/import:
    1. **Providers & Options** (`opencode.jsonc` provider configuration)
    2. **Model Visibility & Status** (desktop `opencode.global.dat` & whitelist/blacklist)
    3. **Provider Credentials** (`auth.json` / `/connect` API keys)
    4. **Custom Agent Roles** (`agent/*.md`)
    5. **Plugins** (`plugin/*.js`)
    6. **Plugin Scopes** (`plugin-scopes.json` per-agent role routing)
    7. **System Prompts & Instructions** (`prompts.json` / `AGENTS.md`)
    8. **MCP Servers** (`opencode.jsonc` `"mcp"`)
    9. **Tools Permissions Matrix** (`tools` block)
    10. **Bash Execution Permissions** (`permissions` block)
    11. **SQLite Session Database** (`opencode.db` conversation & message history with WAL checkpoint flush, streaming gzip compression, and target pre-backup)

### 🔌 New MCP Tools (19 Tools Total)
- Added 3 new Model Context Protocol tools for AI agent automation:
  - `opencodemgr_export_env`: Export environment snapshot bundle from any node with optional module filtering.
  - `opencodemgr_import_env`: Import and apply an environment bundle onto a target node with automatic backup and path translation.
  - `opencodemgr_clone_env`: Execute direct node-to-node network replication across one or multiple targets.

### 🏗️ Codebase Modular Refactoring
- **Backend Service Decoupling**:
  - Split monolithic backend logic into domain-driven service modules under `src/services/`:
    - `clone-service.mjs`: Environment export, import, cross-platform path translation, and network replication.
    - `node-service.mjs`: Multi-host node registry, SSH execution, and health probing.
    - `provider-service.mjs`: Provider configurations, models catalog, and Desktop visibility sync.
    - `agent-plugin-service.mjs`: Agents, plugin scopes, and system prompts.
    - `session-service.mjs`: SQLite database parsing, session aggregation, and pruning.
    - `shared-config.mjs`: Shared node filesystem and config path helpers.
    - `manager-service.mjs`: Unified facade coordinating all services.
- **Frontend Modularization**:
  - Extracted modular logic into `public/js/modules/` (`env-clone.js`), keeping `public/app.js` clean and maintainable.

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
