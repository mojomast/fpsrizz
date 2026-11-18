import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Pickup, Player, Transform, World } from '../src/sdk/index.ts';
import type { CatalogEntry } from '../src/sdk/index.ts';
import keysManifest from '../games/shooter/plugins/example-keys/manifest.json' with { type: 'json' };
import manifest from '../games/shooter/plugins/example-key-dungeon/manifest.json' with { type: 'json' };
import content from '../games/shooter/plugins/example-key-dungeon/content.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const pack = { manifest, content } as CatalogEntry;
const keys = { manifest: keysManifest, load: () => import('../games/shooter/plugins/example-keys/index.ts') } as CatalogEntry;
const plugins = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/keys', 'example/key-dungeon'];
const preset = headlessPreset({ plugins, options: { map: 'example/key-dungeon' } });

test('dungeon requires its key and is traversable to victory, including after restart', async () => {
  const game = createHeadlessGame([keys, pack]);
  await game.host.apply(preset as never);
  const use = () => { game.input.press('core/use'); game.ticks(1); game.input.release('core/use'); game.ticks(1); };
  const pose = () => {
    const entities = game.session().entities;
    return entities.get(entities.first(Player)!, Transform)!;
  };
  // Navigate with the real controller and collision rather than moving the actor through walls.
  const walk = (x: number, z: number) => {
    game.input.press('core/move-forward');
    for (let i = 0; i < 400 && Math.hypot(pose().x - x, pose().z - z) > 0.25; i++) {
      pose().yaw = Math.atan2(-(x - pose().x), -(z - pose().z));
      game.ticks(1);
    }
    game.input.release('core/move-forward');
    game.ticks(12);
    assert.ok(Math.hypot(pose().x - x, pose().z - z) < 0.6, `could not reach ${x},${z}`);
  };
  const run = () => {
    const session = game.session();
    const world = session.services.get(World);
    const flow = session.services.get(Flow);
    const path: number[] = [];
    assert.equal(world.findPath(pose().x, pose().z, 3, 3, path), true, 'key is reachable');
    assert.equal(world.findPath(pose().x, pose().z, 19, 7, path), false, 'closed gate separates the exit');
    assert.equal(world.triggers().some((t) => !!t.desc.opens), false, 'no trigger bypasses the lock');
    assert.equal(session.entities.count(Pickup), 1);
    walk(9, 7);
    pose().yaw = -Math.PI / 2;
    use();
    assert.equal(world.door('vault-door')!.open, false);
    assert.equal(world.door('vault-door')!.locked, true);
    assert.match(flow.notice.text, /vault/);
    assert.equal(flow.result, undefined);
    walk(3, 3);
    assert.equal(session.entities.count(Pickup), 0);
    walk(9, 7);
    pose().yaw = -Math.PI / 2;
    use();
    assert.equal(world.door('vault-door')!.open, true);
    assert.equal(world.door('vault-door')!.locked, false);
    assert.equal(world.findPath(pose().x, pose().z, 19, 7, path), true, 'exit is reachable after unlocking');
    walk(19, 7);
    assert.equal(flow.result?.outcome, 'victory');
  };
  run();
  await game.host.restart();
  run();
  game.host.stop();
});

test('dungeon dependencies and keyed-gate parameters are validated during staging', async () => {
  const missingKeys = createHeadlessGame([keys, pack]);
  await assert.rejects(() => missingKeys.host.apply(headlessPreset({ plugins: plugins.filter((id) => id !== 'example/keys'), options: { map: 'example/key-dungeon' } }) as never), /example\/keys/);
  const badContent = structuredClone(content);
  const map = badContent.find((entry) => entry.kind === 'map')!;
  const gate = map.data.spawns!.find((spawn) => spawn.prefab === 'example/keyed-gate')!;
  gate.params!.door = 'missing';
  const invalid = createHeadlessGame([keys, { manifest, content: badContent } as CatalogEntry]);
  await assert.rejects(() => invalid.host.apply(preset as never), /unknown door "missing"/);
});
