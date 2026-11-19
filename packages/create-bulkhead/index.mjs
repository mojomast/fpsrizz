#!/usr/bin/env node
// create-bulkhead: `npm create bulkhead@latest <name> -- --template fps`.
// Inside an engine checkout (cwd upwards, or --engine <dir>) it scaffolds games/<name>/ with that checkout's own
// scaffolder. Anywhere else it clones the engine into ./<name> (git, shallow), installs it, and scaffolds the game
// there, so the result runs immediately with `npm run dev`. Once the @bulkhead/* packages are published, a
// standalone-repo mode can replace the clone (templates already import the engine as `@bulkhead/sdk`).
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ENGINE_REPO = 'https://github.com/mojomast/fpsrizz.git';
/** The engine release this version of create-bulkhead clones by default, so scaffolds are reproducible. */
export const ENGINE_REF = 'v0.1.0';
export const TEMPLATE_NAMES = ['blank', 'platformer', 'topdown', 'fps', 'puzzle', 'cards'];
const NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function parseArgs(argv) {
  const o = { name: undefined, template: 'blank', title: undefined, engine: undefined, ref: ENGINE_REF, install: true, dryRun: false, help: false, repo: ENGINE_REPO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
    if (a === '--template' || a === '-t') o.template = val();
    else if (a === '--title') o.title = val();
    else if (a === '--engine') o.engine = val();
    else if (a === '--ref') o.ref = val();
    else if (a === '--repo') o.repo = val();
    else if (a === '--no-install') o.install = false;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else if (!o.name) o.name = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (o.help) return o;
  if (!o.name) throw new Error('missing <name>');
  if (!NAME.test(o.name)) throw new Error(`name "${o.name}" must be lowercase letters, digits and "-"`);
  if (!TEMPLATE_NAMES.includes(o.template)) throw new Error(`unknown template "${o.template}"; choose one of: ${TEMPLATE_NAMES.join(', ')}`);
  return o;
}

export function findEngine(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (existsSync(resolve(dir, 'scripts/scaffold-lib.mjs')) && existsSync(resolve(dir, 'templates/games'))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

/** The commands create-bulkhead runs, as data (so --dry-run and tests can inspect them). */
export function plan(o, cwd) {
  const engine = o.engine ? resolve(o.engine) : findEngine(cwd);
  const create = ['scripts/bulkhead.mjs', 'create', o.name, '--template', o.template, ...(o.title ? ['--title', o.title] : [])];
  if (engine) return { mode: 'checkout', engine, steps: [{ cmd: 'node', args: create, cwd: engine }] };
  const dest = resolve(cwd, o.name);
  if (existsSync(dest)) throw new Error(`${dest} already exists`);
  const steps = [{ cmd: 'git', args: ['clone', '--depth', '1', ...(o.ref ? ['--branch', o.ref] : []), o.repo, dest], cwd }];
  if (o.install) steps.push({ cmd: 'npm', args: ['ci', '--no-audit', '--no-fund'], cwd: dest });
  steps.push({ cmd: 'node', args: create, cwd: dest });
  return { mode: 'clone', engine: dest, steps };
}

const usage = `Usage: npm create bulkhead@latest <name> -- [--template ${TEMPLATE_NAMES.join('|')}] [--title "Title"]
       [--engine <checkout>] [--ref <git ref, default ${ENGINE_REF}>] [--no-install] [--dry-run]
Inside an engine checkout: adds games/<name>/. Elsewhere: clones the engine into ./<name>, installs it, adds the game.`;

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`create-bulkhead: ${e.message}\n${usage}`); return 1; }
  if (o.help) { console.log(usage); return 0; }
  let p;
  try { p = plan(o, process.cwd()); } catch (e) { console.error(`create-bulkhead: ${e.message}`); return 1; }
  if (o.dryRun) { console.log(JSON.stringify(p, null, 2)); return 0; }
  for (const s of p.steps) {
    const r = spawnSync(s.cmd === 'node' ? process.execPath : s.cmd, s.args, { stdio: 'inherit', cwd: s.cwd, shell: process.platform === 'win32' && s.cmd === 'npm' });
    if (r.status !== 0) { console.error(`create-bulkhead: "${s.cmd} ${s.args.join(' ')}" failed`); return r.status ?? 1; }
  }
  console.log(`\nNext: cd ${p.mode === 'clone' ? o.name : p.engine} && npm run dev, then open /?preset=${o.name}/default`);
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(await main());
