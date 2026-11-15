// Production build -> dist/.  ENTRY env overrides the entry point (default src/app/main.ts).
import { rmSync, mkdirSync, cpSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { resolveTool, root } from './tools.mjs';

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
  cpSync(resolve(root, 'index.html'), resolve(dist, 'index.html'));
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
