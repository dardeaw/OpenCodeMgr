# Changelog

All notable changes to **OpenCodeMgr** will be documented in this file.

---

## [v1.13.0] - 2026-11-24

### 🛠️ 停用開關全面修正：檔案層級失能 + v2 原生 MCP 形狀

- **Plugin 停用改為檔案層級**：過去只從 `opencode.jsonc` 的 `plugin` 陣列移除一行，實測 opencode v2.1.4 啟動時照樣載入目錄下所有 `.js`（未列名的 ps-guard 仍在攔截工具呼叫；新檔案也不會 hot-load）。現在停用 = 改名 `<name>.js.disabled`（opencode 只載入 `*.js`/`*.mjs`），啟用 = 改名回來；`plugin` 陣列保留為執行順序用途。
- **列表顯示檔案真相**：`.disabled` 顯示已停用；v2 節點上存在但未列名的 active 檔案會顯示已啟用（啟動自動載入）；排序按鈕只對已列名項目出現；active 與 `.disabled` 並存時以 active 為準。
- **MCP 停用支援 v2 原生形狀**：實測 v2 完全忽略舊式 `mcp.<id>.enabled: false`（`mcp list` 仍顯示 connected；連 flat `disabled: true` 也照連）。v2 節點改寫 `mcp.servers.<id>.disabled`（已驗證停用後顯示 disabled 且不影響其他 server），v1 節點維持舊形狀；刪除會清掉兩種形狀；MCP 頁同時合併顯示 flat + servers 來源。
- **匯出／複刻不再誤啟用**：disabled 插件會以 `.disabled` 落地目標節點，並清掉殘留的另一副檔名。
- **重啟提醒**：`toggle-plugin` / `save-plugin` / `save-mcp` / `delete` 回傳統一附 `needRestart: true`，前端 toast 加 `needRestartHint` 四語系（plugin 與 MCP 皆為啟動時載入，改完需重啟 opencode 生效）。
- 附帶修正 `opencodemgr_configure_plugin` 的 `enabled` 欄位說明，以及經 MCP tool 存檔時 `action` 欄位洩漏進 server entry 的問題。

---

## [v1.12.1] - 2026-11-17

### 🔧 清理：移除自更新回傳的硬編碼英文訊息

- `applyUpdate()` 成功回傳中移除未被任何前端消费的 `message` 欄位（原本為硬編碼英文 "Updated to ... Restart the OpenCode Manager..."）。前端一律使用 `from`/`to` 版本號搭配自身 i18n 字串顯示，故不影響任何語系的更新介面。

---

## [v1.12.0] - 2026-11-17

### ✨ 設定項 hover 說明（語系感知工具提示）

- **滑鼠移到設定標籤即顯示說明**：為各分頁不易理解的設定標籤加上悬停提示（cursor: help + 自訂浮層氣泡），取代原生 `title`，即開即用、可換行。
- **涵蓋 41 個設定標籤**：全域模型（主要／輕量／壓縮／命名）、模型參數（context／input／output／temperature／reasoningEffort／attachment／modalities）、服務商（npm／baseURL／API Key／全域認證金鑰）、智能體（mode／model／prompt／desc）、MCP（type／timeout／command／args）、插件（掛載狀態／生效範圍）、進階設定 13 項、節點管理（type／config dir／db path）。
- **語系感知**：說明文案走 i18n `help.*` 子表，切換語言即時更新；共 41 × 4 = 164 條（zh-TW / zh-CN / en-US / ja-JP）。
- **實作**：`index.html` 標籤加 `data-help-key`；`core.js` 以事件委派（mouseover/out）驅動單一浮層 `#help-tooltip`，並在 `applyDomI18n()` 同步本地化 `title`；`styles.css` 新增氣泡樣式。

---

## [v1.11.0] - 2026-11-17

### ✨ 全域進階設定操作介面（Raw JSON 分頁上方結構化卡片）

- **新增「⚙️ 全域進階設定」卡片**：原本只能靠文字編輯器手改的 7 組全域設定，現在有結構化操作介面（位於 Raw JSON 分頁上方，原始 JSONC 編輯器保留在下方）。
- **涵蓋設定項**：
  - `logLevel`（DEBUG / INFO / WARN / ERROR 下拉）
  - `snapshots`（true/false 下拉・可 /undo 回滾開關）
  - `shell`（powershell / bash / zsh / cmd / 自訂絕對路徑）
  - `instructions`（指令檔清單・每行一路徑或 glob）
  - `attachment.image.*`（auto_resize + max_width / max_height / max_base64_bytes）
  - `permission.doom_loop`（allow / ask / deny・反死迴圈防護）
  - `compaction.{auto, tail_turns, prune, reserved}`（自動壓縮策略）
