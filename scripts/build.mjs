// Production build -> dist/.  ENTRY env overrides the entry point (default src/app/main.ts).
// Code is split per plugin into content-hashed chunks. Source maps go to .sourcemaps/ (not deployed); set
// KEEP_SOURCEMAPS=1 to keep them next to the chunks instead. The esbuild metafile is written to .build/meta.json.
import { rmSync, mkdirSync, cpSync, existsSync, statSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join, relative, basename } from 'node:path';
import { resolveTool, root } from './tools.mjs';
import { generate as generateCatalog } from './gen-catalog.mjs';
import { productionOptions, entryOutput } from './build-config.mjs';
import { checkBudget, formatReport } from './bundle-budget.mjs';

const esbuild = resolveTool('esbuild');
const entry = resolve(root, process.env.ENTRY ?? 'src/app/main.ts');
const dist = resolve(root, 'dist');
const maps = resolve(root, '.sourcemaps');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

try {
  if (!existsSync(entry)) throw new Error(`Entry point not found: ${relative(root, entry)}`);
  generateCatalog();
  rmSync(dist, { recursive: true, force: true });
  rmSync(maps, { recursive: true, force: true });
  mkdirSync(resolve(dist, 'assets'), { recursive: true });
  const result = await esbuild.build(productionOptions({ entry }));
  mkdirSync(resolve(root, '.build'), { recursive: true });
  writeFileSync(resolve(root, '.build/meta.json'), JSON.stringify(result.metafile));
  const main = entryOutput(result.metafile);
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const entryUrl = './assets/main.js';
  if (!html.includes(`src="${entryUrl}"`)) throw new Error('index.html is missing the expected JavaScript entry');
  // The entry and every chunk have content-hashed names, so GitHub Pages caches can never serve a stale bundle.
  writeFileSync(resolve(dist, 'index.html'), html.replace(`src="${entryUrl}"`, `src="./assets/${basename(main)}"`));
  if (existsSync(resolve(root, 'public'))) cpSync(resolve(root, 'public'), dist, { recursive: true });
  if (!process.env.KEEP_SOURCEMAPS) {
    mkdirSync(maps, { recursive: true });
    for (const f of walk(resolve(dist, 'assets')).filter((f) => f.endsWith('.map'))) renameSync(f, resolve(maps, basename(f)));
  }
  const files = walk(dist).sort();
  const big = files.filter((f) => statSync(f).size >= 64 * 1024 || !f.includes(`${join('dist', 'assets')}/chunk-`));
  for (const f of big) {
    const kb = statSync(f).size / 1024;
    console.log(`  ${relative(root, f).padEnd(56)} ${kb.toFixed(1).padStart(9)} KiB`);
  }
  const chunks = files.filter((f) => f.endsWith('.js'));
  console.log(`  (${chunks.length} JS files, ${files.length - big.length} small chunks not listed)`);
  const budget = checkBudget(result.metafile);
  console.log(formatReport(budget));
  if (!budget.ok) throw new Error('bundle-size budget exceeded (see above); raise it in scripts/bundle-budget.mjs only on purpose');
  console.log('Build OK -> dist/');
} catch (e) {
  console.error(`Build failed: ${e?.message ?? e}`);
  process.exit(1);
}
