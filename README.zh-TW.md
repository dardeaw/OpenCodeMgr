# OpenCodeMgr 全景管理中心 (v1.8.0)

> 專為 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 與 MCP 全方位管理套件 — 完整支援 **專業技能庫管理（`skills/*/SKILL.md`）**、**多主機環境網路對拷與快照備份**、**模型與供應商視覺化配置（OpenCode Zen / Go / Models.dev / 自訂端點）**、**插件依角色分配 (`plugin/*.js`)**、**自訂代理角色 (`agent/*.md`)**、**23 組 MCP 擴充工具** 與 **SQLite 對話資料庫深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新日誌 (Changelog)](CHANGELOG.md)

---

## 為什麼需要 OpenCodeMgr？

OpenCode 是當前最強大的終端 AI 程式助手之一，但隨著日常深入使用與多主機部署，開發者往往會面臨以下痛點：
1. **技能（Skills）難以維護**：OpenCode 支援符合 `agentskills.io` 規範的 `skills/*/SKILL.md`，但只能手動開終端機進目錄手寫，缺乏視覺化檢索、編輯與跨主機同步機制。
2. **多主機設定複製繁瑣**：本機寫好的模型端點、認證金鑰、自訂 Agent、技能庫與插件，要複製到遠端 Linux GPU 主機時，路徑（Windows 反斜線 vs Linux 正斜線）、端點網址（Localhost vs 遠端 IP）經常報錯。
3. **對話資料庫（`opencode.db`）急遽膨脹**：多次除錯產生的巨大工具輸出、思考歷程、暫存快照會讓 SQLite 資料庫暴增到數 GB，導致 OpenCode 啟動延遲。
4. **手改 `opencode.jsonc` 易出錯**：少個逗號或括號就導致全域設定解析失敗。

**OpenCodeMgr** 提供零依賴的直觀深色主題 GUI 儀表板（`http://127.0.0.1:5210`）與完整的 **MCP 伺服器**，一站解決上述所有難題。

---

## 核心功能詳解

### 1. ⚡ 專業技能庫管理（`skills/*/SKILL.md`，agentskills.io 標準）

