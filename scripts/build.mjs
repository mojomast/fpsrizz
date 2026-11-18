// Production build -> dist/.  ENTRY env overrides the entry point (default src/app/main.ts).
import { rmSync, mkdirSync, cpSync, existsSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, relative } from 'node:path';
import { resolveTool, root } from './tools.mjs';
import { generate as generateCatalog } from './gen-catalog.mjs';

const esbuild = resolveTool('esbuild');
const entry = resolve(root, process.env.ENTRY ?? 'src/app/main.ts');
const dist = resolve(root, 'dist');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

try {
  if (!existsSync(entry)) throw new Error(`Entry point not found: ${relative(root, entry)}`);
  generateCatalog();
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(resolve(dist, 'assets'), { recursive: true });
  await esbuild.build({
    entryPoints: [entry],
    outfile: resolve(dist, 'assets/main.js'),
    bundle: true,
    format: 'esm',
    minify: true,
    sourcemap: true,
    target: 'es2022',
    define: { __DEV__: 'false' },
    logLevel: 'warning',
  });
  // GitHub Pages caches assets at stable URLs. A content-derived query keeps an updated HTML document from
  // reusing an older JavaScript bundle while preserving the same output paths for local tools and source maps.
  const hash = createHash('sha256').update(readFileSync(resolve(dist, 'assets/main.js'))).digest('hex').slice(0, 16);
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const entryUrl = './assets/main.js';
  if (!html.includes(`src="${entryUrl}"`)) throw new Error('index.html is missing the expected JavaScript entry');
  writeFileSync(resolve(dist, 'index.html'), html.replace(`src="${entryUrl}"`, `src="${entryUrl}?v=${hash}"`));
  if (existsSync(resolve(root, 'public'))) cpSync(resolve(root, 'public'), dist, { recursive: true });
  for (const f of walk(dist).sort()) {
    const kb = statSync(f).size / 1024;
    console.log(`  ${relative(root, f).padEnd(32)} ${kb.toFixed(1).padStart(9)} KiB`);
  }
  console.log('Build OK -> dist/');
} catch (e) {
  console.error(`Build failed: ${e?.message ?? e}`);
  process.exit(1);
}
