#!/usr/bin/env node
// Moves base64 pixel data out of generated painter modules into content-hashed binary packs.
// Usage: node scripts/pack-painters.mjs [module.ts ...]   (default: every known generated painter module)
//
// The asset generators (scripts/weapon-painters.py, scripts/assetrizz.py, scripts/import-experience-assets.mjs) emit
// painter modules with inline base64 strings. This tool rewrites such a module in place: pixel data goes to
// public/packs/<plugin>/<module>.<sha256-16>.pack (gzip, inflated in the browser with DecompressionStream) and
// the module awaits it with loadStaticAsset(..., { gunzip: true }). Running it on an
// already packed module is a no-op. The bytes are identical to the decoded base64, so the painted pixels match.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
export const DEFAULT_MODULES = [
  'packages/std/plugins/theme-assetrizz/weapons.ts',
  'packages/std/plugins/theme-assetrizz/cinder-weapons.ts',
  'packages/std/plugins/theme-assetrizz/fantasy-weapons.ts',
  'packages/std/plugins/theme-assetrizz/generated.ts',
  'packages/std/plugins/theme-assetrizz/fantasy-generated.ts',
  'packages/std/plugins/theme-story/generated.ts',
];

const B64 = String.raw`["']([A-Za-z0-9+/=]*)["']`;
const KEY = String.raw`["']([^"']+)["']`;
/** Each variant: how to find entries in the old file and the decoder emitted into the new one. */
const VARIANTS = [
  {
    name: 'rle-rgba', // painter(width, height, "base64 RLE")
    entry: new RegExp(String.raw`^(\s*)${KEY}: painter\((\d+), (\d+), ${B64}\),$`),
    parts: (m) => ({ indent: m[1], key: m[2], args: [m[3], m[4]], blobs: [m[5]] }),
    decoder: `function painter(width: number, height: number, offset: number, length: number): Painter {
  return { width, height, paint(ctx) {
    const data = pack.subarray(offset, offset + length);
    const pixels = new Uint8ClampedArray(width * height * 4);
    let src = 0, dst = 0;
    while (src < data.length) {
      const run = data[src++]! | (data[src++]! << 8);
      const runLength = (run & 0x7fff) * 4;
      if (run & 0x8000) dst += runLength;
      else for (let end = dst + runLength; dst < end; dst++) pixels[dst] = data[src++]!;
    }
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  } };
}`,
  },
  {
    name: 'raw-rgba-64', // painter(width, 'base64 RGBA'), height 64
    entry: new RegExp(String.raw`^(\s*)${KEY}: painter\((\d+), ${B64}\),$`),
    parts: (m) => ({ indent: m[1], key: m[2], args: [m[3]], blobs: [m[4]] }),
    decoder: `function painter(width: number, offset: number, length: number): Painter {
  return { width, height: 64, paint(ctx) {
    const bytes = new Uint8ClampedArray(pack.subarray(offset, offset + length));
    ctx.putImageData(new ImageData(bytes, width, 64), 0, 0);
  } };
}`,
  },
  {
    name: 'palette-runs', // painter(width, height, 'base64 palette', 'base64 runs')
    entry: new RegExp(String.raw`^(\s*)${KEY}: painter\((\d+), (\d+), ${B64}, ${B64}\),$`),
    parts: (m) => ({ indent: m[1], key: m[2], args: [m[3], m[4]], blobs: [m[5], m[6]] }),
    decoder: `function painter(width: number, height: number, colorsAt: number, colorsLength: number, runsAt: number, runsLength: number): Painter {
  return { width, height, paint(ctx) {
    const palette = pack.subarray(colorsAt, colorsAt + colorsLength);
    const encoded = pack.subarray(runsAt, runsAt + runsLength);
    const image = ctx.createImageData(width, height);
    let pixel = 0;
    for (let i = 0; i < encoded.length; i += 2) {
      const count = encoded[i]!;
      const color = encoded[i + 1]! * 4;
      for (let n = 0; n < count; n++) {
        for (let channel = 0; channel < 4; channel++) image.data[pixel++] = palette[color + channel]!;
      }
    }
    ctx.putImageData(image, 0, 0);
  } };
}`,
  },
];

export function packModule(rel) {
  const file = resolve(root, rel);
  const src = readFileSync(file, 'utf8');
  if (src.includes('loadStaticAsset(')) return { rel, skipped: 'already packed' };
  const lines = src.split('\n');
  const exportAt = lines.findIndex((l) => l.startsWith('export const '));
  if (exportAt < 0) throw new Error(`${rel}: no "export const" table`);
  const headerComments = [];
  for (const l of lines) { if (l.startsWith('//')) headerComments.push(l); else break; }
  const typeImport = lines.find((l) => l.startsWith('import type { Painter }'));
  if (!typeImport) throw new Error(`${rel}: missing Painter type import`);
  const sdk = typeImport.match(/from ["'](.+)["']/)[1];

  const chunks = [];
  let size = 0;
  let variant;
  const body = lines.slice(exportAt).map((line) => {
    for (const v of VARIANTS) {
      const m = line.match(v.entry);
      if (!m) continue;
      if (variant && variant !== v) throw new Error(`${rel}: mixed painter formats`);
      variant = v;
      const { indent, key, args, blobs } = v.parts(m);
      const ranges = blobs.flatMap((b) => {
        const bytes = Buffer.from(b, 'base64');
        const at = size;
        chunks.push(bytes);
        size += bytes.length;
        return [at, bytes.length];
      });
      return `${indent}${JSON.stringify(key)}: painter(${[...args, ...ranges].join(', ')}),`;
    }
    return line;
  });
  if (!variant) return { rel, skipped: 'no inline painters' };
  const data = gzipSync(Buffer.concat(chunks), { level: 9 });
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  const plugin = basename(dirname(file));
  const name = basename(file, '.ts');
  const packDir = resolve(root, 'public/packs', plugin);
  mkdirSync(packDir, { recursive: true });
  for (const old of readdirSync(packDir)) if (old.startsWith(`${name}.`) && /\.(bin|pack)$/.test(old)) rmSync(resolve(packDir, old));
  const assetPath = `packs/${plugin}/${name}.${hash}.pack`;
  writeFileSync(resolve(root, 'public', assetPath), data);
  const out = [
    ...headerComments,
    `// Pixel data: public/${assetPath} (${variant.name}, gzip; moved out of JS by scripts/pack-painters.mjs).`,
    `import type { Painter } from '${sdk}';`,
    `import { loadStaticAsset } from '${sdk}';`,
    '',
    `const pack = await loadStaticAsset('${assetPath}', { gunzip: true });`,
    '',
    variant.decoder,
    '',
    ...body,
  ].join('\n');
  writeFileSync(file, out);
  return { rel, asset: assetPath, bytes: data.length, raw: size, before: src.length, after: out.length };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(root, 'scripts/pack-painters.mjs')) {
  const targets = process.argv.slice(2).length ? process.argv.slice(2).map((p) => relative(root, resolve(p))) : DEFAULT_MODULES;
  for (const rel of targets) {
    if (!existsSync(resolve(root, rel))) { console.error(`pack-painters: ${rel} not found`); process.exit(1); }
    const r = packModule(rel);
    console.log(r.skipped ? `  ${rel}: ${r.skipped}` : `  ${rel}: ${(r.before / 1024).toFixed(0)} KiB -> ${(r.after / 1024).toFixed(1)} KiB JS + ${(r.bytes / 1024).toFixed(0)} KiB ${r.asset}`);
  }
}
