#!/usr/bin/env node
// Scaffolds a code plugin from templates/plugin-starter.
// Usage: npm run new-plugin -- <namespace/name> ["Display Name"]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, displayName] = process.argv.slice(2);
if (!id || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/.test(id)) {
  console.error('Usage: npm run new-plugin -- <namespace/name> ["Display Name"]\n  The id must look like "example/regen" (lowercase letters, digits, "-").');
  process.exit(1);
}
const name = displayName ?? id;
const dirName = id.replace('/', '-');
const dir = path.join(root, 'packages', 'std', 'plugins', dirName);
// The standalone template fixture can run without the full repository; the repository scaffold
// also surfaces live candidates, without requiring a separate approval or blocking creation.
if (fs.existsSync(path.join(root, 'scripts/reuse-lib.mjs'))) {
  const { buildReuseIndex, searchReuse } = await import('./reuse-lib.mjs');
  const index = await buildReuseIndex();
  const candidates = searchReuse(index, `${id} ${name}`, { limit: 3 });
  if (candidates.length) {
    console.log('Existing elements to inspect before implementing this capability:');
    for (const candidate of candidates) console.log(`  ${candidate.id} [${candidate.scope}] — ${candidate.summary}`);
  }
}
console.log(`Reuse search: npm run find-reuse -- ${JSON.stringify(name)}\nInspect details: npm run find-reuse -- --show <id>\n`);
fs.mkdirSync(path.dirname(dir), { recursive: true });
try {
  fs.mkdirSync(dir);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error(`packages/std/plugins/${dirName} already exists.`);
  process.exit(1);
}
const tpl = path.join(root, 'templates', 'plugin-starter');
for (const file of fs.readdirSync(tpl)) {
  const text = fs.readFileSync(path.join(tpl, file), 'utf8').replace(
    /"__ID__"|"__NAME__"|'__NAME__ is active'/g,
    (placeholder) => JSON.stringify(placeholder === '"__ID__"' ? id : placeholder === '"__NAME__"' ? name : `${name} is active`),
  ).replaceAll('"../../schemas/', '"../../../../schemas/'); // templates/x -> packages/std/plugins/x
  fs.writeFileSync(path.join(dir, file), text, { flag: 'wx' });
}
console.log(`Created packages/std/plugins/${dirName}/ (manifest.json, index.ts, reuse.json)

1. The catalog picks it up automatically (npm run gen-catalog; dev, build and check do this for you).

2. Enable it: add "${id}" to "plugins" in games/shooter/presets/default.json
   (or tick it in the creator panel, \` key, and press "Apply & restart").

3. npm run dev   — you should see "${name} is active" on the HUD when a session starts.
4. Describe reusable capability, public SDK entry points, limits, examples and tests in reuse.json.
   Prefer existing behavior or data changes; explain the missing behavior when a new implementation is needed.
5. npm run index-reuse — refresh the agent inventory after catalog/source/metadata changes.
6. npm run check — type check, boundaries, inventory freshness and tests must stay green.`);
