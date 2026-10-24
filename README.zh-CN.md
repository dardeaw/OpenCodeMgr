# OpenCodeMgr 全景管理中心 (v1.5.0)

专为 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 与 MCP 管理套件 — 支持 **模型与供应商管理（OpenCode Zen / Go / Models.dev / 自定义端点）**、**插件管理与按角色分配 (`plugin/*.js`)**、**自定义代理角色 (`agent/*.md`)**、**系统提示词**、**MCP 服务器**、**多主机 SSH 集群切换** 与 **SQLite 对话数据库深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新日志 (Changelog)](CHANGELOG.md)

---

## 项目简介

**OpenCodeMgr** 是一套零外部依赖、高稳定性的 OpenCode 可视化控制中心与 **MCP 服务器 (`mcp-server.mjs`)**。彻底解决手改 `opencode.jsonc`、跨机同步配置、插件无法按角色分流、以及 SQLite 对话库 (`opencode.db`) 膨胀卡顿等痛点。

---

## 核心功能亮点

### 1. 🧠 模型与供应商管理（完整对齐 OpenCode `/models` 与 `/connect` 逻辑）
- **关键字模糊搜索下拉框（Fuzzy-Search Combobox）**：所有模型指派字段（主模型 `model`、轻量模型 `small_model`、自动命名 `agent.title.model`、上下文压缩 `agent.compaction.model` 与各角色专属模型）均内置实时关键字模糊搜索，自动按「⭐ 已配置模型」、「✨ OpenCode Zen」、「🚀 OpenCode Go」、「🔗 已认证供应商」分组显示。
- **内置与自定义供应商整合**：原生支持 **OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、自建推理服务（`gufo`、`strata`、`halogen`、`lemonade`、`vLLM`、`llama.cpp`）及各大云端 SDK。
- **双轨密钥管理**：支持直接读写 `~/.local/share/opencode/auth.json`（等同 `/connect`）与 `opencode.jsonc` 内的 `options.baseURL` / `options.apiKey`。
- **Models.dev 官方目录浏览与一键导入**：直接检索节点 `~/.cache/opencode/models.json` 数百款模型规格（Context/Output 上限、模态、Reasoning 强度、Free 标记），一键导入或设为默认主模型。

### 2. 🧩 插件管理与「按角色 (by Agent Role)」启停分配
- **插件挂载与顺序调控**：自动扫描 `plugin/*.js` 脚本，支持一键启用/停用（同步更新 `opencode.jsonc` `"plugin"` 数组）、调整加载顺序（`↑` / `↓`）与在线编辑 JS 源码。
- **按角色指派插件范围（Per-Agent Plugin Scoping）**：可设置插件为 **「🌐 全部角色通用 (`all`)」**、**「🎯 仅指定角色生效 (`include`)」** 或 **「🚫 排除指定角色 (`exclude`)」**。
- **双向同步与无侵入 Runtime 包装**：在「🧩 插件管理」与「🤖 角色管理」两处勾选实时双向同步，自动维护 `plugin-scopes.json` 与 `plugin/_mgr_scope.js` 运行时拦截器。

### 3. 🤖 角色管理与专属工具权限矩阵
- 可视化管理 `agent/*.md`（执行模式 `all` / `subagent` / `primary`、指定模型覆写、角色简介与系统提示词）。
- 内置专属工具权限分配（`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch`）与自定义规则，支持一键应用「⚡ 只读审查模式」与「⚡ 全功能开发模式」。

### 4. 💬 Session 树状归集与 SQLite 深度瘦身清理
- **Subagent 树状归集**：自动将子任务（Subagents）归集于主对话之下，无滚动跳动展开/收起，并计算含子任务的总空间与 Token 消耗。
- **五维度无损瘦身**：一键清理「工具失败与插件拦截记录」、「AI 思考历程 (`<think>`)」、「超长工具输出截断 (`>1500` 字符)」、「大型文件快照」与「步骤空标记」，并支持 `VACUUM` 压缩回收 40%～60% 磁盘空间。

### 5. 🌐 多主机节点管理与 4 国语系实时切换
- 支持 **本机 (Local)**、**SSH 免密直连 (`run_ssh.py`)** 与 **跳板连接 (`jump_ssh.py`)**，实时检测连接状态。
- 内置 **繁體中文 (`zh-TW`)、简体中文 (`zh-CN`)、English (`en-US`)、日本語 (`ja-JP`)** 完整 322 词条字典，切换语言瞬间全板块动态重绘。

### 6. 🔌 内置标准 MCP Server（支持 Stdio 与 HTTP 双协议）
- 内置 **16 个 `opencodemgr_*` MCP 工具** 与动态资源，可挂载至 OpenCode、Antigravity、Claude Desktop 或 Cursor，让 AI 直接查询与管理各节点配置与对话库。

---

## 模块化架构总览

```text
OpenCodeMgr/
├── app.mjs                      # 桌面窗口与服务启动器（支持 --server-only 后台守护模式）
├── server.mjs                   # 轻量化 HTTP 服务器入口 (Port 5210)
├── mcp-server.mjs               # 独立 Stdio MCP Server 入口 (JSON-RPC 2.0)
├── i18n.mjs                     # 四国语系完整字典模块 (322 词条：zh-TW / zh-CN / en-US / ja-JP)
├── db_helper.py                 # 跨平台 Python SQLite 与 Models.dev 目录解析引擎
├── Launcher.cs                  # Windows 原生 .exe 启动器源码（自动最大化独立窗口）
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # 本机 FS、Paramiko SSH、Jump SSH 与安全备份底层
│   │   └── parsers.mjs          # JSONC 解析、Agent Frontmatter、trim-tools 与插件范围包装器
│   ├── services/
│   │   └── manager-service.mjs  # 纯业务逻辑服务层（同时供 REST API 与 MCP Server 共用）
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*)、HTTP MCP (/mcp) 与静态路由
│   └── mcp/
│       └── mcp-server.mjs       # 16 个 MCP 工具定义、资源处理器与双模式 Stdio 解析器
└── public/
    ├── index.html               # 解耦之前端界面结构
    ├── styles.css               # 暗色主题与模糊搜索下拉组件样式
    └── app.js                   # 前端应用逻辑控制器
```

---

## 快速开始

```bash
# 启动服务器并打开最大化桌面窗口
npm start

# 仅启动后台 HTTP 服务器 (http://127.0.0.1:5210)
npm run server

# 启动 Stdio MCP Server
npm run mcp
```

---

## 许可证

MIT License. 详见 [LICENSE](LICENSE)。
