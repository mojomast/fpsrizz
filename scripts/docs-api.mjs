#!/usr/bin/env node
// Generates the SDK API reference from TSDoc comments with TypeDoc -> docs/reference/api/ (not committed).
// Usage: npm run docs:api [-- --json docs/reference/api.json]
// TypeDoc needs the TypeScript 5 compiler API, which the repo's TypeScript 7 (native) toolchain does not ship, so it
// runs from an isolated install: TYPEDOC_DIR=<dir containing node_modules/typedoc> or, by default, `npx` with pinned
// versions (network on first use). Game-family contracts (games/*/contracts/*.ts) are documented as extra entries.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertNodeVersion } from './check-node.mjs';

assertNodeVersion();
const root = resolve(import.meta.dirname, '..');
const TYPEDOC = '0.28.20', TYPESCRIPT = '5.9.3';
const families = existsSync(resolve(root, 'games')) ? readdirSync(resolve(root, 'games')).sort().flatMap((f) => {
  const dir = resolve(root, 'games', f, 'contracts');
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.ts')).sort().map((n) => `games/${f}/contracts/${n}`) : [];
}) : [];
const extra = process.argv.slice(2);
const typedocArgs = ['--options', 'typedoc.json', '--entryPoints', 'packages/sdk/src/index.ts', '--entryPoints', 'packages/sdk/src/render.ts',
  ...families.flatMap((f) => ['--entryPoints', f]), ...extra];
const dir = process.env.TYPEDOC_DIR;
const r = dir
  ? spawnSync(process.execPath, [resolve(dir, 'node_modules/typedoc/bin/typedoc'), ...typedocArgs], { cwd: root, stdio: 'inherit' })
  : spawnSync('npx', ['--yes', '-p', `typedoc@${TYPEDOC}`, '-p', `typescript@${TYPESCRIPT}`, 'typedoc', ...typedocArgs], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) { console.error('docs:api failed'); process.exit(r.status ?? 1); }
console.log('API reference -> docs/reference/api/index.html');
