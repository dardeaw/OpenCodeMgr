# OpenCodeMgr 全景管理中心 (v1.4.0)

專為 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 與 MCP 管理套件 — 支援 **模型與供應商管理（OpenCode Zen / Go / Models.dev / 自訂端點）**、**插件管理與依角色分配 (`plugin/*.js`)**、**自訂代理角色 (`agent/*.md`)**、**系統提示詞**、**MCP 伺服器**、**多主機 SSH 叢集切換** 與 **SQLite 對話資料庫深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

---

## 專案簡介

**OpenCodeMgr** 是一套零外部依賴、高穩定性的 OpenCode 視覺化控制中心與 **MCP 伺服器 (`mcp-server.mjs`)**。徹底解決手改 `opencode.jsonc`、跨機同步設定、插件無法依角色分流、以及 SQLite 對話庫 (`opencode.db`) 膨脹卡頓等痛點。

---

## 核心功能亮點

### 1. 🧠 模型與供應商管理（完整對齊 OpenCode `/models` 與 `/connect` 邏輯）
- **關鍵字模糊搜尋下拉選單（Fuzzy-Search Combobox）**：所有模型指派欄位（主要模型 `model`、輕量模型 `small_model`、自動命名 `agent.title.model`、上下文壓縮 `agent.compaction.model` 與各角色專屬模型）皆內建即時關鍵字模糊搜尋，自動依「⭐ 已配置模型」、「✨ OpenCode Zen」、「🚀 OpenCode Go」、「🔗 已認證供應商」分組顯示。
- **內建與自訂供應商整合**：原生支援 **OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、自建推論服務（`gufo`、`strata`、`halogen`、`lemonade`、`vLLM`、`llama.cpp`）及各大雲端 SDK。
- **雙軌金鑰管理**：支援直接讀寫 `~/.local/share/opencode/auth.json`（等同 `/connect`）與 `opencode.jsonc` 內的 `options.baseURL` / `options.apiKey`。
- **Models.dev 官方目錄瀏覽與一鍵匯入**：直接檢索節點 `~/.cache/opencode/models.json` 數百款模型規格（Context/Output 上限、模態、Reasoning 強度、Free 標記），一鍵匯入或設為預設主模型。

### 2. 🧩 插件管理與「依角色 (by Agent Role)」啟停分配
- **插件掛載與順序調控**：自動掃描 `plugin/*.js` 腳本，支援一鍵啟用/停用（同步更新 `opencode.jsonc` `"plugin"` 陣列）、調整載入順序（`↑` / `↓`）與線上編輯 JS 原始碼。
- **依角色指派插件範圍（Per-Agent Plugin Scoping）**：可設定插件為 **「🌐 全部角色通用 (`all`)」**、**「🎯 僅指定角色生效 (`include`)」** 或 **「🚫 排除指定角色 (`exclude`)」**。
- **雙向同步與無侵入 Runtime 包裝**：在「🧩 插件管理」與「🤖 角色管理」兩處勾選即時雙向同步，自動維護 `plugin-scopes.json` 與 `plugin/_mgr_scope.js` 執行期攔截器。

### 3. 🤖 角色管理與專屬工具權限矩陣
- 視覺化管理 `agent/*.md`（執行模式 `all` / `subagent` / `primary`、指定模型覆寫、角色簡介與系統提示詞）。
- 內建專屬工具權限分配（`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch`）與自訂規則，支援一鍵套用「⚡ 唯讀審查模式」與「⚡ 全功能開發模式」。

### 4. 💬 Session 樹狀歸集與 SQLite 深度瘦身清理
- **Subagent 樹狀歸集**：自動將子任務（Subagents）歸集於主對話之下，無捲動跳動展開/收合，並計算含子任務之總空間與 Token 消耗。
- **五維度無損瘦身**：一鍵清理「工具失敗與外掛攔截記錄」、「AI 思考歷程 (`<think>`)」、「超長工具輸出截斷 (`>1500` 字元)」、「大型檔案快照」與「步驟空標記」，並支援 `VACUUM` 壓縮回收 40%～60% 磁碟空間。

### 5. 🌐 多主機節點管理與 4 國語系即時切換
- 支援 **本機 (Local)**、**SSH 免密直連 (`run_ssh.py`)** 與 **跳板連線 (`jump_ssh.py`)**，即時檢測連線狀態。
- 內建 **繁體中文 (`zh-TW`)、簡體中文 (`zh-CN`)、English (`en-US`)、日本語 (`ja-JP`)** 完整 322 詞條字典，切換語言瞬間全版塊動態重繪。

### 6. 🔌 內建標準 MCP Server（支援 Stdio 與 HTTP 雙協定）
- 內建 **16 個 `opencodemgr_*` MCP 工具** 與動態資源，可掛載至 OpenCode、Antigravity、Claude Desktop 或 Cursor，讓 AI 直接查詢與管理各節點配置與對話庫。

---

## 模組化架構總覽

```text
OpenCodeMgr/
├── app.mjs                      # 桌面視窗與服務啟動器（支援 --server-only 背景守護模式）
├── server.mjs                   # 輕量化 HTTP 伺服器入口 (Port 5210)
├── mcp-server.mjs               # 獨立 Stdio MCP Server 入口 (JSON-RPC 2.0)
├── i18n.mjs                     # 四國語系完整字典模組 (322 詞條：zh-TW / zh-CN / en-US / ja-JP)
├── db_helper.py                 # 跨平台 Python SQLite 與 Models.dev 目錄解析引擎
├── Launcher.cs                  # Windows 原生 .exe 啟動器源碼（自動最大化獨立視窗）
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # 本機 FS、Paramiko SSH、Jump SSH 與安全備份底層
│   │   └── parsers.mjs          # JSONC 解析、Agent Frontmatter、trim-tools 與插件範圍包裝器
│   ├── services/
│   │   └── manager-service.mjs  # 純業務邏輯服務層（同時供 REST API 與 MCP Server 共用）
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*)、HTTP MCP (/mcp) 與靜態路由
│   └── mcp/
│       └── mcp-server.mjs       # 16 個 MCP 工具定義、資源處理器與雙模式 Stdio 解析器
└── public/
    ├── index.html               # 解耦之前端介面結構
    ├── styles.css               # 暗色主題與模糊搜尋下拉組件樣式
    └── app.js                   # 前端應用邏輯控制器
```

---

## 快速開始

### 1. 啟動桌面 GUI 或 Web 服務
- **Windows 桌面版**：直接雙擊執行 **`OpenCode Manager.exe`**（自動啟動背景服務並以最大化原生 App 視窗開啟）。
- **指令列啟動**：
  ```bash
  # 啟動伺服器並開啟桌面視窗
  npm start

  # 僅啟動背景 HTTP 伺服器 (http://127.0.0.1:5210)
  npm run server
  ```

### 2. 在 `opencode.jsonc` 掛載 MCP Server
```json
{
  "mcp": {
    "opencodemgr": {
      "type": "local",
      "command": ["node", "C:\\Users\\馮\\.config\\opencode\\opencode-manager\\mcp-server.mjs"],
      "enabled": true,
      "timeout": 60000
    }
  }
}
```

---

## 授權條款

MIT License. 詳見 [LICENSE](LICENSE)。
