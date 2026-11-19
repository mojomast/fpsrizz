/**
 * Headless replay runner for `node --test` (SDK 3, P1.7). Boots a preset with the host services games need in
 * Node (Input, Assets), records or replays its input stream and fingerprints the final state:
 *
 *   const file = await recordRun({ preset, plugins }, (run) => { run.input.press('a'); run.ticks(30); });
 *   await assertReplay({ preset, plugins }, file);   // re-simulates and compares hashSnapshot()
 *
 * `plugins` are repo-relative plugin directories (each with manifest.json + index.ts).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry, Session } from '@bulkhead/kernel/host.ts';
import { hashSnapshot } from '@bulkhead/kernel/snapshot.ts';
import type { RunSnapshot } from '@bulkhead/kernel/snapshot.ts';
import { createAssetService, preloadManifestAssets } from '@bulkhead/platform-web/assets.ts';
import { createInputCore } from '@bulkhead/platform-web/input.ts';
import type { InputCore } from '@bulkhead/platform-web/input.ts';
import { parseReplay, recordInput, replayFeeder } from '@bulkhead/platform-web/replay.ts';
import type { ReplayFile } from '@bulkhead/platform-web/replay.ts';
import { Assets, Input, InputAxes, InputContexts, PHASES, SDK_COMPAT, SDK_VERSION } from '@bulkhead/sdk';

export interface RunSpec { preset: { id: string; seed?: number } & Record<string, unknown>; plugins: readonly string[] }
export interface Run {
  host: PluginHost;
  session: Session;
  input: InputCore;
  ticks(n: number): void;
  snapshot(): RunSnapshot;
  hash(): string;
  stop(): void;
}

/** `dir` is repo-relative (run from the repo root) or absolute (e.g. from `fileURLToPath(new URL(..., import.meta.url))`). */
const entry = (dir: string): CatalogEntry => ({
  manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string),
  load: () => import(dir.startsWith('/') ? pathToFileURL(`${dir}/index.ts`).href : `../../${dir}/index.ts`),
});

/** Boots `spec`; `beforeTick(tick)` runs right before the input snapshot of every tick (replay feeding). */
export async function startRun(spec: RunSpec, beforeTick?: (tick: number) => void): Promise<Run> {
  const input = createInputCore();
  const assets = createAssetService();
  let tick = 0;
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, beforeActivate: preloadManifestAssets(assets),
    installHostServices(session, scope) {
      session.services.provide(Input, input.service, 'host', scope);
      session.services.provide(InputContexts, input.contexts, 'host', scope);
      session.services.provide(Assets, assets, 'host', scope);
      session.addBeforeTick(() => { beforeTick?.(tick++); input.beginTick(); }, scope);
    },
  });
  input.setAxes(() => host.active?.registries.entries(InputAxes).map((e) => [e.id, e.value] as const) ?? []);
  const issues = host.setCatalog(spec.plugins.map(entry));
  if (issues.length) throw new Error(`replay catalog is invalid: ${issues.map((i) => i.message).join('; ')}`);
  const session = await host.apply(spec.preset);
  return {
    host, session, input,
    ticks: (n) => { for (let i = 0; i < n; i++) session.scheduler.runTick(); },
    snapshot: () => host.snapshot(),
    hash: () => hashSnapshot(host.snapshot()),
    stop: () => host.stop(),
  };
}

/** Runs `script` against a fresh session while recording; returns the replay file (with the final hash). */
export async function recordRun(spec: RunSpec, script: (run: Run) => void | Promise<void>): Promise<ReplayFile> {
  const run = await startRun(spec);
  const rec = recordInput(run.input, { sdk: SDK_VERSION, preset: spec.preset.id, seed: run.session.preset.seed });
  try {
    await script(run);
    return rec.toFile({ hash: run.hash() });
  } finally {
    rec.stop();
    run.stop();
  }
}

/** Re-simulates a replay from a fresh session; returns the final snapshot and hash. */
export async function playReplay(spec: RunSpec, raw: unknown, keepRunning = false): Promise<{ hash: string; snapshot: RunSnapshot; run: Run }> {
  const file = parseReplay(raw);
  assert.equal(file.preset, spec.preset.id, `replay was recorded on preset "${file.preset}"`);
  let feeder: ReturnType<typeof replayFeeder> | undefined;
  const run = await startRun({ ...spec, preset: { ...spec.preset, seed: file.seed } }, (t) => feeder?.feed(t));
  feeder = replayFeeder(run.input, file);
  run.ticks(file.ticks);
  feeder.feed(file.ticks); // trailing calls after the last tick (they affect nothing simulated)
  const snapshot = run.snapshot();
  const out = { hash: hashSnapshot(snapshot), snapshot, run };
  if (!keepRunning) run.stop();
  return out;
}

/**
 * Asserts that `replay` (a ReplayFile or a path to a `.replay.json`) reproduces its recorded hash. With the env var
 * UPDATE_REPLAYS=1 and a path, rewrites the file's hash instead (after an intentional simulation change).
 */
export async function assertReplay(spec: RunSpec, replay: ReplayFile | string): Promise<string> {
  const path = typeof replay === 'string' ? replay : undefined;
  const file = parseReplay(path ? JSON.parse(readFileSync(path, 'utf8') as string) : replay);
  const { hash } = await playReplay(spec, file);
  if (path && process.env.UPDATE_REPLAYS === '1') {
    writeFileSync(path, `${JSON.stringify({ ...file, hash })}\n`);
    return hash;
  }
  assert.ok(file.hash, 'replay has no recorded hash');
  assert.equal(hash, file.hash, `replay diverged: final state hash ${hash}, recorded ${file.hash}${path ? ` (${path}; UPDATE_REPLAYS=1 re-records the hash after an intended change)` : ''}`);
  return hash;
}
