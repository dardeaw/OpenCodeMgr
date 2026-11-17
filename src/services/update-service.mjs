// src/services/update-service.mjs
// Self-update: detect newer GitHub release tags and pull them into the local install.
// Uses `gh` (GitHub CLI) for tag listing; falls back to `git ls-remote` if gh is unavailable.

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MANAGER_ROOT_DIR } from '../core/node-transport.mjs';

const execAsync = promisify(exec);

// The version currently running in this process (from package.json).
export function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MANAGER_ROOT_DIR, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Parse "1.9.0" -> [1,9,0]. Non-numeric -> null.
function parseSemver(v) {
  if (!v) return null;
  const core = String(v).replace(/^v/i, '').split('-')[0];
  const parts = core.split('.').map(n => parseInt(n, 10));
  if (parts.some(isNaN)) return null;
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

// Returns >0 if a>b, <0 if a<b, 0 if equal. Unparseable sorts lowest.
export function compareSemver(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

async function runGit(args, opts = {}) {
  const { stdout } = await execAsync(`git ${args}`, {
    cwd: MANAGER_ROOT_DIR,
    encoding: 'utf-8',
    timeout: opts.timeout || 20000,
    maxBuffer: 1024 * 1024 * 8
  });
  return stdout.trim();
}

// List remote tags matching vX.Y.Z. Prefer gh api; fall back to git ls-remote.
async function listRemoteTags(owner, repo) {
  if (owner && repo) {
    try {
      const { stdout } = await execAsync(`gh api repos/${owner}/${repo}/tags --paginate`, {
        cwd: MANAGER_ROOT_DIR, encoding: 'utf-8', timeout: 20000, maxBuffer: 1024 * 1024 * 8
      });
      const arr = JSON.parse(stdout);
      if (Array.isArray(arr)) return arr.map(t => t.name).filter(Boolean);
    } catch {
      // fall through to git
    }
  }
  try {
    const out = await runGit('ls-remote --tags origin', { timeout: 20000 });
    return out.split('\n').map(line => {
      const m = line.match(/refs\/tags\/(.+?)(\^\{\})?$/);
      return m ? m[1] : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// Determine the newest semver tag on the remote.
export async function checkForUpdate() {
  const current = getLocalVersion();
  let repoInfo = { owner: null, repo: null };
  try {
    const remoteUrl = await runGit('config --get remote.origin.url');
    const m = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i);
    if (m) { repoInfo.owner = m[1]; repoInfo.repo = m[2]; }
  } catch {}

  const tags = await listRemoteTags(repoInfo.owner, repoInfo.repo);
  const semverTags = tags.filter(t => parseSemver(t) !== null);
  if (semverTags.length === 0) {
    return { ok: true, hasUpdate: false, current, latest: current, canAutoUpdate: false, reason: 'no-tags' };
  }
  let latest = semverTags[0];
  for (const t of semverTags) {
    if (compareSemver(t, latest) > 0) latest = t;
  }

  // Auto-update only safe if working tree is clean and we are on a branch tracking origin.
  let dirty = false;
  try {
    const status = await runGit('status --porcelain');
    dirty = status.length > 0;
  } catch {}

  const hasUpdate = compareSemver(latest, current) > 0;
  return {
    ok: true,
    hasUpdate,
    current,
    latest,
    canAutoUpdate: hasUpdate && !dirty,
    dirty,
    owner: repoInfo.owner,
    repo: repoInfo.repo
  };
}

// Pull the latest tag into the local checkout (fast-forward). Does NOT restart the server.
export async function applyUpdate(targetTag) {
  const info = await checkForUpdate();
  if (!info.ok) return { ok: false, error: 'check-failed' };
  if (!info.hasUpdate) return { ok: false, error: 'already-latest', current: info.current };
  if (info.dirty) return { ok: false, error: 'dirty-worktree' };

  const tag = targetTag || info.latest;

  try {
    await runGit('fetch origin --tags --prune', { timeout: 60000 });
  } catch (e) {
    return { ok: false, error: 'fetch-failed', detail: e.message };
  }

  // Ensure the tag exists locally now.
  try {
    await runGit(`rev-parse --verify "refs/tags/${tag}"`, { timeout: 10000 });
  } catch {
    return { ok: false, error: 'tag-not-found', tag };
  }

  // Fast-forward the current branch to the tag commit.
  try {
    await runGit(`merge --ff-only "refs/tags/${tag}"`, { timeout: 60000 });
  } catch (e) {
    return { ok: false, error: 'not-fast-forward', detail: e.message, tag };
  }

  const newVersion = getLocalVersion();
  return {
    ok: true,
    updated: true,
    from: info.current,
    to: newVersion,
    tag,
    needsRestart: true
  };
}

// ---------------------------------------------------------------------------
// Cross-platform self-restart.
//
// Strategy is chosen by detecting who supervises this process, so we never
// fight an external supervisor (which would spawn ghost processes / port races):
//   1. systemd unit  -> systemctl restart <unit>   (INVOCATION_ID injected)
//   2. pm2           -> pm2 reload <app>           (PM2_HOME + node_env marker)
//   3. standalone     -> detached self-respawn of server.mjs, then exit
//
// The standalone path is what covers the Windows desktop app (orphaned
// `node app.mjs --server-only`) AND a plain `node server.mjs` web server on
// any OS. It re-requires the freshly-updated code from disk.
// ---------------------------------------------------------------------------

const SELF = fileURLToPath(import.meta.url);

export function detectSupervisor() {
  if (process.env.INVOCATION_ID || process.env.SYSTEMD_EXEC_PID) return 'systemd';
  if (process.env.PM2_HOME || process.env.pm_id || process.env.NODE_APP_INSTANCE) return 'pm2';
  return 'standalone';
}

// Best-effort systemd unit name for the current process.
async function systemdUnitName() {
  // $INVOCATION_ID is the unit invocation; derive the unit via cgroup.
  try {
    const cg = fs.readFileSync('/proc/self/cgroup', 'utf-8');
    const m = cg.match(/\/([^/]+)\.service/);
    if (m) return `${m[1]}.service`;
  } catch {}
  return null;
}

export async function restartServer() {
  const mode = detectSupervisor();

  if (mode === 'systemd') {
    const unit = await systemdUnitName();
    if (!unit) return { ok: false, error: 'systemd-unit-unknown', mode };
    // Fire-and-forget: systemctl will SIGTERM us and start a fresh unit.
    try {
      const child = spawn('systemctl', ['restart', unit], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, mode, detail: `systemctl restart ${unit}` };
    } catch (e) {
      return { ok: false, error: 'systemd-restart-failed', detail: e.message, mode };
    }
  }

  if (mode === 'pm2') {
    const appName = process.env.pm_exec_path
      ? path.basename(process.env.pm_exec_path).replace(/\.(m?js|cjs)$/, '')
      : (process.env.NODE_APP_NAME || null);
    if (!appName) return { ok: false, error: 'pm2-app-unknown', mode };
    try {
      const child = spawn('pm2', ['reload', appName], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, mode, detail: `pm2 reload ${appName}` };
    } catch (e) {
      return { ok: false, error: 'pm2-reload-failed', detail: e.message, mode };
    }
  }

  // Standalone: spawn a detached successor that binds the same port once we exit.
  try {
    const entry = path.join(MANAGER_ROOT_DIR, 'server.mjs');
    if (!fs.existsSync(entry)) return { ok: false, error: 'entry-not-found', mode };
    const env = { ...process.env, OPENCODE_MGR_PORT: String(process.env.OPENCODE_MGR_PORT || 5210) };
    const child = spawn(process.execPath, [entry], {
      cwd: MANAGER_ROOT_DIR,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env
    });
    child.unref();
    return { ok: true, mode, detail: 'detached-respawn', pid: child.pid };
  } catch (e) {
    return { ok: false, error: 'respawn-failed', detail: e.message, mode };
  }
}
