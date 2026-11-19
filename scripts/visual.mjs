#!/usr/bin/env node
// P3.3: visual regression and cross-browser tests (Playwright toHaveScreenshot).
//   npm run test:visual                        chromium against tests/visual/__screenshots__/
//   npm run test:visual -- --project=firefox   or webkit (needs: npx playwright install --with-deps firefox webkit)
//   npm run test:visual -- --update-snapshots  rewrite the goldens after an intended visual change
// Scaffolds every genre template into games/zz-visual-<template>/ (gitignored), builds the app with them into
// .build/visual-dist/, removes the scaffolds again (restoring the generated catalog), then runs Playwright.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './tools.mjs';
import { TEMPLATES, scaffoldGame } from './scaffold-lib.mjs';
import { generate as generateCatalog } from './gen-catalog.mjs';

export const VISUAL_PREFIX = 'zz-visual-';
const games = resolve(root, 'games');
const cleanup = () => {
  for (const d of readdirSync(games)) if (d.startsWith(VISUAL_PREFIX)) rmSync(resolve(games, d), { recursive: true, force: true });
};
cleanup();
let built;
try {
  for (const t of Object.keys(TEMPLATES)) {
    if (existsSync(resolve(root, 'templates/games', t, 'plugins/game/index.ts'))) scaffoldGame({ engineRoot: root, name: `${VISUAL_PREFIX}${t}`, template: t, title: `Visual ${t}` });
  }
  built = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, DIST_DIR: '.build/visual-dist' } });
  // The scaffolded presets are not built-in presets; the spec applies them from this file.
  const presets = Object.fromEntries(readdirSync(games).filter((d) => d.startsWith(VISUAL_PREFIX)).map((d) => [d.slice(VISUAL_PREFIX.length), JSON.parse(readFileSync(resolve(games, d, 'presets/default.json'), 'utf8'))]));
  mkdirSync(resolve(root, '.build/visual-dist'), { recursive: true });
  writeFileSync(resolve(root, '.build/visual-dist/visual-presets.json'), JSON.stringify(presets));
} finally {
  cleanup();
  generateCatalog();
}
if (built?.status !== 0) process.exit(built?.status ?? 1);
const cli = resolve(root, 'node_modules/@playwright/test/cli.js');
const r = spawnSync(process.execPath, [cli, 'test', '-c', 'tests/visual/playwright.config.mjs', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
