import { I18N } from './i18n.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const PORT = 5210;

// Base paths
const BASE_OPENCODE_DIR = path.resolve('C:/Users/馮/.config/opencode');
const NODES_CONFIG_FILE = path.join(BASE_OPENCODE_DIR, 'opencode-manager', 'nodes.json');
const RUN_SSH_SCRIPT = path.join(BASE_OPENCODE_DIR, 'run_ssh.py');
const JUMP_SSH_SCRIPT = path.join(BASE_OPENCODE_DIR, 'jump_ssh.py');
const LOCAL_DB_HELPER = path.join(BASE_OPENCODE_DIR, 'opencode-manager', 'db_helper.py');

// Load nodes from JSON file
function loadNodes() {
  if (!fs.existsSync(NODES_CONFIG_FILE)) {
    return [
      {
        id: 'local',
        name: '💻 本機 (.102 Windows)',
        type: 'local',
        ip: '192.168.68.102',
        configDir: 'C:\\Users\\馮\\.config\\opencode',
        dbPath: 'C:\\Users\\馮\\.local\\share\\opencode\\opencode.db'
      },
      {
        id: 'remote55',
        name: '🌐 Fedora (.55)',
        type: 'ssh',
        ip: '192.168.68.55',
        user: 'dardeaw',
        configDir: '/home/dardeaw/.config/opencode',
        dbPath: '/home/dardeaw/.local/share/opencode/opencode.db'
      }
    ];
  }
  try {
    return JSON.parse(fs.readFileSync(NODES_CONFIG_FILE, 'utf-8'));
  } catch (err) {
    console.error('Failed to parse nodes.json:', err);
    return [];
  }
}

function saveNodes(nodes) {
  fs.writeFileSync(NODES_CONFIG_FILE, JSON.stringify(nodes, null, 2), 'utf-8');
}

function getNode(nodeId) {
  const nodes = loadNodes();
  return nodes.find(n => n.id === nodeId) || nodes[0];
}

// Run command on specific node
async function runNodeCmd(node, cmd) {
  if (node.type === 'local') {
    const { stdout } = await execAsync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  } else if (node.type === 'jump') {
    const pyCmd = `python "${JUMP_SSH_SCRIPT}" "${cmd.replace(/"/g, '\\"')}"`;
    const { stdout } = await execAsync(pyCmd, { timeout: 25000, maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  } else {
    // Standard SSH via run_ssh.py
    const pyCmd = `python "${RUN_SSH_SCRIPT}" ${node.ip} "${cmd.replace(/"/g, '\\"')}"`;
    const { stdout } = await execAsync(pyCmd, { timeout: 25000, maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  }
}

// Upload file to specific node
async function uploadToNode(node, localPath, remotePath) {
  if (node.type === 'local') {
    fs.copyFileSync(localPath, remotePath);
  } else {
    const pyCmd = `python "${RUN_SSH_SCRIPT}" ${node.ip} --upload "${localPath}" "${remotePath}"`;
    await execAsync(pyCmd, { timeout: 20000 });
  }
}

// Strip comments for parsing JSONC
function stripJsonComments(str) {
  return str.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseJsonc(str) {
  try {
    return JSON.parse(stripJsonComments(str));
  } catch {
    return null;
  }
}

// Backup file on node
async function backupNodeFile(node, filePath) {
  if (node.type === 'local') {
    if (!fs.existsSync(filePath)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath);
    fs.copyFileSync(filePath, path.join(dir, `${base}.bak-${ts}${ext}`));
  } else {
    const cmd = `[ -f "${filePath}" ] && cp "${filePath}" "${filePath}.bak-$(date +%Y%m%d-%H%M%S)" || true`;
    await runNodeCmd(node, cmd);
  }
}

// Parse markdown agent with frontmatter
function parseAgentMarkdown(content, filename) {
  const id = filename.replace(/\.md$/, '');
  let description = '';
  let mode = 'all';
  let model = '';
  let prompt = content;
  let permissions = {};
  let customRules = [];

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    prompt = fmMatch[2].trim();
    let inPerm = false;
    for (const rawLine of fm.split('\\n')) {
      const line = rawLine.replace(/\r$/, '');
      const trimmed = line.trim();
      if (trimmed.startsWith('description:')) {
        description = trimmed.slice(12).trim();
        inPerm = false;
      } else if (trimmed.startsWith('mode:')) {
        mode = trimmed.slice(5).trim();
        inPerm = false;
      } else if (trimmed.startsWith('model:')) {
        model = trimmed.slice(6).trim();
        inPerm = false;
      } else if (trimmed.startsWith('permission:') || trimmed.startsWith('permissions:')) {
        inPerm = true;
      } else if (inPerm) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          const parts = trimmed.split(':');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim().replace(/['"]/g, '');
            if (['edit', 'bash', 'read', 'grep', 'glob', 'task', 'websearch', 'webfetch'].includes(key)) {
              permissions[key] = val;
            } else {
              customRules.push(trimmed);
            }
          }
        } else if (trimmed) {
          inPerm = false;
        }
      }
    }
  }

  return { id, filename, description, mode, model, prompt, permissions, customRules, fullContent: content };
}

// Parse trim-tools.js
function parseTrimTools(content) {
  const descs = {};
  if (!content) return descs;
  const match = content.match(/const\s+DESCS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!match) return descs;

  const lines = match[1].split('\\n');
  let currentKey = null;
  let currentVal = '';

  for (const line of lines) {
    const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      if (currentKey) descs[currentKey] = cleanToolStr(currentVal);
      currentKey = keyMatch[1];
      currentVal = keyMatch[2];
    } else if (currentKey) {
      currentVal += '\n' + line;
    }
  }
  if (currentKey) descs[currentKey] = cleanToolStr(currentVal);
  return descs;
}

function cleanToolStr(raw) {
  let s = raw.trim();
  if (s.endsWith(',')) s = s.slice(0, -1).trim();
  try {
    return eval(`(${s})`);
  } catch {
    return s.replace(/^["'`]|["'`]$/g, '');
  }
}

// Load data for given node
async function getNodeData(node) {
  const isWindows = node.type === 'local' || node.configDir.includes('\\');
  const sep = isWindows ? '\\' : '/';
  const cfgFile = `${node.configDir}${sep}opencode.jsonc`;
  const promptLocal = `${node.configDir}${sep}AGENTS.local.md`;
  const promptGlobal = `${node.configDir}${sep}AGENTS.md`;
  const promptSsh = `${node.configDir}${sep}SSH_WORKFLOW.md`;
  const agentDir = `${node.configDir}${sep}agent`;
  const trimTools = `${node.configDir}${sep}plugin${sep}trim-tools.js`;

  let rawJsonc = '';
  let localPrompt = '';
  let globalPrompt = '';
  let sshPrompt = '';
  let agentList = [];
  let tools = {};

  if (node.type === 'local') {
    rawJsonc = fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile, 'utf-8') : '';
    localPrompt = fs.existsSync(promptLocal) ? fs.readFileSync(promptLocal, 'utf-8') : '';
    globalPrompt = fs.existsSync(promptGlobal) ? fs.readFileSync(promptGlobal, 'utf-8') : '';

    if (fs.existsSync(agentDir)) {
      const files = fs.readdirSync(agentDir);
      for (const f of files) {
        if (f.endsWith('.md')) {
          const c = fs.readFileSync(path.join(agentDir, f), 'utf-8');
          agentList.push(parseAgentMarkdown(c, f));
        }
      }
    }

    const toolsContent = fs.existsSync(trimTools) ? fs.readFileSync(trimTools, 'utf-8') : '';
    tools = parseTrimTools(toolsContent);
  } else {
    rawJsonc = await runNodeCmd(node, `cat "${cfgFile}" 2>/dev/null || true`);
    localPrompt = await runNodeCmd(node, `cat "${promptLocal}" 2>/dev/null || true`);
    globalPrompt = await runNodeCmd(node, `cat "${promptGlobal}" 2>/dev/null || true`);
    sshPrompt = await runNodeCmd(node, `cat "${promptSsh}" 2>/dev/null || true`);

    const agentFilesRaw = await runNodeCmd(node, `ls -1 "${agentDir}"/*.md 2>/dev/null || true`);
    const agentFiles = agentFilesRaw.split('\\n').map(s => s.trim()).filter(Boolean);
    for (const f of agentFiles) {
      const filename = f.split('/').pop().split('\\').pop();
      const c = await runNodeCmd(node, `cat "${f}" 2>/dev/null || true`);
      agentList.push(parseAgentMarkdown(c, filename));
    }
  }

  const parsed = parseJsonc(rawJsonc) || {};

  return {
    node: node.id,
    name: node.name,
    ip: node.ip,
    config: parsed,
    rawJsonc,
    systemPrompts: {
      local: { name: 'AGENTS.local.md', content: localPrompt },
      global: { name: 'AGENTS.md', content: globalPrompt },
      ssh: { name: 'SSH_WORKFLOW.md', content: sshPrompt }
    },
    agents: agentList,
    tools
  };
}

// Write file to node
async function writeNodeFile(node, targetPath, content) {
  await backupNodeFile(node, targetPath);
  if (node.type === 'local') {
    fs.writeFileSync(targetPath, content, 'utf-8');
  } else {
    const tempPath = path.join(os.tmpdir(), `oc_tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.tmp`);
    fs.writeFileSync(tempPath, content, 'utf-8');
    try {
      await uploadToNode(node, tempPath, targetPath);
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}

// Run DB helper on node
async function runDbHelperOnNode(node, args) {
  const isWindows = node.type === 'local' || node.configDir.includes('\\');
  const sep = isWindows ? '\\' : '/';
  const remoteHelper = `${node.configDir}${sep}db_helper.py`;

  if (node.type === 'local') {
    const cmd = `python "${LOCAL_DB_HELPER}" ${args.join(' ')}`;
    const { stdout } = await execAsync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32 });
    return JSON.parse(stdout.trim());
  } else {
    const envPrefix = node.dbPath ? `OPENCODE_DB_PATH="${node.dbPath}" ` : '';
    const cmd = `${envPrefix}python3 "${remoteHelper}" ${args.join(' ')}`;
    const out = await runNodeCmd(node, cmd);
    return JSON.parse(out.trim());
  }
}

// HTML UI
function getHtml(serverDetectedLocale = "zh-TW") {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>OpenCode Manager</title>
  <style>
    :root {
      --bg: #0b0c0f;
      --card-bg: #13151b;
      --card-hover: #181b24;
      --border: #232733;
      --text: #e2e8f0;
      --text-muted: #808b9e;
      --primary: #10b981;
      --primary-hover: #059669;
      --accent: #38bdf8;
      --purple: #818cf8;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --warning: #f59e0b;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }

    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .logo-area { display: flex; align-items: center; gap: 12px; }
    .badge {
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 4px;
      background: #1c202c;
      color: var(--primary);
      border: 1px solid #2d3548;
    }
    h1 { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; }

    /* Node Selector Dropdown */
    .node-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #090a0d;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 3px 8px;
    }
    .node-select {
      background: transparent;
      border: none;
      color: #fff;
      font-size: 12.5px;
      font-weight: 600;
      outline: none;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .node-select option, select option {
      background-color: #12141a !important;
      color: #f8fafc !important;
      padding: 8px 12px !important;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--primary);
      box-shadow: 0 0 6px var(--primary);
    }
    .status-dot.offline {
      background: var(--danger);
      box-shadow: 0 0 6px var(--danger);
    }

    nav {
      display: flex;
      gap: 4px;
      background: var(--card-bg);
      padding: 0 20px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 9px 14px;
      cursor: pointer;
      font-size: 12.5px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--primary);
      border-bottom-color: var(--primary);
      background: rgba(16, 185, 129, 0.05);
    }

    main {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .tab-pane { display: none; }
    .tab-pane.active { display: block; }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 5px;
      letter-spacing: 0.5px;
    }
    input:not([type="checkbox"]):not([type="radio"]), textarea, select {
      width: 100%;
      background: #090a0d;
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text);
      padding: 7px 10px;
      font-size: 13px;
      font-family: var(--font-mono);
      outline: none;
      user-select: text;
      transition: border 0.15s;
    }
    input[type="checkbox"], input[type="radio"] {
      width: 16px;
      height: 16px;
      accent-color: var(--primary);
      cursor: pointer;
      flex-shrink: 0;
      margin: 0;
    }
    input:focus, textarea:focus, select:focus {
      border-color: var(--primary);
    }
    textarea {
      resize: vertical;
      min-height: 120px;
      line-height: 1.45;
    }

    .row { display: flex; gap: 12px; margin-bottom: 12px; }
    .col { flex: 1; }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #1c202c;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 6px 14px;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { background: #282f40; }
    .btn-primary {
      background: var(--primary);
      color: #041f14;
      border-color: var(--primary);
      font-weight: 600;
    }
    .btn-primary:hover { background: var(--primary-hover); }
    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      color: var(--danger);
      border-color: rgba(239, 68, 68, 0.3);
    }
    .btn-danger:hover {
      background: var(--danger);
      color: #fff;
    }
    .btn-sm {
      padding: 3px 8px;
      font-size: 11px;
    }

    /* Grid & Lists */
    .agent-grid, .mcp-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .item-card {
      background: #090a0d;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
      position: relative;
      cursor: pointer;
      transition: all 0.15s;
    }
    .item-card:hover {
      border-color: #38bdf8;
      background: var(--card-hover);
    }
    .item-card.selected {
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary);
    }
    .item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .item-name {
      font-weight: 600;
      font-size: 13.5px;
      color: #38bdf8;
      font-family: var(--font-mono);
    }
    .item-desc {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .item-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
      font-family: var(--font-mono);
    }

    /* Stat Cards */
    .stats-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-card {
      background: #090a0d;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px;
    }
    .stat-val {
      font-size: 20px;
      font-weight: 700;
      color: var(--accent);
      font-family: var(--font-mono);
      margin-top: 4px;
    }
    .stat-lbl {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      font-weight: 600;
    }

    /* Session Table */
    .session-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    .session-table th {
      text-align: left;
      padding: 8px 12px;
      background: #090a0d;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .session-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #1a1e28;
      font-family: var(--font-mono);
    }
    .session-table tr:hover td {
      background: #181b24;
    }

    /* Modals */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.75);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    }
    .modal-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 90vw;
      height: 88vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px rgba(0,0,0,0.6);
      overflow: hidden;
    }
    .modal-header {
      padding: 14px 20px;
      background: #090a0d;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      user-select: text;
    }

    /* Node Manager Modal Box */
    .node-modal-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 780px;
      max-width: 95vw;
      max-height: 88vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px rgba(0,0,0,0.6);
      overflow: hidden;
    }

    /* Chat bubble styles */
    .msg-bubble {
      margin-bottom: 18px;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      background: #0f1118;
    }
    .msg-header {
      background: #161922;
      padding: 8px 14px;
      font-size: 11.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      font-family: var(--font-mono);
    }
    .msg-header.user { border-left: 3px solid var(--accent); color: var(--accent); }
    .msg-header.assistant { border-left: 3px solid var(--primary); color: var(--primary); }
    .msg-content {
      padding: 14px;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .part-box {
      margin-top: 10px;
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      font-family: var(--font-mono);
    }
    .part-reasoning {
      background: #1a1625;
      border: 1px solid #3b2d54;
      color: #c4b5fd;
    }
    .part-tool {
      background: #0d1b2a;
      border: 1px solid #1e3a5f;
      color: #7dd3fc;
    }

    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1c202c;
      border: 1px solid var(--primary);
      color: #fff;
      padding: 10px 18px;
      border-radius: 5px;
      font-size: 12.5px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      display: none;
      z-index: 10001;
    }
    .loading-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(11, 12, 15, 0.75);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      font-family: var(--font-mono);
      font-size: 14px;
      color: var(--accent);
    }
    /* Clean Dialog Card Styles */
    .clean-card-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 14px;
      margin-bottom: 8px;
      background: #090a0d;
      border: 1px solid var(--border);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      text-transform: none !important;
    }
    .clean-card-item:hover {
      background: #12141a;
      border-color: rgba(255, 255, 255, 0.18);
    }
    .clean-card-item input[type="checkbox"] {
      margin-top: 3px;
      width: 16px;
      height: 16px;
      accent-color: #f59e0b;
      flex-shrink: 0;
    }
    .clean-card-body {
      flex: 1;
      text-transform: none !important;
    }
    .clean-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 3px;
      text-transform: none !important;
      letter-spacing: normal !important;
    }
    .clean-card-desc {
      font-size: 11.5px;
      color: #94a3b8;
      line-height: 1.45;
      text-transform: none !important;
      letter-spacing: normal !important;
    }
    .clean-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
  </style>
