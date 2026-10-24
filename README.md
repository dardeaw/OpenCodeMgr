# OpenCodeMgr

Cross-Platform GUI Management Tool for OpenCode Configuration, Multi-Host Nodes, and SQLite Database Maintenance.

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

---

## Overview

OpenCodeMgr is a desktop administrative console designed for OpenCode developers. It provides centralized management for agent definitions, MCP servers, system prompts, permission guards, multi-host SSH nodes, and advanced SQLite conversation session pruning.

---

## Key Features

- Multi-Language Support (i18n):
  - English, Traditional Chinese, Simplified Chinese, Japanese.
  - Automatic OS / browser language detection with manual persistent switching.
- Multi-Host Fleet Management:
  - Manage local workstations, direct SSH remote nodes, and jump-host SSH servers within a single unified dashboard.
  - Hot switching between servers with dynamic status indicators.
- Session Hierarchy and Tree Aggregation:
  - Automatically identifies root conversations and organizes Subagent child tasks into a collapsible tree structure.
  - Prevents UI layout jitter, title misalignment, and scroll jumps during tree expansion.
- Deep Database Session Pruning:
  - Reclaim 40% to 60% of SQLite database storage without losing valuable user prompts or final code answers.
  - Prunes non-zero exit errors, aborted executions, and plugin defense rejections.
  - Cleans lengthy AI reasoning chains (<think> blocks).
  - Truncates oversized tool outputs (>1500 characters) while preserving command metadata and execution summaries.
  - Removes redundant temporary file snapshots and empty step marker events.
  - Built-in SQLite VACUUM optimization to recover physical disk space.
- Configuration Management:
  - Edit system instructions (AGENTS.local.md, SSH_WORKFLOW.md, AGENTS.md).
  - Manage custom Agents (prompt, description, model override, mode).
  - Register and configure MCP servers (local binaries and remote endpoints).
  - Fine-tune tool descriptions (trim-tools.js) and command permission rules (permission.bash).
  - Live inspection and auto-backup editor for opencode.jsonc.

---

## Installation & Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- Python 3.8+ (for SQLite helper operations and Paramiko SSH operations)

### 1. Clone Repository
```bash
git clone https://github.com/dardeaw/OpenCodeMgr.git
cd OpenCodeMgr
```

### 2. Configure Host Nodes
Copy the example node configuration template:
```bash
cp nodes.example.json nodes.json
```
Edit nodes.json to configure your local environment or remote servers. nodes.json is automatically ignored by git to protect private network credentials.

### 3. Launch Application
To launch the server with native application window:
```bash
npm start
```
Or start the HTTP server only (accessible on http://127.0.0.1:5210):
```bash
npm run server
```

---

## Architecture

- Server Backend (server.mjs): Native Node.js HTTP server without heavy framework dependencies.
- Frontend Client: Zero-dependency responsive dark-themed dashboard embedded directly with instant DOM i18n rendering.
- Database Engine (db_helper.py): High-performance Python SQLite script handling multi-platform database path resolution, subagent tree parsing, and deep JSON part payload pruning.
- Window Wrapper (app.mjs): Lightweight launcher utilizing native system application mode (Microsoft Edge or Google Chrome) for native desktop look and feel.

---

## License

MIT License. See LICENSE for details.
