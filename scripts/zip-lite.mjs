// Minimal ZIP writer (store/deflate, no zip64) for exports. Node's zlib provides deflate and CRC-32.
import { crc32, deflateRawSync } from 'node:zlib';

/** entries: [{ name: 'a/b.txt', data: Uint8Array }] -> Buffer of a .zip archive. Paths always use "/". */
export function createZip(entries, { mtime = new Date(1980, 0, 1) } = {}) {
  const dosTime = ((mtime.getHours() << 11) | (mtime.getMinutes() << 5) | (mtime.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((mtime.getFullYear() - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate()) & 0xffff;
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    if (name.startsWith('/') || name.includes('..') || name.includes('\\')) throw new Error(`bad zip path ${name}`);
    const raw = Buffer.from(data);
    const deflated = deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const fname = Buffer.from(name, 'utf8');
    const crc = crc32(raw) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(useDeflate ? 8 : 0, 8); head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(fname.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, fname, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10); cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(fname.length, 28); cen.writeUInt32LE(offset, 42);
    centrals.push(cen, fname);
    offset += 30 + fname.length + body.length;
    if (offset > 0xffffffff) throw new Error('zip too large (no zip64 support)');
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Lists { name, size, method } from a zip buffer produced by createZip (central directory walk). */
export function listZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 24), n = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32);
    out.push({ name: buf.subarray(p + 46, p + 46 + n).toString('utf8'), size, method });
    p += 46 + n + extra + comment;
  }
  return out;
}
