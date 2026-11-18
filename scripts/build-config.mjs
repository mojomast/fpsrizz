// Shared production esbuild options (used by scripts/build.mjs and scripts/bundle-budget.mjs).
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './tools.mjs';

/** The vendored official Three.js runtime the app renders with (src/platform/render/mini3/vendor). */
export const VENDORED_THREE = resolve(root, 'src/platform/render/mini3/vendor/three.module.js');

/**
 * Three.js addons (three/examples/jsm: GLTFLoader, KTX2Loader...) import the bare "three" package. Resolve it to the
 * vendored runtime so the bundle contains exactly one copy of Three.js and addon objects pass instanceof checks.
 */
export const threeDedupe = {
  name: 'three-dedupe',
  setup(build) {
    build.onResolve({ filter: /^three$/ }, () => ({ path: VENDORED_THREE }));
  },
};

/** Copies runtime files that come from npm packages (Basis transcoder for KTX2) into a site folder. */
export function copyVendorStatic(siteRoot) {
  const basis = resolve(root, 'node_modules/three/examples/jsm/libs/basis');
  if (!existsSync(basis)) throw new Error('three/examples/jsm/libs/basis is missing; run npm ci');
  mkdirSync(resolve(siteRoot, 'vendor/basis'), { recursive: true });
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) cpSync(resolve(basis, f), resolve(siteRoot, 'vendor/basis', f));
}

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
    plugins: [threeDedupe],
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
