#!/usr/bin/env node
// create-bulkhead: `npm create bulkhead <name> -- --template fps` once published.
// Until the engine ships as npm packages (roadmap P0.2), games live inside an engine checkout, so this wrapper
// finds the checkout (cwd upwards, or --engine <dir>) and calls its scaffolder. Without one it prints how to get it.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const findEngine = (start) => {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(resolve(dir, 'scripts/scaffold-lib.mjs'))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
};
const engine = opt('engine') ? resolve(opt('engine')) : findEngine(process.cwd());
if (!engine || !existsSync(resolve(engine, 'scripts/scaffold-lib.mjs'))) {
  console.error(`create-bulkhead: no Bulkhead engine checkout found.
  git clone https://github.com/mojomast/fpsrizz && cd fpsrizz && npm ci
  then run: npx create-bulkhead <name> --template <template>   (or npm run bulkhead -- create ...)`);
  process.exit(1);
}
const { TEMPLATES } = await import(pathToFileURL(resolve(engine, 'scripts/scaffold-lib.mjs')).href);
if (!args.length || args.includes('--help')) {
  console.log(`Usage: create-bulkhead <name> [--template ${Object.keys(TEMPLATES).join('|')}] [--title "Title"] [--engine <dir>]`);
  process.exit(args.length ? 0 : 1);
}
const pass = args.filter((a, i) => a !== '--engine' && args[i - 1] !== '--engine');
const r = spawnSync(process.execPath, [resolve(engine, 'scripts/bulkhead.mjs'), 'create', ...pass], { stdio: 'inherit', cwd: engine });
process.exit(r.status ?? 1);
