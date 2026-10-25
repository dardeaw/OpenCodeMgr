# OpenCodeMgr 全景管理中心 (v1.7.0)

专为 **OpenCode (`opencode-ai`)** 打造的跨平台桌面 GUI 与 MCP 管理套件 — 支持 **专业技能库管理（`skills/*/SKILL.md`）**、**环境网络对拷与快照备份**、**模型与供应商管理（OpenCode Zen / Go / Models.dev / 自定义端点）**、**插件管理与按角色分配 (`plugin/*.js`)**、**自定义代理角色 (`agent/*.md`)**、**系统提示词**、**MCP 服务器**、**多主机 SSH 集群切换** 与 **SQLite 对话数据库深度瘦身**。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [更新日志 (Changelog)](CHANGELOG.md)

---

## 项目简介

**OpenCodeMgr** 是一套零外部依赖、高稳定性的 OpenCode 可视化控制中心与 **MCP 服务器 (`mcp-server.mjs`)**。彻底解决手改 `opencode.jsonc`、跨主机环境复制同步、专业技能工作流维护、插件无法按角色分流、以及 SQLite 对话库 (`opencode.db`) 膨胀卡顿等痛点。

---

## 核心功能亮点

### 1. ⚡ 专业技能库管理（`skills/*/SKILL.md`，兼容 agentskills.io 标准）
- **原生 OpenCode 技能工作流支持**：完整支持 `<configDir>/skills/<id>/SKILL.md` 目录结构，包含 YAML 前言（`name`、`description`）与 Markdown 详细执行标准。
- **顶部吸顶卡片列表与即时模糊搜索**：即时按技能 ID、显示名称与触发说明过滤筛选；选中卡片即自动载入专属编辑器。
- **全高纵向 Markdown 工作区**：具备等宽字体（monospace）与独立纵向滚动条，支持安全修改、自动备份与一键删除。
- **内置实战示范技能**：
  - `git-release`：标准化 SemVer 版本推进、CHANGELOG 更新、Git Commit/Tag 与 Push 发布流程。
  - `code-refactor`：单一职责原则（SRP）、清晰架构分层、语法检查与暂存文件不落地安全原则。
  - `sqlite-optimizer`：SQLite WAL 断点截断（`PRAGMA wal_checkpoint(TRUNCATE)`）、对话历程修剪与数据库 `VACUUM`。
- **4 组专属 Skill MCP 工具**：直接通过 MCP 自动化读取、创建、更新与删除各主机之技能目录。

