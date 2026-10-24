#!/usr/bin/env node
import { startServer } from './server.mjs';
import { spawn, exec } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const PORT = 5210;
const APP_URL = `http://127.0.0.1:${PORT}`;

function checkServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openAppWindow() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromePathUser = path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe');

  let targetExe = null;
  if (fs.existsSync(edgePath)) targetExe = edgePath;
  else if (fs.existsSync(chromePath)) targetExe = chromePath;
  else if (fs.existsSync(chromePathUser)) targetExe = chromePathUser;

  if (targetExe) {
    console.log('[OpenCode Manager] Launching App Window with:', targetExe);
    try {
      const p = spawn(targetExe, [`--app=${APP_URL}`, '--window-size=1260,860'], {
        detached: true,
        stdio: 'ignore'
      });
      p.unref();
      return;
    } catch (e) {
      console.warn('[OpenCode Manager] Failed to spawn app window:', e.message);
    }
  }

  // Fallback to default browser
  console.log('[OpenCode Manager] Launching default browser...');
  exec(`explorer "${APP_URL}"`);
}

async function main() {
  const isRunning = await checkServerRunning();
  if (isRunning) {
    console.log('[OpenCode Manager] Server is already running. Opening App Window...');
    openAppWindow();
    setTimeout(() => process.exit(0), 1200);
    return;
  }

  // Start HTTP server
  await startServer();
  openAppWindow();

  console.log('[OpenCode Manager] App service is active. Minimize or keep this window open.');
}

main().catch(err => {
  console.error('[OpenCode Manager] Startup error:', err);
});
