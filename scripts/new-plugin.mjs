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
const dir = path.join(root, 'src', 'plugins', dirName);
if (fs.existsSync(dir)) {
  console.error(`src/plugins/${dirName} already exists.`);
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const tpl = path.join(root, 'templates', 'plugin-starter');
for (const file of fs.readdirSync(tpl)) {
  const text = fs.readFileSync(path.join(tpl, file), 'utf8').replaceAll('__ID__', id).replaceAll('__NAME__', name);
  fs.writeFileSync(path.join(dir, file), text);
}
const ident = dirName.replace(/[-.](\w)/g, (_, c) => c.toUpperCase());
console.log(`Created src/plugins/${dirName}/ (manifest.json, index.ts)

1. Add to src/app/catalog.ts:

   import ${ident} from '../plugins/${dirName}/manifest.json' with { type: 'json' };
   …
   { manifest: ${ident}, load: () => import('../plugins/${dirName}/index.ts') },

2. Enable it: add "${id}" to "plugins" in src/content/presets/default.json
   (or tick it in the creator panel, \` key, and press "Apply & restart").

3. npm run dev   — you should see "${name} is active" on the HUD when a session starts.
4. npm run check — type check, import boundaries and tests must stay green.`);
