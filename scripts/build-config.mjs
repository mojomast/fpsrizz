// Shared production esbuild options (used by scripts/build.mjs and scripts/bundle-budget.mjs).
import { resolve } from 'node:path';
import { root } from './tools.mjs';

export function productionOptions({ entry = resolve(root, process.env.ENTRY ?? 'src/app/main.ts'), outdir = resolve(root, 'dist/assets') } = {}) {
  return {
    entryPoints: { main: entry },
    outdir,
    bundle: true,
    // Every plugin's `load: () => import(...)` becomes its own chunk; shared code is hoisted into common chunks.
    splitting: true,
    format: 'esm',
    minify: true,
    // Content-hashed names: an updated deploy never reuses a stale cached chunk.
    entryNames: '[name]-[hash]',
    chunkNames: 'chunk-[hash]',
    assetNames: '[name]-[hash]',
    // Maps are written but not referenced from the JS; scripts/build.mjs moves them out of dist/.
    sourcemap: 'external',
    metafile: true,
    target: 'es2022',
    define: { __DEV__: 'false' },
    logLevel: 'warning',
  };
}

/** The output file for the `main` entry point in an esbuild metafile (path relative to the repo root). */
export function entryOutput(metafile) {
  // Lazily imported modules also carry `entryPoint`; the real entry is the one named by `entryPoints: { main }`.
  const hit = Object.entries(metafile.outputs).find(([p, o]) => o.entryPoint && /(^|\/)main-[^/]+\.js$/.test(p));
  if (!hit) throw new Error('esbuild metafile has no entry output');
  return hit[0];
}
