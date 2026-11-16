#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReuseIndex, indexFiles, renderIndex } from './reuse-lib.mjs';
import { root } from './tools.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--check')) throw new Error('Usage: npm run index-reuse -- [--check]');
  const index = await buildReuseIndex();
  const outputs = [[indexFiles.json, JSON.stringify(index, null, 2) + '\n'], [indexFiles.markdown, renderIndex(index)]];
  for (const [file, text] of outputs) {
    if (args[0] === '--check') {
      if (!existsSync(resolve(root, file)) || readFileSync(resolve(root, file), 'utf8') !== text) throw new Error(`${file} is stale. Review relevant reuse.json metadata, then run npm run index-reuse.`);
    } else writeFileSync(resolve(root, file), text);
  }
  console.log(`Reuse index ${args[0] === '--check' ? 'current' : 'generated'}: ${index.entries.filter(item => item.type === 'plugin').length} plugins, ${index.entries.filter(item => item.type === 'contract').length} SDK values, ${index.entries.filter(item => item.type === 'recipe').length} recipes.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
