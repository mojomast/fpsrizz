// Resolve dev tools (esbuild, playwright) from the project, then from fallback locations.
import { createRequire } from 'node:module';
import { delimiter, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function searchDirs() {
  const extra = (process.env.TOOLS_NODE_MODULES ?? '').split(delimiter).filter(Boolean);
  return [...extra, '/opt/npm-tools/node_modules'];
}

export function resolveTool(name) {
  const tried = [];
  try {
    return createRequire(resolve(root, 'package.json'))(name);
  } catch (e) {
    if (e?.code !== 'MODULE_NOT_FOUND') throw e;
    tried.push(root + '/node_modules');
  }
  for (const dir of searchDirs()) {
    try {
      return createRequire(resolve(dir, 'noop.js'))(name);
    } catch (e) {
      if (e?.code !== 'MODULE_NOT_FOUND') throw e;
      tried.push(dir);
    }
  }
  throw new Error(
    `Cannot find required package "${name}". Run "npm install" in ${root}, or set TOOLS_NODE_MODULES to a ` +
      `node_modules directory containing it. Searched: ${tried.join(', ')}`,
  );
}
