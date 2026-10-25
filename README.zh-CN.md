# OpenCodeMgr 全景管理中心 (v1.7.0)

> 专为 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 与 MCP 全方位管理套件 — 完整支持 **专业技能库管理（`skills/*/SKILL.md`）**、**多主机环境网络对拷与快照备份**、**模型与供应商可视化配置（OpenCode Zen / Go / Models.dev / 自定义端点）**、**插件按角色分配 (`plugin/*.js`)**、**自定义代理角色 (`agent/*.md`)**、**23 组 MCP 扩展工具** 与 **SQLite 对话数据库深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新日志 (Changelog)](CHANGELOG.md)

---

## 为什么需要 OpenCodeMgr？

OpenCode 是当前最强大的终端 AI 编程助手之一，但随着日常深入使用与多主机部署，开发者往往会面临以下痛点：
1. **技能（Skills）难以维护**：OpenCode 原生支持符合 `agentskills.io` 规范的 `skills/*/SKILL.md`，但只能手动进目录手写，缺乏可视化检索、编辑与跨主机同步机制。
2. **多主机设置复制繁琐**：本机写好的模型端点、认证密钥、自定义 Agent、技能库与插件，要复制到远程 Linux GPU 主机时，路径（Windows 反斜杠 vs Linux 正斜杠）、端点网址（Localhost vs 远程 IP）经常报错。
3. **对话数据库（`opencode.db`）急剧膨胀**：多次调试产生的巨大工具输出、思考历程、暂存快照会让 SQLite 数据库暴增到数 GB，导致 OpenCode 启动延迟。
4. **手改 `opencode.jsonc` 易出错**：少个逗号或括号就导致全局设置解析失败。

**OpenCodeMgr** 提供零依赖的直观深色主题 GUI 仪表盘（`http://127.0.0.1:5210`）与完整的 **MCP 服务器**，一站解决上述所有难题。

---

## 核心功能详解

### 1. ⚡ 专业技能库管理（`skills/*/SKILL.md`，agentskills.io 标准）

