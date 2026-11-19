import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry } from '@bulkhead/kernel/host.ts';
import { createAssetService, preloadManifestAssets } from '@bulkhead/platform-web/assets.ts';
import { createInputCore } from '@bulkhead/platform-web/input.ts';
import { Assets, Input, InputAxes, PHASES, RigidBody, SDK_COMPAT, SDK_VERSION, Transform3D } from '@bulkhead/sdk';
import { Sandbox } from '../contracts/sandbox.ts';
import preset from '../presets/physics-sandbox.json' with { type: 'json' };

const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../../../${dir}/index.ts`) });

test('physics sandbox: the hero walks onto the sensor pad and the crate stack stays standing', async () => {
  const input = createInputCore();
  const assets = createAssetService();
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, beforeActivate: preloadManifestAssets(assets), installHostServices(session, scope) {
    session.services.provide(Input, input.service, 'host', scope);
    session.services.provide(Assets, assets, 'host', scope);
    session.addBeforeTick(() => input.beginTick(), scope);
  } });
  input.setAxes(() => host.active?.registries.entries(InputAxes).map((e) => [e.id, e.value] as const) ?? []);
  host.setCatalog(['packages/std/plugins/std-transform', 'packages/std/plugins/std-assets', 'packages/std/plugins/std-render-sync', 'packages/std/plugins/std-physics-rapier', 'games/sandbox/plugins/sandbox-game', 'games/sandbox/plugins/sandbox-presentation'].map(real));
  const session = await host.apply(preset);
  const ticks = (n: number): void => { for (let i = 0; i < n; i++) session.scheduler.runTick(); };
  const state = session.services.get(Sandbox);
  // The glTF-authored corner spawned from node custom properties.
  assert.ok(state.goal !== undefined, 'goal trigger from the level');
  assert.equal(session.entities.get(state.props.get('Barrel.001')!, RigidBody)?.type, 'dynamic');
  ticks(60);
  const barrel = session.entities.get(state.props.get('Barrel.003')!, Transform3D)!.position.y;
  assert.ok(barrel > 1.5, `barrel stack stays up (${barrel})`);
  const top = state.crates[state.crates.length - 1]!;
  const topY = session.entities.get(top, Transform3D)!.position.y;
  assert.ok(topY > 3, `stack still standing (${topY})`);
  // Pad centre is (5, 2); the hero starts at (0, 4). Walk right, then forward.
  input.press('sandbox/right'); ticks(60); input.release('sandbox/right');
  input.press('sandbox/forward'); ticks(24); input.release('sandbox/forward');
  ticks(5);
  const hero = session.entities.get(state.hero, Transform3D)!.position;
  assert.ok(Math.abs(hero.x - 5) < 0.6 && Math.abs(hero.z - 2) < 0.6, `on the pad (${hero.x.toFixed(2)}, ${hero.z.toFixed(2)})`);
  assert.equal(state.onPad, true);
  assert.equal(state.padEntries, 1);
  host.stop();
});