- **外科式寫入**：只 patch 對應鍵，不動其他設定——`compaction.model/system`、`permission.bash` 規則、provider、agents 等全部原樣保留；清空欄位即移除該鍵。
- **後端**：`getAdvancedSettings()` / `saveAdvancedSettings()`（agent-plugin-service）+ 新端點 `GET /api/advanced-settings`、`POST /api/save-advanced-settings`。
- **前端**：`renderAdvancedSettings()` 隨 config 載入回填表單；`saveAdvancedSettings()` 一鍵儲存並重載。
- **i18n**：17 個新字串 × 4 語言（zh-TW / zh-CN / en-US / ja-JP）。

---

## [v1.10.0] - 2026-11-16

### ✨ GitHub Self-Update with Cross-Platform Auto-Restart
- **Update bell in the header**: a 🔔 icon appears in the top-right whenever a newer GitHub release tag exists than the running version. Hovering shows a tooltip (`current → latest`); clicking opens an update modal.
- **New `update-service.mjs`**: detects the newest remote semver tag (via `gh api`, falling back to `git ls-remote`), compares against the local `package.json` version, and reports whether auto-update is safe (clean working tree required).
- **One-click apply**: fast-forwards the checkout to the new tag (`git fetch --tags` + `git merge --ff-only`). Refuses on dirty worktree / non-fast-forward / missing tag with localized messages.
- **Cross-platform self-restart** (`/api/restart`): after updating, the server restarts itself so the new code loads — no manual process-killing. The strategy is chosen by detecting who supervises the process:
  - **systemd** → `systemctl restart <unit>`
  - **pm2** → `pm2 reload <app>`
  - **standalone** (Windows desktop app, web server, or bare `node server.mjs`) → detached self-respawn of `server.mjs`, then exit.
- **Seamless UX**: the frontend triggers the restart, polls until the fresh server answers again, then auto-reloads the page. Falls back to a "reopen manually" hint if it can't reconnect.
- New REST endpoints `GET /api/check-update`, `POST /api/apply-update`, `POST /api/restart`; 18 new i18n keys across zh-TW / zh-CN / en-US / ja-JP.

---

## [v1.9.0] - 2026-11-16

