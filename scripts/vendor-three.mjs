// Reproduce the boundary-local official Three.js runtime and its matching declaration graph.
// npm ci && npm run vendor-three; --check compares bytes without writing.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'packages/platform-web/src/render/mini3/vendor');
const version = '0.187.0';
const files = new Map();
const sources = {};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function copy(source, dest, transform = value => value) {
  const bytes = await readFile(resolve(root, 'node_modules', source));
  sources[source] = hash(bytes);
  files.set(dest, transform(bytes));
}
for (const pkg of ['three', '@types/three']) {
  const manifest = JSON.parse(await readFile(resolve(root, 'node_modules', pkg, 'package.json'), 'utf8'));
  if (manifest.version !== version) throw new Error(`${pkg}: expected ${version}, got ${manifest.version}; run npm ci`);
}
for (const name of ['three.module.js', 'three.core.js']) await copy(`three/build/${name}`, name);
await copy('three/LICENSE', 'THREE-LICENSE.txt');
await copy('@types/three/LICENSE', 'TYPES-LICENSE.txt');
await copy('@types/webxr/LICENSE', 'WEBXR-LICENSE.txt');
await copy('@types/webxr/index.d.ts', 'webxr.d.ts');

// Copy only the declaration dependency closure of the WebGL/core namespace, not addons/WebGPU.
const seen = new Set();
async function declaration(path) {
  if (seen.has(path)) return;
  seen.add(path);
  const source = `@types/three/src/${path}`;
  const text = await readFile(resolve(root, 'node_modules', source), 'utf8');
  for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
    const spec = match[1];
    if (!spec.startsWith('.')) throw new Error(`Unexpected bare declaration dependency: ${source}: ${spec}`);
    const next = relative(resolve(root, 'node_modules/@types/three/src'), resolve(root, 'node_modules/@types/three/src', dirname(path), spec)).replaceAll('\\', '/').replace(/\.js$/, '.d.ts');
    if (next.startsWith('..')) throw new Error(`Declaration escaped src: ${next}`);
    await declaration(next);
  }
  const webxr = relative(dirname(resolve(out, 'types', path)), resolve(out, 'webxr.d.ts')).replaceAll('\\', '/');
  await copy(source, `types/${path}`, bytes => Buffer.from(bytes.toString().replace('/// <reference types="webxr" />', `/// <reference path="${webxr}" />`)));
}
await declaration('Three.d.ts');
files.set('three.module.d.ts', Buffer.from('export * from "./types/Three.js";\n'));
const outputs = Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => [name, hash(bytes)]));
const webxrVersion = JSON.parse(await readFile(resolve(root, 'node_modules/@types/webxr/package.json'), 'utf8')).version;
files.set('provenance.json', Buffer.from(JSON.stringify({
  generator: 'scripts/vendor-three.mjs', version, revision: '187', typesVersion: version, webxrVersion,
  upstream: 'https://github.com/mrdoob/three.js/tree/r187', license: 'MIT',
  note: 'Runtime copied byte-for-byte from the official npm build. Declarations from @types/three; only WebXR reference rewritten to local path.',
  sources: Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))), outputs,
}, null, 2) + '\n'));

if (process.argv.includes('--check')) {
  for (const [name, bytes] of files) {
    const existing = await readFile(resolve(out, name));
    if (!existing.equals(bytes)) throw new Error(`Vendored file differs: ${name}; run npm run vendor-three`);
  }
  const actual = await readdir(out, { recursive: true, withFileTypes: true });
  if (actual.filter(entry => entry.isFile()).length !== files.size) throw new Error('Unexpected files in vendor directory');
  console.log(`Three.js ${version}: ${files.size} vendored files verified`);
} else {
  for (const [name, bytes] of files) {
    await mkdir(dirname(resolve(out, name)), { recursive: true });
    await writeFile(resolve(out, name), bytes);
  }
  console.log(`Three.js ${version}: ${files.size} files vendored (${[...files.values()].reduce((n, b) => n + b.length, 0)} bytes)`);
}
