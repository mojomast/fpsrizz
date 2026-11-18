#!/usr/bin/env node
// Moves plugins, their game-specific SDK contracts, presets and unit tests into games/<family>/ and rewrites every
// reference (relative imports, repo-relative paths in text, SDK imports of moved contract symbols).
// Usage: node scripts/move-to-game.mjs <family> [--plugins a,b] [--contracts x,y] [--presets p,q] [--tests t,u] [--dry-run]
//   --contracts  names in src/sdk/contracts/ (without .ts) -> games/<family>/contracts/<name>.ts
//   --presets    names in src/content/presets/ (without .json) -> games/<family>/presets/<name>.json
//   --tests      names in tests/ (without .test.ts) -> games/<family>/tests/<name>.test.ts
// Run `npm run gen-catalog && npm run index-reuse && npm run check` afterwards.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

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
const SKIP = new Set(['node_modules', 'dist', '.dev', '.smoke', '.sourcemaps', '.build', '.git', 'public', 'assets', 'vendor']);

function walk(dir) {
  const abs = resolve(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    if (SKIP.has(d.name)) return [];
    const p = dir ? `${dir}/${d.name}` : d.name;
    return d.isDirectory() ? walk(p) : [p];
  });
}

// ---- 1. move map ------------------------------------------------------------------------------------------------
const moves = new Map(); // old repo path -> new repo path (files)
const dirMoves = []; // [oldDir, newDir]
for (const p of list('--plugins')) {
  const from = `src/plugins/${p}`;
  if (!existsSync(resolve(root, from))) throw new Error(`no plugin folder ${from}`);
  dirMoves.push([from, `${game}/plugins/${p}`]);
  for (const f of walk(from)) moves.set(f, `${game}/plugins/${p}${f.slice(from.length)}`);
}
const contractNames = list('--contracts');
for (const c of contractNames) moves.set(`src/sdk/contracts/${c}.ts`, `${game}/contracts/${c}.ts`);
for (const p of list('--presets')) moves.set(`src/content/presets/${p}.json`, `${game}/presets/${p}.json`);
for (const t of list('--tests')) moves.set(`tests/${t}.test.ts`, `${game}/tests/${t}.test.ts`);
for (const from of moves.keys()) if (!existsSync(resolve(root, from))) throw new Error(`missing ${from}`);

const mapPath = (p) => {
  if (moves.has(p)) return moves.get(p);
  for (const [a, b] of dirMoves) if (p === a || p.startsWith(`${a}/`)) return b + p.slice(a.length);
  return p;
};

// Contract symbols that leave the SDK entry point.
const contractExports = new Map(); // symbol -> new contract path
for (const c of contractNames) {
  const src = readFileSync(resolve(root, `src/sdk/contracts/${c}.ts`), 'utf8');
  for (const m of src.matchAll(/^export (?:declare )?(?:const|let|function|class|interface|type|enum|abstract class) ([A-Za-z0-9_$]+)/gm)) contractExports.set(m[1], `${game}/contracts/${c}.ts`);
  for (const m of src.matchAll(/^export \{([^}]*)\}/gm)) for (const n of m[1].split(',')) { const name = n.trim().split(/\s+as\s+/).pop(); if (name) contractExports.set(name.replace(/^type\s+/, ''), `${game}/contracts/${c}.ts`); }
}

// ---- 2. rewrite references ----------------------------------------------------------------------------------------
const rel = (fromFile, target) => { let r = posix.relative(posix.dirname(fromFile), target); if (!r.startsWith('.')) r = `./${r}`; return r; };
const CODE = /\.(ts|mts|mjs|cjs|js)$/;
const TEXT = /\.(ts|mts|mjs|cjs|js|json|md|py|yml|yaml)$/;
const files = walk('').filter((f) => TEXT.test(f) && !f.startsWith('games/') || (f.startsWith('games/') && TEXT.test(f)));
const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bnew URL\(\s*|\bexport\s+\*\s+from\s*)(['"])(\.{1,2}\/[^'"]*)\2/g;
const pathPairs = [
  ...dirMoves.map(([a, b]) => [a, b]),
  ...[...moves].filter(([a]) => !dirMoves.some(([d]) => a.startsWith(`${d}/`))),
];
const changed = new Map(); // new path -> text

for (const file of files) {
  const abs = resolve(root, file);
  let text = readFileSync(abs, 'utf8');
  const original = text;
  const newFile = mapPath(file);
  if (CODE.test(file)) {
    text = text.replace(SPEC, (all, lead, q, spec) => {
      const target = posix.normalize(posix.join(posix.dirname(file), spec));
      const moved = mapPath(target);
      if (moved === target && newFile === file) return all;
      return `${lead}${q}${rel(newFile, moved)}${q}`;
    });
  }
  // Repo-relative paths in strings, docs and metadata.
  for (const [a, b] of pathPairs) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`(^|[^A-Za-z0-9_./-])${esc}(?![A-Za-z0-9_-])`, 'gm'), (_m, pre) => `${pre}${b}`);
  }
  if (CODE.test(file) && contractExports.size) text = splitSdkImports(newFile, text);
  if (moves.has(file) && file.startsWith('src/sdk/contracts/')) text = sdkInternalsToIndex(newFile, text);
  // The SDK entry point stops re-exporting moved contracts (the specifier was already rewritten above).
  if (file === 'src/sdk/index.ts') for (const c of contractNames) text = text.replace(new RegExp(`^export \\* from '[^']*games/${family}/contracts/${c}\\.ts';\\n`, 'm'), '');
  if (text !== original || newFile !== file) changed.set(file, text);
}

function splitSdkImports(file, text) {
  return text.replace(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+(['"])([^'"]*?sdk\/index\.ts)\3;?[ \t]*$/gm, (all, typeKw, names, q, spec) => {
    const keep = [], moved = new Map();
    for (const raw of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      const base = raw.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      const to = contractExports.get(base);
      if (to) { if (!moved.has(to)) moved.set(to, []); moved.get(to).push(raw); } else keep.push(raw);
    }
    if (!moved.size) return all;
    const kw = typeKw ? 'type ' : '';
    const out = [];
    if (keep.length) out.push(`import ${kw}{ ${keep.join(', ')} } from ${q}${spec}${q};`);
    for (const [to, ns] of moved) out.push(`import ${kw}{ ${ns.join(', ')} } from ${q}${rel(file, to)}${q};`);
    return out.join('\n');
  });
}

function sdkInternalsToIndex(file, text) {
  // Family contracts see the SDK only through its entry point.
  return text.replace(/(\bfrom\s*)(['"])([^'"]*?src\/sdk\/(?!index\.ts)[^'"]*)\2/g, (_all, lead, q) => `${lead}${q}${rel(file, 'src/sdk/index.ts')}${q}`);
}

// ---- 3. apply ---------------------------------------------------------------------------------------------------
console.log(`${moves.size} files move to ${game}/; ${changed.size} files change.`);
if (dry) {
  for (const [a, b] of moves) console.log(`  mv ${a} -> ${b}`);
  process.exit(0);
}
for (const [from, to] of moves) {
  mkdirSync(dirname(resolve(root, to)), { recursive: true });
  execFileSync('git', ['mv', from, to], { cwd: root });
}
for (const [file, text] of changed) writeFileSync(resolve(root, mapPath(file)), text);
console.log('Done. Next: npm run gen-catalog && npm run index-reuse && npm run check');
