// Minimal RFC 6455 WebSocket server side (text frames, ping/pong, close, fragmentation, 64-bit lengths) for the
// dev-only RPC bridge. No dependencies; localhost development use only.
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024 * 1024;

/** Completes the upgrade handshake; returns a connection or undefined (socket already rejected). */
export function acceptWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string' || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return undefined;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  return wrap(socket);
}

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) head = Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]);
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

function wrap(socket) {
  const listeners = { message: [], close: [] };
  let buf = Buffer.alloc(0), parts = [], closed = false;
  const finish = () => { if (closed) return; closed = true; for (const fn of listeners.close) fn(); };
  const conn = {
    send(text) { if (!closed) socket.write(frame(1, Buffer.from(text, 'utf8'))); },
    close(code = 1000) {
      if (closed) return;
      const b = Buffer.alloc(2); b.writeUInt16BE(code);
      try { socket.write(frame(8, b)); } catch { /* gone */ }
      socket.end();
      finish();
    },
    on(ev, fn) { listeners[ev].push(fn); return conn; },
    get open() { return !closed; },
  };
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_MESSAGE) return conn.close(1009);
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = buf.subarray(off, off + 4); payload = Buffer.from(payload); for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3]; }
      buf = buf.subarray(need);
      if (op === 8) return conn.close();
      if (op === 9) { socket.write(frame(10, payload)); continue; }
      if (op === 10) continue;
      parts.push(Buffer.from(payload));
      if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; for (const fn of listeners.message) fn(text); }
    }
  });
  socket.on('close', finish);
  socket.on('error', finish);
  return conn;
}
