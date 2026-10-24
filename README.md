# OpenCodeMgr

Cross-Platform GUI Management Tool for OpenCode System Prompts, Agent Roles, MCP Tools, Multi-Host Nodes, and SQLite Database Maintenance.

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

---

## Overview

OpenCodeMgr is a comprehensive desktop management dashboard built for developers using OpenCode. It centralizes control over system prompts (instructions), custom agent roles, MCP servers and tool permissions, multi-host SSH fleet deployment, and deep SQLite conversation database maintenance.

---

## Key Features

- Prompt, Agent, and MCP Tool Management:
  - System Prompts: Live visual editing and versioned backups for primary instructions (AGENTS.local.md), remote SSH workflow rules (SSH_WORKFLOW.md), and global workspace guidelines (AGENTS.md).
  - Agent Roles: Register, edit, and configure custom agents with execution mode controls (primary, subagent, or all), specialized descriptions for LLM routing, and model overrides.
  - MCP Servers: Manage local binary executables and remote Model Context Protocol (MCP) endpoints with one-click toggling, timeouts, and argument passing.
  - Tool Descriptions and Permission Guards: Customize system descriptions exposed to LLMs (trim-tools.js) to reduce token consumption, and configure deny/ask security guards for bash execution (permission.bash).
  - opencode.jsonc Editor: Live JSONC inspector with instant schema checking and automated backups.
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
- Multi-Language Support (i18n):
  - English, Traditional Chinese, Simplified Chinese, Japanese.
  - Automatic OS / browser language detection with manual persistent switching.

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