OpenCode 原生支持符合 [agentskills.io](https://agentskills.io) 标准的技能系统。OpenCodeMgr 提供最完整、可视化的技能管理中心：

```text
~/.config/opencode/skills/
├── git-release/
│   └── SKILL.md            # YAML 前言 (name, description) + 详细指令规范
├── code-refactor/
│   └── SKILL.md
└── sqlite-optimizer/
    └── SKILL.md
```

- **OpenCode 技能运行原理**：
  OpenCode 启动时会自动扫描 `skills/*/SKILL.md`，并将顶部 YAML Frontmatter 的 `name` 与 `description`（触发情境）载入模型全局感知中。当对话任务吻合该情境时，AI 会自动读取整篇 `SKILL.md` 遵循该 SOP 流程执行。
- **标准 SKILL.md 格式范例**：
  ```markdown
  ---
  name: git-release
  description: 自动化 SemVer 版本推进、CHANGELOG 更新、Git Commit/Tag 与 Push 发布流程
  ---

  # Git Release Workflow
  当用户要求发布新版本时，严格遵循以下步骤：
  1. 检查 git status 与语法检查通过
  2. 根据变更性质推进 SemVer（Patch / Minor / Major）
  3. 更新 CHANGELOG.md 新增版本区块
  4. 执行 git add、git commit 与 git tag
  5. 推送代码与标签至远程仓库
  ```
- **可视化双栏编辑界面**：
  - **吸顶卡片选择区**：即时按技能 ID、名称与触发说明进行关键字模糊搜索，快速定位。
  - **全高纵向 Markdown 工作区**：具备等宽字体（monospace）与独立纵向滚动条，方便撰写多步骤 SOP 规范。
  - **安全防护**：修改或删除前自动创建 `.bak` 备份文件，避免误删宝贵工作流。
- **内置 3 组实战示范技能**：
  1. `git-release`：标准化版本发布、日志写入与 Git Tag 发布流。
  2. `code-refactor`：单一职责（SRP）、分层解耦、语法即时检查与暂存文件不落地标准。
  3. `sqlite-optimizer`：SQLite WAL 断点截断、历史消息修剪与磁盘 VACUUM 瘦身。
- **专属 Skill MCP 工具自动化**：
  AI Agent 可通过 `opencodemgr_list_skills`、`opencodemgr_get_skill`、`opencodemgr_save_skill`、`opencodemgr_delete_skill` 直接自我扩充与维护技能库。

---

### 2. 🧬 环境复制、跨机网络对拷与快照备份

- **跨机网络对拷（Node-to-Node Live Clone）**：
  直接将当前主机（如本机 Windows）的 OpenCode 环境推送到一或多台远程 Linux / macOS 主机，支持循序传输与即时进度/失败日志。
- **便携式环境快照（Export & Import）**：
  一键将整套环境打包成单一 `.opencode-env.json` 下载保存；更换新电脑时上传文件即可完整还原。
- **跨平台智能路径转译（Smart Path Translation）**：
  自动将 Windows 路径（`C:\Users\馮\.config\opencode\...`）转译为目标 Linux 节点路径（`/home/dardeaw/.config/opencode/...`），自动校正正反斜杠与目录结构。
- **目标 BaseURL 保留**：
  还原时可勾选保留目标主机专属的推理端点（例如本地 SSH 隧道 `127.0.0.1:18200` vs 远程 Tailscale IP `100.103.82.28:18200`），避免覆盖后无法连接。
- **十二维度模块勾选矩阵**：
  自由勾选是否同步：
  1. 供应商与旗下模型配置 (`opencode.jsonc` provider)
  2. 模型显示开关状态 (`opencode.global.dat`)
  3. 认证密钥 (`auth.json`)
  4. 自定义代理角色 (`agent/*.md`)
  5. **专业技能库 (`skills/*/SKILL.md`)**
  6. 插件 (`plugin/*.js`)
  7. 插件角色作用范围 (`plugin-scopes.json`)
  8. 系统提示词 (`AGENTS.md`)
  9. MCP 服务器配置 (`opencode.jsonc` mcp)
  10. 工具系统提示精简 (`plugin/trim-tools.js`)
  11. Bash 执行权限规则 (`permission.bash`)
  12. **SQLite 对话数据库 (`opencode.db`)**（自动 WAL 截断 + Gzip 流式压缩封装）

---

### 3. 🧠 模型与供应商管理（对齐 `/models` 与 `/connect`）

- **全局活跃模型指派**：
  可视化设置主模型（`model`）、轻量模型（`small_model`）、对话命名模型（`agent.title.model`）与上下文压缩模型（`agent.compaction.model`）。所有字段均支持**关键字模糊搜索下拉菜单（Fuzzy-Search Combobox）**。
- **OpenCode Zen 活跃模型即时过滤**：
  自动交叉比对 OpenCode Zen 线上模型列表，过滤历史废弃模型，精准呈现当前可用的官方推荐模型。
- **官方目录一键导入（Models.dev）**：
  一键检索官方模型数据库（40+ 供应商、数百款模型），直接带入上下文长度、模态支持、推理强度与定价信息。
- **自定义与本机推理端点**：
  完美兼容 `@ai-sdk/openai-compatible`，支持 `llama.cpp`、`vLLM`、`gufo`、`strata`、`lemonade` 等本地大模型。

---

### 4. 🧩 插件管理与按角色分流（Per-Agent Scoping）

- **动态挂载与排序**：在线即时启用/停用插件、调整执行先后顺序（`↑` / `↓`），并提供 Monaco 风格的 JS 源代码编辑器。
- **角色生效范围分流**：
  - `all`：全局通用，所有 Agent 都会执行该插件。
  - `include`：仅在勾选的指定角色执行（未勾选的角色自动跳过）。
  - `exclude`：在勾选的指定角色豁免排除（勾选的角色不执行该插件）。
- **无侵入式 Runtime 拦截**：由 OpenCodeMgr 自动维护 `plugin/_mgr_scope.js`，完全不修改您原本的插件业务逻辑。

---

### 5. 🤖 自定义代理角色（`agent/*.md`）

- 完整支持可视化编辑 `agent/*.md`（模式 `all` / `subagent` / `primary`、专属模型覆写、职责说明、系统提示词）。
- **可视化 6 大工具权限矩阵**：可按角色独立配置 `edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch` 的权限（继承 / 允许 / 询问 / 禁止），并内置「⚡ 只读审查模式」与「⚡ 全功能开发模式」一键套用。

---

### 6. 💬 Session 树状归集与 SQLite 深度瘦身

- **Subagent 子对话树状归集**：将嵌套派生的子任务自动收合在根对话下方，阶梯式展开，清晰计算全链路 Token 与容量占用。
- **深度瘦身清理（Pruning）**：
  - 勾选清理中断/失败的工具调用输出
  - 删除过长工具输出（可自定义门槛，如 >1500 字符）
  - 清除思考历程标签（`<think>` tokens）
  - 清理编辑过程产生的巨大暂存快照
  - 搭配一键 `VACUUM`，实测可释放 **40% ~ 60%** 的 `opencode.db` 磁盘空间。

---

### 7. 🔌 23 组内置 MCP 工具清单

OpenCodeMgr 自带兼容 JSON-RPC 2.0 的 MCP 服务器（同时支持 Stdio 与 Streamable HTTP `POST /mcp`），所有功能皆可由 AI 代理自主调用：

| 模块分类 | MCP 工具名称 | 功能简介 |
|---|---|---|
| **主机节点** | `opencodemgr_list_nodes` | 列出所有受控主机（本机、远程 SSH、跳板机） |
| | `opencodemgr_test_node` | 测试目标主机连通性与健康度 |
| | `opencodemgr_get_config` | 获取目标主机完整的配置快照 |
| **对话维护** | `opencodemgr_session_stats` | 获取 SQLite 数据库容量、WAL 与对话笔数统计 |
| | `opencodemgr_list_sessions` | 按工作区获取对话列表 |
| | `opencodemgr_get_session_detail` | 读取单一对话之完整消息与历程记录 |
| | `opencodemgr_clean_session` | 针对指定对话执行细部瘦身清理 |
| | `opencodemgr_delete_session` | 删除指定对话及其关联历程 |
| **模型与供应商** | `opencodemgr_list_providers` | 获取已配置之模型供应商与旗下列表 |
| | `opencodemgr_set_global_models` | 设置全局主模型、轻量模型与命名/压缩模型 |
| | `opencodemgr_save_provider` | 新增或更新供应商配置与认证密钥 |
| **代理角色** | `opencodemgr_list_agents` | 列出所有自定义 Agent 及工具权限配置 |
| | `opencodemgr_save_agent` | 创建或更新自定义 Agent 角色 |
| **专业技能库** | `opencodemgr_list_skills` | **查询所有 `skills/*/SKILL.md` 专业技能列表** |
| | `opencodemgr_get_skill` | **读取技能前言设置与 Markdown 执行指引全文** |
| | `opencodemgr_save_skill` | **创建或更新专业技能（自动建目录与备份）** |
| | `opencodemgr_delete_skill` | **删除指定技能目录（自动安全备份）** |
| **插件与范围** | `opencodemgr_list_plugins` | 列出已安装之插件、加载顺序与角色生效范围 |
| | `opencodemgr_configure_plugin` | 启用/停用插件、更新角色范围或修改代码 |
| **MCP 管理** | `opencodemgr_manage_mcp` | 新增、更新或删除目标主机的 MCP 服务器挂载 |
| **环境对拷** | `opencodemgr_export_env` | 导出便携式 OpenCode 环境快照包 |
| | `opencodemgr_import_env` | 将快照包还原至目标主机（智能转译与备份） |
| | `opencodemgr_clone_env` | 跨机直接推播对拷环境至一或多台远程节点 |

---

## 模块化架构

```text
OpenCodeMgr/
├── app.mjs                      # 桌面应用程序与服务启动器 (--server-only 支持)
├── server.mjs                   # 轻量 HTTP 服务器入口 (Port 5210)
├── mcp-server.mjs               # 独立 Stdio MCP 服务器入口 (JSON-RPC 2.0)
├── i18n.mjs                     # 四语系本地化字典库 (340+ 键值: zh-TW, zh-CN, en-US, ja-JP)
├── db_helper.py                 # 跨平台 Python SQLite 与目录检索引擎
├── Launcher.cs                  # 原生 Windows .exe 启动器源码 (全屏 Edge/Chrome 应用模式)
├── src/
│   ├── core/
│   │   ├── node-transport.mjs   # 本地文件、Paramiko SSH、跳板传输与安全备份层
│   │   └── parsers.mjs          # JSONC、Agent/Skill Frontmatter 与插件封装解析器
│   ├── services/
│   │   ├── clone-service.mjs    # 环境导出、导入、跨平台转译与网络对拷服务
│   │   ├── skill-service.mjs    # 技能库 CRUD、验证与目录管理服务
│   │   ├── node-service.mjs     # 多主机注册表、SSH 命令执行与健康探测
│   │   ├── provider-service.mjs # 供应商、模型目录与桌面显示状态同步
│   │   ├── agent-plugin-service.mjs # 代理角色、插件范围与系统提示词
│   │   ├── session-service.mjs  # SQLite 对话树归集、修剪与瘦身
│   │   ├── shared-config.mjs    # 共享主机文件系统与路径转换工具
│   │   └── manager-service.mjs  # 统一业务逻辑外观层 (REST API 与 MCP 服务器)
│   ├── api/
│   │   └── router.mjs           # HTTP REST API (/api/*)、Streamable MCP (/mcp) 与静态路由
│   └── mcp/
│       └── mcp-server.mjs       # MCP 工具声明 (23 组工具)、资源处理器与 Stdio 流
└── public/
    ├── index.html               # 仪表盘 HTML 结构与弹窗
    ├── styles.css               # 深色主题样式与响应式切分排版
    ├── app.js                   # 前端主控制器与生命周期协调
    └── js/
        ├── core.js              # 全局状态、i18n DOM 引擎与共用 API 客户端
        ├── components/
        │   └── fuzzy-combobox.js# 关键字模糊搜索下拉菜单组件
        └── modules/
            ├── sessions.js      # 对话历程树、详细查看与数据库维护
            ├── providers.js     # 供应商、旗下模型与官方目录浏览
            ├── agents-plugins.js# 代理角色、专属插件分配、MCP 与系统提示词
            ├── skills.js        # 技能工作流吸顶卡片与 Markdown 编辑器
            └── env-clone.js     # 环境对拷、快照导出与还原弹窗控制器
```

---

## 快速开始

### 系统需求
- **Node.js** `>= 18.0.0`
- **Python** `>= 3.8`

### 1. 获取项目并配置节点列表
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
cp nodes.example.json nodes.json
```
编辑 `nodes.json` 配置您的本机与远程主机 IP 及连接信息。

### 2. 启动管理界面
```bash
# 启动本机服务器并自动开启全屏应用窗口
npm start

# 仅启动后台服务器 (http://127.0.0.1:5210)
npm run server
```
在 Windows 系统中，可直接双击运行 **`OpenCode Manager.exe`**。

### 3. 挂载为 OpenCode 的 MCP 扩展服务器
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

## 开源协议

本项目采用 [MIT License](LICENSE) 授权。欢迎社区提报 Issue 与发送 PR！
