import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '../../../src/kernel/host.ts';
import type { CatalogEntry } from '../../../src/kernel/host.ts';
import { createInputCore } from '../../../src/platform/input.ts';
import { Input, PHASES, SDK_COMPAT, SDK_VERSION, Transform3D } from '../../../src/sdk/index.ts';
import { Sandbox } from '../contracts/sandbox.ts';
import preset from '../presets/physics-sandbox.json' with { type: 'json' };

const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../../../${dir}/index.ts`) });

test('physics sandbox: the hero walks onto the sensor pad and the crate stack stays standing', async () => {
  const input = createInputCore();
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) {
    session.services.provide(Input, input.service, 'host', scope);
    session.addBeforeTick(() => input.beginTick(), scope);
  } });
  host.setCatalog(['src/plugins/std-transform', 'src/plugins/std-render-sync', 'src/plugins/std-physics-rapier', 'games/sandbox/plugins/sandbox-game', 'games/sandbox/plugins/sandbox-presentation'].map(real));
  const session = await host.apply(preset);
  const ticks = (n: number): void => { for (let i = 0; i < n; i++) session.scheduler.runTick(); };
  const state = session.services.get(Sandbox);
  ticks(60);
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
