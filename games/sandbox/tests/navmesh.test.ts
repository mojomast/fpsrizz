import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry } from '@bulkhead/kernel/host.ts';
import { createAssetService, preloadManifestAssets } from '@bulkhead/platform-web/assets.ts';
import { createInputCore } from '@bulkhead/platform-web/input.ts';
import { Assets, Input, InputAxes, NavAgentState, NavMesh, PHASES, SDK_COMPAT, SDK_VERSION, Transform3D } from '@bulkhead/sdk';
import { Sandbox, SandboxNav } from '../contracts/sandbox.ts';
import preset from '../presets/navmesh-sandbox.json' with { type: 'json' };

const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../../../${dir}/index.ts`) });

test('navmesh sandbox: the follower builds a navmesh from the level colliders and chases the hero', async () => {
  const input = createInputCore();
  const assets = createAssetService();
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, beforeActivate: preloadManifestAssets(assets), installHostServices(session, scope) {
    session.services.provide(Input, input.service, 'host', scope);
    session.services.provide(Assets, assets, 'host', scope);
    session.addBeforeTick(() => input.beginTick(), scope);
  } });
  input.setAxes(() => host.active?.registries.entries(InputAxes).map((e) => [e.id, e.value] as const) ?? []);
  host.setCatalog(['std-transform', 'std-assets', 'std-render-sync', 'std-physics-rapier', 'std-navigation-recast'].map((p) => real(`packages/std/plugins/${p}`))
    .concat(['sandbox-game', 'sandbox-presentation', 'sandbox-navmesh'].map((p) => real(`games/sandbox/plugins/${p}`))));
  const session = await host.apply(preset);
  const ticks = (n: number): void => { for (let i = 0; i < n; i++) session.scheduler.runTick(); };
  const hero = session.services.get(Sandbox).hero;
  const { follower } = session.services.get(SandboxNav);
  const gap = (): number => {
    const a = session.entities.get(hero, Transform3D)!.position, b = session.entities.get(follower, Transform3D)!.position;
    return Math.hypot(a.x - b.x, a.z - b.z);
  };
  ticks(1);
  const info = session.services.get(NavMesh).info()!;
  assert.equal(info.source, 'colliders');
  assert.ok(info.triangles > 5 * 12, `floor, walls and glTF props (${info.triangles} source triangles)`);
  const start = gap();
  ticks(60 * 6);
  assert.ok(gap() < 2 && gap() < start - 5, `caught up with the hero (${start.toFixed(1)} -> ${gap().toFixed(2)} m)`);
  assert.equal(session.entities.get(follower, NavAgentState)!.status, 'arrived');
  // Walk away: it follows again.
  input.press('sandbox/left'); ticks(60); input.release('sandbox/left');
  ticks(2);
  assert.equal(session.entities.get(follower, NavAgentState)!.status, 'moving');
  ticks(60 * 4);
  assert.ok(gap() < 2, `followed (${gap().toFixed(2)} m)`);
  host.stop();
});
