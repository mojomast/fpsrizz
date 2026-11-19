/**
 * Headless in-page replay (P2.6 `replay.run`): boots a second, render-less PluginHost from the same catalog,
 * feeds the replay's input stream tick by tick and compares the final snapshot hash with the recorded one.
 * The live game is untouched. Mirrors tests/helpers/replay.ts, which does the same under Node.
 */
import { PluginHost } from '../kernel/host.ts';
import type { CatalogEntry } from '../kernel/host.ts';
import { hashSnapshot } from '../kernel/snapshot.ts';
import type { Json } from '../kernel/validate.ts';
import { Assets, Input, InputAxes, InputContexts, PHASES, SDK_COMPAT, SDK_VERSION } from '../sdk/index.ts';
import { createAssetService, preloadManifestAssets } from './assets.ts';
import { createInputCore } from './input.ts';
import { parseReplay, replayFeeder } from './replay.ts';

export async function runReplayHeadless(o: { catalog: readonly CatalogEntry[]; presets: readonly unknown[]; file: unknown }): Promise<Json> {
  const file = parseReplay(o.file);
  const preset = o.presets.find((p) => !!p && typeof p === 'object' && (p as { id?: unknown }).id === file.preset);
  if (!preset) throw new Error(`replay preset "${file.preset}" is not a built-in preset`);
  const input = createInputCore();
  const assets = createAssetService();
  let feeder: ReturnType<typeof replayFeeder> | undefined;
  let tick = 0;
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, beforeActivate: preloadManifestAssets(assets),
    installHostServices(session, scope) {
      session.services.provide(Input, input.service, 'host', scope);
      session.services.provide(InputContexts, input.contexts, 'host', scope);
      session.services.provide(Assets, assets, 'host', scope);
      session.addBeforeTick(() => { feeder?.feed(tick++); input.beginTick(); }, scope);
    },
  });
  input.setAxes(() => host.active?.registries.entries(InputAxes).map((e) => [e.id, e.value] as const) ?? []);
  host.setCatalog([...o.catalog]);
  const t0 = performance.now();
  try {
    const session = await host.apply({ ...(preset as object), seed: file.seed });
    feeder = replayFeeder(input, file);
    for (let i = 0; i < file.ticks; i++) session.scheduler.runTick();
    feeder.feed(file.ticks);
    const hash = hashSnapshot(host.snapshot());
    return { preset: file.preset, seed: file.seed, ticks: file.ticks, hash, expected: file.hash ?? null, match: file.hash ? file.hash === hash : null, ms: Math.round(performance.now() - t0) };
  } finally {
    host.stop();
  }
}
