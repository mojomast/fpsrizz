#!/usr/bin/env node
/**
 * Agent-friendly GameGraph CLI. The semantic model and compiler live in src/app/game-graph.ts; this script only
 * loads/writes JSON and exposes small, deterministic edit operations.
 *
 * Catalog metadata comes from docs/reuse-index.json so agents can operate without booting a browser. The generated
 * index includes manifests, role registrations and owner plugin ids. Run `npm run index-reuse` after adding plugins.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addPluginNode, autoLayout, compileGraph, graphToPreset, normalizeGraph, presetToGraph,
  removePluginNode, selectRoleProvider, setGraphOption, setPluginConfig,
} from '../src/app/game-graph.ts';

const root = resolve(import.meta.dirname, '..');
const index = JSON.parse(readFileSync(resolve(root, 'docs/reuse-index.json'), 'utf8'));
const entries = Array.isArray(index.entries) ? index.entries.filter(entry => entry.type === 'plugin') : [];
const byId = new Map(entries.map(entry => [entry.id, entry]));

function manifestOf(entry) {
  const providers = {};
  for (const registration of entry.registrations ?? []) {
    if (typeof registration.kind !== 'string' || !registration.kind.startsWith('role:')) continue;
    const role = registration.kind.slice(5);
    (providers[role] ??= []).push(registration.id);
  }
  return {
    manifest: {
      schema: 1, id: entry.id, name: entry.name ?? entry.id, version: entry.version ?? '1.0.0',
      kind: 'code', sdk: entry.sdk ?? '^2.0.0', description: entry.summary ?? entry.useWhen ?? '',
      dependencies: entry.dependencies ?? {}, optionalDependencies: entry.optionalDependencies ?? {},
      conflicts: entry.conflicts ?? [], capabilities: [], requiresRoles: entry.requiresRoles ?? [],
      roleDependencies: entry.roleDependencies ?? [], config: entry.config ?? {},
    },
    providers,
  };
}
const catalog = entries.map(manifestOf);

function readJson(path) {
  try { return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')); }
  catch (error) { throw new Error(`Could not read JSON "${path}": ${error instanceof Error ? error.message : String(error)}`); }
}
function writeJson(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (!path) process.stdout.write(text);
  else writeFileSync(resolve(process.cwd(), path), text);
}
function parsePair(text, flag) {
  const index = text.indexOf('=');
  if (index <= 0) throw new Error(`${flag} expects KEY=VALUE`);
  return [text.slice(0, index), text.slice(index + 1)];
}
function parseValue(text) {
  try { return JSON.parse(text); } catch { return text; }
}
function usage() {
  process.stdout.write(`Game graph CLI

Usage:
  npm run graph -- from-preset <preset.json> [--out graph.json]
  npm run graph -- to-preset <graph.json> [--out preset.json]
  npm run graph -- validate <graph.json>
  npm run graph -- layout <graph.json> [--out graph.json]
  npm run graph -- edit <graph.json> [--out graph.json] [operations]
  npm run graph -- plugins

Edit operations (repeatable):
  --add-plugin <id>
  --remove-plugin <id>
  --role <role=provider>          Select provider from an enabled owner.
  --option <key=json>             Set/replace a preset option.
  --config <plugin.key=json>      Set/replace typed plugin config.
  --seed <integer>
  --id <namespaced-id>
  --name <name>

Graphs use stable ids and never require layout coordinates. The CLI compiles and validates structurally; run
\`npm run validate-game -- <compiled-preset.json>\` for full host staging.
`);
}
function requireGraph(args) {
  const path = args[0];
  if (!path) throw new Error('expected a graph file');
  const graph = readJson(path);
  if (!graph || typeof graph !== 'object' || graph.schema !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    throw new Error('input is not a schema 1 GameGraph');
  return { path, graph };
}
function summary(result) {
  if (!result.ok) {
    for (const issue of result.issues) process.stderr.write(`${issue.source} · ${issue.path} · ${issue.message}\n`);
    return false;
  }
  return true;
}
function main(args) {
  const command = args[0];
  const rest = args.slice(1);
  if (!command || command === 'help' || command === '--help') { usage(); return; }
  if (command === 'plugins') {
    for (const entry of entries.sort((a, b) => a.id < b.id ? -1 : 1)) process.stdout.write(`${entry.id}\t${entry.name ?? ''}\n`);
    return;
  }
  if (command === 'from-preset') {
    const path = rest[0]; if (!path) throw new Error('expected a preset file');
    const out = rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : undefined;
    const preset = readJson(path);
    const graph = autoLayout(presetToGraph(preset, catalog));
    writeJson(out, graph);
    return;
  }
  if (command === 'to-preset') {
    const path = rest[0]; if (!path) throw new Error('expected a graph file');
    const out = rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : undefined;
    const graph = readJson(path);
    const result = compileGraph(graph, catalog);
    if (!summary(result)) process.exitCode = 1;
    if (result.ok && result.preset) writeJson(out, result.preset);
    return;
  }
  if (command === 'validate') {
    const path = rest[0]; if (!path) throw new Error('expected a graph file');
    const result = compileGraph(readJson(path), catalog);
    if (result.ok) process.stdout.write(`valid · ${result.preset.plugins.length} plugins · ${Object.keys(result.preset.roles).length} role selections\n`);
    else { summary(result); process.exitCode = 1; }
    return;
  }
  if (command === 'layout') {
    const path = rest[0]; if (!path) throw new Error('expected a graph file');
    const out = rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : undefined;
    writeJson(out, autoLayout(readJson(path)));
    return;
  }
  if (command === 'edit') {
    const path = rest[0]; if (!path) throw new Error('expected a graph file');
    let graph = normalizeGraph(readJson(path));
    const out = rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : undefined;
    for (let i = 1; i < rest.length; i++) {
      const flag = rest[i];
      if (flag === '--out') { i++; continue; }
      if (flag === '--add-plugin') { const id = rest[++i]; if (!byId.has(id)) throw new Error(`unknown plugin "${id}"`); graph = addPluginNode(graph, id); }
      else if (flag === '--remove-plugin') graph = removePluginNode(graph, rest[++i]);
      else if (flag === '--role') {
        const [role, provider] = parsePair(rest[++i], flag);
        const owner = entries.find(entry => (entry.registrations ?? []).some(r => r.kind === `role:${role}` && r.id === provider))?.id;
        if (!owner) throw new Error(`no installed plugin offers provider "${provider}" for role "${role}"`);
        graph = selectRoleProvider(graph, role, provider, owner);
      } else if (flag === '--option') { const [key, value] = parsePair(rest[++i], flag); graph = setGraphOption(graph, key, parseValue(value)); }
      else if (flag === '--config') {
        const [key, value] = parsePair(rest[++i], flag);
        const split = key.lastIndexOf('.');
        if (split <= 0) throw new Error('--config expects plugin.key=json');
        graph = setPluginConfig(graph, key.slice(0, split), key.slice(split + 1), parseValue(value));
      } else if (flag === '--seed') graph = { ...graph, seed: Number(rest[++i]) };
      else if (flag === '--id') graph = { ...graph, id: rest[++i] };
      else if (flag === '--name') graph = { ...graph, name: rest[++i] };
      else throw new Error(`unknown edit flag "${flag}"`);
    }
    graph = autoLayout(graph);
    const result = compileGraph(graph, catalog);
    if (!summary(result)) process.exitCode = 1;
    writeJson(out, graph);
    return;
  }
  throw new Error(`unknown command "${command}"`);
}

try { main(process.argv.slice(2)); }
catch (error) { process.stderr.write(`game-graph: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
