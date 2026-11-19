#!/usr/bin/env node
// @bulkhead/tools: the `bulkhead` command (create, templates, new plugin, add, validate, graph) for any folder inside
// an engine checkout. The implementations still live in the repository's scripts/ (they share helpers with build, dev
// and check); this bin finds the checkout and forwards to scripts/bulkhead.mjs.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

let dir = resolve(process.cwd());
while (!existsSync(resolve(dir, 'scripts/bulkhead.mjs'))) {
  if (dirname(dir) === dir) { console.error('bulkhead: run this inside a Bulkhead engine checkout (or use npm create bulkhead).'); process.exit(1); }
  dir = dirname(dir);
}
const r = spawnSync(process.execPath, [resolve(dir, 'scripts/bulkhead.mjs'), ...process.argv.slice(2)], { stdio: 'inherit', cwd: dir });
process.exit(r.status ?? 1);
