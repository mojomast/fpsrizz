// Architecture boundary checker. Run: node scripts/boundaries.ts
// Pure `checkSource` + filesystem-backed `checkRepo`.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Violation = { file: string; line: number; specifier: string; rule: string; message: string };

type Ref = { specifier: string; line: number };
type Tok = { kind: 'id' | 'str' | 'punct'; text: string; line: number };

const SDK_INDEX = 'packages/sdk/src/index.ts';
const SDK_RENDER = 'packages/sdk/src/render.ts';
/**
 * npm packages an engine or game plugin may import directly, each gated by a manifest capability. Keep this list
 * short: wrap a package in one std plugin and expose it through an SDK service instead of importing it everywhere.
 */
export const VENDOR_PACKAGES: readonly { pkg: string; capability: string }[] = [
  { pkg: '@dimforge/rapier3d-compat', capability: 'physics' },
  { pkg: 'recast-navigation', capability: 'navmesh' },
  // Official Three.js addons (loaders, decoders). The build resolves their bare "three" import to the vendored runtime.
  { pkg: 'three/examples/jsm', capability: 'render' },
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

/** Workspace packages: `@bulkhead/<name>[/<rest>]` resolves to `packages/<name>/<dir>/<rest>` (index.ts for the root). */
export const WORKSPACE_PACKAGES: Readonly<Record<string, { dir: string; index?: string }>> = {
  kernel: { dir: 'packages/kernel/src' },
  sdk: { dir: 'packages/sdk/src', index: 'index.ts' },
  'platform-web': { dir: 'packages/platform-web/src' },
  std: { dir: 'packages/std/plugins' },
};

function resolveSpecifier(fromFile: string, spec: string): { bare: boolean; path: string } {
  const ws = /^@bulkhead\/([a-z-]+)(?:\/(.*))?$/.exec(spec);
  if (ws && WORKSPACE_PACKAGES[ws[1]!]) {
    const pkg = WORKSPACE_PACKAGES[ws[1]!]!;
    const rest = ws[2] ?? pkg.index;
    if (rest) return { bare: false, path: normalizePosix(`${pkg.dir}/${rest}`) };
  }
  if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') {
    const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
    return { bare: false, path: normalizePosix(`${dir}/${spec}`) };
  }
  if (spec.startsWith('/')) return { bare: false, path: normalizePosix(spec.slice(1)) };
  return { bare: true, path: spec };
}

const under = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);

// ---------------------------------------------------------------- rules

export function checkSource(relPath: string, source: string, opts: { capabilities?: string[]; uses?: string[] } = {}): Violation[] {
  const file = relPath.replace(/\\/g, '/');
  const out: Violation[] = [];
  const toks = tokenize(source);
  const add = (line: number, specifier: string, rule: string, message: string) =>
    out.push({ file, line, specifier, rule, message });

  // Engine plugins live in packages/std/plugins/<name>/; game plugins in games/<family>/plugins/<name>/.
  const pluginMatch = /^(?:packages\/std\/plugins|games\/[^/]+\/plugins)\/([^/]+)\//.exec(file);
  const pluginDir = pluginMatch ? file.slice(0, pluginMatch[0].length - 1) : '';
  const familyMatch = /^games\/([^/]+)\//.exec(file);
  const familyContracts = familyMatch ? `games/${familyMatch[1]}/contracts` : '';
  const inFamilyContracts = familyContracts !== '' && under(file, familyContracts);
  // Contracts of other families this family declares in games/<family>/family.json "uses".
  const usedContracts = familyMatch ? (opts.uses ?? []).map((u) => `games/${u}/contracts`) : [];
  const inUsedContracts = (path: string) => usedContracts.some((d) => under(path, d));
  const inKernel = under(file, 'packages/kernel/src');
  const inSdk = under(file, 'packages/sdk/src');
  const inPlatform = under(file, 'packages/platform-web/src');

  if (inKernel) {
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k]!;
      if (t.kind === 'id' && (t.text === 'document' || t.text === 'window') && toks[k + 1]?.text === '.' && toks[k - 1]?.text !== '.') {
        add(t.line, t.text, 'no-dom-in-kernel', `The kernel must not touch the DOM (\`${t.text}.\`); keep browser access in packages/platform-web/src.`);
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
      if (!bare && familyContracts && (under(path, familyContracts) || inUsedContracts(path))) continue;
      if (!bare && path === SDK_RENDER) {
        if (!(opts.capabilities ?? []).includes('render')) {
          add(line, specifier, 'render-capability',
            `Plugin "${pluginMatch[1]}" imports the rendering SDK but its manifest.json does not list "render" in "capabilities".`);
        }
        continue;
      }
      add(line, specifier, 'plugin-isolation',
        `Plugins may only import their own folder, the SDK entry point ('@bulkhead/sdk')` +
        `${familyContracts ? `, their family's contracts (${familyContracts}/), contracts of families listed in games/${familyMatch![1]}/family.json "uses"` : ''} or, with the "render" capability, '@bulkhead/sdk/render.ts'. ` +
        `Import "${specifier}" from the SDK entry point instead.`);
    } else if (inFamilyContracts) {
      if (bare || !(path === SDK_INDEX || under(path, familyContracts) || inUsedContracts(path))) {
        add(line, specifier, 'family-contracts',
          `Game contracts may only import the SDK entry point ('@bulkhead/sdk') and other contracts of the same family; "${specifier}" is not allowed.`);
      }
    } else if (inKernel) {
      if (bare || !under(path, 'packages/kernel/src')) {
        add(line, specifier, 'kernel-purity', `packages/kernel/src may only import other packages/kernel/src files; "${specifier}" is not allowed.`);
      }
    } else if (inSdk) {
      const ok =
        !bare &&
        (under(path, 'packages/sdk/src') ||
          under(path, 'packages/kernel/src') ||
          (file === SDK_RENDER && under(path, 'packages/platform-web/src/render/mini3')));
      if (!ok) {
        const hint = !bare && under(path, 'packages/platform-web/src/render/mini3') ? ' Only packages/sdk/src/render.ts may import the mini3 renderer.' : '';
        add(line, specifier, 'sdk-surface', `packages/sdk/src may only import packages/sdk/src and packages/kernel/src; "${specifier}" is not allowed.${hint}`);
      }
    } else if (inPlatform) {
      const ok = !bare && (under(path, 'packages/platform-web/src') || under(path, 'packages/kernel/src') || under(path, 'packages/sdk/src'));
      if (!ok) {
        add(line, specifier, 'platform-layer', `packages/platform-web/src may only import packages/platform-web/src, packages/kernel/src and packages/sdk/src; "${specifier}" is not allowed (never plugins or app).`);
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
  for (const top of ['src', 'packages', 'games']) {
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

function readUses(root: string, family: string): string[] {
  const p = join(root, 'games', family, 'family.json');
  if (!existsSync(p)) return [];
  try {
    const f = JSON.parse(readFileSync(p, 'utf8')) as { uses?: unknown };
    return Array.isArray(f.uses) ? f.uses.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export function checkRepo(root: string): Violation[] {
  const out: Violation[] = [];
  for (const rel of listSourceFiles(root)) {
    const m = /^(?:packages\/std\/plugins|games\/[^/]+\/plugins)\/[^/]+\//.exec(rel);
    const capabilities = m ? readCapabilities(root, m[0].slice(0, -1)) : [];
    const fam = /^games\/([^/]+)\//.exec(rel);
    const uses = fam ? readUses(root, fam[1]!) : [];
    out.push(...checkSource(rel, readFileSync(join(root, rel), 'utf8'), { capabilities, uses }));
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
