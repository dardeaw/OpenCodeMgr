# OpenCodeMgr

跨平台 OpenCode 系統提示詞、角色設定、MCP 工具、多主機節點調度與 SQLite 資料庫維護桌面工具。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

---

## 專案簡介

OpenCodeMgr 專為 OpenCode 開發者打造，提供全方位視覺化管理面板。集中掌控系統指示詞 (Instructions)、自訂角色 (Agents)、MCP 伺服器與工具權限守護、多節點 SSH 主機部署，以及專業級 SQLite 對話 Session 瘦身清理。

---

## 核心功能特色

- 提示詞、角色與 MCP 工具集中管理：
  - 系統指示詞管理：線上即時編輯主系統指示 (AGENTS.local.md)、遠端 SSH 工作流規範 (SSH_WORKFLOW.md) 與全域通用規範 (AGENTS.md)，支援自動備份。
  - 角色設定 (Agent Roles)：註冊與自訂 Agent，完整配置執行模式 (主對話、子代理或通用)、引導 LLM 調度的簡介說明、系統提示詞與覆寫模型。
  - MCP 伺服器管理：直覺化管理 Model Context Protocol (MCP) 伺服器，支援本機可執行檔與遠端 URL，一鍵啟用/停用、逾時設定與參數配置。
  - 工具描述客製化與權限守護：自訂提供給 LLM 的各工具描述 (trim-tools.js) 以節省 Token 消耗，並提供 Bash 危險指令 Deny/Ask 攔截規則守護 (permission.bash)。
  - opencode.jsonc 視覺化：即時檢視核心 JSONC 配置，支援語法檢查與修改時自動備份。
- 多主機節點管理 (Multi-Host Fleet)：
  - 於單一儀表板統一管理本機工作站、遠端直連 SSH 主機、以及 Jump SSH 跳板伺服器。
  - 熱切換節點，即時健康狀態指示。
- Session 階層化樹狀歸集 (Tree Aggregation)：
  - 自動關聯主對話與子代理 (Subagent) 任務，支援樹狀摺疊與展開。
  - 展開時維持 DOM 原位顯示，徹底解決畫面跳動、頁面回滾至頂部與排版歪斜問題。
- SQLite 資料庫深度瘦身清理：
  - 精準瘦身 40% 至 60% 空間，完整保留所有重要對話問答與最終程式碼產出。
  - 清理非 0 異常退出碼 (Non-0 Exit)、外掛防護攔截與中途中斷的調用記錄。
  - 清除龐大的 AI 思考歷程 (<think> 區塊)。
  - 截斷超過 1500 字元的超長日誌與檔案 dump，保留關鍵摘要與狀態標記。
  - 清除歷史暫存大型檔案快照與無意義步驟空標記。
  - 內建一鍵 SQLite VACUUM 實體磁碟空間回收。
- 多語系支援 (i18n)：
  - 完整支援繁體中文、簡體中文、English、日本語。
  - 啟動時自動偵測作業系統 (OS) 與瀏覽器語系，並支援右上角即時切換與持久化記憶。

---

## 安裝與快速開始

### 環境需求
- Node.js 18.0.0 以上
- Python 3.8+ (供 SQLite 處理模組與 Paramiko SSH 使用)

### 1. 下載專案
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
```

### 2. 配置主機節點
複製節點範本設定：
```bash
cp nodes.example.json nodes.json
```
編輯 nodes.json 設定您的主機連線。此檔案已納入 .gitignore，確保內部 IP 與連線資訊不被外洩。

### 3. 啟動應用
以原生應用程式視窗啟動：
```bash
npm start
```
或僅啟動 HTTP 伺服器服務 (監聽 http://127.0.0.1:5210)：
```bash
npm run server
```

---

## 系統架構

- 後端服務 (server.mjs)：以原生 Node.js HTTP 實作，零厚重框架相依。
- 前端面板：輕量高反應暗色主題介面，支援零延遲 DOM 動態 i18n 渲染。
- 資料庫引擎 (db_helper.py)：高性能 Python SQLite 輔助模組，支援跨平台路徑解析、Subagent 關聯樹建構與 deep JSON payload 瘦身。
- 視窗包裝器 (app.mjs)：呼叫本機應用模式 (Edge / Chrome) 提供近乎原生桌面應用的使用體驗。

---

## 授權條款

MIT License. 詳細資訊請見 LICENSE 文件。
