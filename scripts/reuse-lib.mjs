// Agent-facing discovery. Registration is observed in isolated stages; sessions are never activated.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalog, presets } from '../src/app/catalog.ts';
import { PluginHost } from '../src/kernel/host.ts';
import { parseManifest } from '../src/kernel/manifest.ts';
import * as sdk from '../src/sdk/index.ts';
import * as renderSdk from '../src/sdk/render.ts';
import { root } from './tools.mjs';

export const indexFiles = { json: 'docs/reuse-index.json', markdown: 'REUSE_INDEX.md' };
const scopes = ['cross-genre', 'family', 'presentation', 'content', 'unreviewed'];
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, 'en'));
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
function files(directory, accept = () => true) {
  return sorted(readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path, accept) : accept(path) ? [path] : [];
  }));
}
function fail(path, message) { throw new Error(`${path}: ${message}`); }
function pathExists(path, label) {
  if (typeof path !== 'string' || path.includes('\\') || path.startsWith('/') || path.split('/').includes('..')) fail(label, 'expected a repository-relative path');
  const absolute = resolve(root, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) fail(label, `missing file ${path}`);
}
const keys = ['schema', 'scope', 'summary', 'keywords', 'entryPoints', 'useWhen', 'limitations', 'docs', 'examples', 'tests'];
export function validateMetadata(data, label, symbols) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(label, 'expected an object');
  for (const key of Object.keys(data)) if (!keys.includes(key)) fail(`${label}.${key}`, 'unknown property');
  if (data.schema !== 1) fail(`${label}.schema`, 'expected 1');
  if (!scopes.includes(data.scope)) fail(`${label}.scope`, `expected ${scopes.join(', ')}`);
  for (const key of ['summary', 'useWhen']) if (typeof data[key] !== 'string' || !data[key].trim()) fail(`${label}.${key}`, 'expected a nonblank string');
  for (const key of ['keywords', 'entryPoints', 'limitations', 'docs', 'examples', 'tests']) {
    if (!Array.isArray(data[key]) || data[key].some(item => typeof item !== 'string' || !item.trim()) || new Set(data[key]).size !== data[key].length) fail(`${label}.${key}`, 'expected unique nonblank strings');
  }
  for (const symbol of data.entryPoints) if (!symbols.has(symbol)) fail(`${label}.entryPoints`, `unknown public SDK value ${symbol}; use the exported token/helper name`);
  for (const key of ['docs', 'examples', 'tests']) for (const path of data[key]) pathExists(path, `${label}.${key}`);
  if (data.scope === 'cross-genre' && (!data.entryPoints.length || !data.examples.length || !data.tests.length || !data.limitations.length)) fail(label, 'cross-genre claims need entry points, examples, tests and limitations');
  return data;
}

function sdkInventory() {
  const sources = files('src/sdk', path => path.endsWith('.ts')).concat(files('src/kernel', path => path.endsWith('.ts')))
    .map(path => ({ path, text: readFileSync(resolve(root, path), 'utf8') }));
  const values = { ...sdk, ...renderSdk };
  return sorted(Object.keys(values)).map(name => {
    const declaration = new RegExp(`^export (?:(?:const|function|class) ${name}\\b|\\{\\s*${name}[\\s,}])`, 'm');
    const source = sources.find(source => declaration.test(source.text));
    const offset = source?.text.search(declaration) ?? -1;
    const sourcePath = source?.path ?? 'src/sdk/core.ts';
    const line = offset < 0 ? 1 : source.text.slice(0, offset).split('\n').length;
    const value = values[name];
    const token = value && typeof value === 'object' ? value.id ?? value.kind : undefined;
    return { id: `sdk/${name}`, type: 'contract', name, scope: 'contract', summary: `${typeof value === 'function' ? 'Public helper/class' : 'Public SDK value'}${token ? `: ${token}` : ''}`,
      importFrom: name in renderSdk ? 'src/sdk/render.ts' : 'src/sdk/index.ts',
      token, source: `${sourcePath}:${line}`, docs: ['PLUGINS.md'], examples: [], tests: [], keywords: [name, ...(token ? [token] : [])],
      useWhen: 'Read the linked declaration and consuming examples. A token is a contract, not an installed implementation.', limitations: ['Rendering SDK imports require the render manifest capability.'] };
  });
}