</head>
<body>

  <div class="loading-overlay" id="loading" data-i18n="connecting">連線同步中...</div>

  <header>
    <div class="logo-area">
      <h1>OpenCode Manager</h1>
      <span class="badge">v1.3.0 Dynamic</span>
      
      <!-- Dynamic Node Selector -->
      <div class="node-bar">
        <div class="status-dot" id="node-status-dot"></div>
        <select class="node-select" id="node-selector" onchange="switchNode(this.value)">
          <option value="local">💻 本機 (.102)</option>
        </select>
        <button class="btn btn-sm" onclick="openNodeManagerModal()" title="新增、編輯或管理主機節點" data-i18n="manageNodes">⚙️ 管理主機</button>
      </div>

      <span class="badge" id="host-badge" style="color: #38bdf8;">192.168.68.102</span>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <select id="lang-selector" class="node-select" onchange="changeLanguage(this.value)" style="padding: 5px 8px; font-size: 12px; background: #13151b; border: 1px solid var(--border); border-radius: 5px; color: var(--text);">
        <option value="zh-TW">繁體中文</option>
        <option value="zh-CN">简体中文</option>
        <option value="en-US">English</option>
        <option value="ja-JP">日本語</option>
      </select>
      <button class="btn btn-primary" id="btn-reload-all" onclick="reloadAll()" data-i18n="refresh">🔄 重新整理</button>
    </div>
  </header>

  <nav>
    <button class="tab-btn active" onclick="switchTab('sessions')" data-i18n="tabSessions">💬 Session 管理</button>
    <button class="tab-btn" onclick="switchTab('system-prompts')" data-i18n="tabPrompts">📋 系統提示詞 (Instructions)</button>
    <button class="tab-btn" onclick="switchTab('agents')" data-i18n="tabAgents">🤖 角色管理 (Agents)</button>
    <button class="tab-btn" onclick="switchTab('mcp')" data-i18n="tabMcp">🔌 MCP 伺服器</button>
    <button class="tab-btn" onclick="switchTab('tools')" data-i18n="tabTools">🛠️ Tools & 權限</button>
    <button class="tab-btn" onclick="switchTab('raw-json')" data-i18n="tabRawJson">📄 opencode.jsonc 檢視</button>
  </nav>

  <main>
    <!-- 0. Session Manager Tab -->
    <div id="sessions" class="tab-pane active">
      <!-- Database Stats -->
      <div class="stats-container">
        <div class="stat-card">
          <div class="stat-lbl" data-i18n="statDbSize">SQLite 庫容量</div>
          <div class="stat-val" id="stat-db-size">-</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl" data-i18n="statWalSize">WAL 暫存佔用</div>
          <div class="stat-val" id="stat-wal-size">-</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl" data-i18n="statSessions">總 Session 數</div>
          <div class="stat-val" id="stat-sessions">-</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl" data-i18n="statMessages">Messages 筆數</div>
          <div class="stat-val" id="stat-messages">-</div>
        </div>
        <div class="stat-card">
          <div class="stat-lbl" data-i18n="statParts">Parts (細部歷程)</div>
          <div class="stat-val" id="stat-parts">-</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <span data-i18n="workspaceTitle">Workspace 對話管理</span>
            <select id="session-workspace-filter" style="width: 240px; font-size: 12px;" onchange="loadSessions()">
              <option value="all">全部工作區 (All Workspaces)</option>
            </select>
            <div style="display: flex; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; background: #090a0d;">
              <button id="btn-view-tree" class="btn btn-sm" style="background: rgba(56,189,248,0.2); color: #38bdf8; border: none; border-radius: 0; padding: 4px 10px; font-weight: 600;" onclick="switchSessionViewMode('tree')">🗂️ 樹狀歸集</button>
              <button id="btn-view-flat" class="btn btn-sm" style="background: transparent; color: var(--text-muted); border: none; border-radius: 0; padding: 4px 10px;" onclick="switchSessionViewMode('flat')">📋 平鋪清單</button>
            </div>
          </div>
          <div>
            <button class="btn btn-sm" onclick="runVacuum()">🧹 VACUUM 瘦身重整</button>
            <button class="btn btn-sm btn-primary" onclick="loadSessions()">🔄 刷新列表</button>
          </div>
        </div>

        <div style="overflow-x: auto;">
          <table class="session-table">
            <thead>
              <tr>
                <th>對話標題 / ID</th>
                <th data-i18n="colWorkspace">工作區 (Workspace)</th>
                <th data-i18n="colModel">模型 (Model)</th>
                <th data-i18n="colUpdated">更新時間</th>
                <th>佔用容量 (Size)</th>
                <th data-i18n="colCounts">對話 / Part 數</th>
                <th data-i18n="colTokens">Token 消耗</th>
                <th style="text-align: right;">操作</th>
              </tr>
            </thead>
            <tbody id="session-tbody">
              <tr><td colspan="8" style="text-align: center; color: var(--text-muted);">載入中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 1. System Prompts -->
    <div id="system-prompts" class="tab-pane">
      <div class="card">
        <div class="card-title">
          <span id="prompt-local-title"><span data-i18n="promptMainTitle">AGENTS.local.md (主要系統指示)</span></span>
          <button class="btn btn-primary" onclick="savePrompt('local')">💾 儲存</button>
        </div>
        <textarea id="prompt-local" style="height: 380px;"></textarea>
      </div>

      <div class="card" id="card-ssh-prompt" style="display: none;">
        <div class="card-title">
          <span><span data-i18n="promptSshTitle">SSH_WORKFLOW.md (遠端 SSH 工作流規範)</span></span>
          <button class="btn btn-primary" onclick="savePrompt('ssh')">💾 儲存 SSH_WORKFLOW.md</button>
        </div>
        <textarea id="prompt-ssh" style="height: 220px;"></textarea>
      </div>

      <div class="card">
        <div class="card-title">
          <span><span data-i18n="promptGlobalTitle">AGENTS.md (全域通用規範)</span></span>
          <button class="btn btn-primary" onclick="savePrompt('global')">💾 儲存 AGENTS.md</button>
        </div>
        <textarea id="prompt-global" style="height: 180px;"></textarea>
      </div>
    </div>

    <!-- 2. Agents -->
    <div id="agents" class="tab-pane">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h2 style="font-size: 14px;" id="agent-list-title">已註冊之自訂角色 (Custom Agents)</h2>
        <button class="btn btn-primary" onclick="createNewAgent()">➕ 新增角色</button>
      </div>

      <div class="agent-grid" id="agent-list"></div>

      <!-- Agent Editor -->
      <div class="card" id="agent-editor" style="display: none;">
        <div class="card-title">
          <span id="agent-editor-title" data-i18n="editAgent">編輯角色</span>
          <div>
            <button class="btn btn-danger" id="btn-delete-agent" onclick="deleteCurrentAgent()">🗑️ 刪除角色</button>
            <button class="btn btn-primary" onclick="saveCurrentAgent()">💾 儲存角色設定</button>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <label data-i18n="agentId">角色 ID (檔案名，如 llm-engineer)</label>
            <input type="text" id="agent-id" placeholder="my-agent">
          </div>
          <div class="col">
            <label data-i18n="agentMode">執行模式 (Mode)</label>
            <select id="agent-mode">
              <option value="all">all (主要對話與子代理通用)</option>
              <option value="subagent">subagent (僅作為子代理)</option>
              <option value="primary">primary (僅作為主對話)</option>
            </select>
          </div>
          <div class="col">
            <label data-i18n="agentModel">指定模型 (Model Override)</label>
            <input type="text" id="agent-model" placeholder="opencode/deepseek-v4-flash-free">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label data-i18n="agentDesc">角色簡介 (Description - 給 LLM 判斷何時啟動)</label>
          <input type="text" id="agent-desc" placeholder="簡述角色專長與啟動時機">
        </div>

        <!-- Dedicated Agent Tool Permissions -->
        <div style="background: #090a0d; border: 1px solid var(--border); border-radius: 6px; padding: 14px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--accent);" data-i18n="agentToolsTitle">專屬 Tools 與權限分配 (Agent Tool Permissions)</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-sm" type="button" onclick="applyAgentToolPreset('readonly')" data-i18n="presetReadOnly">⚡ 唯讀審查模式 (禁止改檔/終端)</button>
              <button class="btn btn-sm" type="button" onclick="applyAgentToolPreset('fulldev')" data-i18n="presetFullDev">⚡ 全功能開發模式 (全部允許)</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-bottom: 12px;">
            <div style="background: #13151b; border: 1px solid var(--border); border-radius: 5px; padding: 8px 12px;">
              <label style="margin-bottom: 4px;" data-i18n="agentToolEdit">修改檔案 (edit / write)</label>
              <select id="agent-perm-edit" style="padding: 4px 8px; font-size: 12px;">
                <option value="inherit" data-i18n="permInherit">繼承全域 (inherit)</option>
                <option value="allow" data-i18n="permAllow">允許 (allow)</option>
                <option value="ask" data-i18n="permAsk">詢問確認 (ask)</option>
                <option value="deny" data-i18n="permDeny">禁止 (deny)</option>
              </select>
            </div>
            <div style="background: #13151b; border: 1px solid var(--border); border-radius: 5px; padding: 8px 12px;">
              <label style="margin-bottom: 4px;" data-i18n="agentToolBash">終端指令 (bash / shell)</label>
              <select id="agent-perm-bash" style="padding: 4px 8px; font-size: 12px;">
                <option value="inherit" data-i18n="permInherit">繼承全域 (inherit)</option>
                <option value="allow" data-i18n="permAllow">允許 (allow)</option>
                <option value="ask" data-i18n="permAsk">詢問確認 (ask)</option>
                <option value="deny" data-i18n="permDeny">禁止 (deny)</option>
              </select>
            </div>
            <div style="background: #13151b; border: 1px solid var(--border); border-radius: 5px; padding: 8px 12px;">
              <label style="margin-bottom: 4px;" data-i18n="agentToolRead">讀取檔案 (read)</label>
              <select id="agent-perm-read" style="padding: 4px 8px; font-size: 12px;">
                <option value="inherit" data-i18n="permInherit">繼承全域 (inherit)</option>
                <option value="allow" data-i18n="permAllow">允許 (allow)</option>
                <option value="ask" data-i18n="permAsk">詢問確認 (ask)</option>
                <option value="deny" data-i18n="permDeny">禁止 (deny)</option>
              </select>
            </div>
            <div style="background: #13151b; border: 1px solid var(--border); border-radius: 5px; padding: 8px 12px;">
              <label style="margin-bottom: 4px;" data-i18n="agentToolSearch">檢索搜尋 (grep / glob)</label>
              <select id="agent-perm-search" style="padding: 4px 8px; font-size: 12px;">
                <option value="inherit" data-i18n="permInherit">繼承全域 (inherit)</option>
                <option value="allow" data-i18n="permAllow">允許 (allow)</option>
                <option value="ask" data-i18n="permAsk">詢問確認 (ask)</option>
                <option value="deny" data-i18n="permDeny">禁止 (deny)</option>
              </select>
            </div>
            <div style="background: #13151b; border: 1px solid var(--border); border-radius: 5px; padding: 8px 12px;">
              <label style="margin-bottom: 4px;" data-i18n="agentToolTask">委派子任務 (task / subagent)</label>
              <select id="agent-perm-task" style="padding: 4px 8px; font-size: 12px;">
                <option value="inherit" data-i18n="permInherit">繼承全域 (inherit)</option>
                <option value="allow" data-i18n="permAllow">允許 (allow)</option>
                <option value="ask" data-i18n="permAsk">詢問確認 (ask)</option>
                <option value="deny" data-i18n="permDeny">禁止 (deny)</option>
              </select>
            </div>
            <div style="background: #13151b; border: 1px solid var(--border); border-radius: 5px; padding: 8px 12px;">
              <label style="margin-bottom: 4px;" data-i18n="agentToolWeb">聯網搜尋 (websearch / webfetch)</label>
              <select id="agent-perm-web" style="padding: 4px 8px; font-size: 12px;">
                <option value="inherit" data-i18n="permInherit">繼承全域 (inherit)</option>
                <option value="allow" data-i18n="permAllow">允許 (allow)</option>
                <option value="ask" data-i18n="permAsk">詢問確認 (ask)</option>
                <option value="deny" data-i18n="permDeny">禁止 (deny)</option>
              </select>
            </div>
          </div>

          <div>
            <label style="margin-bottom: 4px;" data-i18n="agentToolCustom">自訂指令/資源規則 (每行一個，如 git *: allow 或 mcp_*: deny)</label>
            <textarea id="agent-perm-custom" style="min-height: 50px; height: 55px; font-size: 12px;" placeholder="'git *': allow&#10;'rm *': deny"></textarea>
          </div>
        </div>

        <div>
          <label data-i18n="agentPrompt">角色系統提示詞 (System Prompt)</label>
          <textarea id="agent-prompt" style="height: 320px;"></textarea>
        </div>
      </div>

      <!-- Core Agents Config -->
      <div class="card">
        <div class="card-title">
          <span data-i18n="coreConfig">核心角色設定 (Core Config in opencode.jsonc)</span>
          <button class="btn btn-primary" onclick="saveCoreAgents()">💾 儲存核心角色設定</button>
        </div>
        <div class="row">
          <div class="col">
            <label data-i18n="compactionModel">對話接續壓縮角色 (Compaction Model)</label>
            <input type="text" id="compaction-model">
          </div>
          <div class="col">
            <label data-i18n="titleModel">對話命名角色 (Title Model)</label>
            <input type="text" id="title-model">
          </div>
        </div>
        <div>
          <label data-i18n="compactionPrompt">對話接續壓縮提示詞 (Compaction Prompt)</label>
          <textarea id="compaction-prompt" style="height: 100px;"></textarea>
        </div>
      </div>
    </div>

    <!-- 3. MCP -->
    <div id="mcp" class="tab-pane">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <h2 style="font-size: 14px;">MCP 伺服器 (Model Context Protocol)</h2>
        <button class="btn btn-primary" onclick="addNewMcp()">➕ 新增 MCP 伺服器</button>
      </div>

      <div class="mcp-grid" id="mcp-list"></div>

      <!-- MCP Editor -->
      <div class="card" id="mcp-editor" style="display: none;">
        <div class="card-title">
          <span id="mcp-editor-title" data-i18n="editMcp">編輯 MCP 伺服器</span>
          <div>
            <button class="btn btn-danger" onclick="deleteCurrentMcp()">🗑️ 刪除</button>
            <button class="btn btn-primary" onclick="saveCurrentMcp()">💾 儲存 MCP</button>
          </div>
        </div>

        <div class="row">
          <div class="col">
            <label data-i18n="mcpName">伺服器名稱 (ID)</label>
            <input type="text" id="mcp-id" placeholder="docgraph">
          </div>
          <div class="col">
            <label data-i18n="mcpType">傳輸類型 (Type)</label>
            <select id="mcp-type">
              <option value="local">local (本機可執行檔)</option>
              <option value="remote">remote (遠端 URL)</option>
            </select>
          </div>
          <div class="col">
            <label data-i18n="mcpStatus">狀態 (Enabled)</label>
            <select id="mcp-enabled">
              <option value="true">啟用 (true)</option>
              <option value="false">停用 (false)</option>
            </select>
          </div>
          <div class="col">
            <label data-i18n="mcpTimeout">超時時間毫秒 (Timeout)</label>
            <input type="number" id="mcp-timeout" placeholder="60000">
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label data-i18n="mcpCommand">執行指令 (Command)</label>
          <input type="text" id="mcp-command" placeholder="C:\Users\馮\bin\docgraph.exe 或 npx">
        </div>

        <div style="margin-bottom: 12px;">
          <label data-i18n="mcpArgs">指令參數 (Arguments，以空格分開或 JSON 陣列)</label>
          <input type="text" id="mcp-args" placeholder='serve --path "..."'>
        </div>
      </div>
    </div>

    <!-- 4. Tools -->
    <div id="tools" class="tab-pane">
      <div class="card" id="card-trim-tools">
        <div class="card-title">
          <span data-i18n="trimToolsDesc">工具描述自訂 (plugin/trim-tools.js)</span>
          <button class="btn btn-primary" onclick="saveTools()">💾 儲存 Tools 描述</button>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
          自訂各工具提供給 LLM 的 System Description，有助於降低 Token 消耗並精準指引模型行為。
        </p>
        <div id="tools-container"></div>
      </div>

      <div class="card">
        <div class="card-title">
          <span data-i18n="permGuard">危險指令權限守護 (permission.bash in opencode.jsonc)</span>
          <button class="btn btn-primary" onclick="savePermissions()">💾 儲存權限設定</button>
        </div>
        <div class="row">
          <div class="col">
            <label data-i18n="denyList">Deny 清單 (直接拒絕執行的指令模式，每行一個)</label>
            <textarea id="perm-deny" style="height: 120px;"></textarea>
          </div>
          <div class="col">
            <label data-i18n="askList">Ask 清單 (必須向使用者確認的指令模式，每行一個)</label>
            <textarea id="perm-ask" style="height: 120px;"></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. Raw JSONC -->
    <div id="raw-json" class="tab-pane">
      <div class="card">
        <div class="card-title">
          <span data-i18n="rawJsonTitle">opencode.jsonc 即時內容</span>
          <div>
            <button class="btn btn-primary" onclick="saveRawJsonc()">💾 儲存 opencode.jsonc（自動備份）</button>
          </div>
        </div>
        <textarea id="raw-jsonc-content" style="height: 500px;"></textarea>
      </div>
    </div>
  </main>

  <!-- Full Conversation Detail Modal -->
  <div class="modal-overlay" id="detail-modal" onclick="closeDetail(event)">
    <div class="modal-box" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div>
          <h3 id="modal-title" style="font-size: 14px; font-weight: 600; color: #fff;">對話內容記錄</h3>
          <span id="modal-meta" style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);"></span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="modal-search" placeholder="搜尋對話關鍵字..." style="width: 200px; font-size: 12px;" oninput="filterModalContent()">
          <button class="btn btn-sm" style="border-color: #f59e0b; color: #fbbf24;" onclick="openCleanModalFromDetail()">🧹 瘦身清理此對話</button>
          <button class="btn btn-sm" onclick="closeDetailModal()">✕ 關閉</button>
        </div>
      </div>
      <div class="modal-body" id="modal-content"></div>
    </div>
  </div>

  <!-- Manage Nodes Modal -->
  <div class="modal-overlay" id="node-modal" onclick="closeNodeModal(event)">
    <div class="node-modal-box" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h3 style="font-size: 14px; font-weight: 600; color: #fff;">⚙️ 主機節點管理 (Node Management)</h3>
        <button class="btn btn-sm" onclick="closeNodeModalDirect()" data-i18n="closeBtn">✕ 關閉</button>
      </div>
      <div class="modal-body">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <span style="font-size: 12px; color: var(--text-muted);"><span data-i18n="nodeModalDesc">配置 OpenCode 連線節點（支援本機、遠端 SSH、Jump SSH）</span></span>
          <button class="btn btn-sm btn-primary" onclick="initNewNodeForm()">➕ 新增主機節點</button>
        </div>

        <div id="node-card-list" style="margin-bottom: 20px;"></div>

        <!-- Node Edit Form -->
        <div class="card" id="node-edit-card" style="display: none; background: #090a0d;">
          <div class="card-title">
            <span id="node-form-title">編輯主機</span>
            <button class="btn btn-sm btn-primary" onclick="saveNodeConfig()">💾 儲存主機</button>
          </div>
          <div class="row">
            <div class="col">
              <label data-i18n="nodeId">節點 ID (如 remote67)</label>
              <input type="text" id="edit-node-id" placeholder="remote67">
            </div>
            <div class="col">
              <label data-i18n="nodeName">顯示名稱 (Name)</label>
              <input type="text" id="edit-node-name" placeholder="🐧 Nobara (.67)">
            </div>
            <div class="col">
              <label data-i18n="nodeType">連線類型 (Type)</label>
              <select id="edit-node-type">
                <option value="ssh">ssh (Paramiko 直連)</option>
                <option value="local">local (本機)</option>
                <option value="jump">jump (跳板 Jump SSH)</option>
              </select>
            </div>
          </div>

          <div class="row">
            <div class="col">
              <label data-i18n="nodeIp">IP 位址 / 主機名</label>
              <input type="text" id="edit-node-ip" placeholder="192.168.68.67">
            </div>
            <div class="col">
              <label data-i18n="nodeUser">SSH 登入帳號 (User)</label>
              <input type="text" id="edit-node-user" placeholder="nobara-user">
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <label data-i18n="nodeConfigDir">OpenCode 配置目錄路徑 (Config Directory)</label>
            <input type="text" id="edit-node-config" placeholder="/home/nobara-user/.config/opencode">
          </div>

          <div>
            <label data-i18n="nodeDbPath">OpenCode SQLite 資料庫路徑 (DB Path)</label>
            <input type="text" id="edit-node-db" placeholder="/home/nobara-user/.local/share/opencode/opencode.db">
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Clean Session Modal -->
  <div class="modal-overlay" id="clean-modal" onclick="closeCleanModalOverlay(event)">
    <div class="node-modal-box" style="max-width: 560px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h3 style="font-size: 14px; font-weight: 600; color: #fbbf24;">🧹 對話瘦身與冗餘清理 (Prune & Clean)</h3>
        <button class="btn btn-sm" onclick="closeCleanModal()">✕ 關閉</button>
      </div>
      <div class="modal-body">
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 14px;">
          目標對話：<span id="clean-session-title" style="color: #fff; font-weight: 600;"></span>
          <div id="clean-session-id" style="font-size: 11px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;"></div>
        </div>

        <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-weight: 600; font-size: 13px; color: #f8fafc; text-transform: none;">選擇要清理的項目：</div>
            <button class="btn btn-sm" style="font-size: 11px; padding: 3px 8px; border-color: #38bdf8; color: #38bdf8;" onclick="applyCleanDefaults()">✨ 套用推薦預設</button>
          </div>
          
          <label style="display: flex; align-items: flex-start; padding: 10px 14px; margin-bottom: 8px; background: #0c0e14; border: 1px solid #1e293b; border-radius: 6px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="clean-opt-errors" onchange="saveCleanPreferences()" style="width: 18px !important; min-width: 18px !important; max-width: 18px !important; height: 18px !important; margin: 2px 14px 0 0 !important; flex: 0 0 18px !important; accent-color: #f59e0b; cursor: pointer;">
            <div style="flex: 1; text-transform: none;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #f87171; margin-bottom: 3px;">
                <span data-i18n="optErrors">🚫 工具失敗與外掛攔截 (Errors & Blocked)</span>
                <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; background: rgba(56,189,248,0.2); color: #38bdf8;">推薦</span>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.45;"><span data-i18n="optErrorsDesc">清理指令異常 (Non-0 Exit)、外掛防護攔截 (Plugin Rejections)、找不到檔案與中途卡死 (Running) 等失敗記錄。</span></div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; padding: 10px 14px; margin-bottom: 8px; background: #0c0e14; border: 1px solid #1e293b; border-radius: 6px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="clean-opt-reasoning" onchange="saveCleanPreferences()" style="width: 18px !important; min-width: 18px !important; max-width: 18px !important; height: 18px !important; margin: 2px 14px 0 0 !important; flex: 0 0 18px !important; accent-color: #f59e0b; cursor: pointer;">
            <div style="flex: 1; text-transform: none;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #c084fc; margin-bottom: 3px;">
                <span data-i18n="optReasoning">🧠 AI 思考歷程 (Reasoning / CoT)</span>
                <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; background: rgba(192,132,252,0.2); color: #c084fc;"><span data-i18n="badgeReasoning">強力推薦</span> (佔44MB)</span>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.45;"><span data-i18n="optReasoningDesc">清除模型的大段思維鏈 (&lt;think&gt;)。保留所有問答與代碼成果，大幅節省 40%~60% 空間！</span></div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; padding: 10px 14px; margin-bottom: 8px; background: #0c0e14; border: 1px solid #1e293b; border-radius: 6px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="clean-opt-outputs" onchange="saveCleanPreferences()" style="width: 18px !important; min-width: 18px !important; max-width: 18px !important; height: 18px !important; margin: 2px 14px 0 0 !important; flex: 0 0 18px !important; accent-color: #f59e0b; cursor: pointer;">
            <div style="flex: 1; text-transform: none;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #38bdf8; margin-bottom: 3px;">
                <span data-i18n="optLargeOutput">📜 超長工具輸出瘦身 (Truncate Large Outputs)</span>
                <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; background: rgba(56,189,248,0.2); color: #38bdf8;"><span data-i18n="badgeLargeOutput">推薦 (含Metadata)</span></span>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.45;"><span data-i18n="optLargeOutputDesc">保留工具指令名稱與狀態，但將超過 1,500 字元的超長日誌/檔案 dump 截斷並保留摘要。</span></div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; padding: 10px 14px; margin-bottom: 8px; background: #0c0e14; border: 1px solid #1e293b; border-radius: 6px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="clean-opt-files" onchange="saveCleanPreferences()" style="width: 18px !important; min-width: 18px !important; max-width: 18px !important; height: 18px !important; margin: 2px 14px 0 0 !important; flex: 0 0 18px !important; accent-color: #f59e0b; cursor: pointer;">
            <div style="flex: 1; text-transform: none;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #fbbf24; margin-bottom: 3px;">
                <span data-i18n="optSnapshots">📁 暫存大型檔案快照 (File Snapshots)</span>
                <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; background: rgba(251,191,36,0.2); color: #fbbf24;">推薦 (佔16MB)</span>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.45;"><span data-i18n="optSnapshotsDesc">清除附掛在對話中的全量暫存檔案副本（單筆可達數 MB）。</span></div>
            </div>
          </label>

          <label style="display: flex; align-items: flex-start; padding: 10px 14px; margin-bottom: 0; background: #0c0e14; border: 1px solid #1e293b; border-radius: 6px; cursor: pointer; text-transform: none;">
            <input type="checkbox" id="clean-opt-steps" onchange="saveCleanPreferences()" style="width: 18px !important; min-width: 18px !important; max-width: 18px !important; height: 18px !important; margin: 2px 14px 0 0 !important; flex: 0 0 18px !important; accent-color: #f59e0b; cursor: pointer;">
            <div style="flex: 1; text-transform: none;">
              <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #94a3b8; margin-bottom: 3px;">
                <span data-i18n="optStepMarkers">🏷️ 步驟空標記 (Step-Start / Step-Finish)</span>
                <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 500; background: rgba(148,163,184,0.2); color: #94a3b8;">推薦 (佔6萬筆)</span>
              </div>
              <div style="font-size: 11.5px; color: #94a3b8; line-height: 1.45;"><span data-i18n="optStepMarkersDesc">清除純 UI 步驟分隔符號，減少幾千筆無意義的資料庫 row。</span></div>
            </div>
          </label>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-muted); cursor: pointer; text-transform: none; margin-bottom: 0;">
            <input type="checkbox" id="clean-opt-vacuum" onchange="saveCleanPreferences()"> <span data-i18n="optVacuum">清理後自動壓縮資料庫 (VACUUM)</span>
          </label>
          <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="closeCleanModal()">取消</button>
            <button class="btn" style="background: linear-gradient(135deg, #d97706, #b45309); color: #fff; border: none; font-weight: 600;" onclick="executeCleanSession()" data-i18n="execCleanBtn">⚡ 立即執行瘦身</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    // Injected i18n Dictionary
    const I18N = ${JSON.stringify(I18N)};

    // Detect Language: 1. localStorage, 2. navigator.language (OS / Browser), 3. serverDetectedLocale, 4. 'zh-TW'
    function detectInitialLang() {
      const saved = localStorage.getItem('opencode_manager_lang');
      if (saved && I18N[saved]) return saved;

      const navLangs = navigator.languages || [navigator.language || navigator.userLanguage || ''];
      for (const nl of navLangs) {
        if (!nl) continue;
        const lower = nl.toLowerCase();
        if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.startsWith('zh-mo') || lower === 'zh-hant') return 'zh-TW';
        if (lower.startsWith('zh')) return 'zh-CN';
        if (lower.startsWith('ja')) return 'ja-JP';
        if (lower.startsWith('en')) return 'en-US';
      }

      const srv = "${serverDetectedLocale}".toLowerCase();
      if (srv.startsWith('zh-tw') || srv.startsWith('zh-hk') || srv.startsWith('zh-mo')) return 'zh-TW';
      if (srv.startsWith('zh')) return 'zh-CN';
      if (srv.startsWith('ja')) return 'ja-JP';
      if (srv.startsWith('en')) return 'en-US';

      return 'zh-TW';
    }

    let currentLang = detectInitialLang();

    function t(key, params = {}) {
      const dict = I18N[currentLang] || I18N['zh-TW'];
      let str = dict[key] !== undefined ? dict[key] : (I18N['zh-TW'][key] || key);
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
      }
      return str;
    }

    function applyDomI18n() {
      // 1. Update document title
      document.title = t('appName');

      // 2. Update language selector value
      const lSel = document.getElementById('lang-selector');
      if (lSel) lSel.value = currentLang;

      // 3. Update all elements with data-i18n
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        if (k && I18N[currentLang] && I18N[currentLang][k] !== undefined) {
          el.innerText = t(k);
        }
      });
    }

    function changeLanguage(lang) {
      if (!I18N[lang]) return;
      currentLang = lang;
      localStorage.setItem('opencode_manager_lang', lang);
      applyDomI18n();
      loadSessions(); // re-render table with new language headers/badges
    }

    let nodeList = [];
    let currentNode = 'local';
    let state = {};
    let currentAgentId = null;
    let currentMcpId = null;
    let currentSessionData = null;

    function formatBytes(bytes) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatTime(ts) {
      if (!ts) return '-';
      const d = new Date(ts);
      return d.getFullYear() + '/' + 
        String(d.getMonth() + 1).padStart(2, '0') + '/' + 
        String(d.getDate()).padStart(2, '0') + ' ' + 
        String(d.getHours()).padStart(2, '0') + ':' + 
        String(d.getMinutes()).padStart(2, '0');
    }

    function showLoading(show) {
      document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2500);
    }

    function switchTab(id) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(id).classList.add('active');

      if (id === 'sessions') {
        loadSessionStats();
        loadSessions();
      }
    }

    // Dynamic Node Switcher
    async function loadNodeList() {
      const res = await fetch('/api/nodes');
      nodeList = await res.json();
      const sel = document.getElementById('node-selector');
      sel.innerHTML = '';
      nodeList.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n.id;
        opt.innerText = n.name;
        sel.appendChild(opt);
      });
      if (nodeList.find(n => n.id === currentNode)) {
        sel.value = currentNode;
      } else if (nodeList.length > 0) {
        currentNode = nodeList[0].id;
        sel.value = currentNode;
      }
      updateNodeBadge();
    }

    function updateNodeBadge() {
      const n = nodeList.find(x => x.id === currentNode);
      if (n) {
        document.getElementById('host-badge').innerText = n.ip + (n.type !== 'local' ? ' (' + (n.user || 'ssh') + ')' : ' (Local)');
      }
    }

    function switchNode(nodeId) {
      currentNode = nodeId;
      updateNodeBadge();

      const n = nodeList.find(x => x.id === nodeId);
      const isLocal = n && n.type === 'local';

      document.getElementById('card-ssh-prompt').style.display = isLocal ? 'none' : 'block';
      document.getElementById('card-trim-tools').style.display = isLocal ? 'block' : 'none';

      currentAgentId = null;
      currentMcpId = null;
      document.getElementById('agent-editor').style.display = 'none';
      document.getElementById('mcp-editor').style.display = 'none';

      reloadAll();
      loadSessionStats();
      loadSessions();
      testNodeHealth(nodeId);
    }

    async function testNodeHealth(nodeId) {
      const dot = document.getElementById('node-status-dot');
      try {
        const res = await fetch('/api/test-node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: nodeId })
        });
        const r = await res.json();
        if (r.ok) {
          dot.className = 'status-dot';
        } else {
          dot.className = 'status-dot offline';
        }
      } catch {
        dot.className = 'status-dot offline';
      }
    }

    // Manage Nodes Modal
    function openNodeManagerModal() {
      renderNodeManagerCards();
      document.getElementById('node-modal').style.display = 'flex';
      document.getElementById('node-edit-card').style.display = 'none';
    }

    function closeNodeModalDirect() {
      document.getElementById('node-modal').style.display = 'none';
    }

    function closeNodeModal(e) {
      if (e.target.id === 'node-modal') {
        closeNodeModalDirect();
      }
    }

    function renderNodeManagerCards() {
      const list = document.getElementById('node-card-list');
      list.innerHTML = '';
      nodeList.forEach(n => {
        const div = document.createElement('div');
        div.style.cssText = 'background: #090a0d; border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;';
        div.innerHTML = \`
          <div>
            <div style="font-weight: 600; color: #fff; font-size: 13.5px;">\${n.name} <span class="badge" style="font-size: 10px;">\${n.type}</span></div>
            <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">
              IP: \${n.ip} | User: \${n.user || '-'} | Path: \${n.configDir}
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="editNodeForm('\${n.id}')">✏️ 編輯</button>
            \${n.id !== 'local' ? '<button class="btn btn-sm btn-danger" onclick="deleteNodeConfig(\\'' + n.id + '\\')">🗑️</button>' : ''}
          </div>
        \`;
        list.appendChild(div);
      });
    }

    function initNewNodeForm() {
      document.getElementById('node-edit-card').style.display = 'block';
      document.getElementById('node-form-title').innerText = '新增主機節點';
      document.getElementById('edit-node-id').value = '';
      document.getElementById('edit-node-id').disabled = false;
      document.getElementById('edit-node-name').value = '';
      document.getElementById('edit-node-type').value = 'ssh';
      document.getElementById('edit-node-ip').value = '';
      document.getElementById('edit-node-user').value = 'dardeaw';
      document.getElementById('edit-node-config').value = '/home/dardeaw/.config/opencode';
      document.getElementById('edit-node-db').value = '/home/dardeaw/.local/share/opencode/opencode.db';
    }

    function editNodeForm(id) {
      const n = nodeList.find(x => x.id === id);
      if (!n) return;
      document.getElementById('node-edit-card').style.display = 'block';
      document.getElementById('node-form-title').innerText = '編輯主機：' + n.name;
      document.getElementById('edit-node-id').value = n.id;
      document.getElementById('edit-node-id').disabled = (n.id === 'local');
      document.getElementById('edit-node-name').value = n.name;
      document.getElementById('edit-node-type').value = n.type;
      document.getElementById('edit-node-ip').value = n.ip;
      document.getElementById('edit-node-user').value = n.user || '';
      document.getElementById('edit-node-config').value = n.configDir;
      document.getElementById('edit-node-db').value = n.dbPath || '';
    }

    async function saveNodeConfig() {
      const id = document.getElementById('edit-node-id').value.trim();
      if (!id) return alert(t('enterNodeId'));
      const payload = {
        id,
        name: document.getElementById('edit-node-name').value.trim() || id,
        type: document.getElementById('edit-node-type').value,
        ip: document.getElementById('edit-node-ip').value.trim(),
        user: document.getElementById('edit-node-user').value.trim(),
        configDir: document.getElementById('edit-node-config').value.trim(),
        dbPath: document.getElementById('edit-node-db').value.trim()
      };
      await fetch('/api/save-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(t('nodeSaved'));
      await loadNodeList();
      renderNodeManagerCards();
      document.getElementById('node-edit-card').style.display = 'none';
    }

    async function deleteNodeConfig(id) {
      if (!confirm(t('confirmDeleteNode') + id + '?')) return;
      await fetch('/api/delete-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      showToast(t('nodeDeleted'));
      await loadNodeList();
      renderNodeManagerCards();
    }

    // Sessions Logic
    async function loadSessionStats() {
      try {
        const res = await fetch('/api/session-stats?node=' + currentNode);
        const stats = await res.json();
        if (stats.error) {
          document.getElementById('stat-db-size').innerText = '未找到 DB';
          return;
        }

        document.getElementById('stat-db-size').innerText = formatBytes(stats.size_bytes);
        document.getElementById('stat-wal-size').innerText = formatBytes(stats.wal_bytes);
        document.getElementById('stat-sessions').innerText = (stats.session_count || 0).toLocaleString();
        document.getElementById('stat-messages').innerText = (stats.message_count || 0).toLocaleString();
        document.getElementById('stat-parts').innerText = (stats.part_count || 0).toLocaleString();

        const sel = document.getElementById('session-workspace-filter');
        const currVal = sel.value;
        sel.innerHTML = '<option value="all">全部工作區 (All Workspaces)</option>';
        (stats.workspaces || []).forEach(w => {
          const opt = document.createElement('option');
          opt.value = w.directory;
          opt.innerText = w.directory + ' (' + w.count + ')';
          sel.appendChild(opt);
        });
        if (currVal) sel.value = currVal;
      } catch (err) {
        console.error('Failed to load session stats:', err);
      }
    }

    let currentSessionViewMode = 'tree';
    let expandedTreeNodes = new Set();

    function switchSessionViewMode(mode) {
      currentSessionViewMode = mode;
      const btnTree = document.getElementById('btn-view-tree');
      const btnFlat = document.getElementById('btn-view-flat');
      if (btnTree && btnFlat) {
        btnTree.style.background = mode === 'tree' ? 'rgba(56,189,248,0.2)' : 'transparent';
        btnTree.style.color = mode === 'tree' ? '#38bdf8' : 'var(--text-muted)';
        btnTree.style.fontWeight = mode === 'tree' ? '600' : 'normal';

        btnFlat.style.background = mode === 'flat' ? 'rgba(56,189,248,0.2)' : 'transparent';
        btnFlat.style.color = mode === 'flat' ? '#38bdf8' : 'var(--text-muted)';
        btnFlat.style.fontWeight = mode === 'flat' ? '600' : 'normal';
      }
      loadSessions();
    }

    function toggleSubagentTree(parentId) {
      const isExpanded = !expandedTreeNodes.has(parentId);
      if (isExpanded) {
        expandedTreeNodes.add(parentId);
      } else {
        expandedTreeNodes.delete(parentId);
      }

      // Instant local DOM toggle: zero network call, zero scroll jump!
      const childRows = document.querySelectorAll('.subagent-of-' + parentId);
      childRows.forEach(row => {
        row.style.display = isExpanded ? '' : 'none';
      });

      const caret = document.getElementById('caret-' + parentId);
      if (caret) {
        caret.innerText = isExpanded ? '▼' : '▶';
        caret.title = isExpanded ? '收合子任務' : '展開子任務';
      }
    }

    function escapeAttr(str) {
      return (str || '').replace(/'/g, "\\\\'").replace(/"/g, '&quot;');
    }

    async function loadSessions() {
      const ws = document.getElementById('session-workspace-filter').value;
      const tbody = document.getElementById('session-tbody');
      const prevScrollY = window.scrollY;

      try {
        const res = await fetch('/api/sessions?node=' + currentNode + '&workspace=' + encodeURIComponent(ws));
        const list = await res.json();

        if (!list || list.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">查無對話記錄</td></tr>';
          return;
        }

        tbody.innerHTML = '';

        if (currentSessionViewMode === 'flat') {
          list.forEach(s => appendSessionRow(tbody, s, false));
          window.scrollTo(0, prevScrollY);
          return;
        }

        // Tree Mode
        const sessionMap = new Map();
        list.forEach(s => {
          s.children = [];
          sessionMap.set(s.id, s);
        });

        const rootList = [];
        list.forEach(s => {
          if (s.parent_id && sessionMap.has(s.parent_id)) {
            sessionMap.get(s.parent_id).children.push(s);
          } else {
            rootList.push(s);
          }
        });

        rootList.forEach(s => {
          const hasChildren = s.children && s.children.length > 0;
          const isExpanded = expandedTreeNodes.has(s.id);
          appendSessionRow(tbody, s, false, hasChildren, isExpanded);

          if (hasChildren) {
            s.children.forEach(child => {
              appendSessionRow(tbody, child, true, false, isExpanded);
            });
          }
        });

        // Restore scroll position so user never jumps
        window.scrollTo(0, prevScrollY);
      } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--danger);">載入失敗: ' + err.message + '</td></tr>';
      }
    }

    function appendSessionRow(tbody, s, isChild = false, hasChildren = false, isExpanded = false) {
      const tr = document.createElement('tr');
      const totalTokens = ((s.tokens_input || 0) + (s.tokens_output || 0)).toLocaleString();

      if (isChild) {
        tr.className = 'subagent-row subagent-of-' + s.parent_id;
        tr.style.display = isExpanded ? '' : 'none';
        tr.style.background = 'rgba(15, 23, 42, 0.45)';
        tr.style.borderLeft = '3px solid #8b5cf6';
      }

      let titleHtml = '';
      if (isChild) {
        titleHtml = \`
          <div style="display: flex; align-items: center; padding-left: 28px;">
            <span style="color: #8b5cf6; font-family: var(--font-mono); font-weight: bold; margin-right: 8px;">└── 🤖</span>
            <span style="font-weight: 500; color: #cbd5e1; cursor: pointer; font-size: 13px;" onclick="openDetail('\${s.id}')">\${escapeHtml(s.title)}</span>
            <span style="font-size: 9.5px; color: #a78bfa; background: rgba(167,139,250,0.15); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(167,139,250,0.3); margin-left: 8px;">Subagent</span>
          </div>
          <div style="padding-left: 56px; font-size: 10px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;">\${s.id}</div>
        \`;
      } else {
        const caret = hasChildren
          ? \`<span id="caret-\${s.id}" onclick="toggleSubagentTree('\${s.id}')" style="cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; color: #38bdf8; background: rgba(56,189,248,0.15); font-size: 10px; margin-right: 8px; flex-shrink: 0;" title="\${isExpanded ? '收合子任務' : '展開子任務'}">\${isExpanded ? '▼' : '▶'}</span>\`
          : '<span style="display: inline-block; width: 20px; margin-right: 8px; flex-shrink: 0;"></span>';

        const subagentTag = hasChildren
          ? \`<span onclick="toggleSubagentTree('\${s.id}')" style="cursor: pointer; margin-left: 10px; font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(56,189,248,0.12); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); font-weight: 500;" title="點擊展開/收合子任務">🤖 \${s.children.length} Subagents ▾</span>\`
          : '';

        titleHtml = \`
          <div style="display: flex; align-items: center;">
            \${caret}
            <span style="font-weight: 600; color: #fff; cursor: pointer; font-size: 13.5px;" onclick="openDetail('\${s.id}')">\${escapeHtml(s.title)}</span>
            \${subagentTag}
          </div>
          <div style="padding-left: 28px; font-size: 10.5px; color: #64748b; font-family: var(--font-mono); margin-top: 2px;">\${s.id}</div>
        \`;
      }

      let sizeHtml = '';
      if (hasChildren) {
        let totalTreeBytes = s.size_bytes || 0;
        s.children.forEach(c => { totalTreeBytes += (c.size_bytes || 0); });
        sizeHtml = \`
          <div style="font-weight: 600; color: #f59e0b; font-size: 12px;">\${formatBytes(s.size_bytes)}</div>
          <div style="font-size: 10px; color: #94a3b8;" title="含全部 Subagents 總計">含子任務: \${formatBytes(totalTreeBytes)}</div>
        \`;
      } else if (isChild) {
        sizeHtml = \`<span style="color: #cbd5e1; font-size: 11.5px;">\${formatBytes(s.size_bytes)}</span>\`;
      } else {
        sizeHtml = \`<span style="font-weight: 600; color: #f59e0b; font-size: 12px;">\${formatBytes(s.size_bytes)}</span>\`;
      }

      tr.innerHTML = \`
        <td>\${titleHtml}</td>
        <td style="color: #94a3b8; font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          \${escapeHtml(s.directory || '-')}
        </td>
        <td><span class="badge" style="color: \${isChild ? '#a78bfa' : '#38bdf8'};">\${escapeHtml(s.model || '預設')}</span></td>
        <td style="color: var(--text-muted); font-size: 11.5px;">\${formatTime(s.time_updated)}</td>
        <td>\${sizeHtml}</td>
        <td style="font-size: 11.5px;">
          <span style="color: var(--accent);" title="對話訊息則數">\${s.message_count} 則</span> / 
          <span style="color: var(--text-muted);" title="部件總數">\${s.part_count} parts</span>
        </td>
        <td style="font-size: 11.5px; color: var(--purple);">\${totalTokens}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-sm" onclick="openDetail('\${s.id}')">📖 檢視</button>
          <button class="btn btn-sm" style="border-color: #f59e0b; color: #fbbf24;" onclick="openCleanModal('\${s.id}', '\${escapeAttr(s.title)}')">🧹 瘦身</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSession('\${s.id}', '\${escapeAttr(s.title)}', \${hasChildren ? s.children.length : 0})">🗑️ 刪除</button>
        </td>
      \`;
      tbody.appendChild(tr);
    }

    async function deleteSession(id, title, childrenCount = 0) {
      let confirmMsg = t('confirmDeleteSession', { title, id });
      if (childrenCount > 0) {
        confirmMsg += t('warnSubagentsExist', { count: childrenCount });
      }
      if (!confirm(confirmMsg)) return;
      showLoading(true);
      try {
        await fetch('/api/delete-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node: currentNode, id })
        });
        showToast(t('sessionDeleted'));
        await loadSessionStats();
        await loadSessions();
      } catch (err) {
        alert('刪除失敗: ' + err.message);
      } finally {
        showLoading(false);
      }
    }

    async function runVacuum() {
      if (!confirm(t('confirmVacuum'))) return;
      showLoading(true);
      try {
        await fetch('/api/vacuum-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ node: currentNode })
        });
        showToast(t('vacuumDone'));
        await loadSessionStats();
      } catch (err) {
        alert('VACUUM 失敗: ' + err.message);
      } finally {
        showLoading(false);
      }
    }

    let cleanTargetId = null;

    const DEFAULT_CLEAN_PREFS = {
      errors: true,
      reasoning: true,
      outputs: true,
      files: true,
      steps: true,
      vacuum: false
    };

    function loadCleanPreferences() {
      try {
        const saved = localStorage.getItem('opencode_clean_prefs');
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...DEFAULT_CLEAN_PREFS, ...parsed };
        }
      } catch {}
      return { ...DEFAULT_CLEAN_PREFS };
    }

    function saveCleanPreferences() {
      const prefs = {
        errors: document.getElementById('clean-opt-errors').checked,
        reasoning: document.getElementById('clean-opt-reasoning').checked,
        outputs: document.getElementById('clean-opt-outputs').checked,
        files: document.getElementById('clean-opt-files').checked,
        steps: document.getElementById('clean-opt-steps').checked,
        vacuum: document.getElementById('clean-opt-vacuum').checked
      };
      try {
        localStorage.setItem('opencode_clean_prefs', JSON.stringify(prefs));
      } catch {}
    }

    function setCleanCheckboxes(prefs) {
      document.getElementById('clean-opt-errors').checked = !!prefs.errors;
      document.getElementById('clean-opt-reasoning').checked = !!prefs.reasoning;
      document.getElementById('clean-opt-outputs').checked = !!prefs.outputs;
      document.getElementById('clean-opt-files').checked = !!prefs.files;
      document.getElementById('clean-opt-steps').checked = !!prefs.steps;
      document.getElementById('clean-opt-vacuum').checked = !!prefs.vacuum;
    }

    function applyCleanDefaults() {
      setCleanCheckboxes(DEFAULT_CLEAN_PREFS);
      saveCleanPreferences();
      showToast(t('presetApplied'));
    }

    function openCleanModal(id, title) {
      cleanTargetId = id;
      document.getElementById('clean-session-title').innerText = title;
      document.getElementById('clean-session-id').innerText = 'ID: ' + id;
      setCleanCheckboxes(loadCleanPreferences());
      document.getElementById('clean-modal').style.display = 'flex';
    }

    function openCleanModalFromDetail() {
      if (currentSessionData && currentSessionData.session) {
        openCleanModal(currentSessionData.session.id, currentSessionData.session.title);
      }
    }

    function closeCleanModal() {
      document.getElementById('clean-modal').style.display = 'none';
      cleanTargetId = null;
    }

    function closeCleanModalOverlay(e) {
      if (e.target.id === 'clean-modal') closeCleanModal();
    }

    async function executeCleanSession() {
      if (!cleanTargetId) return;
      const opts = [];
      if (document.getElementById('clean-opt-errors').checked) opts.push('errors');
      if (document.getElementById('clean-opt-reasoning').checked) opts.push('reasoning');
      if (document.getElementById('clean-opt-outputs').checked) opts.push('outputs');
      if (document.getElementById('clean-opt-files').checked) opts.push('files');
      if (document.getElementById('clean-opt-steps').checked) opts.push('steps');

      if (opts.length === 0) {
        return alert(t('cleanSelectWarning'));
      }

      const doVacuum = document.getElementById('clean-opt-vacuum').checked;
      showLoading(true);
      try {
        const res = await fetch('/api/clean-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node: currentNode,
            id: cleanTargetId,
            options: opts.join(',')
          })
        });
        const resData = await res.json();
        if (resData.error) throw new Error(resData.error);

        if (doVacuum) {
          await fetch('/api/vacuum-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node: currentNode })
          });
        }

        const st = resData.stats || {};
        const savedMB = ((st.saved_bytes || 0) / (1024 * 1024)).toFixed(2);
        closeCleanModal();

        if (currentSessionData && currentSessionData.session && currentSessionData.session.id === cleanTargetId) {
          await openDetail(cleanTargetId);
        }

        await loadSessionStats();
        await loadSessions();

        let report = '';
        if (resData.total_cleaned > 0) {
          report = t('cleanSuccessTitle') +
            t('cleanSummaryLargeOutput', { count: st.truncated_outputs || 0 }) +
            t('cleanSummaryErrors', { count: st.deleted_errors || 0 }) +
            t('cleanSummaryReasoning', { count: st.deleted_reasoning || 0 }) +
            t('cleanSummarySnapshots', { count: st.deleted_files || 0 }) +
            t('cleanSummarySteps', { count: st.deleted_steps || 0 }) +
            t('cleanSummarySaved', { saved: savedMB + ' MB' }) + '\\n' +
            t('cleanSummaryTips');
        } else {
          report = t('cleanHealthyTitle') +
            t('cleanSummaryHeader') +
            t('cleanSummaryMsgParts') +
            t('cleanSummaryNotice');
        }
        alert(report);
      } catch (err) {
        alert('瘦身執行失敗: ' + err.message);
      } finally {
        showLoading(false);
      }
    }

    async function openDetail(id) {
      showLoading(true);
      try {
        const res = await fetch('/api/session-detail?node=' + currentNode + '&id=' + id);
        currentSessionData = await res.json();
        if (currentSessionData.error) {
          return alert('讀取對話失敗: ' + currentSessionData.error);
        }

        const s = currentSessionData.session;
        document.getElementById('modal-title').innerText = s.title;
        document.getElementById('modal-meta').innerText = 'ID: ' + s.id + ' | Workspace: ' + (s.directory || '無') + ' | ' + formatTime(s.time_created);
        document.getElementById('modal-search').value = '';

        renderModalMessages(currentSessionData.messages);
        document.getElementById('detail-modal').style.display = 'flex';
      } catch (err) {
        alert(t('loading') + ': ' + err.message);
      } finally {
        showLoading(false);
      }
    }

    function renderModalMessages(messages) {
      const container = document.getElementById('modal-content');
      container.innerHTML = '';

      if (!messages || messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">無對話訊息</div>';
        return;
      }

      messages.forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';

        const role = m.role || 'user';
        const roleLabel = role === 'user' ? '👤 USER' : '🤖 ASSISTANT';
        const modelLabel = m.model && (m.model.modelID || m.model.id) ? (' [' + (m.model.modelID || m.model.id) + ']') : '';

        let partsHtml = '';
        (m.parts || []).forEach(p => {
          const d = p.data || {};
          if (d.type === 'text') {
            partsHtml += '<div class="msg-content">' + escapeHtml(d.text || '') + '</div>';
          } else if (d.type === 'reasoning') {
            partsHtml += '<div class="part-box part-reasoning"><strong>🧠 思考歷程 (Reasoning):</strong><br>' + escapeHtml(d.text || '') + '</div>';
          } else if (d.type === 'tool') {
            const st = d.state || {};
            const inputStr = JSON.stringify(st.input || {}, null, 2);
            const isError = st.status === 'error' || !!st.error;
            let outputContent = '';
            if (st.error) {
              outputContent = typeof st.error === 'string' ? st.error : JSON.stringify(st.error, null, 2);
            } else if (st.output !== undefined && st.output !== null) {
              outputContent = typeof st.output === 'string' ? st.output : JSON.stringify(st.output, null, 2);
            } else {
              outputContent = '(無輸出內容)';
            }
            const statusBadge = isError 
              ? '<span style="color: var(--danger); font-weight: bold;">✕ 失敗 (error)</span>' 
              : '<span style="color: var(--primary);">✓ 成功 (done)</span>';

            partsHtml += '<div class="part-box part-tool' + (isError ? ' error' : '') + '">' +
              '<div style="display: flex; justify-content: space-between; align-items: center;">' +
              '<strong>🛠️ 工具呼叫: ' + escapeHtml(d.tool || '') + '</strong>' + statusBadge +
              '</div>' +
              '<details style="margin-top: 6px;"><summary style="cursor: pointer; color: var(--accent);">▶ 輸入參數</summary><pre style="margin-top: 4px; overflow-x: auto;">' + escapeHtml(inputStr) + '</pre></details>' +
              '<details style="margin-top: 6px;" open><summary style="cursor: pointer; color: ' + (isError ? 'var(--danger)' : 'var(--primary)') + ';">' + (isError ? '▼ 錯誤詳情' : '▼ 執行輸出') + '</summary><pre style="margin-top: 4px; overflow-x: auto; max-height: 250px; color: ' + (isError ? '#f87171' : 'inherit') + ';">' + escapeHtml(outputContent) + '</pre></details>' +
              '</div>';
          }
        });

        bubble.innerHTML = \`
          <div class="msg-header \${role}">
            <span>\${roleLabel}\${modelLabel}</span>
            <span style="color: #64748b;">\${formatTime(m.time_created)}</span>
          </div>
          \${partsHtml || '<div class="msg-content" style="color: var(--text-muted);">(無文字內容)</div>'}
        \`;
        container.appendChild(bubble);
      });
    }

    function filterModalContent() {
      const q = document.getElementById('modal-search').value.toLowerCase().trim();
      const bubbles = document.querySelectorAll('.msg-bubble');
      bubbles.forEach(b => {
        if (!q) {
          b.style.display = 'block';
        } else {
          b.style.display = b.innerText.toLowerCase().includes(q) ? 'block' : 'none';
        }
      });
    }

    function closeDetailModal() {
      document.getElementById('detail-modal').style.display = 'none';
    }

    function closeDetail(e) {
      if (e.target.id === 'detail-modal') {
        closeDetailModal();
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function reloadAll() {
      showLoading(true);
      try {
        const res = await fetch('/api/config?node=' + currentNode);
        state = await res.json();

        // System Prompts
        const sp = state.systemPrompts || {};
        document.getElementById('prompt-local').value = (sp.local && sp.local.content) || '';
        document.getElementById('prompt-global').value = (sp.global && sp.global.content) || '';
        if (sp.ssh) {
          document.getElementById('prompt-ssh').value = sp.ssh.content || '';
        }

        // Core Agents
        const cfg = state.config || {};
        const agentCfg = cfg.agent || {};
        const comp = agentCfg.compaction || {};
        document.getElementById('compaction-model').value = comp.model || '';
        document.getElementById('compaction-prompt').value = comp.prompt || '';
        document.getElementById('title-model').value = (agentCfg.title && agentCfg.title.model) || '';

        // Render Agents & MCP
        renderAgents();
        renderMcp();

        // Render Tools (local only)
        const isLocal = state.ip === '192.168.68.102';
        if (isLocal) {
          renderTools();
        }

        // Permissions
        const bashPerm = (cfg.permission && cfg.permission.bash) || {};
        const denyList = [];
        const askList = [];
        for (const [k, v] of Object.entries(bashPerm)) {
          if (v === 'deny') denyList.push(k);
          else if (v === 'ask') askList.push(k);
        }
        document.getElementById('perm-deny').value = denyList.join('\\n');
        document.getElementById('perm-ask').value = askList.join('\\n');

        // Raw JSONC
        document.getElementById('raw-jsonc-content').value = state.rawJsonc || '';

        showToast(state.name + ' 設定同步完成');
      } catch (err) {
        alert('載入失敗: ' + err.message);
      } finally {
        showLoading(false);
      }
    }

    function renderAgents() {
      const list = document.getElementById('agent-list');
      list.innerHTML = '';
      (state.agents || []).forEach(a => {
        const div = document.createElement('div');
        div.className = 'item-card' + (currentAgentId === a.id ? ' selected' : '');
        div.onclick = () => selectAgent(a.id);
        div.innerHTML = \`
          <div class="item-header">
            <span class="item-name">\${a.id}</span>
            <span class="badge">\${a.mode}</span>
          </div>
          <div class="item-desc">\${a.description || '(無簡介)'}</div>
          <div class="item-footer">
            <span>Model: \${a.model || '預設'}</span>
          </div>
        \`;
        list.appendChild(div);
      });
    }

    function selectAgent(id) {
      currentAgentId = id;
      renderAgents();
      const a = (state.agents || []).find(x => x.id === id);
      if (!a) return;
      document.getElementById('agent-editor').style.display = 'block';
      document.getElementById('agent-editor-title').innerText = '編輯角色：' + a.id;
      document.getElementById('agent-id').value = a.id;
      document.getElementById('agent-id').disabled = true;
      document.getElementById('agent-mode').value = a.mode || 'all';
      document.getElementById('agent-model').value = a.model || '';
      document.getElementById('agent-desc').value = a.description || '';
      document.getElementById('agent-prompt').value = a.prompt || '';
      document.getElementById('btn-delete-agent').style.display = 'inline-flex';

      // Load agent tool permissions
      const p = a.permissions || {};
      document.getElementById('agent-perm-edit').value = p.edit || 'inherit';
      document.getElementById('agent-perm-bash').value = p.bash || 'inherit';
      document.getElementById('agent-perm-read').value = p.read || 'inherit';
      document.getElementById('agent-perm-search').value = p.grep || p.glob || 'inherit';
      document.getElementById('agent-perm-task').value = p.task || 'inherit';
      document.getElementById('agent-perm-web').value = p.websearch || p.webfetch || 'inherit';
      document.getElementById('agent-perm-custom').value = (a.customRules || []).join('\\n');
    }

    function createNewAgent() {
      currentAgentId = null;
      renderAgents();
      document.getElementById('agent-editor').style.display = 'block';
      document.getElementById('agent-editor-title').innerText = t('addAgent');
      document.getElementById('agent-id').value = '';
      document.getElementById('agent-id').disabled = false;
      document.getElementById('agent-mode').value = 'all';
      document.getElementById('agent-model').value = '';
      document.getElementById('agent-desc').value = '';
      document.getElementById('agent-prompt').value = '';
      document.getElementById('btn-delete-agent').style.display = 'none';

      // Reset permissions to inherit
      document.getElementById('agent-perm-edit').value = 'inherit';
      document.getElementById('agent-perm-bash').value = 'inherit';
      document.getElementById('agent-perm-read').value = 'inherit';
      document.getElementById('agent-perm-search').value = 'inherit';
      document.getElementById('agent-perm-task').value = 'inherit';
      document.getElementById('agent-perm-web').value = 'inherit';
      document.getElementById('agent-perm-custom').value = '';
    }

    function applyAgentToolPreset(preset) {
      if (preset === 'readonly') {
        document.getElementById('agent-perm-edit').value = 'deny';
        document.getElementById('agent-perm-bash').value = 'deny';
        document.getElementById('agent-perm-read').value = 'allow';
        document.getElementById('agent-perm-search').value = 'allow';
        document.getElementById('agent-perm-task').value = 'allow';
        document.getElementById('agent-perm-web').value = 'allow';
        showToast(t('presetReadOnly'));
      } else if (preset === 'fulldev') {
        document.getElementById('agent-perm-edit').value = 'allow';
        document.getElementById('agent-perm-bash').value = 'allow';
        document.getElementById('agent-perm-read').value = 'allow';
        document.getElementById('agent-perm-search').value = 'allow';
        document.getElementById('agent-perm-task').value = 'allow';
        document.getElementById('agent-perm-web').value = 'allow';
        showToast(t('presetFullDev'));
      }
    }

    async function saveCurrentAgent() {
      const id = document.getElementById('agent-id').value.trim();
      if (!id) return alert(t('enterAgentId'));
      showLoading(true);

      const perms = {
        edit: document.getElementById('agent-perm-edit').value,
        bash: document.getElementById('agent-perm-bash').value,
        read: document.getElementById('agent-perm-read').value,
        grep: document.getElementById('agent-perm-search').value,
        glob: document.getElementById('agent-perm-search').value,
        task: document.getElementById('agent-perm-task').value,
        websearch: document.getElementById('agent-perm-web').value,
        webfetch: document.getElementById('agent-perm-web').value
      };

      const customRules = document.getElementById('agent-perm-custom').value
        .split('\\n')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        node: currentNode,
        id,
        mode: document.getElementById('agent-mode').value,
        model: document.getElementById('agent-model').value.trim(),
        description: document.getElementById('agent-desc').value.trim(),
        prompt: document.getElementById('agent-prompt').value,
        permissions: perms,
        customRules: customRules
      };
      await fetch('/api/save-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('角色 ' + id + ' 已同步儲存');
      currentAgentId = id;
      await reloadAll();
      selectAgent(id);
    }

    async function deleteCurrentAgent() {
      if (!currentAgentId) return;
      if (!confirm(t('confirmDeleteAgent') + currentAgentId + '?')) return;
      showLoading(true);
      await fetch('/api/delete-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, id: currentAgentId })
      });
      showToast(t('agentDeleted'));
      document.getElementById('agent-editor').style.display = 'none';
      currentAgentId = null;
      await reloadAll();
    }

    function renderMcp() {
      const list = document.getElementById('mcp-list');
      list.innerHTML = '';
      const mcpMap = (state.config && state.config.mcp) || {};
      for (const [id, m] of Object.entries(mcpMap)) {
        const div = document.createElement('div');
        div.className = 'item-card' + (currentMcpId === id ? ' selected' : '');
        div.onclick = () => selectMcp(id, m);
        const cmd = Array.isArray(m.command) ? m.command.join(' ') : (m.command || '');
        div.innerHTML = \`
          <div class="item-header">
            <span class="item-name">\${id}</span>
            <span class="badge" style="color: \${m.enabled !== false ? 'var(--primary)' : 'var(--danger)'}">
              \${m.enabled !== false ? '啟用中' : '已停用'}
            </span>
          </div>
          <div class="item-desc">\${cmd}</div>
          <div class="item-footer">
            <span>Type: \${m.type || 'local'}</span>
            <span>Timeout: \${m.timeout || '預設'}</span>
          </div>
        \`;
        list.appendChild(div);
      }
    }

    function selectMcp(id, m) {
      currentMcpId = id;
      renderMcp();
      document.getElementById('mcp-editor').style.display = 'block';
      document.getElementById('mcp-editor-title').innerText = '編輯 MCP 伺服器：' + id;
      document.getElementById('mcp-id').value = id;
      document.getElementById('mcp-id').disabled = true;
      document.getElementById('mcp-type').value = m.type || 'local';
      document.getElementById('mcp-enabled').value = m.enabled !== false ? 'true' : 'false';
      document.getElementById('mcp-timeout').value = m.timeout || '';
      
      if (Array.isArray(m.command)) {
        document.getElementById('mcp-command').value = m.command[0] || '';
        document.getElementById('mcp-args').value = m.command.slice(1).join(' ');
      } else {
        document.getElementById('mcp-command').value = m.command || '';
        document.getElementById('mcp-args').value = Array.isArray(m.args) ? m.args.join(' ') : (m.args || '');
      }
    }

    function addNewMcp() {
      currentMcpId = null;
      renderMcp();
      document.getElementById('mcp-editor').style.display = 'block';
      document.getElementById('mcp-editor-title').innerText = '新增 MCP 伺服器';
      document.getElementById('mcp-id').value = '';
      document.getElementById('mcp-id').disabled = false;
      document.getElementById('mcp-type').value = 'local';
      document.getElementById('mcp-enabled').value = 'true';
      document.getElementById('mcp-timeout').value = '60000';
      document.getElementById('mcp-command').value = '';
      document.getElementById('mcp-args').value = '';
    }

    async function saveCurrentMcp() {
      const id = document.getElementById('mcp-id').value.trim();
      if (!id) return alert(t('enterMcpId'));
      const cmd = document.getElementById('mcp-command').value.trim();
      const rawArgs = document.getElementById('mcp-args').value.trim();
      const args = rawArgs ? rawArgs.match(/(?:[^\s"]+|"[^"]*")+/g).map(s => s.replace(/^"|"$/g, '')) : [];

      const fullCommand = [cmd, ...args];
      showLoading(true);
      const payload = {
        node: currentNode,
        id,
        type: document.getElementById('mcp-type').value,
        command: fullCommand,
        enabled: document.getElementById('mcp-enabled').value === 'true',
        timeout: parseInt(document.getElementById('mcp-timeout').value, 10) || undefined
      };

      await fetch('/api/save-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('MCP 伺服器 ' + id + ' 已儲存');
      await reloadAll();
    }

    async function deleteCurrentMcp() {
      if (!currentMcpId) return;
      if (!confirm(t('confirmDeleteMcp') + currentMcpId + '?')) return;
      showLoading(true);
      await fetch('/api/delete-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, id: currentMcpId })
      });
      showToast(t('mcpDeleted'));
      document.getElementById('mcp-editor').style.display = 'none';
      currentMcpId = null;
      await reloadAll();
    }

    function renderTools() {
      const container = document.getElementById('tools-container');
      container.innerHTML = '';
      const tools = state.tools || {};
      for (const [k, v] of Object.entries(tools)) {
        const div = document.createElement('div');
        div.style.marginBottom = '14px';
        div.innerHTML = \`
          <label style="color: #38bdf8;">Tool: \${k}</label>
          <textarea class="tool-desc-input" data-tool="\${k}" style="height: 75px;">\${v}</textarea>
        \`;
        container.appendChild(div);
      }
    }

    async function saveTools() {
      const textareas = document.querySelectorAll('.tool-desc-input');
      const updated = {};
      textareas.forEach(t => {
        updated[t.getAttribute('data-tool')] = t.value;
      });
      showLoading(true);
      await fetch('/api/save-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast(t('trimToolsSaved'));
      await reloadAll();
    }

    async function savePrompt(type) {
      let val = '';
      if (type === 'local') val = document.getElementById('prompt-local').value;
      else if (type === 'global') val = document.getElementById('prompt-global').value;
      else if (type === 'ssh') val = document.getElementById('prompt-ssh').value;

      showLoading(true);
      await fetch('/api/save-system-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, type, content: val })
      });
      showToast(t('promptSaved'));
      showLoading(false);
    }

    async function saveCoreAgents() {
      showLoading(true);
      const payload = {
        node: currentNode,
        compactionModel: document.getElementById('compaction-model').value.trim(),
        compactionPrompt: document.getElementById('compaction-prompt').value.trim(),
        titleModel: document.getElementById('title-model').value.trim()
      };
      await fetch('/api/save-core-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(t('coreConfigSaved'));
      await reloadAll();
    }

    async function savePermissions() {
      showLoading(true);
      const denyLines = document.getElementById('perm-deny').value.split('\\n').map(s => s.trim()).filter(Boolean);
      const askLines = document.getElementById('perm-ask').value.split('\\n').map(s => s.trim()).filter(Boolean);
      await fetch('/api/save-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, deny: denyLines, ask: askLines })
      });
      showToast(t('permGuardSaved'));
      await reloadAll();
    }

    async function saveRawJsonc() {
      showLoading(true);
      const content = document.getElementById('raw-jsonc-content').value;
      await fetch('/api/save-raw-jsonc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, content })
      });
      showToast(t('rawJsonSaved'));
      await reloadAll();
    }

    // Initialize application
    async function initApp() {
      applyDomI18n();
      await loadNodeList();
      await loadSessionStats();
      await loadSessions();
      await reloadAll();
      testNodeHealth(currentNode);
    }

    initApp();
  </script>
</body>
</html>`;
}

// Server API Router
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const osLocale = Intl.DateTimeFormat().resolvedOptions().locale || "zh-TW";
    return res.end(getHtml(osLocale));
  }

  // Nodes Management
  if (req.method === 'GET' && url.pathname === '/api/nodes') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(loadNodes()));
  }

  // Session Stats
  if (req.method === 'GET' && url.pathname === '/api/session-stats') {
    const nodeId = url.searchParams.get('node') || 'local';
    const node = getNode(nodeId);
    try {
      const stats = await runDbHelperOnNode(node, ['stats']);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(stats));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Session List
  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    const nodeId = url.searchParams.get('node') || 'local';
    const node = getNode(nodeId);
    const ws = url.searchParams.get('workspace') || 'all';
    try {
      const list = await runDbHelperOnNode(node, ['sessions', `"${ws}"`]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(list));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Session Detail
  if (req.method === 'GET' && url.pathname === '/api/session-detail') {
    const nodeId = url.searchParams.get('node') || 'local';
    const node = getNode(nodeId);
    const id = url.searchParams.get('id') || '';
    try {
      const detail = await runDbHelperOnNode(node, ['detail', `"${id}"`]);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(detail));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Config Fetch
  if (req.method === 'GET' && url.pathname === '/api/config') {
    const nodeId = url.searchParams.get('node') || 'local';
    const node = getNode(nodeId);
    try {
      const data = await getNodeData(node);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    let data = {};
    if (body) {
      try { data = JSON.parse(body); } catch {}
    }

    const node = getNode(data.node || 'local');

    try {
      // Test node connectivity
      if (req.method === 'POST' && url.pathname === '/api/test-node') {
        const targetNode = getNode(data.id || 'local');
        try {
          if (targetNode.type === 'local') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true }));
          } else {
            await runNodeCmd(targetNode, 'echo ping');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true }));
          }
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      }

      // Save node configuration
      if (req.method === 'POST' && url.pathname === '/api/save-node') {
        const nodes = loadNodes();
        const idx = nodes.findIndex(n => n.id === data.id);
        if (idx >= 0) {
          nodes[idx] = { ...nodes[idx], ...data };
        } else {
          nodes.push(data);
        }
        saveNodes(nodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Delete node configuration
      if (req.method === 'POST' && url.pathname === '/api/delete-node') {
        let nodes = loadNodes();
        nodes = nodes.filter(n => n.id !== data.id && n.id !== 'local');
        saveNodes(nodes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Delete Session
      if (req.method === 'POST' && url.pathname === '/api/delete-session') {
        const result = await runDbHelperOnNode(node, ['delete', `"${data.id}"`]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      // Clean Session (Prune errors, reasoning, heavy outputs, files, steps)
      if (req.method === 'POST' && url.pathname === '/api/clean-session') {
        const opts = data.options || 'errors,reasoning,outputs,files,steps';
        const result = await runDbHelperOnNode(node, ['clean', `"${data.id}"`, `"${opts}"`]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      // Vacuum DB
      if (req.method === 'POST' && url.pathname === '/api/vacuum-db') {
        const result = await runDbHelperOnNode(node, ['vacuum']);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }

      // Save system prompt
      if (req.method === 'POST' && url.pathname === '/api/save-system-prompt') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        let target = `${node.configDir}${sep}AGENTS.local.md`;
        if (data.type === 'global') target = `${node.configDir}${sep}AGENTS.md`;
        else if (data.type === 'ssh') target = `${node.configDir}${sep}SSH_WORKFLOW.md`;

        await writeNodeFile(node, target, data.content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Save Agent
      if (req.method === 'POST' && url.pathname === '/api/save-agent') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const target = `${node.configDir}${sep}agent${sep}${data.id}.md`;
        let fmBlock = `description: ${data.description || ''}\nmode: ${data.mode || 'all'}`;
        if (data.model) fmBlock += `\nmodel: ${data.model}`;
        
        // Build permissions yaml if any specified
        const perms = data.permissions || {};
        const customRules = data.customRules || [];
        const permKeys = Object.keys(perms).filter(k => perms[k] && perms[k] !== 'inherit');
        if (permKeys.length > 0 || customRules.length > 0) {
          fmBlock += `\npermission:`;
          for (const k of permKeys) {
            fmBlock += `\n  ${k}: "${perms[k]}"`;
          }
          for (const cr of customRules) {
            if (cr.trim()) fmBlock += `\n  ${cr.trim()}`;
          }
        }

        const fileContent = `---\n${fmBlock}\n---\n\n${data.prompt || ''}\n`;
        await writeNodeFile(node, target, fileContent);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Delete Agent
      if (req.method === 'POST' && url.pathname === '/api/delete-agent') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const target = `${node.configDir}${sep}agent${sep}${data.id}.md`;
        await backupNodeFile(node, target);
        if (node.type === 'local') {
          if (fs.existsSync(target)) fs.unlinkSync(target);
        } else {
          await runNodeCmd(node, `rm -f "${target}"`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Save MCP
      if (req.method === 'POST' && url.pathname === '/api/save-mcp') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const cfgFile = `${node.configDir}${sep}opencode.jsonc`;

        let content = '';
        if (node.type === 'local') {
          content = fs.readFileSync(cfgFile, 'utf-8');
        } else {
          content = await runNodeCmd(node, `cat "${cfgFile}" 2>/dev/null || true`);
        }

        const parsed = parseJsonc(content) || {};
        if (!parsed.mcp) parsed.mcp = {};
        parsed.mcp[data.id] = {
          type: data.type || 'local',
          command: data.command,
          enabled: data.enabled !== false,
          timeout: data.timeout
        };

        const mcpStr = JSON.stringify(parsed.mcp, null, 2).replace(/\n/g, '\n  ');
        if (/"mcp"\s*:\s*\{[\s\S]*?\n\s*\}/.test(content)) {
          content = content.replace(/"mcp"\s*:\s*\{[\s\S]*?\n\s*\}/, `"mcp": ${mcpStr}`);
        }

        await writeNodeFile(node, cfgFile, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Delete MCP
      if (req.method === 'POST' && url.pathname === '/api/delete-mcp') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const cfgFile = `${node.configDir}${sep}opencode.jsonc`;

        let content = '';
        if (node.type === 'local') {
          content = fs.readFileSync(cfgFile, 'utf-8');
        } else {
          content = await runNodeCmd(node, `cat "${cfgFile}" 2>/dev/null || true`);
        }

        const parsed = parseJsonc(content) || {};
        if (parsed.mcp && parsed.mcp[data.id]) {
          delete parsed.mcp[data.id];
          const mcpStr = JSON.stringify(parsed.mcp, null, 2).replace(/\n/g, '\n  ');
          content = content.replace(/"mcp"\s*:\s*\{[\s\S]*?\n\s*\}/, `"mcp": ${mcpStr}`);
          await writeNodeFile(node, cfgFile, content);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Save Core Agents
      if (req.method === 'POST' && url.pathname === '/api/save-core-agent') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const cfgFile = `${node.configDir}${sep}opencode.jsonc`;

        let content = '';
        if (node.type === 'local') {
          content = fs.readFileSync(cfgFile, 'utf-8');
        } else {
          content = await runNodeCmd(node, `cat "${cfgFile}" 2>/dev/null || true`);
        }

        if (data.compactionModel) {
          content = content.replace(/"compaction"\s*:\s*\{[\s\S]*?"model"\s*:\s*"[^"]*"/, (m) => {
            return m.replace(/"model"\s*:\s*"[^"]*"/, `"model": "${data.compactionModel}"`);
          });
        }
        if (data.compactionPrompt) {
          content = content.replace(/"compaction"\s*:\s*\{[\s\S]*?"prompt"\s*:\s*"[^"]*"/, (m) => {
            return m.replace(/"prompt"\s*:\s*"[^"]*"/, `"prompt": ${JSON.stringify(data.compactionPrompt)}`);
          });
        }
        if (data.titleModel) {
          content = content.replace(/"title"\s*:\s*\{[\s\S]*?"model"\s*:\s*"[^"]*"/, (m) => {
            return m.replace(/"model"\s*:\s*"[^"]*"/, `"model": "${data.titleModel}"`);
          });
        }

        await writeNodeFile(node, cfgFile, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Save Permissions
      if (req.method === 'POST' && url.pathname === '/api/save-permissions') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const cfgFile = `${node.configDir}${sep}opencode.jsonc`;

        let content = '';
        if (node.type === 'local') {
          content = fs.readFileSync(cfgFile, 'utf-8');
        } else {
          content = await runNodeCmd(node, `cat "${cfgFile}" 2>/dev/null || true`);
        }

        const newBash = {};
        (data.deny || []).forEach(k => { newBash[k] = 'deny'; });
        (data.ask || []).forEach(k => { newBash[k] = 'ask'; });
        const bashStr = JSON.stringify(newBash, null, 4).replace(/\n/g, '\n    ');
        content = content.replace(/"bash"\s*:\s*\{[\s\S]*?\n\s*\}/, `"bash": ${bashStr}`);

        await writeNodeFile(node, cfgFile, content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Save Raw JSONC
      if (req.method === 'POST' && url.pathname === '/api/save-raw-jsonc') {
        const isWindows = node.type === 'local' || node.configDir.includes('\\');
        const sep = isWindows ? '\\' : '/';
        const cfgFile = `${node.configDir}${sep}opencode.jsonc`;

        await writeNodeFile(node, cfgFile, data.content);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

export function startServer() {
  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`[OpenCode Manager] Server active on http://127.0.0.1:${PORT}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  startServer();
}
