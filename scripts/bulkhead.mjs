#!/usr/bin/env node
// The Bulkhead CLI (P2.3): one entry point for the authoring scripts.
//   npm run bulkhead -- create <name> [--template blank|platformer|topdown|fps|puzzle|cards] [--title "My Game"]
//   npm run bulkhead -- new plugin <namespace/name> ["Display Name"]
//   npm run bulkhead -- add <mechanic-plugin-id> --preset <preset.json>
//   npm run bulkhead -- validate <preset.json | --bundled> [--pack <pack.json> ...]
//   npm run bulkhead -- graph <graph args...>
//   npm run bulkhead -- templates
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './tools.mjs';
import { TEMPLATES, scaffoldGame } from './scaffold-lib.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const run = (script, args) => { const r = spawnSync(process.execPath, [resolve(root, 'scripts', script), ...args], { stdio: 'inherit', cwd: root }); process.exit(r.status ?? 1); };
const help = `Usage: npm run bulkhead -- <command>
  create <name> [--template ${Object.keys(TEMPLATES).join('|')}] [--title "Title"]   new game in games/<name>
  new plugin <namespace/name> ["Display Name"]                         new shared plugin in src/plugins
  add <plugin-id> --preset <preset.json>                               enable a plugin (e.g. a mechanic) in a preset
  validate <preset.json | --bundled> [--pack <pack.json> ...]          resolve and activate presets headlessly
  graph ...                                                            GameGraph CLI (see npm run graph -- --help)
  templates                                                            list game templates`;

try {
  switch (cmd) {
    case 'create': {
      const name = rest.find((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1]?.startsWith('--')));
      if (!name) throw new Error('create needs a game name');
      const template = flag('template') ?? 'blank';
      const files = scaffoldGame({ engineRoot: root, name, template, title: flag('title') });
      spawnSync(process.execPath, [resolve(root, 'scripts/gen-catalog.mjs')], { stdio: 'inherit', cwd: root });
      console.log(`Created games/${name} from the "${template}" template:\n  ${files.join('\n  ')}\n
Next:
  npm run dev                      then open http://localhost:8000/?preset=${name}/default
  node --test games/${name}/tests/*.test.ts  headless tests for the new game
  read games/${name}/AGENTS.md      conventions for agents working on it`);
      break;
    }
    case 'templates':
      for (const [k, v] of Object.entries(TEMPLATES)) console.log(`${k.padEnd(11)} ${v}`);
      break;
    case 'new':
      if (rest[0] !== 'plugin') throw new Error('usage: bulkhead new plugin <namespace/name>');
      run('new-plugin.mjs', rest.slice(1));
      break;
    case 'add': {
      const id = rest[0], presetPath = flag('preset');
      if (!id || !presetPath) throw new Error('usage: bulkhead add <plugin-id> --preset <preset.json>');
      const abs = resolve(process.cwd(), presetPath);
      const preset = JSON.parse(readFileSync(abs, 'utf8'));
      if (preset.plugins.includes(id)) { console.log(`${id} is already enabled in ${presetPath}`); break; }
      preset.plugins.push(id);
      writeFileSync(abs, `${JSON.stringify(preset, null, 2)}\n`);
      console.log(`Enabled ${id} in ${presetPath}. Checking that the preset still resolves...`);
      run('validate-game.mjs', [abs]);
      break;
    }
    case 'validate': run('validate-game.mjs', rest); break;
    case 'graph': run('game-graph.mjs', rest); break;
    case undefined: case '--help': case '-h': console.log(help); break;
    default: throw new Error(`unknown command "${cmd}"\n${help}`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