export function dependencyClosure(id, manifests) {
  const result = new Set();
  function visit(current) {
    if (result.has(current)) return;
    const manifest = manifests.get(current);
    if (!manifest) fail(id, `missing dependency ${current}`);
    result.add(current);
    for (const dependency of Object.keys(manifest.dependencies ?? {})) visit(dependency);
  }
  visit(id);
  return sorted(result);
}

export async function buildReuseIndex() {
  const contracts = sdkInventory(), symbols = new Set(contracts.map(item => item.name));
  const manifests = new Map(), folders = new Map();
  const inputs = new Set(['src/app/catalog.ts', 'scripts/reuse-lib.mjs', 'docs/reuse-recipes.json']);
  for (const folder of sorted(readdirSync(resolve(root, 'src/plugins')))) {
    const directory = `src/plugins/${folder}`, path = `${directory}/manifest.json`;
    if (!existsSync(resolve(root, path))) continue;
    const issues = [];
    const manifest = parseManifest(json(path), new sdk.Reporter(issues, path));
    if (!manifest || issues.length) fail(path, issues.map(issue => `${issue.path}: ${issue.message}`).join('; '));
    if (manifests.has(manifest.id)) fail(path, `duplicate plugin ID ${manifest.id}`);
    manifests.set(manifest.id, manifest); folders.set(manifest.id, directory);
    for (const file of files(directory, path => /\.(ts|json)$/.test(path))) inputs.add(file);
  }
  for (const file of files('src/sdk', path => path.endsWith('.ts')).concat(files('src/kernel', path => path.endsWith('.ts')), files('src/content/presets', path => path.endsWith('.json')))) inputs.add(file);
  const installed = new Set(catalog.map(entry => entry.manifest.id));
  for (const id of installed) if (!manifests.has(id)) fail('catalog', `no source manifest found for ${id}`);
  const host = new PluginHost({ sdkVersion: sdk.SDK_VERSION, phases: sdk.PHASES });
  const issues = host.setCatalog(catalog);
  if (issues.length) fail('catalog', JSON.stringify(issues));
  const plugins = [];
  for (const id of sorted(manifests.keys())) {
    const manifest = manifests.get(id), directory = folders.get(id), metadataPath = `${directory}/reuse.json`;
    const metadata = existsSync(resolve(root, metadataPath)) ? validateMetadata(json(metadataPath), metadataPath, symbols) : undefined;
    const enable = dependencyClosure(id, manifests);
    const registrations = [], contentKinds = [];
    if (installed.has(id)) {
      // Default registration snapshot. No validators, role activation, services or gameplay are run.
      const staged = await host.stage({ schema: 1, id: 'discovery/snapshot', name: 'Discovery', seed: 1, plugins: enable, roles: {}, options: {} }, [], { skipValidation: true });
      try {
        for (const kind of sorted(Object.keys(staged.registries.summary()))) {
          for (const entry of staged.registries.entries({ kind }).filter(entry => entry.owner === id).sort((a, b) => a.id.localeCompare(b.id, 'en'))) {
            registrations.push({ kind, id: entry.id, description: entry.value?.description ?? entry.value?.name ?? '' });
          }
        }
        for (const [kind, entry] of staged.contentKinds) if (entry.owner === id) contentKinds.push({ kind, description: entry.loader.description ?? '' });
      } finally { host.discard(staged); }
    }
    const examples = presets.filter(preset => preset.plugins.includes(id)).map(preset => ({ id: preset.id, name: preset.name, roles: preset.roles }));
    plugins.push({ id, type: 'plugin', name: manifest.name, scope: metadata?.scope ?? (manifest.kind === 'content' ? 'content' : 'unreviewed'),
      summary: metadata?.summary ?? manifest.description ?? manifest.name, source: directory, version: manifest.version, sdk: manifest.sdk, builtIn: installed.has(id), reviewed: Boolean(metadata && metadata.scope !== 'unreviewed'),
      keywords: metadata?.keywords ?? [], entryPoints: metadata?.entryPoints ?? [], useWhen: metadata?.useWhen ?? 'Inspect the implementation and an existing preset before composing it.',
      limitations: metadata?.limitations ?? ['Reuse scope is unreviewed; registration alone does not prove cross-genre compatibility.'],
      docs: metadata?.docs ?? ['PLUGINS.md'], examples: metadata?.examples ?? [], tests: metadata?.tests ?? [],
      dependencies: manifest.dependencies ?? {}, optionalDependencies: manifest.optionalDependencies ?? {}, conflicts: manifest.conflicts ?? [],
      requiresRoles: manifest.requiresRoles ?? [], roleDependencies: manifest.roleDependencies ?? [], config: manifest.config ?? {},
      enable, registrations, contentKinds: contentKinds.sort((a, b) => a.kind.localeCompare(b.kind, 'en')), presets: examples });
  }
  const recipeData = json('docs/reuse-recipes.json');
  if (!recipeData || recipeData.schema !== 1 || !Array.isArray(recipeData.recipes)) fail('docs/reuse-recipes.json', 'expected schema 1 and recipes array');
  for (const key of Object.keys(recipeData)) if (!['schema', 'recipes'].includes(key)) fail(`docs/reuse-recipes.json.${key}`, 'unknown property');
  const recipes = recipeData.recipes.map(recipe => {
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) fail('recipe', 'expected an object');
    const { id, name, plugins: enabled = [], roles = {}, steps, ...metadata } = recipe;
    if (typeof id !== 'string' || !/^recipe\/[a-z0-9-]+$/.test(id) || typeof name !== 'string' || !name.trim()) fail('recipe', 'expected namespaced recipe ID and name');
    validateMetadata(metadata, id, symbols);
    if (!Array.isArray(enabled) || enabled.some(id => !installed.has(id)) || new Set(enabled).size !== enabled.length) fail(id, 'plugins must name unique compiled-in plugins');
    if (!roles || typeof roles !== 'object' || Array.isArray(roles)) fail(id, 'roles must be an object');
    for (const [role, provider] of Object.entries(roles)) {
      if (!plugins.some(item => enabled.includes(item.id) && item.registrations.some(entry => entry.kind === `role:${role}` && entry.id === provider))) fail(id, `role ${role} has no enabled provider ${provider}`);
    }
    for (const plugin of enabled) {
      for (const dependency of dependencyClosure(plugin, manifests)) if (!enabled.includes(dependency)) fail(id, `missing dependency ${dependency}`);
      for (const role of [...(manifests.get(plugin).requiresRoles ?? []), ...(manifests.get(plugin).roleDependencies ?? [])]) if (!roles[role]) fail(id, `missing selected role ${role}`);
    }
    if (!Array.isArray(steps) || !steps.length || steps.some(step => typeof step !== 'string' || !step.trim())) fail(id, 'expected nonempty composition steps');
    return { ...metadata, id, name, type: 'recipe', source: 'docs/reuse-recipes.json', plugins: enabled, roles, steps };
  });
  if (new Set(recipes.map(item => item.id)).size !== recipes.length) fail('recipes', 'duplicate ID');
  const all = [...recipes, ...plugins, ...contracts];
  for (const plugin of plugins) plugin.recipes = recipes.filter(recipe => recipe.plugins.includes(plugin.id)).map(recipe => recipe.id);
  for (const contract of contracts) {
    contract.documentedBy = plugins.filter(plugin => plugin.entryPoints.includes(contract.name)).map(plugin => plugin.id);
    contract.recipes = recipes.filter(recipe => recipe.entryPoints.includes(contract.name)).map(recipe => recipe.id);
    contract.implementations = plugins.filter(plugin => plugin.registrations.some(entry => entry.kind === contract.token || entry.kind === `role:${contract.token}`)).map(plugin => plugin.id);
  }
  const digest = createHash('sha256');
  for (const path of sorted(inputs)) digest.update(path).update('\0').update(readFileSync(resolve(root, path))).update('\0');
  return { schema: 1, sourceDigest: digest.digest('hex'), description: 'Live built-in registration snapshots at default config, source manifests and curated reuse metadata. No activation. Validate a complete preset before use.',
    entries: all, presets: presets.map(preset => ({ id: preset.id, name: preset.name, plugins: preset.plugins, roles: preset.roles })) };
}

