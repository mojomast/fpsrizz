#!/usr/bin/env node
// Moves files (git mv) according to a JSON plan and rewrites every reference to them across the repository:
// relative import specifiers in code, relative links in Markdown (inline, reference-style and HTML src/href), and
// repo-relative path mentions in any text file (docs, JSON metadata such as reuse.json, comments, script strings).
// Usage: node scripts/move-paths.mjs plan.json [--dry-run]
//   plan.json: { "moves": { "OLD/PATH.md": "NEW/path.md", "old/dir/": "new/dir/" } }   (a trailing / moves a folder)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'dist', '.dev', '.smoke', '.sourcemaps', '.build', '.git', 'public', 'assets', 'vendor', '.tools']);
const TEXT = /\.(ts|mts|mjs|cjs|js|json|md|py|yml|yaml|txt|html)$/;
const CODE = /\.(ts|mts|mjs|cjs|js)$/;

function walk(dir) {
  const abs = resolve(root, dir || '.');
  return readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    if (SKIP.has(d.name)) return [];
    const p = dir ? `${dir}/${d.name}` : d.name;
    return d.isDirectory() ? walk(p) : [p];
  });
}

export function planMoves(plan) {
  const files = new Map();
  const dirs = [];
  for (const [from, to] of Object.entries(plan.moves)) {
    if (from.endsWith('/')) {
      const a = from.slice(0, -1), b = to.replace(/\/$/, '');
      if (!existsSync(resolve(root, a))) throw new Error(`missing folder ${a}`);
      dirs.push([a, b]);
      for (const f of walk(a)) files.set(f, b + f.slice(a.length));
    } else {
      if (!existsSync(resolve(root, from))) throw new Error(`missing file ${from}`);
      files.set(from, to);
    }
  }
  return { files, dirs };
}

export function applyPlan(plan, { dry = false } = {}) {
  const { files: moves, dirs } = planMoves(plan);
  const mapPath = (p) => {
    if (moves.has(p)) return moves.get(p);
    for (const [a, b] of dirs) if (p === a || p.startsWith(`${a}/`)) return b + p.slice(a.length);
    return p;
  };
  const rel = (fromFile, target) => {
    const r = posix.relative(posix.dirname(fromFile), target) || posix.basename(target);
    return r.startsWith('.') || r.startsWith('/') ? r : `./${r}`;
  };
  const relMd = (fromFile, target) => posix.relative(posix.dirname(fromFile), target) || posix.basename(target);
  const resolveFrom = (file, spec) => posix.normalize(posix.join(posix.dirname(file), spec));
  const isExternal = (t) => /^([a-z][a-z0-9+.-]*:|#|\/|\{)/i.test(t);

  const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\bnew URL\(\s*|\bexport\s+\*\s+from\s*)(['"])(\.{1,2}\/[^'"]*)\2/g;
  const MDLINK = /(\]\()(<?)([^)\s>]+)(>?)((?:\s+"[^"]*")?\))/g;
  const MDREF = /^(\s*\[[^\]]+\]:\s*)(\S+)/gm;
  const HTMLATTR = /(\b(?:src|href)=)(["'])([^"']+)\2/g;
  // Longest first so a folder move does not pre-empt a file move inside it.
  const pairs = [...dirs, ...[...moves].filter(([a]) => !dirs.some(([d]) => a.startsWith(`${d}/`)))].sort((x, y) => y[0].length - x[0].length);

  const changed = new Map();
  for (const file of walk('').filter((f) => TEXT.test(f))) {
    let text = readFileSync(resolve(root, file), 'utf8');
    const original = text;
    const newFile = mapPath(file);
    const relink = (target, md) => {
      const [path, anchor = ''] = target.split(/(?=#)/);
      if (!path || isExternal(path)) return target;
      const abs = resolveFrom(file, decodeURI(path));
      const moved = mapPath(abs);
      if (moved === abs && newFile === file) return target;
      if (!existsSync(resolve(root, abs)) && moved === abs) return target; // unknown target; leave as is
      return (md ? relMd(newFile, moved) : rel(newFile, moved)) + anchor;
    };
    if (CODE.test(file)) text = text.replace(SPEC, (all, lead, q, spec) => `${lead}${q}${relink(spec, false)}${q}`);
    if (file.endsWith('.md') || file.endsWith('.html')) {
      text = text.replace(MDLINK, (all, open, lt, target, gt, close) => `${open}${lt}${relink(target, true)}${gt}${close}`);
      text = text.replace(MDREF, (all, lead, target) => `${lead}${relink(target, true)}`);
      text = text.replace(HTMLATTR, (all, lead, q, target) => `${lead}${q}${relink(target, true)}${q}`);
    }
    // Repo-relative mentions (not part of a longer path) in prose, metadata and strings.
    for (const [a, b] of pairs) {
      const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`(^|[^A-Za-z0-9_./-])${esc}(?![A-Za-z0-9_-])`, 'gm'), (_m, pre) => `${pre}${b}`);
    }
    if (text !== original || newFile !== file) changed.set(file, text);
  }
  if (dry) return { moves, changed };
  for (const [from, to] of moves) {
    mkdirSync(dirname(resolve(root, to)), { recursive: true });
    const tracked = execFileSync('git', ['ls-files', '--', from], { cwd: root, encoding: 'utf8' }).trim();
    if (tracked) execFileSync('git', ['mv', from, to], { cwd: root });
    else writeFileSync(resolve(root, to), readFileSync(resolve(root, from)));
  }
  for (const [file, text] of changed) writeFileSync(resolve(root, mapPath(file)), text);
  return { moves, changed };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(root, 'scripts/move-paths.mjs')) {
  const planFile = process.argv[2];
  if (!planFile) { console.error('usage: node scripts/move-paths.mjs plan.json [--dry-run]'); process.exit(2); }
  const dry = process.argv.includes('--dry-run');
  const { moves, changed } = applyPlan(JSON.parse(readFileSync(planFile, 'utf8')), { dry });
  console.log(`${moves.size} files ${dry ? 'would move' : 'moved'}; ${changed.size} files ${dry ? 'would change' : 'changed'}.`);
  if (dry) for (const [a, b] of moves) console.log(`  ${a} -> ${b}`);
}
