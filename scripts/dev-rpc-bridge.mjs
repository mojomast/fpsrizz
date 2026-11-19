#!/usr/bin/env node
// Dev-only JSON-RPC 2.0 bridge (P2.6). The dev page connects as the game over ws://127.0.0.1:<port>/game; agents and
// tools send requests over HTTP (POST /rpc, Content-Type: application/json) or WebSocket (/agent) and get the game's
// answers. Started by `npm run dev` on the dev server port + 1; standalone: node scripts/dev-rpc-bridge.mjs [--port N].
// Safety: binds 127.0.0.1 only, refuses browser origins other than the dev server's (so other web pages cannot drive
// the game), and requires application/json for HTTP so cross-site form posts are impossible. Never part of a build.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { acceptWebSocket } from './ws-lite.mjs';

const TIMEOUT_MS = 30000;

export function startDevRpcBridge({ port = 5174, host = '127.0.0.1', allowOrigin = () => false, log = console.log } = {}) {
  let game;
  let seq = 0;
  const pending = new Map();
  const agents = new Set();
  const forward = (req) => new Promise((resolve) => {
    const id = req?.id;
    const fail = (code, message) => resolve({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
    if (!req || typeof req !== 'object' || req.jsonrpc !== '2.0' || typeof req.method !== 'string') return fail(-32600, 'invalid JSON-RPC 2.0 request');
    if (!game?.open) return fail(-32001, 'no game connected: open the dev server page (npm run dev) in a browser');
    const key = `b${++seq}`;
    const timer = setTimeout(() => { pending.delete(key); fail(-32002, `game did not answer ${req.method} within ${TIMEOUT_MS / 1000} s`); }, TIMEOUT_MS);
    pending.set(key, (res) => { clearTimeout(timer); resolve({ ...res, id: id ?? null }); });
    game.send(JSON.stringify({ ...req, id: key }));
  });
  const handle = (msg) => (Array.isArray(msg) ? Promise.all(msg.map(forward)) : forward(msg));
  // Non-browser clients send no Origin; browser pages must be the dev server's own.
  const originOk = (req) => { const o = req.headers.origin; return o === undefined || allowOrigin(o); };

  const server = createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (!originOk(req)) return send(403, { error: 'origin not allowed' });
    if (req.method === 'GET' && req.url === '/status') return send(200, { game: !!game?.open, agents: agents.size, pending: pending.size });
    if (req.method !== 'POST' || req.url !== '/rpc') return send(404, { error: 'POST /rpc with a JSON-RPC 2.0 body, or GET /status' });
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, { error: 'Content-Type must be application/json' });
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 64 * 1024 * 1024) req.destroy(); });
    req.on('end', async () => {
      let msg;
      try { msg = JSON.parse(body); } catch { return send(200, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
      send(200, await handle(msg));
    });
  });
  server.on('upgrade', (req, socket) => {
    if (!originOk(req) || (req.url !== '/game' && req.url !== '/agent')) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const ws = acceptWebSocket(req, socket);
    if (!ws) return;
    if (req.url === '/game') {
      if (game?.open) game.close(4000); // newest page wins (e.g. after a reload)
      game = ws;
      log?.('[dev-rpc] game connected');
      ws.on('message', (text) => {
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        for (const r of Array.isArray(msg) ? msg : [msg]) {
          const done = pending.get(r?.id);
          if (done) { pending.delete(r.id); done(r); }
        }
      });
      ws.on('close', () => { if (game === ws) { game = undefined; log?.('[dev-rpc] game disconnected'); } });
    } else {
      agents.add(ws);
      ws.on('message', async (text) => {
        let msg;
        try { msg = JSON.parse(text); } catch { return ws.send(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })); }
        ws.send(JSON.stringify(await handle(msg)));
      });
      ws.on('close', () => agents.delete(ws));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        port: addr.port, url: `http://${host}:${addr.port}`,
        get gameConnected() { return !!game?.open; },
        close: () => new Promise((r) => { game?.close(); for (const a of agents) a.close(); server.close(() => r()); server.closeAllConnections?.(); }),
      });
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : 5174;
  const b = await startDevRpcBridge({ port, allowOrigin: (o) => /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o) });
  console.log(`dev-rpc bridge on ${b.url} (POST /rpc, ws /agent; the game connects to ws /game)`);
}
