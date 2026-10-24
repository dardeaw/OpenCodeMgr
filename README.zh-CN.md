# OpenCodeMgr

跨平台 OpenCode 配置管理、多主机节点调度与 SQLite 数据库深度维护桌面工具。

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

---

## 项目简介

OpenCodeMgr 专为 OpenCode 开发者打造，提供一站式可视化管理面板。涵盖自定义角色 (Agents)、MCP 服务器、系统提示词 (Instructions)、危险命令权限守卫、多节点 SSH 服务器热切换，以及专业级 SQLite 会话 Session 瘦身清理。

---

## 核心功能特色

- 多语言支持 (i18n)：
  - 完整支持简体中文、繁体中文、English、日本語。
  - 启动时自动探测操作系统 (OS) 与浏览器语言，支持右上角即时切换与持久化存储。
- 多主机节点管理 (Multi-Host Fleet)：
  - 单一控制台统一调度本机工作站、远程直连 SSH 主机与 Jump SSH 跳板机。
  - 热切换节点，实时连接状态指示。
- Session 树状归集层级 (Tree Aggregation)：
  - 自动关联主会话与子代理 (Subagent) 任务，支持树状折叠与展开。
  - 展开时保持 DOM 原位无缝渲染，彻底解决页面抖动、滚动条跳顶与排版错位问题。
- SQLite 数据库深度瘦身清理：
  - 精准瘦身 40% 至 60% 空间，完整保留核心历史问答与最终产出代码。
  - 清理非 0 退出码 (Non-0 Exit)、插件防护拦截与挂起中断调用记录。
  - 剥离大段 AI 深度思考链 (<think> 文本)。
  - 截断超过 1500 字符的超大终端日志与文件 dump，保留摘要与状态。
  - 清理历史临时大文件快照与无意义步骤空事件。
  - 内置一键 SQLite VACUUM 磁盘空间物理回收。
- 配置与权限可视化：
  - 在线维护系统提示词 (AGENTS.local.md, SSH_WORKFLOW.md, AGENTS.md)。
  - 管理自定义角色配置 (Prompt、简介、指定模型、运行模式)。
  - 注册与启用 MCP 服务器 (本机可执行文件与远程 URL)。
  - 工具描述优化 (trim-tools.js) 与危险命令拦截 (permission.bash)。
  - opencode.jsonc 实时查看与自动备份保存。

---

## 安装与快速上手

### 环境要求
- Node.js 18.0.0 或更高版本
- Python 3.8+ (用于 SQLite 处理与 Paramiko SSH 连接)

### 1. 克隆代码仓库
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
```

### 2. 配置主机节点
复制节点模板：
```bash
cp nodes.example.json nodes.json
```
编辑 nodes.json 配置您的主机网络。该文件已被 .gitignore 自动排除，防止内网敏感信息泄露。

### 3. 启动应用
以原生应用窗口启动：
```bash
npm start
```
或仅启动后台 HTTP 服务 (监听 http://127.0.0.1:5210)：
```bash
npm run server
```

---

## 系统架构

- 后端服务 (server.mjs)：基于原生 Node.js HTTP 实现，零第三方厚重框架依赖。
- 前端控制台：轻量高响应深色主题，支持零延迟 DOM 动态 i18n 切换。
- 数据库引擎 (db_helper.py)：高性能 Python SQLite 辅助脚本，支持跨平台路径解析、Subagent 树状关系提取与 deep JSON payload 清理。
- 窗口适配器 (app.mjs)：调用本地 Edge 或 Chrome 应用模式，提供沉浸式桌面客户端体验。

---

## 开源协议

MIT License. 详见 LICENSE 文件。
