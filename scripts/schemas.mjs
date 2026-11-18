#!/usr/bin/env node
// JSON Schema check for every data file (P2.2).
//   npm run schemas            validate every tracked JSON file against its schema (part of `npm run check`)
//   npm run schemas -- --write add/fix "$schema" in each covered object file and regenerate .vscode/settings.json
// Semantic cross-reference checks (dependency resolution, content-kind data, reuse entry points) stay in TypeScript.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { root } from './tools.mjs';

/** Which schema covers which files (first match wins). `embed: false` = arrays, mapped through editor settings only. */
export const SCHEMA_MAP = [
  { schema: 'plugin-manifest', match: /(^|\/)manifest\.json$/, glob: '**/manifest.json' },
  { schema: 'preset', match: /^(templates\/)?games\/[^/]+\/presets\/[^/]+\.json$/, glob: '{games,templates/games}/*/presets/*.json' },
  { schema: 'reuse', match: /(^|\/)reuse\.json$/, glob: '**/reuse.json' },
  { schema: 'content-pack', match: /(^|\/)content\.json$/, glob: '**/content.json', embed: false },
  { schema: 'replay', match: /\.replay\.json$/, glob: '**/*.replay.json' },
  { schema: 'models', match: /^assets\/models\.json$/, glob: 'assets/models.json' },
  { schema: 'reuse-recipes', match: /^docs\/reuse-recipes\.json$/, glob: 'docs/reuse-recipes.json' },
];
/** Tool configs, provenance records and generated indexes: not engine data formats. */
const NOT_DATA = [
  /(^|\/)package(-lock)?\.json$/, /(^|\/)tsconfig\.json$/, /^typedoc\.json$/, /(^|\/)provenance\.json$/, /^scripts\/[^/]+\.json$/,
  /^assets\/weapons\//, /^docs\/reuse-index\.json$/, /^public\/models\/index\.json$/, /^src\/app\/catalog-providers\.json$/,
  /^schemas\//, /^\.vscode\//, /^games\/expeditions\/plugins\/salt-rpg-content\/campaign-draft\.json$/,
];

const write = process.argv.includes('--write');
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '*.json'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).filter((f) => existsSync(resolve(root, f))).sort();
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTuples: false, allowUnionTypes: true });
const validators = new Map();
const validatorFor = (name) => {
  if (!validators.has(name)) validators.set(name, ajv.compile(JSON.parse(readFileSync(resolve(root, `schemas/${name}.schema.json`), 'utf8'))));
  return validators.get(name);
};
// Templates carry placeholders that new-plugin replaces; validate them with sample values.
const fillTemplate = (text) => text.replace(/__ID__/g, 'template/starter').replace(/__NS__/g, 'template').replace(/__[A-Z_]+__/g, 'Template');

const problems = [];
const unclassified = [];
let checked = 0, fixed = 0;
for (const file of files) {
  if (NOT_DATA.some((re) => re.test(file))) continue;
  const entry = SCHEMA_MAP.find((m) => m.match.test(file));
  if (!entry) { unclassified.push(file); continue; }
  const abs = resolve(root, file);
  let text = readFileSync(abs, 'utf8');
  const ref = relative(dirname(abs), resolve(root, `schemas/${entry.schema}.schema.json`)).replaceAll('\\', '/');
  if (entry.embed !== false) {
    const json = JSON.parse(text);
    if (json.$schema !== ref) {
      if (!write) { problems.push(`${file}: "$schema" should be "${ref}" (run npm run schemas -- --write)`); }
      else {
        if (json.$schema !== undefined) text = text.replace(/"\$schema"\s*:\s*"[^"]*"/, `"$schema": ${JSON.stringify(ref)}`);
        else {
          const m = /^\{(\r?\n)([ \t]+)/.exec(text);
          text = m ? text.replace(/^\{\r?\n/, `{${m[1]}${m[2]}"$schema": ${JSON.stringify(ref)},${m[1]}`) : text.replace(/^\{\s*/, `{"$schema": ${JSON.stringify(ref)}, `);
        }
        writeFileSync(abs, text);
        fixed++;
      }
    }
  }
  const data = JSON.parse(file.startsWith('templates/') ? fillTemplate(text) : text);
  const validate = validatorFor(entry.schema);
  checked++;
  if (!validate(data)) for (const e of validate.errors) problems.push(`${file}${e.instancePath || ''}: ${e.message}${e.params && e.keyword === 'additionalProperties' ? ` ("${e.params.additionalProperty}")` : ''}`);
}
for (const f of unclassified) problems.push(`${f}: no schema covers this JSON file; add it to SCHEMA_MAP or NOT_DATA in scripts/schemas.mjs`);

if (write) {
  mkdirSync(resolve(root, '.vscode'), { recursive: true });
  const settingsPath = resolve(root, '.vscode/settings.json');
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
  settings['json.schemas'] = SCHEMA_MAP.map((m) => ({ fileMatch: [m.glob.startsWith('**/') ? m.glob.slice(3) : `/${m.glob}`], url: `./schemas/${m.schema}.schema.json` }));
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}
if (problems.length) {
  console.error(`schemas: ${problems.length} problem(s)\n  ${problems.slice(0, 80).join('\n  ')}`);
  process.exit(1);
}
console.log(`schemas OK (${checked} files against ${validators.size} schemas${fixed ? `, ${fixed} $schema refs written` : ''})`);
