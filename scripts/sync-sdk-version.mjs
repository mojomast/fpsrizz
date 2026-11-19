#!/usr/bin/env node
// P3.4: keeps the runtime SDK_VERSION (packages/sdk/src/core.ts) equal to the @bulkhead/sdk package version that
// Changesets bumps. On a major bump the previous version is added to SDK_COMPAT only if the release notes say the
// old manifests still load, so this script never does that silently: it prints a reminder instead.
//   node scripts/sync-sdk-version.mjs           rewrite core.ts from packages/sdk/package.json
//   node scripts/sync-sdk-version.mjs --check   exit 1 if they differ (part of npm run check)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './tools.mjs';

export const CORE = resolve(root, 'packages/sdk/src/core.ts');
export const PKG = resolve(root, 'packages/sdk/package.json');
const RE = /export const SDK_VERSION = '([^']+)';/;

export function readSdkVersion(src) {
  const m = RE.exec(src);
  if (!m) throw new Error('SDK_VERSION declaration not found in packages/sdk/src/core.ts');
  return m[1];
}

/** Returns core.ts source with SDK_VERSION set to `version`, plus whether the major changed. */
export function withSdkVersion(src, version) {
  const prev = readSdkVersion(src);
  return { src: src.replace(RE, `export const SDK_VERSION = '${version}';`), prev, majorChanged: prev.split('.')[0] !== version.split('.')[0] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const version = JSON.parse(readFileSync(PKG, 'utf8')).version;
  const src = readFileSync(CORE, 'utf8');
  if (process.argv.includes('--check')) {
    const cur = readSdkVersion(src);
    if (cur !== version) {
      console.error(`SDK_VERSION ${cur} != @bulkhead/sdk ${version}; run node scripts/sync-sdk-version.mjs`);
      process.exit(1);
    }
    console.log(`SDK_VERSION ${cur} matches @bulkhead/sdk`);
  } else {
    const r = withSdkVersion(src, version);
    writeFileSync(CORE, r.src);
    console.log(`SDK_VERSION ${r.prev} -> ${version}`);
    if (r.majorChanged) console.log(`Major SDK bump: decide whether SDK_COMPAT keeps accepting '${r.prev}' manifests and add a docs/migrations/sdk-${version.split('.')[0]}.md.`);
  }
}
