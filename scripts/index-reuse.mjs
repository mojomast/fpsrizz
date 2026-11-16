#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReuseIndex, indexFiles, renderIndex } from './reuse-lib.mjs';
import { root } from './tools.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--check')) throw new Error('Usage: npm run index-reuse -- [--check]');
  const index = await buildReuseIndex();
  const providers = {};
  for (const entry of index.entries) {
    if (entry.type !== 'plugin') continue;
    for (const registration of entry.registrations ?? []) {
      if (typeof registration.kind !== 'string' || !registration.kind.startsWith('role:')) continue;
      const role = registration.kind.slice(5);
      const bucket = providers[entry.id] ??= {};
      const list = bucket[role] ??= [];
      if (!list.includes(registration.id)) list.push(registration.id);
    }
  }
  for (const roles of Object.values(providers)) for (const role of Object.keys(roles)) roles[role].sort();
  const sortedProviders = Object.fromEntries(Object.keys(providers).sort().map(id => [id, Object.fromEntries(Object.keys(providers[id]).sort().map(role => [role, providers[id][role]]))]));
  const maps = {};
  for (const entry of index.entries) {
    if (entry.type !== 'plugin') continue;
    for (const registration of entry.registrations ?? []) {
      if (registration.kind !== 'map') continue;
      const list = maps[entry.id] ??= [];
      if (!list.some(item => item.id === registration.id)) list.push({ id: registration.id, name: registration.description ?? registration.id });
    }
  }
  for (const list of Object.values(maps)) list.sort((a, b) => a.id.localeCompare(b.id));
  const sortedMaps = Object.fromEntries(Object.keys(maps).sort().map(id => [id, maps[id]]));
  const providerText = JSON.stringify({ schema: 1, providers: sortedProviders, maps: sortedMaps }, null, 2) + '\n';
  const outputs = [[indexFiles.json, JSON.stringify(index, null, 2) + '\n'], [indexFiles.markdown, renderIndex(index)], ['src/app/catalog-providers.json', providerText]];
  for (const [file, text] of outputs) {
    if (args[0] === '--check') {
      if (!existsSync(resolve(root, file)) || readFileSync(resolve(root, file), 'utf8') !== text) throw new Error(`${file} is stale. Review relevant reuse.json metadata, then run npm run index-reuse.`);
    } else writeFileSync(resolve(root, file), text);
  }
  console.log(`Reuse index ${args[0] === '--check' ? 'current' : 'generated'}: ${index.entries.filter(item => item.type === 'plugin').length} plugins, ${index.entries.filter(item => item.type === 'contract').length} SDK values, ${index.entries.filter(item => item.type === 'recipe').length} recipes.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
