#!/usr/bin/env node
// Moves plugins, their game-specific SDK contracts, presets and unit tests into games/<family>/ and rewrites every
// reference: relative imports, Markdown links, repo-relative paths in text (via scripts/move-paths.mjs), and SDK
// entry-point imports of the moved contract symbols.
// Usage: node scripts/move-to-game.mjs <family> [--plugins a,b] [--contracts x,y] [--presets p,q] [--tests t,u] [--dry-run]
//   --contracts  names in src/sdk/contracts/ (without .ts) -> games/<family>/contracts/<name>.ts
//   --presets    names in src/content/presets/ (without .json) -> games/<family>/presets/<name>.json
//   --tests      names in tests/ (without .test.ts) -> games/<family>/tests/<name>.test.ts
// Run `npm run gen-catalog && npm run index-reuse && npm run check` afterwards.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { applyPlan } from './move-paths.mjs';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const family = args[0];
if (!family || family.startsWith('--') || !/^[a-z0-9-]+$/.test(family)) {
  console.error('usage: node scripts/move-to-game.mjs <family> [--plugins a,b] [--contracts x] [--presets p] [--tests t] [--dry-run]');
  process.exit(2);
}
const list = (flag) => { const i = args.indexOf(flag); return i > 0 && args[i + 1] ? args[i + 1].split(',').filter(Boolean) : []; };
const dry = args.includes('--dry-run');
const game = `games/${family}`;
const SKIP = new Set(['node_modules', 'dist', '.dev', '.smoke', '.sourcemaps', '.build', '.git', 'public', 'assets', 'vendor', '.tools']);
function walk(dir) {
  return readdirSync(resolve(root, dir || '.'), { withFileTypes: true }).flatMap((d) => {
    if (SKIP.has(d.name)) return [];
    const p = dir ? `${dir}/${d.name}` : d.name;
    return d.isDirectory() ? walk(p) : [p];
  });
}

// ---- 1. plan ------------------------------------------------------------------------------------------------------
const moves = {};
for (const p of list('--plugins')) moves[`src/plugins/${p}/`] = `${game}/plugins/${p}/`;
const contractNames = list('--contracts');
for (const c of contractNames) moves[`src/sdk/contracts/${c}.ts`] = `${game}/contracts/${c}.ts`;
for (const p of list('--presets')) moves[`src/content/presets/${p}.json`] = `${game}/presets/${p}.json`;
for (const t of list('--tests')) moves[`tests/${t}.test.ts`] = `${game}/tests/${t}.test.ts`;

// Contract symbols that leave the SDK entry point.
const contractExports = new Map(); // symbol -> new contract path
for (const c of contractNames) {
  const src = readFileSync(resolve(root, `src/sdk/contracts/${c}.ts`), 'utf8');
  for (const m of src.matchAll(/^export (?:declare )?(?:const|let|function|class|interface|type|enum|abstract class) ([A-Za-z0-9_$]+)/gm)) contractExports.set(m[1], `${game}/contracts/${c}.ts`);
  for (const m of src.matchAll(/^export \{([^}]*)\}/gm)) for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/).pop(); if (name) contractExports.set(name.replace(/^type\s+/, ''), `${game}/contracts/${c}.ts`); }
}

// ---- 2. move files and rewrite paths ------------------------------------------------------------------------------
const { moves: moved, changed } = applyPlan({ moves }, { dry });
console.log(`${moved.size} files ${dry ? 'would move' : 'moved'} to ${game}/; ${changed.size} files ${dry ? 'would change' : 'changed'}.`);
if (dry) {
  for (const [a, b] of moved) console.log(`  mv ${a} -> ${b}`);
  process.exit(0);
}

// ---- 3. contract-specific rewrites -------------------------------------------------------------------------------
const rel = (fromFile, target) => { let r = posix.relative(posix.dirname(fromFile), target); if (!r.startsWith('.')) r = `./${r}`; return r; };

function splitSdkImports(file, text) {
  return text.replace(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"])([^'"]*?sdk\/index\.ts)\3;?[ \t]*$/gm, (all, typeKw, names, q, spec) => {
    const keep = [], byTarget = new Map();
    for (const raw of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      const base = raw.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      const to = contractExports.get(base);
      if (to) { if (!byTarget.has(to)) byTarget.set(to, []); byTarget.get(to).push(raw); } else keep.push(raw);
    }
    if (!byTarget.size) return all;
    const kw = typeKw ? 'type ' : '';
    const out = [];
    if (keep.length) out.push(`import ${kw}{ ${keep.join(', ')} } from ${q}${spec}${q};`);
    for (const [to, ns] of byTarget) out.push(`import ${kw}{ ${ns.join(', ')} } from ${q}${rel(file, to)}${q};`);
    return out.join('\n');
  });
}

// Family contracts see the SDK only through its entry point.
const sdkInternalsToIndex = (file, text) =>
  text.replace(/(\bfrom\s*)(['"])([^'"]*?src\/sdk\/(?!index\.ts)[^'"]*)\2/g, (_all, lead, q) => `${lead}${q}${rel(file, 'src/sdk/index.ts')}${q}`);

for (const file of walk('').filter((f) => /\.(ts|mts|mjs|cjs|js)$/.test(f))) {
  const abs = resolve(root, file);
  const original = readFileSync(abs, 'utf8');
  let text = original;
  if (contractExports.size) text = splitSdkImports(file, text);
  if (file.startsWith(`${game}/contracts/`)) text = sdkInternalsToIndex(file, text);
  // The SDK entry point stops re-exporting moved contracts (its specifier was already rewritten in step 2).
  if (file === 'src/sdk/index.ts') for (const c of contractNames) text = text.replace(new RegExp(`^export \\* from '[^']*games/${family}/contracts/${c}\\.ts';\\n`, 'm'), '');
  if (text !== original) writeFileSync(abs, text);
}
console.log('Done. Next: npm run gen-catalog && npm run index-reuse && npm run check');
