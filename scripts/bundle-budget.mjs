#!/usr/bin/env node
// Bundle-size budget for the production build. `npm run budget` builds in memory (nothing is written) and fails when a
// limit is exceeded; scripts/build.mjs applies the same check to every real build. Raise a limit only on purpose.
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { resolveTool, root } from './tools.mjs';
import { productionOptions, entryOutput } from './build-config.mjs';

const KiB = 1024;
/** Limits in bytes (minified, not gzipped, unless noted). */
export const BUDGET = {
  /** The entry chunk plus the chunks it imports statically: what every visitor downloads before any game loads. */
  initialJs: 1200 * KiB,
  /** Any single JS file (today: the vendored three.js chunk). Inlined art or a whole game in one chunk trips this. */
  largestChunk: 800 * KiB,
  /** Every JS file together (all games). */
  totalJs: 2200 * KiB,
};

/** Static-import closure of the entry output. */
function initialFiles(metafile) {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const imp of metafile.outputs[path]?.imports ?? []) if (imp.kind === 'import-statement') visit(imp.path);
  };
  visit(entryOutput(metafile));
  return [...seen];
}

export function checkBudget(metafile, contents) {
  const js = Object.entries(metafile.outputs).filter(([p]) => p.endsWith('.js'));
  const size = (p) => metafile.outputs[p].bytes;
  const initial = initialFiles(metafile);
  const initialJs = initial.reduce((n, p) => n + size(p), 0);
  const [largestPath, largest] = js.reduce((best, [p, o]) => (o.bytes > best[1] ? [p, o.bytes] : best), ['', 0]);
  const totalJs = js.reduce((n, [, o]) => n + o.bytes, 0);
  const initialGzip = contents ? initial.reduce((n, p) => n + gzipSync(contents.get(p) ?? new Uint8Array()).length, 0) : undefined;
  const rows = [
    ['initial JS (entry + static imports)', initialJs, BUDGET.initialJs],
    [`largest chunk (${largestPath.split('/').pop()})`, largest, BUDGET.largestChunk],
    [`total JS (${js.length} files)`, totalJs, BUDGET.totalJs],
  ];
  return { ok: rows.every(([, v, max]) => v <= max), rows, initialGzip, initialFiles: initial.length };
}

export function formatReport(b) {
  const kib = (n) => `${(n / KiB).toFixed(1)} KiB`;
  const lines = ['Bundle budget:'];
  for (const [name, v, max] of b.rows) lines.push(`  ${v <= max ? 'ok  ' : 'OVER'} ${name.padEnd(44)} ${kib(v).padStart(12)} / ${kib(max)}`);
  if (b.initialGzip !== undefined) lines.push(`       initial JS gzipped (${b.initialFiles} files)${' '.repeat(14)}${kib(b.initialGzip).padStart(12)}`);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(root, 'scripts/bundle-budget.mjs')) {
  const esbuild = resolveTool('esbuild');
  const result = await esbuild.build({ ...productionOptions(), write: false, sourcemap: false });
  const contents = new Map(result.outputFiles.map((f) => [f.path.slice(root.length + 1), f.contents]));
  const b = checkBudget(result.metafile, contents);
  console.log(formatReport(b));
  if (!b.ok) { console.error('Bundle-size budget exceeded.'); process.exit(1); }
}
