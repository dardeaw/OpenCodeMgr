// src/core/node-transport.mjs
// Cross-Node Transport Layer (Local FS, Paramiko SSH, Jump SSH, and Remote Python DB Helper)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MANAGER_ROOT_DIR = path.resolve(__dirname, '..', '..');
export const BASE_OPENCODE_DIR = path.resolve(MANAGER_ROOT_DIR, '..');
export const NODES_CONFIG_FILE = path.join(MANAGER_ROOT_DIR, 'nodes.json');
export const RUN_SSH_SCRIPT = path.join(BASE_OPENCODE_DIR, 'run_ssh.py');
export const JUMP_SSH_SCRIPT = path.join(BASE_OPENCODE_DIR, 'jump_ssh.py');
export const LOCAL_DB_HELPER = path.join(MANAGER_ROOT_DIR, 'db_helper.py');

const DEFAULT_NODES = [
  {
    id: 'local',
    name: '💻 本機 (.102 Windows)',
    type: 'local',
    ip: '192.168.68.102',
    configDir: path.join(os.homedir(), '.config', 'opencode'),
    dbPath: path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db')
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

export function loadNodes() {
  if (!fs.existsSync(NODES_CONFIG_FILE)) {
    return DEFAULT_NODES;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(NODES_CONFIG_FILE, 'utf-8'));
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_NODES;
  } catch (err) {
    console.error('[node-transport] Failed to parse nodes.json:', err.message);
    return DEFAULT_NODES;
  }
}

export function saveNodes(nodes) {
  fs.writeFileSync(NODES_CONFIG_FILE, JSON.stringify(nodes, null, 2) + '\n', 'utf-8');
}

export function getNode(nodeId = 'local') {
  const nodes = loadNodes();
  return nodes.find(n => n.id === nodeId) || nodes[0];
}

export function getNodePaths(node) {
  const isWindows = node.type === 'local' || String(node.configDir || '').includes('\\');
  const sep = isWindows ? '\\' : '/';
  const configDir = String(node.configDir || '').replace(/[\\/]+$/, '');
  return {
    isWindows,
    sep,
    configDir,
    cfgFile: `${configDir}${sep}opencode.jsonc`,
    promptLocal: `${configDir}${sep}AGENTS.local.md`,
    promptGlobal: `${configDir}${sep}AGENTS.md`,
    promptSsh: `${configDir}${sep}SSH_WORKFLOW.md`,
    agentDir: `${configDir}${sep}agent`,
    pluginDir: `${configDir}${sep}plugin`,
    pluginScopesFile: `${configDir}${sep}plugin-scopes.json`,
    trimTools: `${configDir}${sep}plugin${sep}trim-tools.js`
  };
}

export async function runNodeCmd(node, cmd) {
  if (node.type === 'local') {
    const { stdout } = await execAsync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  } else if (node.type === 'jump') {
    const pyCmd = `python "${JUMP_SSH_SCRIPT}" "${cmd.replace(/"/g, '\\"')}"`;
    const { stdout } = await execAsync(pyCmd, { encoding: 'utf-8', timeout: 25000, maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  } else {
    const pyCmd = `python "${RUN_SSH_SCRIPT}" ${node.ip} "${cmd.replace(/"/g, '\\"')}"`;
    const { stdout } = await execAsync(pyCmd, { encoding: 'utf-8', timeout: 25000, maxBuffer: 1024 * 1024 * 32 });
    return stdout;
  }
}

export async function uploadToNode(node, localPath, remotePath) {
  if (node.type === 'local') {
    const dir = path.dirname(remotePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(localPath, remotePath);
  } else {
    const pyCmd = `python "${RUN_SSH_SCRIPT}" ${node.ip} --upload "${localPath}" "${remotePath}"`;
    await execAsync(pyCmd, { encoding: 'utf-8', timeout: 30000 });
  }
}

export async function downloadFromNode(node, remotePath, localPath) {
  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (node.type === 'local') {
    if (fs.existsSync(remotePath)) {
      fs.copyFileSync(remotePath, localPath);
      return true;
    }
    return false;
  } else {
    const pyCmd = `python "${RUN_SSH_SCRIPT}" ${node.ip} --download "${remotePath}" "${localPath}"`;
    await execAsync(pyCmd, { encoding: 'utf-8', timeout: 30000 });
    return fs.existsSync(localPath);
  }
}

/**
 * Backup file on node with .bak-TIMESTAMP suffix at the end so it never matches *.md or *.js globs
 */
export async function backupNodeFile(node, filePath) {
  if (node.type === 'local') {
    if (!fs.existsSync(filePath)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(filePath, `${filePath}.bak-${ts}`);
  } else {
    const cmd = `[ -f "${filePath}" ] && cp "${filePath}" "${filePath}.bak-$(date +%Y%m%d-%H%M%S)" || true`;
    await runNodeCmd(node, cmd);
  }
}

export async function readNodeFile(node, targetPath) {
  if (node.type === 'local') {
    return fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf-8') : '';
  }
  return await runNodeCmd(node, `cat "${targetPath}" 2>/dev/null || true`);
}

export async function writeNodeFile(node, targetPath, content, doBackup = true) {
  if (doBackup) {
    await backupNodeFile(node, targetPath);
  }
  if (node.type === 'local') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

export async function deleteNodeFile(node, targetPath, doBackup = true) {
  if (doBackup) {
    await backupNodeFile(node, targetPath);
  }
  if (node.type === 'local') {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
  } else {
    await runNodeCmd(node, `rm -f "${targetPath}"`);
  }
}

export async function runDbHelperOnNode(node, args) {
  const { sep, configDir } = getNodePaths(node);
  const remoteHelper = `${configDir}${sep}db_helper.py`;

  const quotedArgs = args.map(a => {
    const s = String(a ?? '');
    if (s.startsWith('"') && s.endsWith('"')) return s;
    return `"${s.replace(/"/g, '\\"')}"`;
  });

  if (node.type === 'local') {
    const env = { ...process.env };
    if (node.dbPath) env.OPENCODE_DB_PATH = node.dbPath;
    const cmd = `python "${LOCAL_DB_HELPER}" ${quotedArgs.join(' ')}`;
    const { stdout } = await execAsync(cmd, { encoding: 'utf-8', env, maxBuffer: 1024 * 1024 * 32 });
    return JSON.parse(stdout.trim());
  } else {
    const envPrefix = node.dbPath ? `OPENCODE_DB_PATH="${node.dbPath}" ` : '';
    const cmd = `${envPrefix}python3 "${remoteHelper}" ${quotedArgs.join(' ')}`;
    const out = await runNodeCmd(node, cmd);
    return JSON.parse(out.trim());
  }
}