### 2. 🧬 环境复制、跨机网络对拷与快照备份
- **跨机网络对拷（Node-to-Node Live Clone）**：可自任意源节点（本机 `.102`、远程 Fedora `.55`、Nobara `.67` 等）直接将环境同步拷贝至单一或多台目标主机，支持循序执行与即时进度/错误回报。
- **便携式环境快照导出/还原（Snapshot Export / Import）**：一键将设置封装为 `.opencode-env.json` 文件下载备份；支持文件上传还原并提供完整的 JSON 结构预览与校验机制。
- **跨平台智能路径转译（Smart Path Translation）**：自动判断 Windows (`C:\Users\馮\.config\opencode\...`) 与 Linux (`/home/dardeaw/.config/opencode/...`) 目录结构与斜杠 (`\` 与 `/`)，转译后无缝对接无死节点。
- **保留目标主机专属 BaseURL（Target BaseURL Preservation）**：智能保留目标主机原有之供应商端点连接（例如本机走 SSH Tunnel `127.0.0.1:18200`，远程走 Tailscale IP `100.103.82.28:18200`），避免复制后推理中断。
- **执行前自动安全备份（Auto-Backup）**：覆写前自动于目标主机创建 `.bak-YYYYMMDD_HHMMSS` 时间戳备份文件，确保设置安全无虞。
- **十二维度细粒度勾选矩阵（含专业技能库与 SQLite 对话库）**：可自由独立勾选复制：供应商配置、模型可见度开关、认证密钥 (`auth.json`)、代理角色 (`agent/*.md`)、**专业技能库 (`skills/*/SKILL.md`)**、插件 (`plugin/*.js`)、插件角色作用范围、系统提示词、MCP 服务器、工具权限矩阵、Bash 执行权限，以及 **SQLite 对话数据库 (`opencode.db`)**。

### 3. 🧠 模型与供应商管理（完整对齐 OpenCode `/models` 与 `/connect` 逻辑）
- **关键字模糊搜索下拉菜单（Fuzzy-Search Combobox）**：所有模型指派字段（主要模型 `model`、轻量模型 `small_model`、自动命名 `agent.title.model`、上下文压缩 `agent.compaction.model` 与各角色专属模型）皆内置即时关键字模糊搜索，自动按分组标签快速筛选。
- **内置与自定义供应商整合**：原生支持 **OpenCode Zen (`opencode`)**、**OpenCode Go (`opencode-go`)**、自建推理服务（`gufo`、`strata`、`halogen`、`lemonade`、`vLLM`、`llama.cpp`）及各大云端 SDK。
- **双轨密钥管理**：支持直接读写 `~/.local/share/opencode/auth.json`（等同 `/connect`）与 `opencode.jsonc` 内的 `options.baseURL` / `options.apiKey`。
- **Models.dev 官方目录浏览与一键导入**：直接检索节点 `~/.cache/opencode/models.json` 数百款模型规格（Context/Output 上限、模态、Reasoning 强度、Free 标记），一键导入或设为默认主模型。

### 4. 🧩 插件管理与「按角色 (by Agent Role)」启停分配
- **插件挂载与顺序调控**：自动扫描 `plugin/*.js` 脚本，支持一键启用/停用（同步更新 `opencode.jsonc` `"plugin"` 数组）、调整载入顺序（`↑` / `↓`）与在线编辑 JS 源代码。
- **按角色指派插件范围（Per-Agent Plugin Scoping）**：可设置插件为 **「🌐 全部角色通用 (`all`)」**、**「🎯 仅指定角色生效 (`include`)」** 或 **「🚫 排除指定角色 (`exclude`)」**。
- **双向同步与无侵入 Runtime 包装**：在「🧩 插件管理」与「🤖 角色管理」两处勾选即时双向同步，自动维护 `plugin-scopes.json` 与 `plugin/_mgr_scope.js` 运行时拦截器。

### 5. 🤖 角色管理与专属工具权限矩阵
- 可视化管理 `agent/*.md`（执行模式 `all` / `subagent` / `primary`、指定模型覆写、角色简介与系统提示词）。
- 内置专属工具权限分配（`edit`、`bash`、`read`、`grep`/`glob`、`task`、`websearch`/`webfetch`）与自定义规则，支持一键套用「⚡ 只读审查模式」与「⚡ 全功能开发模式」。

### 6. 💬 Session 树状归集与 SQLite 深度瘦身清理
- **Subagent 子对话树状归集**：自动将子代理任务归并在主对话下方，阶梯式收合展开并统计容量与 Token 总额。
- **深度瘦身清理**：精准勾选清理失败工具调用、`<think>` 思考历程、过长工具输出（>1500 字符）、编辑前后暂存快照，搭配一键 `VACUUM` 压缩重整，常态可为 `opencode.db` 释放 40%–60% 磁盘空间。

### 7. 🌐 多主机节点管理与四语系支持
- 支持在 **本机 (Local)**、**直连 SSH 主机** 与 **Jump-Host 跳板机主机** 间秒级切换，自动探测远程路径。
- **100% 完整纯净四语系（340+ 键值）**：繁体中文 (`zh-TW`)、简体中文 (`zh-CN`)、英文 (`en-US`)、日语 (`ja-JP`) 即时动态切换，杜绝中英夹杂的虚假翻译。

### 8. 🔌 内置 MCP 服务器 (Stdio & HTTP)
- 提供 **23 组 MCP 工具 (`opencodemgr_*`)** 与动态资源协议（`opencodemgr://nodes`、`opencodemgr://config/{node}`），全面打通外部 AI 与自动化脚本。

---

## 模块化架构

```text
OpenCodeMgr/
├── app.mjs                      # 桌面窗口与服务启动器 (--server-only 支持)
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

### 环境需求
- **Node.js** `>= 18.0.0`
- **Python** `>= 3.8`

### 1. 获取项目并配置主机
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
cp nodes.example.json nodes.json
```

### 2. 启动管理中心
```bash
# 同时启动本机服务器与全屏应用窗口
npm start

# 仅启动后台 HTTP 服务器 (http://127.0.0.1:5210)
npm run server
```
在 Windows 环境下，亦可直接双击运行 **`OpenCode Manager.exe`**。

### 3. 挂载为 OpenCode 本机 MCP 服务器 (`opencode.jsonc`)
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

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。