const stopwords = new Set('a an and are as be by can do for from game games have how i in is it me my need of on or plugin plugins the to use using want with without'.split(' '));
function words(text) {
  return [...new Set(String(text).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 1 && !stopwords.has(word)).map(word => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word))];
}
export function searchReuse(index, query, { limit = 12, type, scope } = {}) {
  const terms = words(query);
  return index.entries.filter(item => (!type || item.type === type) && (!scope || item.scope === scope)).map(item => {
    const fields = [
      ['id/name', `${item.id} ${item.name}`, 12], ['keywords', item.keywords.join(' '), 10], ['summary', item.summary, 6],
      ['entryPoints', (item.entryPoints ?? []).join(' '), 8], ['registrations', JSON.stringify([item.registrations, item.contentKinds]), 4],
      ['useWhen', item.useWhen, 3],
    ];
    const matched = [], reasons = new Set(); let score = 0;
    for (const term of terms) {
      let best = 0;
      for (const [field, text, weight] of fields) if (words(text).includes(term)) { best = Math.max(best, weight); reasons.add(field); }
      if (best) { score += best; matched.push(term); }
    }
    if (item.id.toLowerCase() === query.toLowerCase() || item.name.toLowerCase() === query.toLowerCase()) score += 100;
    if (score) score += matched.length === terms.length ? 12 : 0;
    if (score && item.scope === 'cross-genre') score += 3;
    // Contract aliases help exact ID lookup but should not crowd out working implementations and family alternatives.
    if (score && item.type === 'contract') score -= 8;
    return { ...item, score, matched, matchedFields: [...reasons] };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en')).slice(0, limit);
}

export function formatEntry(item, detailed = false) {
  const lines = [`${item.id} — ${item.name} [${item.type}; ${item.scope}]`, `  ${item.summary}`, `  Use when: ${item.useWhen}`];
  if (item.entryPoints?.length) lines.push(`  SDK: ${item.entryPoints.join(', ')}`);
  if (item.importFrom) lines.push(`  Import: ${item.importFrom}${item.token ? ` · token: ${item.token}` : ''}`);
  lines.push(`  Source: ${item.source}`);
  if (item.examples?.length) lines.push(`  Examples: ${item.examples.join(', ')}`);
  if (item.docs?.length) lines.push(`  Docs: ${item.docs.join(', ')}`);
  if (item.limitations?.length) lines.push(`  Limits: ${item.limitations.join(' ')}`);
  if (item.matched?.length) lines.push(`  Matched: ${item.matched.join(', ')} (${item.matchedFields.join(', ')})`);
  if (detailed) {
    for (const key of ['version', 'sdk', 'enable', 'dependencies', 'optionalDependencies', 'conflicts', 'requiresRoles', 'roleDependencies', 'config', 'registrations', 'contentKinds', 'plugins', 'roles', 'documentedBy', 'implementations', 'recipes', 'tests']) if (item[key]) lines.push(`  ${key}: ${JSON.stringify(item[key])}`);
    if (item.presets?.length) lines.push(`  Presets: ${item.presets.map(preset => preset.id).join(', ')}`);
    if (item.steps) lines.push(...item.steps.map((step, i) => `  ${i + 1}. ${step}`));
  }
  return lines.join('\n');
}

export function renderIndex(index) {
  const escape = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
  return '# Reuse index\n\nGenerated by `npm run index-reuse`. Do not edit this file directly.\n\n' +
    'Start with [the reuse workflow](REUSE.md). Search by intent with `npm run find-reuse -- "stamina cooldown"`; inspect a result with `--show mechanics/actions`. Use `--json` for structured results.\n\n' +
    'Metadata describes scope; registrations are observed at default config without activation or cross-reference validation. Enable lists include concrete dependencies only; select the required roles and validate the complete preset. `unreviewed` does not mean genre-neutral.\n\n' +
    `Source digest: \`${index.sourceDigest}\`\n\n` +
    ['recipe', 'plugin', 'contract'].map(type => `## ${type === 'recipe' ? 'Composition recipes' : type === 'plugin' ? 'All source plugins' : 'Public SDK values'}\n\n` +
      '| ID | Scope | What exists | Source |\n|---|---|---|---|\n' + index.entries.filter(item => item.type === type).map(item => {
        const source = item.source.replace(/:(\d+)$/, '#L$1');
        return `| \`${item.id}\` | ${item.scope} | ${escape(item.summary)} | [source](${source}) |`;
      }).join('\n')).join('\n\n') + '\n';
}
