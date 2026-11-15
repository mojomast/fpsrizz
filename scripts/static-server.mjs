// Tiny static file server shared by preview.mjs and smoke-lib.mjs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function startStaticServer(dir, port = 0, host = '127.0.0.1') {
  const base = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      } catch {
        res.writeHead(400).end('Bad request');
        return;
      }
      if (pathname.includes('\0')) {
        res.writeHead(400).end('Bad request');
        return;
      }
      let file = resolve(base, '.' + pathname);
      if (file !== base && !file.startsWith(base + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let st = await stat(file).catch(() => null);
      if (st?.isDirectory()) {
        file = resolve(file, 'index.html');
        st = await stat(file).catch(() => null);
      }
      if (!st?.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      const p = server.address().port;
      ok({
        url: `http://${host}:${p}/`,
        port: p,
        close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections?.(); }),
      });
    });
  });
}
