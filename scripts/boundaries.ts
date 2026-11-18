// Architecture boundary checker. Run: node scripts/boundaries.ts
// Pure `checkSource` + filesystem-backed `checkRepo`.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Violation = { file: string; line: number; specifier: string; rule: string; message: string };

type Ref = { specifier: string; line: number };
type Tok = { kind: 'id' | 'str' | 'punct'; text: string; line: number };

const SDK_INDEX = 'src/sdk/index.ts';
const SDK_RENDER = 'src/sdk/render.ts';
/**
 * npm packages an engine or game plugin may import directly, each gated by a manifest capability. Keep this list
 * short: wrap a package in one std plugin and expose it through an SDK service instead of importing it everywhere.
 */
export const VENDOR_PACKAGES: readonly { pkg: string; capability: string }[] = [
  { pkg: '@dimforge/rapier3d-compat', capability: 'physics' },
];

// ---------------------------------------------------------------- tokenizer

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const isIdStart = (c: string) => /[A-Za-z_$\u0080-￿]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_$\u0080-￿]/.test(c);

  // Skips a template literal body starting after the opening backtick; returns raw text.
  function template(): string {
    let text = '';
    while (i < n) {
      const c = src[i]!;
      if (c === '\\') { text += c + (src[i + 1] ?? ''); if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '`') { i++; return text; }
      if (c === '$' && src[i + 1] === '{') {
        i += 2;
        let depth = 1;
        while (i < n && depth > 0) {
          const d = src[i]!;
          if (d === '\n') { line++; i++; }
          else if (d === '{') { depth++; i++; }
          else if (d === '}') { depth--; i++; }
          else if (d === "'" || d === '"') { quoted(d); }
          else if (d === '`') { i++; template(); }
          else if (d === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; }
          else if (d === '/' && src[i + 1] === '*') { i = blockEnd(i); }
          else i++;
        }
        continue;
      }
      if (c === '\n') line++;
      text += c;
      i++;
    }
    return text;
  }
  function quoted(q: string): string {
    i++;
    let text = '';
    while (i < n) {
      const c = src[i]!;
      if (c === '\\') { text += c + (src[i + 1] ?? ''); if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === q) { i++; return text; }
      if (c === '\n') break; // unterminated; recover at line end
      text += c;
      i++;
    }
    return text;
  }
  function blockEnd(from: number): number {
    let j = from + 2;
    while (j < n && !(src[j] === '*' && src[j + 1] === '/')) { if (src[j] === '\n') line++; j++; }
    return Math.min(n, j + 2);
  }

  while (i < n) {
    const c = src[i]!;
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = blockEnd(i); continue; }
    if (c === '"' || c === "'") { const l = line; toks.push({ kind: 'str', text: quoted(c), line: l }); continue; }
    if (c === '`') { const l = line; i++; toks.push({ kind: 'str', text: template(), line: l }); continue; }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isId(src[j]!)) j++;
      toks.push({ kind: 'id', text: src.slice(i, j), line });
      i = j;
      continue;
    }
    toks.push({ kind: 'punct', text: c, line });
    i++;
  }
  return toks;
}

// ---------------------------------------------------------------- specifier extraction