### 🎨 Merged Global Model Card + Hidden-Agent Enable Switches
- **Two cards → one**: the previously separate 「全域預設模型指派」 and 「系統內建代理設定」 cards are merged into a single **per-agent sub-block** card, eliminating the duplicate `title`/`compaction` model inputs that both wrote the same config keys. Each agent (Primary / Small / Compaction / Title) is now one self-contained block.
- **Clear "built-in" definition**: the built-in maintenance agents are exactly **Compaction** (model + system prompt) and **Title** (model only — its prompt is fixed/built-in). Primary is not disable-able. `build`/`plan`/etc. remain primary roles in the Roles view and never appear here.
- **Enable/disable switches**: Compaction and Title sub-blocks each get an iOS-style toggle (`disabled` on v2 / `disable` on v1). Turning an agent off greys out its inputs while preserving their values.
- **Small model is version-gated**: the `small_model` field renders only on pre-v2 nodes; on v2 it is hidden entirely (folded into the title agent's model). Rendering is driven once by `state.isV2` at load / node-switch rather than per-field.
- **Single backend writer**: the `/api/save-core-agent` endpoint and `saveCoreAgents()` are retired; all global-model + core-agent fields now flow through one `saveGlobalModels()` call to `/api/save-global-models`, removing the two-paths-writing-same-keys drift.
- **i18n**: new `enableCompactionAgent` / `enableTitleAgent` strings across all four languages, plus a `data-i18n-title` tooltip hook in the i18n engine.

---

## [v1.8.4] - 2026-11-16

### ✨ OpenCode v2 Config Compatibility (`agents` / `disabled` / `system`)
- **Version-aware config writer**: `node-transport.mjs` gains `isOpenCodeV2()` (semver major ≥ 2) and `detectNodeOpenCodeVersion()` now reports `isV2`. On OpenCode **v2** nodes the manager writes the native plural `agents` map with renamed fields (`disable`→`disabled`, `prompt`→`system`); on pre-v2 nodes it keeps the legacy singular `agent`. A V2 node never dual-writes `agent` + `agents` (which would raise a `conflict` diagnostic).
- **Shared-config helpers**: new `ensureAgentsContainer` / `dropLegacyAgent` / `ensureNativeAgent` (migrates a touched legacy agent to native, preserving model/description/mode/hidden/color/steps) / `setCoreAgentField` / `readCoreAgentModel` / `readCoreAgentEnabled`.
- **Global model assignment** (`provider-service.saveGlobalModels`) and **core-agent save** (`agent-plugin-service.saveCoreAgents`) branch by version; on v2 `small_model` is folded into the title agent's model instead of written as a top-level key.
- **Reads are native-first**: `node-service` inline-agent enumeration merges `agents` ∪ `agent` and surfaces an `enabled` flag; `mcp-server` active-model reporting and the frontend `app.js` populate read native `agents.*` first, falling back to legacy for older nodes.
- **Environment clone** (`clone-service`) export/import is version-aware: a v2 source exports native `agents`, and a v2 target folds incoming legacy `agent`/`small_model` into native `agents`.

---

## [v1.8.3] - 2026-11-10

### 🗑️ Cascade Session Deletion (subagents)
- **Subagent sessions are now deleted together with their parent**: `delete_session()` walks the `session.parent_id` tree and removes all descendant subagent sessions, messages, parts, and context epochs in a single operation. Previously deleting a parent left orphaned child subagent sessions behind. The confirmation dialog now states that subagent tasks will also be removed.

---

## [v1.8.2] - 2026-11-10

### 🤖 Inline Agent Roles from `opencode.jsonc`
- **JSONC-defined agents now appear in the Roles view**: Custom agents declared inline inside `opencode.jsonc` (`"agent": { "<id>": {...} }`) are enumerated alongside `agent/*.md` files, so roles such as `build`, `plan`, `publish`, `programmer`, and `gm` show up even when they are not separate markdown files. `{file:...}` prompt references are resolved automatically, and entries are deduplicated against markdown-defined agents.

---

## [v1.8.1] - 2026-11-09

### 🔧 Path Portability Fixes (per-user / new-host ready)
- **Home Expansion in `nodes.json`**: `getNodePaths()` and `loadNodes()` now expand leading `~`, `~/`, `~\` and `$HOME/` to the current user's home directory for both `configDir` and `dbPath`. The portable `~/.config/opencode` notation from `nodes.example.json` works out of the box on any OS/user without hardcoding absolute paths.
- **Dual Agent/Plugin Directory Layouts**: Node configuration snapshots now scan both singular (`agent/`, `plugin/`) and plural (`agents/`, `plugins/`) directories, so custom agent roles and plugins appear regardless of the local layout convention. Applies to both local and remote SSH nodes.

---

## [v1.8.0] - 2026-10-25

### 🚀 OpenCode 2.0 Full Compatibility & 1.x Backward Compatibility (雙軌兼備)
- **OpenCode 2.0 Architecture Ready**:
  - **Dual Configuration Synchronisation**: Extended the Environment Clone Matrix to 13 components, adding native support for OpenCode 2.0's global `cli.json` (`cli_config`) while maintaining seamless backward compatibility for OpenCode 1.x's `tui.json` (`tui_config`).
  - **Node OpenCode Version Introspection**: Automatically probes and detects OpenCode CLI and Desktop runtime versions across local and remote SSH nodes (`1.19.4` / `2.0.x`), surfacing compatibility flags and v2 readiness badges.
  - **Dynamic SQLite Schema Introspection**: Upgraded `db_helper.py` to introspect SQLite `session` table columns dynamically via `PRAGMA table_info(session)`. Gracefully supports reasoning tokens (`tokens_reasoning`), estimated cost (`cost`), agent identity (`agent`), and schema version (`version`) with zero breakage on older databases.
  - **Enhanced Session Telemetry UI**:
    - Surfaces agent pills (`🤖 <agent>`) and v2 tags (`v2`) directly in the conversation tree.
    - Token summary column displays reasoning tokens (`🧠 <N>`) and cost attribution (`$<amount>`).
    - Standardized all storage and conversation footprint metrics uniformly to **`MB`** (with 3-decimal precision for micro-files).
  - **Complete 4-Language i18n**: All new OpenCode 2.0 badges, configuration matrix items, and telemetry metrics translated across Traditional Chinese (`zh-TW`), Simplified Chinese (`zh-CN`), English (`en`), and Japanese (`ja-JP`).

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
