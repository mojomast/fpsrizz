import { pathToFileURL } from 'node:url';

// Preflight: fail fast with a clear message when Node is too old to run the TypeScript tooling.
// `node --test` and `node scripts/*.ts` rely on native type stripping, which is stable from Node 22.18.
export const MIN_NODE = [22, 18, 0];

export function nodeVersionOk(version = process.versions.node) {
  const [a, b, c] = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y, z] = MIN_NODE;
  return a !== x ? a > x : b !== y ? b > y : c >= z;
}

export function assertNodeVersion() {
  if (nodeVersionOk()) return;
  console.error(
    `Node >=${MIN_NODE.join('.')} required (found ${process.versions.node}). ` +
      'Run "nvm use" (reads .nvmrc) or install Node 22.18+ from https://nodejs.org/.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) assertNodeVersion();
