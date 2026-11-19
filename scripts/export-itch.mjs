#!/usr/bin/env node
// P3.1: package dist/ for itch.io's HTML5 player (https://itch.io/docs/creators/html5).
//   npm run export:itch                  zip the existing dist/ into .export/bulkhead-itch.zip
//   npm run export:itch -- --build       run `npm run build` first
//   npm run export:itch -- --preset ID   make the zip boot straight into one preset (writes index.html redirect args)
//   npm run export:itch -- --out file.zip
// Checks itch's rules: index.html at the zip root, relative URLs only, <= 1000 files, each file < 200 MB.
// Upload by hand on itch.io ("This file will be played in the browser"), or with butler (see deploy-itch.yml).
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './tools.mjs';
import { createZip } from './zip-lite.mjs';

export const ITCH_LIMITS = { maxFiles: 1000, maxFileBytes: 200 * 1024 * 1024 };

export function collect(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!name.endsWith('.map')) out.push(p);
    }
  };
  walk(dir);
  return out.map((p) => ({ name: relative(dir, p).split('\\').join('/'), path: p }));
}

/** Problems that would break the itch.io player. `html` is index.html's text. */
export function checkItch(files, html) {
  const problems = [];
  if (!files.some((f) => f.name === 'index.html')) problems.push('index.html must be at the zip root');
  if (files.length > ITCH_LIMITS.maxFiles) problems.push(`${files.length} files; itch.io allows ${ITCH_LIMITS.maxFiles}`);
  for (const f of files) if (f.size > ITCH_LIMITS.maxFileBytes) problems.push(`${f.name} is larger than 200 MB`);
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const url = m[1];
    if (url.startsWith('/') && !url.startsWith('//')) problems.push(`index.html uses a root-relative URL (${url}); itch serves games from a subfolder`);
  }
  return problems;
}

/** Bakes a default query (e.g. preset) into index.html so the exported build boots one game. */
export function withDefaultQuery(html, query) {
  const script = `<script>if(!location.search)history.replaceState(null,'','?${query.replace(/'/g, '')}'+location.hash)</script>`;
  return html.replace('<script type="module"', `${script}\n    <script type="module"`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--build')) {
    const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const dist = resolve(root, 'dist');
  if (!existsSync(resolve(dist, 'index.html'))) { console.error('export:itch: no dist/index.html; run npm run build (or pass --build)'); process.exit(1); }
  const files = collect(dist).map((f) => ({ ...f, data: readFileSync(f.path) })).map((f) => ({ ...f, size: f.data.length }));
  const index = files.find((f) => f.name === 'index.html');
  let html = index.data.toString('utf8');
  const preset = opt('preset');
  if (preset) { html = withDefaultQuery(html, `preset=${encodeURIComponent(preset).replace(/%2F/g, '/')}`); index.data = Buffer.from(html); }
  const problems = checkItch(files, html);
  if (problems.length) { for (const p of problems) console.error(`  ✗ ${p}`); process.exit(1); }
  const out = resolve(root, opt('out') ?? '.export/bulkhead-itch.zip');
  mkdirSync(dirname(out), { recursive: true });
  const zip = createZip(files.map((f) => ({ name: f.name, data: f.data })));
  writeFileSync(out, zip);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`export:itch OK -> ${relative(root, out)} (${files.length} files, ${mb(files.reduce((n, f) => n + f.size, 0))} MB unpacked, ${mb(zip.length)} MB zipped)${preset ? `, boots ${preset}` : ''}`);
  console.log('Upload it as an HTML game on itch.io (Kind of project: HTML; check "This file will be played in the browser"); viewport 1280x720 works well.');
}
