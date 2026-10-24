// server.mjs — Lightweight HTTP Server Entry Point for OpenCode Manager
import http from 'node:http';
import { handleHttpRequest } from './src/api/router.mjs';

export const PORT = Number(process.env.OPENCODE_MGR_PORT || 5210);

const server = http.createServer(async (req, res) => {
  try {
    await handleHttpRequest(req, res);
  } catch (err) {
    console.error('[OpenCode Manager] Unhandled HTTP error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
    }
  }
});

export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`[OpenCode Manager] Server active on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  startServer();
}
