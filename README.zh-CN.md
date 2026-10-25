# OpenCodeMgr 全景管理中心 (v1.6.0)

专为 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 与 MCP 管理套件 — 支持 **环境网络对拷与快照备份**、**模型与供应商管理（OpenCode Zen / Go / Models.dev / 自定义端点）**、**插件管理与按角色分配 (`plugin/*.js`)**、**自定义代理角色 (`agent/*.md`)**、**系统提示词**、**MCP 服务器**、**多主机 SSH 集群切换** 与 **SQLite 对话数据库深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新日志 (Changelog)](CHANGELOG.md)

---

## 项目简介

**OpenCodeMgr** 是一套零外部依赖、高稳定性的 OpenCode 可视化控制中心与 **MCP 服务器 (`mcp-server.mjs`)**。彻底解决手改 `opencode.jsonc`、跨机同步配置与环境克隆、插件无法按角色分流、以及 SQLite 对话库 (`opencode.db`) 膨胀卡顿等痛点。

---

## 核心功能亮点

### 1. 🧬 环境克隆、跨机网络对拷与快照备份
- **跨机网络对拷（Node-to-Node Live Clone）**：可从任意源节点（本机 `.102`、远程 Fedora `.55`、Nobara `.67` 等）直接将环境同步拷贝至单个或多个目标主机，支持循序执行与实时进度/错误反馈。
- **便携式环境快照导出/恢复（Snapshot Export / Import）**：一键将配置打包为 `.opencode-env.json` 文件下载备份；支持文件上传恢复并提供完整的 JSON 结构预览与校验机制。
- **跨平台智能路径转译（Smart Path Translation）**：自动判断 Windows (`C:\Users\馮\.config\opencode\...`) 与 Linux (`/home/dardeaw/.config/opencode/...`) 目录结构与斜杠 (`\` 与 `/`)，转译后无缝对接无死链接。
- **保留目标主机专属 BaseURL（Target BaseURL Preservation）**：智能保留目标主机原有的供应商端点连接（例如本机走 SSH Tunnel `127.0.0.1:18200`，远程走 Tailscale IP `100.103.82.28:18200`），避免克隆后推理中断。
- **执行前自动安全备份（Auto-Backup）**：覆写前自动在目标主机创建 `.bak-YYYYMMDD_HHMMSS` 时间戳备份文件，确保配置安全无虞。
- **十一维度细粒度勾选矩阵（含 SQLite 对话库）**：可自由独立勾选克隆：供应商配置、模型可见度开关、认证密钥 (`auth.json`)、代理角色 (`agent/*.md`)、外挂插件 (`plugin/*.js`)、外挂角色作用范围、系统提示词、MCP 服务器、工具权限矩阵、Bash 执行权限，以及 **SQLite 对话数据库 (`opencode.db`)**。对拷复制自动保留备份，导出封装采用极简流式压缩打包为单一完整快照包。

### 2. 🧠 模型与供应商管理（完整对齐 OpenCode `/models` 与 `/connect` 逻辑）
- **关键字模糊搜索下拉框（Fuzzy-Search Combobox）**：所有模型指派字段（主模型 `model`、轻量模型 `small_model`、自动命名 `agent.title.model`、上下文压缩 `agent.compaction.model` 与各角色专属模型）均内置实时关键字模糊搜索，自动按「⭐ 已配置模型」、「✨ OpenCode Zen」、「🚀 OpenCode Go」、「🔗 已认证供应商」分组显示。
- **内置与自定义供应商整合**：原生支持 **OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、自建推理服务（`gufo`、`strata`、`halogen`、`lemonade`、`vLLM`、`llama.cpp`）及各大云端 SDK。
- **双轨密钥管理**：支持直接读写 `~/.local/share/opencode/auth.json`（等同 `/connect`）与 `opencode.jsonc` 内的 `options.baseURL` / `options.apiKey`。
- **Models.dev 官方目录浏览与一键导入**：直接检索节点 `~/.cache/opencode/models.json` 数百款模型规格（Context/Output 上限、模态、Reasoning 强度、Free 标记），一键导入或设为默认主模型。

### 3. 🧩 插件管理与「按角色 (by Agent Role)」启停分配
- **插件挂载与顺序调控**：自动扫描 `plugin/*.js` 脚本，支持一键启用/停用（同步更新 `opencode.jsonc` `"plugin"` 数组）、调整加载顺序（`↑` / `↓`）与在线编辑 JS 源码。
- **按角色指派插件范围（Per-Agent Plugin Scoping）**：可设置插件为 **「🌐 全部角色通用 (`all`)」**、**「🎯 仅指定角色生效 (`include`)」** 或 **「🚫 排除指定角色 (`exclude`)」**。
- **双向同步与无侵入 Runtime 包装**：在「🧩 插件管理」与「🤖 角色管理」两处勾选实时双向同步，自动维护 `plugin-scopes.json` 与 `plugin/_mgr_scope.js` 运行时拦截器。

### 4. 🤖 角色管理与专属工具权限矩阵
- 可视化管理 `agent/*.md`（执行模式 `all` / `subagent` / `primary`、指定模型覆写、角色简介与系统提示词）。
- 内置专属工具权限分配（`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch`）与自定义规则，支持一键应用「⚡ 只读审查模式」与「⚡ 全功能开发模式」。

### 5. 💬 Session 树状归集与 SQLite 深度瘦身清理
- **Subagent 树状归集**：自动将子任务（Subagents）归集于主对话之下，无滚动跳动展开/收起，并计算含子任务的总空间与 Token 消耗。
- **五维度无损瘦身**：一键清理「工具失败与插件拦截记录」、「AI 思考历程 (`<think>`)」、「超长工具输出截断 (`>1500` 字符)」、「大型文件快照」与「步骤空标记」，并支持 `VACUUM` 压缩回收 40%～60% 磁盘空间。

### 6. 🌐 多主机节点管理与 4 国语系实时切换
- 支持 **本机 (Local)**、**SSH 免密直连 (`run_ssh.py`)** 与 **跳板连接 (`jump_ssh.py`)**，实时检测连接状态。
- 内置 **繁體中文 (`zh-TW`)、简体中文 (`zh-CN`)、English (`en-US`)、日本語 (`ja-JP`)** 完整 322 词条字典，切换语言瞬间全板块动态重绘。

### 7. 🔌 内置标准 MCP Server（支持 Stdio 与 HTTP 双协议）
- 内置 **19 个 `opencodemgr_*` MCP 工具** 与动态资源，可挂载至 OpenCode、Antigravity、Claude Desktop 或 Cursor，让 AI 直接查询、管理与跨机克隆各节点配置与对话库。

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
│   │   ├── clone-service.mjs    # 环境导出、导入、跨平台转译与跨主机对拷服务
│   │   ├── node-service.mjs     # 多主机节点登录、SSH 命令执行与健康检测
│   │   ├── provider-service.mjs # 供应商、Models 目录与 Desktop 模型可见度同步
│   │   ├── agent-plugin-service.mjs # 代理角色、插件范围过滤与系统提示词
│   │   ├── session-service.mjs  # SQLite 会话树归集、瘦身裁剪与 Vacuum 压缩
│   │   ├── shared-config.mjs    # 跨节点文件系统与路径共用模块
│   │   └── manager-service.mjs  # 核心业务逻辑统整 Facade（供 REST API 与 MCP 共用）
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*)、HTTP MCP (/mcp) 与静态路由
│   └── mcp/
│       └── mcp-server.mjs       # 19 个 MCP 工具定义、资源处理器与双模式 Stdio 解析器
└── public/
    ├── index.html               # 前端可视化控制面板结构与弹窗
    ├── styles.css               # 暗色主题与分栏响应式排版样式
    ├── app.js                   # 前端核心应用逻辑控制器
    └── js/
        └── modules/
            └── env-clone.js     # 环境对拷、导出与还原交互模块
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
