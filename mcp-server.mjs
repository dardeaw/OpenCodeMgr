#!/usr/bin/env node
// mcp-server.mjs — Standalone MCP Server Entry Point for OpenCode Manager
// Supports stdio transport (JSON-RPC 2.0) for OpenCode, Antigravity, Claude Desktop, and Cursor.

import { startMcpStdioServer } from './src/mcp/mcp-server.mjs';

startMcpStdioServer();