function extractRefs(toks: Tok[]): Ref[] {
  const refs: Ref[] = [];
  const isP = (t: Tok | undefined, s: string) => t?.kind === 'punct' && t.text === s;
  const isId = (t: Tok | undefined, s: string) => t?.kind === 'id' && t.text === s;

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.kind !== 'id' || (t.text !== 'import' && t.text !== 'export')) continue;
    if (isP(toks[k - 1], '.')) continue; // property access, e.g. foo.import

    if (t.text === 'import') {
      const next = toks[k + 1];
      if (isP(next, '.')) continue; // import.meta
      if (isP(next, '(')) {
        const arg = toks[k + 2];
        if (arg?.kind === 'str') refs.push({ specifier: arg.text, line: arg.line });
        continue;
      }
      if (next?.kind === 'str') { refs.push({ specifier: next.text, line: next.line }); continue; }
      // import clause ... from '...'
      for (let j = k + 1; j < toks.length; j++) {
        const u = toks[j]!;
        if (isP(u, ';')) break;
        if (isId(u, 'from') && toks[j + 1]?.kind === 'str') {
          refs.push({ specifier: toks[j + 1]!.text, line: toks[j + 1]!.line });
          break;
        }
      }
      continue;
    }

    // export
    let j = k + 1;
    if (isId(toks[j], 'type')) j++;
    if (isP(toks[j], '*')) {
      for (; j < toks.length; j++) {
        if (isP(toks[j], ';')) break;
        if (isId(toks[j], 'from') && toks[j + 1]?.kind === 'str') {
          refs.push({ specifier: toks[j + 1]!.text, line: toks[j + 1]!.line });
          break;
        }
      }
    } else if (isP(toks[j], '{')) {
      while (j < toks.length && !isP(toks[j], '}')) j++;
      if (isId(toks[j + 1], 'from') && toks[j + 2]?.kind === 'str') {
        refs.push({ specifier: toks[j + 2]!.text, line: toks[j + 2]!.line });
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------- paths

function normalizePosix(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.push('..'); // keep unresolved escapes visible
    else out.push(seg);
  }
  // collapse a/../ pairs
  const res: string[] = [];
  for (const s of out) {
    if (s === '..' && res.length > 0 && res[res.length - 1] !== '..') res.pop();
    else res.push(s);
  }
  return res.join('/');
}

function resolveSpecifier(fromFile: string, spec: string): { bare: boolean; path: string } {
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
    const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
    return { bare: false, path: normalizePosix(`${dir}/${spec}`) };
  }
  if (spec.startsWith('/')) return { bare: false, path: normalizePosix(spec.slice(1)) };
  return { bare: true, path: spec };
}

function relFrom(fromFile: string, target: string): string {
  const from = fromFile.split('/').slice(0, -1);
  const to = target.split('/');
  let c = 0;
  while (c < from.length && c < to.length - 1 && from[c] === to[c]) c++;
  const up = from.length - c;
  const rel = [...Array(up).fill('..'), ...to.slice(c)].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

const under = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);

// ---------------------------------------------------------------- rules

