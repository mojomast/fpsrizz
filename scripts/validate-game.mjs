#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { catalog, presets } from '../src/app/catalog.ts';
import { HostError, PluginHost } from '@bulkhead/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION } from '@bulkhead/sdk';

const usage = 'Usage: npm run validate-game -- <preset.json | --bundled> [--pack <pack.json> ...]';
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON from "${path}": ${error.message}`);
  }
}

async function main(args) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(usage);
    return;
  }
  let target;
  const packPaths = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pack') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`--pack requires a file path.\n${usage}`);
      packPaths.push(args[++i]);
    } else if (arg === '--bundled') {
      if (target) throw new Error(`Specify exactly one preset or --bundled.\n${usage}`);
      target = arg;
    } else if (arg.startsWith('-') || target) {
      throw new Error(`Unexpected argument "${arg}".\n${usage}`);
    } else target = arg;
  }
  if (!target) throw new Error(usage);

  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  const catalogIssues = host.setCatalog(catalog);
  if (catalogIssues.length) throw new HostError('catalog', catalogIssues);
  const installed = host.installed();
  const extra = [];
  for (const path of packPaths) {
    const pack = await readJson(path);
    if (!record(pack) || pack.schema !== 1 || !record(pack.manifest) || pack.manifest.kind !== 'content' || !Array.isArray(pack.content)) {
      throw new Error(`Invalid pack "${path}": expected { schema: 1, manifest: { kind: "content", ... }, content: [...] }.`);
    }
    if (typeof pack.manifest.id === 'string' && installed.get(pack.manifest.id)?.kind === 'code') {
      throw new Error(`Invalid pack "${path}": cannot replace installed code plugin "${pack.manifest.id}".`);
    }
    extra.push({ manifest: pack.manifest, content: pack.content, origin: path });
  }
  const candidates = target === '--bundled'
    ? presets.map((preset, i) => ({ preset, label: record(preset) && typeof preset.id === 'string' ? preset.id : `bundled[${i}]` }))
    : [{ preset: await readJson(target), label: target }];
  let failed = false;
  for (const { preset, label } of candidates) {
    try {
      const staged = await host.stage(preset, extra);
      host.discard(staged);
      console.log(`OK ${label} (staged)`);
    } catch (error) {
      failed = true;
      console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