OpenCode 原生支援符合 [agentskills.io](https://agentskills.io) 標準的技能系統。OpenCodeMgr 提供最完整、視覺化的技能管理中心：

```text
~/.config/opencode/skills/
├── git-release/
│   └── SKILL.md            # YAML 前言 (name, description) + 詳細指令規範
├── code-refactor/
│   └── SKILL.md
└── sqlite-optimizer/
    └── SKILL.md
```

- **OpenCode 技能運作原理**：
  OpenCode 啟動時會自動掃描 `skills/*/SKILL.md`，並將頂部 YAML Frontmatter 的 `name` 與 `description`（觸發情境）載入模型全域感知中。當對話任務吻合該情境時，AI 會自動讀取整篇 `SKILL.md` 遵循該 SOP 流程執行。
- **標準 SKILL.md 格式範例**：
  ```markdown
  ---
  name: git-release
  description: 自動化 SemVer 版本推進、CHANGELOG 更新、Git Commit/Tag 與 Push 發布流程
  ---

  # Git Release Workflow
  當使用者要求發布新版本時，嚴格遵循以下步驟：
  1. 檢查 git status 與語法檢查通過
  2. 根據變更性質推進 SemVer（Patch / Minor / Major）
  3. 更新 CHANGELOG.md 新增版本區塊
  4. 執行 git add、git commit 與 git tag
  5. 推送程式碼與標籤至遠端倉庫
  ```
- **視覺化雙欄編輯介面**：
  - **吸頂卡片選擇區**：即時依技能 ID、名稱與觸發說明進行關鍵字模糊搜尋，快速定位。
  - **全高縱向 Markdown 工作區**：具備等寬字體（monospace）與獨立縱向滾動條，方便撰寫多步驟 SOP 規範。
  - **安全防護**：修改或刪除前自動建立 `.bak` 備份檔，避免誤刪寶貴工作流。
- **內建 3 組實戰示範技能**：
  1. `git-release`：標準化版本發布、日誌寫入與 Git Tag 發布流。
  2. `code-refactor`：單一職責（SRP）、分層解耦、語法即時檢查與暫存檔不落地標準。
  3. `sqlite-optimizer`：SQLite WAL 斷點截斷、歷史訊息修剪與磁碟 VACUUM 瘦身。
- **專屬 Skill MCP 工具自動化**：
  AI Agent 可透過 `opencodemgr_list_skills`、`opencodemgr_get_skill`、`opencodemgr_save_skill`、`opencodemgr_delete_skill` 直接自我擴充與維護技能庫。

---

### 2. 🧬 環境複製、跨機網路對拷與快照備份

- **跨機網路對拷（Node-to-Node Live Clone）**：
  直接將目前主機（如本機 Windows）的 OpenCode 環境推送到一或多台遠端 Linux / macOS 主機，支援循序傳輸與即時進度/失敗日誌。
- **便攜式環境快照（Export & Import）**：
  一鍵將整套環境打包成單一 `.opencode-env.json` 下載保存；更換新電腦時上傳檔案即可完整還原。
- **跨平台智慧路徑轉譯（Smart Path Translation）**：
  自動將 Windows 路徑（`C:\Users\馮\.config\opencode\...`）轉譯為目標 Linux 節點路徑（`/home/dardeaw/.config/opencode/...`），自動校正正反斜線與目錄結構。
- **目標 BaseURL 保留**：
  還原時可勾選保留目標主機專屬的推論端點（例如本地 SSH 隧道 `127.0.0.1:18200` vs 遠端 Tailscale IP `100.103.82.28:18200`），避免覆蓋後無法連線。
- **十二維度模組勾選矩陣**：
  自由勾選是否同步：
  1. 供應商與旗下模型配置 (`opencode.jsonc` provider)
  2. 模型顯示開關狀態 (`opencode.global.dat`)
  3. 認證金鑰 (`auth.json`)
  4. 自訂代理角色 (`agent/*.md`)
  5. **專業技能庫 (`skills/*/SKILL.md`)**
  6. 外掛程式 (`plugin/*.js`)
  7. 插件角色作用範圍 (`plugin-scopes.json`)
  8. 系統提示詞 (`AGENTS.md`)
  9. MCP 伺服器配置 (`opencode.jsonc` mcp)
  10. 工具系統提示精簡 (`plugin/trim-tools.js`)
  11. Bash 執行權限規則 (`permission.bash`)
  12. **SQLite 對話資料庫 (`opencode.db`)**（自動 WAL 截斷 + Gzip 串流壓縮封裝）

---

### 3. 🧠 模型與供應商管理（對齊 `/models` 與 `/connect`）

- **全域活躍模型指派**：
  視覺化設定主模型（`model`）、輕量模型（`small_model`）、對話命名模型（`agent.title.model`）與上下文壓縮模型（`agent.compaction.model`）。所有欄位均支援**關鍵字模糊搜尋下拉選單（Fuzzy-Search Combobox）**。
- **OpenCode Zen 活躍模型即時過濾**：
  自動交叉比對 OpenCode Zen 線上模型清單，過濾歷史廢棄模型，精準呈現目前可用的官方推薦模型。
- **官方目錄一鍵匯入（Models.dev）**：
  一鍵檢索官方模型資料庫（40+ 供應商、數百款模型），直接帶入上下文長度、模態支援、推論強度與定價資訊。
- **自訂與本機推論端點**：
  完美相容 `@ai-sdk/openai-compatible`，支援 `llama.cpp`、`vLLM`、`gufo`、`strata`、`lemonade` 等本地大模型。

---

### 4. 🧩 插件管理與依角色分流（Per-Agent Scoping）

- **動態掛載與排序**：線上即時啟用/停用插件、調整執行先後順序（`↑` / `↓`），並提供 Monaco 風格的 JS 原始碼編輯器。
- **角色生效範圍分流**：
  - `all`：全域通用，所有 Agent 都會執行該插件。
  - `include`：僅在勾選的指定角色執行（未勾選的角色自動跳過）。
  - `exclude`：在勾選的指定角色豁免排除（勾選的角色不執行該插件）。
- **無侵入式 Runtime 攔截**：由 OpenCodeMgr 自動維護 `plugin/_mgr_scope.js`，完全不修改您原本的插件業務邏輯。

---

### 5. 🤖 自訂代理角色（`agent/*.md`）

- 完整支援視覺化編輯 `agent/*.md`（模式 `all` / `subagent` / `primary`、專屬模型覆寫、職責說明、系統提示詞）。
- **視覺化 6 大工具權限矩陣**：可依角色獨立配置 `edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch` 的權限（繼承 / 允許 / 詢問 / 禁止），並內建「⚡ 唯讀審查模式」與「⚡ 全功能開發模式」一鍵套用。

---

### 6. 💬 Session 樹狀歸集與 SQLite 深度瘦身

- **Subagent 子對話樹狀歸集**：將巢狀派生的子任務自動收合於根對話下方，階梯式展開，清晰計算全鏈路 Token 與容量佔用。
- **深度瘦身清理（Pruning）**：
  - 勾選清理中斷/失敗的工具調用輸出
  - 刪除過長工具輸出（可自訂門檻，如 >1500 字元）
  - 清除思考歷程標籤（`<think>` tokens）
  - 清理編輯過程產生的巨大暫存快照
  - 搭配一鍵 `VACUUM`，實測可釋放 **40% ~ 60%** 的 `opencode.db` 磁碟空間。

---

### 7. 🔌 23 組內建 MCP 工具清單

OpenCodeMgr 自帶相容 JSON-RPC 2.0 的 MCP 伺服器（同時支援 Stdio 與 Streamable HTTP `POST /mcp`），所有功能皆可由 AI 代理自主呼叫：

| 模組分類 | MCP 工具名稱 | 功能簡介 |
|---|---|---|
| **主機節點** | `opencodemgr_list_nodes` | 列出所有受控主機（本機、遠端 SSH、跳板機） |
| | `opencodemgr_test_node` | 測試目標主機連通性與健康度 |
| | `opencodemgr_get_config` | 取得目標主機完整的設定快照 |
| **對話維護** | `opencodemgr_session_stats` | 取得 SQLite 資料庫容量、WAL 與對話筆數統計 |
| | `opencodemgr_list_sessions` | 依工作區取得對話清單 |
| | `opencodemgr_get_session_detail` | 讀取單一對話之完整訊息與歷程記錄 |
| | `opencodemgr_clean_session` | 針對指定對話執行細部瘦身清理 |
| | `opencodemgr_delete_session` | 刪除指定對話及其關聯歷程 |
| **模型與供應商** | `opencodemgr_list_providers` | 取得已配置之模型供應商與旗下列名 |
| | `opencodemgr_set_global_models` | 設定全域主模型、輕量模型與命名/壓縮模型 |
| | `opencodemgr_save_provider` | 新增或更新供應商配置與認證金鑰 |
| **代理角色** | `opencodemgr_list_agents` | 列出所有自訂 Agent 及工具權限配置 |
| | `opencodemgr_save_agent` | 建立或更新自訂 Agent 角色 |
| **專業技能庫** | `opencodemgr_list_skills` | **查詢所有 `skills/*/SKILL.md` 專業技能清單** |
| | `opencodemgr_get_skill` | **讀取技能前言設定與 Markdown 執行指引全文** |
| | `opencodemgr_save_skill` | **建立或更新專業技能（自動建目錄與備份）** |
| | `opencodemgr_delete_skill` | **刪除指定技能目錄（自動安全備份）** |
| **插件與範圍** | `opencodemgr_list_plugins` | 列出已安裝之插件、載入順序與角色生效範圍 |
| | `opencodemgr_configure_plugin` | 啟用/停用插件、更新角色範圍或修改代碼 |
| **MCP 管理** | `opencodemgr_manage_mcp` | 新增、更新或刪除目標主機的 MCP 伺服器掛載 |
| **環境對拷** | `opencodemgr_export_env` | 匯出可攜式 OpenCode 環境快照包 |
| | `opencodemgr_import_env` | 將快照包還原至目標主機（智慧轉譯與備份） |
| | `opencodemgr_clone_env` | 跨機直接推播對拷環境至一或多台遠端節點 |

---

## 模組化架構

```text
OpenCodeMgr/
├── app.mjs                      # 桌面應用程式與服務啟動器 (--server-only 支援)
├── server.mjs                   # 輕量 HTTP 伺服器入口 (Port 5210)
├── mcp-server.mjs               # 獨立 Stdio MCP 伺服器入口 (JSON-RPC 2.0)
├── i18n.mjs                     # 四語系在地化字典庫 (340+ 鍵值: zh-TW, zh-CN, en-US, ja-JP)
├── db_helper.py                 # 跨平台 Python SQLite 與目錄檢索引擎
├── Launcher.cs                  # 原生 Windows .exe 啟動器原始碼 (全螢幕 Edge/Chrome 應用模式)
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # 本地檔案、Paramiko SSH、跳板傳輸與安全備份層
│   │   └── parsers.mjs          # JSONC、Agent/Skill Frontmatter 與插件封裝解析器
│   ├── services/
│   │   ├── clone-service.mjs    # 環境匯出、匯入、跨平台轉譯與網路對拷服務
│   │   ├── skill-service.mjs    # 技能庫 CRUD、驗證與目錄管理服務
│   │   ├── node-service.mjs     # 多主機註冊表、SSH 指令執行與健康探測
│   │   ├── provider-service.mjs # 供應商、模型目錄與桌面顯示狀態同步
│   │   ├── agent-plugin-service.mjs # 代理角色、插件範圍與系統提示詞
│   │   ├── session-service.mjs  # SQLite 對話樹歸集、修剪與瘦身
│   │   ├── shared-config.mjs    # 共用主機檔案系統與路徑轉換工具
│   │   └── manager-service.mjs  # 統一業務邏輯外觀層 (REST API 與 MCP 伺服器)
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*)、Streamable MCP (/mcp) 與靜態路由
│   └── mcp/
│       └── mcp-server.mjs       # MCP 工具宣告 (23 組工具)、資源處理器與 Stdio 串流
└── public/
    ├── index.html               # 儀表板 HTML 結構與彈窗
    ├── styles.css               # 深色主題樣式與響應式切分排版
    ├── app.js                   # 前端主控制器與生命週期協調
    └── js/
        ├── core.js              # 全域狀態、i18n DOM 引擎與共用 API 客戶端
        ├── components/
        │   └── fuzzy-combobox.js# 關鍵字模糊搜尋下拉選單元件
        └── modules/
            ├── sessions.js      # 對話歷程樹、詳細檢視與資料庫維護
            ├── providers.js     # 供應商、旗下模型與官方目錄瀏覽
            ├── agents-plugins.js# 代理角色、專屬插件分配、MCP 與系統提示詞
            ├── skills.js        # 技能工作流吸頂卡片與 Markdown 編輯器
            └── env-clone.js     # 環境對拷、快照匯出與還原彈窗控制器
```

---

## 快速開始

### 系統需求
- **Node.js** `>= 18.0.0`
- **Python** `>= 3.8`

### 1. 取得專案並設定節點清單
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
cp nodes.example.json nodes.json
```
編輯 `nodes.json` 設定您的本機與遠端主機 IP 及連線資訊。

### 2. 啟動管理介面
```bash
# 啟動本機伺服器並自動開啟全螢幕應用視窗
npm start

# 僅啟動後台伺服器 (http://127.0.0.1:5210)
npm run server
```
在 Windows 系統中，可直接雙擊執行 **`OpenCode Manager.exe`**。

### 3. 掛載為 OpenCode 的 MCP 擴充伺服器
在您的 `~/.config/opencode/opencode.jsonc` 中加入：
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

## 開源授權

本專案採用 [MIT License](LICENSE) 授權。歡迎社群提報 Issue 與發送 PR！