export function checkSource(relPath: string, source: string, opts: { capabilities?: string[] } = {}): Violation[] {
  const file = relPath.replace(/\\/g, '/');
  const out: Violation[] = [];
  const toks = tokenize(source);
  const add = (line: number, specifier: string, rule: string, message: string) =>
    out.push({ file, line, specifier, rule, message });

  // Engine plugins live in src/plugins/<name>/; game plugins in games/<family>/plugins/<name>/.
  const pluginMatch = /^(?:src\/plugins|games\/[^/]+\/plugins)\/([^/]+)\//.exec(file);
  const pluginDir = pluginMatch ? file.slice(0, pluginMatch[0].length - 1) : '';
  const familyMatch = /^games\/([^/]+)\//.exec(file);
  const familyContracts = familyMatch ? `games/${familyMatch[1]}/contracts` : '';
  const inFamilyContracts = familyContracts !== '' && under(file, familyContracts);
  const inKernel = under(file, 'src/kernel');
  const inSdk = under(file, 'src/sdk');
  const inPlatform = under(file, 'src/platform');

  if (inKernel) {
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k]!;
      if (t.kind === 'id' && (t.text === 'document' || t.text === 'window') && toks[k + 1]?.text === '.' && toks[k - 1]?.text !== '.') {
        add(t.line, t.text, 'no-dom-in-kernel', `The kernel must not touch the DOM (\`${t.text}.\`); keep browser access in src/platform.`);
      }
    }
  }

  const refs = extractRefs(toks);
  for (const { specifier, line } of refs) {
    const { bare, path } = resolveSpecifier(file, specifier);

    if (pluginMatch) {
      const own = pluginDir;
      if (!bare && under(path, own)) continue;
      if (!bare && path === SDK_INDEX) continue;
      if (bare) {
        const vendor = VENDOR_PACKAGES.find((v) => specifier === v.pkg || specifier.startsWith(`${v.pkg}/`));
        if (vendor) {
          if (!(opts.capabilities ?? []).includes(vendor.capability)) {
            add(line, specifier, 'vendor-package',
              `Plugin "${pluginMatch[1]}" imports "${specifier}" but its manifest.json does not list "${vendor.capability}" in "capabilities".`);
          }
          continue;
        }
      }
      if (!bare && familyContracts && under(path, familyContracts)) continue;
      if (!bare && path === SDK_RENDER) {
        if (!(opts.capabilities ?? []).includes('render')) {
          add(line, specifier, 'render-capability',
            `Plugin "${pluginMatch[1]}" imports the rendering SDK but its manifest.json does not list "render" in "capabilities".`);
        }
        continue;
      }
      add(line, specifier, 'plugin-isolation',
        `Plugins may only import their own folder, the SDK entry point (${relFrom(file, SDK_INDEX)})` +
        `${familyContracts ? `, their family's contracts (${familyContracts}/)` : ''} or, with the "render" capability, ${relFrom(file, SDK_RENDER)}. ` +
        `Import "${specifier}" from the SDK entry point instead.`);
    } else if (inFamilyContracts) {
      if (bare || !(path === SDK_INDEX || under(path, familyContracts))) {
        add(line, specifier, 'family-contracts',
          `Game contracts may only import the SDK entry point (${relFrom(file, SDK_INDEX)}) and other contracts of the same family; "${specifier}" is not allowed.`);
      }
    } else if (inKernel) {
      if (bare || !under(path, 'src/kernel')) {
        add(line, specifier, 'kernel-purity', `src/kernel may only import other src/kernel files; "${specifier}" is not allowed.`);
      }
    } else if (inSdk) {
      const ok =
        !bare &&
        (under(path, 'src/sdk') ||
          under(path, 'src/kernel') ||
          (file === SDK_RENDER && under(path, 'src/platform/render/mini3')));
      if (!ok) {
        const hint = !bare && under(path, 'src/platform/render/mini3') ? ' Only src/sdk/render.ts may import the mini3 renderer.' : '';
        add(line, specifier, 'sdk-surface', `src/sdk may only import src/sdk and src/kernel; "${specifier}" is not allowed.${hint}`);
      }
    } else if (inPlatform) {
      const ok = !bare && (under(path, 'src/platform') || under(path, 'src/kernel') || under(path, 'src/sdk'));
      if (!ok) {
        add(line, specifier, 'platform-layer', `src/platform may only import src/platform, src/kernel and src/sdk; "${specifier}" is not allowed (never plugins or app).`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- repo walk

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) acc.push(full);
  }
}

export function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const top of ['src', 'games']) {
    const dir = resolve(root, top);
    if (existsSync(dir)) walk(dir, files);
  }
  const prefix = resolve(root).replace(/\\/g, '/') + '/';
  return files.map((f) => f.replace(/\\/g, '/').replace(prefix, '')).sort();
}

function readCapabilities(root: string, pluginDir: string): string[] {
  const p = join(root, pluginDir, 'manifest.json');
  if (!existsSync(p)) return [];
  try {
    const m = JSON.parse(readFileSync(p, 'utf8')) as { capabilities?: unknown };
    return Array.isArray(m.capabilities) ? m.capabilities.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

export function checkRepo(root: string): Violation[] {
  const out: Violation[] = [];
  for (const rel of listSourceFiles(root)) {
    const m = /^(?:src\/plugins|games\/[^/]+\/plugins)\/[^/]+\//.exec(rel);
    const capabilities = m ? readCapabilities(root, m[0].slice(0, -1)) : [];
    out.push(...checkSource(rel, readFileSync(join(root, rel), 'utf8'), { capabilities }));
  }
  return out;
}

// ---------------------------------------------------------------- CLI

const argv1 = process.argv[1];
if (argv1 && resolve(argv1) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const violations = checkRepo(root);
  if (violations.length > 0) {
    for (const v of violations) console.error(`${v.file}:${v.line}  [${v.rule}]  ${v.message}`);
    console.error(`\n${violations.length} boundary violation(s).`);
    process.exit(1);
  }
  console.log(`boundaries OK (${listSourceFiles(root).length} source files checked)`);
}
