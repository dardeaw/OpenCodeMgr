# OpenCodeMgr 全景管理中心 (v1.7.0)

專為 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 與 MCP 管理套件 — 支援 **專業技能庫管理（`skills/*/SKILL.md`）**、**環境網路對拷與快照備份**、**模型與供應商管理（OpenCode Zen / Go / Models.dev / 自訂端點）**、**插件管理與依角色分配 (`plugin/*.js`)**、**自訂代理角色 (`agent/*.md`)**、**系統提示詞**、**MCP 伺服器**、**多主機 SSH 叢集切換** 與 **SQLite 對話資料庫深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新日誌 (Changelog)](CHANGELOG.md)

---

## 專案簡介

**OpenCodeMgr** 是一套零外部依賴、高穩定性的 OpenCode 視覺化控制中心與 **MCP 伺服器 (`mcp-server.mjs`)**。徹底解決手改 `opencode.jsonc`、跨主機環境複製同步、專業技能工作流維護、插件無法依角色分流、以及 SQLite 對話庫 (`opencode.db`) 膨脹卡頓等痛點。

---

## 核心功能亮點

### 1. ⚡ 專業技能庫管理（`skills/*/SKILL.md`，相容 agentskills.io 標準）
- **原生 OpenCode 技能工作流支援**：完整支援 `<configDir>/skills/<id>/SKILL.md` 目錄結構，包含 YAML 前言（`name`、`description`）與 Markdown 詳細執行標準。
- **頂部吸頂卡片清單與即時模糊搜尋**：即時依技能 ID、顯示名稱與觸發說明過濾篩選；選取卡片即自動載入專屬編輯器。
- **全高縱向 Markdown 工作區**：具備等寬字體（monospace）與獨立縱向捲動條，支援安全修改、自動備份與單鍵刪除。
- **內建實戰示範技能**：
  - `git-release`：標準化 SemVer 版本推進、CHANGELOG 更新、Git Commit/Tag 與 Push 發布流程。
  - `code-refactor`：單一職責原則（SRP）、清晰架構分層、語法檢查與暫存檔不落地安全原則。
  - `sqlite-optimizer`：SQLite WAL 斷點截斷（`PRAGMA wal_checkpoint(TRUNCATE)`）、對話歷程修剪與資料庫 `VACUUM`。
- **4 組專屬 Skill MCP 工具**：直接透過 MCP 自動化讀取、建立、更新與刪除各主機之技能目錄。

