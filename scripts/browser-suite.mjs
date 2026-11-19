#!/usr/bin/env node
// Runs the browser acceptance suites one after another (never in parallel: SwiftShader is CPU-heavy).
// Usage: node scripts/browser-suite.mjs [--all] [name ...]
//   default   the CI set: the smoke test plus one demo per game family and the engine adapters
//   --all     every suite, including the ones listed as known-failing below
//   --retries N  rerun a failing suite up to N times (CI uses 1: SwiftShader timing on shared runners is noisy)
// Expects `npm run build` to have produced dist/ (the dev-reload demo starts its own dev server).
import { spawnSync } from 'node:child_process';
import { root } from './tools.mjs';

/** [name, script, args]. Order is cheapest first so failures show up early. */
export const SUITES = [
  ['smoke', 'scripts/smoke.mjs'],
  ['dev-reload', 'tests/dev-reload-demo/run.mjs'],
  ['render-three', 'tests/render-three-demo/run.mjs'],
  ['mini3', 'tests/mini3-demo/run.cjs'],
  ['platform', 'tests/platform-demo/run.cjs'],
  ['shell', 'tests/shell-demo/run.cjs'],
  ['hud', 'games/shooter/tests/hud-demo/run.cjs'],
  ['presentation', 'games/shooter/tests/presentation-demo/run.cjs'],
  ['composer', 'tests/composer-demo/run.mjs'],
  ['creator', 'tests/creator-demo/run.mjs'],
  ['genre', 'games/shooter/tests/genre-demo/run.mjs'],
  ['hollowmere', 'games/hollowmere/tests/hollowmere-demo/run.mjs'],
  ['cinder', 'games/cinder/tests/cinder-demo/run.mjs'],
  ['stonewake', 'games/puzzles/tests/stonewake-demo/run.mjs'],
  ['salt-ledger', 'games/expeditions/tests/salt-ledger-demo/run.mjs'],
  ['silt-archive', 'games/expeditions/tests/silt-archive-demo/run.mjs'],
  ['common-ground', 'games/expeditions/tests/common-ground-demo/run.mjs'],
  ['sandbox', 'games/sandbox/tests/sandbox-demo/run.mjs'],
  ['inspector', 'tests/inspector-demo/run.mjs'],
  ['reusable-games', 'tests/reusable-games-demo/run.mjs'],
  ['portfolio-qol', 'tests/portfolio-qol-demo/run.mjs'],
];

/** Suites that fail on main today; run with --all or by name. Fix them, then move them into SUITES. */
export const KNOWN_FAILING = [
  // Asserts zero DOM mutations in an idle 1.5 s window; the visor HUD currently writes ~18 times.
  ['ext-hud', 'games/shooter/tests/ext-hud/run.mjs'],
  // Tactics step intermittently times out clicking a cell that re-renders under the pointer.
  ['experience', 'tests/experience-demo/run.mjs'],
];

const args = process.argv.slice(2);
const all = args.includes('--all');
const ri = args.indexOf('--retries');
const retries = ri >= 0 ? Number(args[ri + 1]) : 0;
if (ri >= 0) args.splice(ri, 2);
const names = args.filter((a) => !a.startsWith('--'));
const pool = [...SUITES, ...KNOWN_FAILING];
const selected = names.length ? pool.filter(([n]) => names.includes(n)) : all ? pool : SUITES;
if (names.length && selected.length !== names.length) {
  console.error(`Unknown suite. Known: ${pool.map(([n]) => n).join(', ')}`);
  process.exit(2);
}

const results = [];
for (const [name, script, extra = []] of selected) {
  const t0 = Date.now();
  console.log(`\n=== ${name} (${script})`);
  let r, attempt = 0;
  for (;;) {
    r = spawnSync(process.execPath, [script, ...extra], { cwd: root, stdio: 'inherit', timeout: 10 * 60_000 });
    if (r.status === 0 || attempt >= retries) break;
    attempt++;
    console.log(`--- ${name} failed; retry ${attempt}/${retries}`);
  }
  results.push({ name, ok: r.status === 0, retried: attempt, s: ((Date.now() - t0) / 1000).toFixed(1) });
}
console.log('\nBrowser suites:');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(16)} ${r.s}s${r.retried ? ` (after ${r.retried} retr${r.retried > 1 ? 'ies' : 'y'})` : ''}`);
const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(`${failed.length} suite(s) failed: ${failed.map((r) => r.name).join(', ')}`);
  process.exit(1);
}