### 2. 🧬 環境複製、跨機網路對拷與快照備份
- **跨機網路對拷（Node-to-Node Live Clone）**：可自任意來源節點（本機 `.102`、遠端 Fedora `.55`、Nobara `.67` 等）直接將環境同步拷貝至單一或多台目標主機，支援循序執行與即時進度/錯誤回報。
- **便攜式環境快照匯出/還原（Snapshot Export / Import）**：一鍵將設定封裝為 `.opencode-env.json` 檔案下載備份；支援檔案上傳還原並提供完整的 JSON 結構預覽與校驗機制。
- **跨平台智慧路徑轉譯（Smart Path Translation）**：自動判斷 Windows (`C:\Users\馮\.config\opencode\...`) 與 Linux (`/home/dardeaw/.config/opencode/...`) 目錄結構與斜線 (`\` 與 `/`)，轉譯後無縫對接無死節點。
- **保留目標主機專屬 BaseURL（Target BaseURL Preservation）**：智慧保留目標主機原有之供應商端點連線（例如本機走 SSH Tunnel `127.0.0.1:18200`，遠端走 Tailscale IP `100.103.82.28:18200`），避免複製後推論中斷。
- **執行前自動安全備份（Auto-Backup）**：覆寫前自動於目標主機建立 `.bak-YYYYMMDD_HHMMSS` 時間戳備份檔，確保設定安全無虞。
- **十二維度細粒度勾選矩陣（含專業技能庫與 SQLite 對話庫）**：可自由獨立勾選複製：供應商配置、模型可見度開關、認證金鑰 (`auth.json`)、代理角色 (`agent/*.md`)、**專業技能庫 (`skills/*/SKILL.md`)**、外掛程式 (`plugin/*.js`)、外掛角色作用範圍、系統提示詞、MCP 伺服器、工具權限矩陣、Bash 執行權限，以及 **SQLite 對話資料庫 (`opencode.db`)**。

### 3. 🧠 模型與供應商管理（完整對齊 OpenCode `/models` 與 `/connect` 邏輯）
- **關鍵字模糊搜尋下拉選單（Fuzzy-Search Combobox）**：所有模型指派欄位（主要模型 `model`、輕量模型 `small_model`、自動命名 `agent.title.model`、上下文壓縮 `agent.compaction.model` 與各角色專屬模型）皆內建即時關鍵字模糊搜尋，自動依分組標籤快速篩選。
- **內建與自訂供應商整合**：原生支援 **OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、自建推論服務（`gufo`、`strata`、`halogen`、`lemonade`、`vLLM`、`llama.cpp`）及各大雲端 SDK。
- **雙軌金鑰管理**：支援直接讀寫 `~/.local/share/opencode/auth.json`（等同 `/connect`）與 `opencode.jsonc` 內的 `options.baseURL` / `options.apiKey`。
- **Models.dev 官方目錄瀏覽與一鍵匯入**：直接檢索節點 `~/.cache/opencode/models.json` 數百款模型規格（Context/Output 上限、模態、Reasoning 強度、Free 標記），一鍵匯入或設為預設主模型。

### 4. 🧩 插件管理與「依角色 (by Agent Role)」啟停分配
- **插件掛載與順序調控**：自動掃描 `plugin/*.js` 腳本，支援一鍵啟用/停用（同步更新 `opencode.jsonc` `"plugin"` 陣列）、調整載入順序（`↑` / `↓`）與線上編輯 JS 原始碼。
- **依角色指派插件範圍（Per-Agent Plugin Scoping）**：可設定插件為 **「🌐 全部角色通用 (`all`)」**、**「🎯 僅指定角色生效 (`include`)」** 或 **「🚫 排除指定角色 (`exclude`)」**。
- **雙向同步與無侵入 Runtime 包裝**：在「🧩 插件管理」與「🤖 角色管理」兩處勾選即時雙向同步，自動維護 `plugin-scopes.json` 與 `plugin/_mgr_scope.js` 執行期攔截器。

### 5. 🤖 角色管理與專屬工具權限矩陣
- 視覺化管理 `agent/*.md`（執行模式 `all` / `subagent` / `primary`、指定模型覆寫、角色簡介與系統提示詞）。
- 內建專屬工具權限分配（`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch`）與自訂規則，支援一鍵套用「⚡ 唯讀審查模式」與「⚡ 全功能開發模式」。

### 6. 💬 Session 樹狀歸集與 SQLite 深度瘦身清理
- **Subagent 子對話樹狀歸集**：自動將子代理任務歸併於主對話下方，階梯式收合展開並統計容量與 Token 總額。
- **深度瘦身清理**：精準勾選清理失敗工具呼叫、`<think>` 思考歷程、過長工具輸出（>1500 字元）、編輯前後暫存快照，搭配一鍵 `VACUUM` 壓縮重整，常態可為 `opencode.db` 釋放 40%–60% 磁碟空間。

### 7. 🌐 多主機節點管理與四語系支援
- 支援在 **本機 (Local)**、**直連 SSH 主機** 與 **Jump-Host 跳板機主機** 間秒級切換，自動探測遠端路徑。
- **100% 完整純淨四語系（340+ 鍵值）**：繁體中文 (`zh-TW`)、簡體中文 (`zh-CN`)、英文 (`en-US`)、日本語 (`ja-JP`) 即時動態切換，杜絕中英夾雜的虛假翻譯。

### 8. 🔌 內建 MCP 伺服器 (Stdio & HTTP)
- 提供 **23 組 MCP 工具 (`opencodemgr_*`)** 與動態資源協議（`opencodemgr://nodes`、`opencodemgr://config/{node}`），全面打通外部 AI 與自動化腳本。

---

## 模組化架構

```text
OpenCodeMgr/
├── app.mjs                      # 桌面視窗與服務啟動器 (--server-only 支援)
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

### 環境需求
- **Node.js** `>= 18.0.0`
- **Python** `>= 3.8`

### 1. 取得專案並設定主機
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
cp nodes.example.json nodes.json
```

### 2. 啟動管理中心
```bash
# 同時啟動本機伺服器與全螢幕應用視窗
npm start

# 僅啟動後台 HTTP 伺服器 (http://127.0.0.1:5210)
npm run server
```
在 Windows 環境下，亦可直接雙擊執行 **`OpenCode Manager.exe`**。

### 3. 掛載為 OpenCode 本機 MCP 伺服器 (`opencode.jsonc`)
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

本專案採用 MIT 授權條款，詳見 [LICENSE](LICENSE) 檔案。
