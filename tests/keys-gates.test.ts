import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Intent, Pickup, PickupEffects, Player, Transform, World, definePlugin, makeTransform } from '../src/sdk/index.ts';
import type { CatalogEntry, SessionContext } from '../src/sdk/index.ts';
import manifest from '../games/shooter/plugins/example-keys/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const base = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/keys', 'test/keys-content', 'test/probe'];

function content(door = 'gate', key: unknown = 'blue', extra: Record<string, unknown> = {}): CatalogEntry {
  return {
    manifest: { schema: 1, id: 'test/keys-content', name: 'Keys test', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0', 'example/keys': '^1.0.0' } },
    content: [
      { kind: 'pickup', id: 'test/blue-key', data: { name: 'Blue key', effect: 'example/give-key', params: { key }, visual: 'pickup-key' } },
      { kind: 'map', id: 'test/gate-map', data: {
        schema: 1, format: 'core/grid', name: 'Gate', cellSize: 2,
        legend: { '#': { solid: true, wall: 'wall' }, '.': { floor: 'floor' } },
        grid: ['#######', '#..#..#', '#.....#', '#..#..#', '#######'],
        playerStart: { cell: [1, 2], yaw: -90 },
        doors: [{ id: 'gate', cell: [3, 2], locked: true }],
        spawns: [
          { id: 'guard', prefab: 'example/keyed-gate', cell: [2, 2], params: { door, key: 'blue', ...extra } },
          { id: 'key', prefab: 'test/blue-key', cell: [1, 1] },
        ],
        triggers: [{ id: 'exit', kind: 'zone', cell: [5, 2], tags: ['exit'] }],
      } },
    ],
  } as CatalogEntry;
}

async function setup(entry = content()) {
  let context: SessionContext | undefined;
  const probe = { manifest: { schema: 1, id: 'test/probe', name: 'Probe', version: '1.0.0', kind: 'code', sdk: '^2.0.0' }, load: async () => ({ default: definePlugin({ activate(ctx) { context = ctx; } }) }) } as unknown as CatalogEntry;
  const game = createHeadlessGame([entry, probe, { manifest, load: () => import('../games/shooter/plugins/example-keys/index.ts') }]);
  const preset = headlessPreset({ plugins: base, options: { map: 'test/gate-map' } });
  await game.host.apply(preset as never);
  assert.ok(context);
  return { game, ctx: context, preset };
}

test('map pickup unlocks its gate, one use at a time; restart resets keys and door', async () => {
  const { game, ctx } = await setup();
  const player = ctx.world.first(Player)!;
  const pose = ctx.world.get(player, Transform)!;
  const world = ctx.services.get(World);
  const use = () => { game.input.press('core/use'); game.ticks(1); game.input.release('core/use'); game.ticks(1); };
  pose.x = 5.5; pose.z = 5; pose.yaw = -Math.PI / 2;
  use();
  assert.equal(world.door('gate')!.open, false);
  assert.match(ctx.services.get(Flow).notice.text, /blue/);
  pose.x = 3; pose.z = 3;
  game.ticks(1);
  assert.equal(ctx.world.count(Pickup), 0);
  pose.x = 5.5; pose.z = 5;
  use();
  assert.equal(world.door('gate')!.open, true);
  assert.equal(world.door('gate')!.locked, false);
  use();
  assert.equal(world.door('gate')!.open, false);
  use();
  assert.equal(world.door('gate')!.open, true);
  pose.x = 11; pose.z = 5;
  game.ticks(1);
  assert.equal(ctx.services.get(Flow).result?.outcome, 'victory');
  await game.host.restart();
  const session = game.session();
  const newPlayer = session.entities.first(Player)!;
  const newPose = session.entities.get(newPlayer, Transform)!;
  newPose.x = 5.5; newPose.z = 5; newPose.yaw = -Math.PI / 2;
  use();
  assert.equal(session.services.get(World).door('gate')!.open, false);
  assert.match(session.services.get(Flow).notice.text, /blue/);
  game.host.stop();
});

test('key ownership is actor-specific and duplicate pickups are not consumed', async () => {
  const { game, ctx } = await setup();
  const effect = ctx.instantiate(PickupEffects, 'example/give-key', (def, owner) => def.start(owner));
  const actor = ctx.world.create();
  ctx.world.add(actor, Transform, makeTransform(5.5, 5, -Math.PI / 2));
  ctx.world.add(actor, Intent, { moveX: 0, moveZ: 0, fire: false, firePressed: false, use: true, weaponSlot: 0, weaponCycle: 0 });
  const player = ctx.world.first(Player)!;
  assert.equal(effect(player, { key: 'blue' }), true);
  assert.equal(effect(player, { key: 'blue' }), false);
  game.ticks(1);
  assert.equal(ctx.services.get(World).door('gate')!.open, false);
  assert.equal(effect(actor, { key: 'blue' }), true);
  game.ticks(1);
  assert.equal(ctx.services.get(World).door('gate')!.open, true);
  game.host.stop();
});

test('invalid key and gate parameters fail staging', async () => {
  for (const bad of [content('missing'), content('gate', ''), content('gate', 'blue', { typo: 1 })]) {
    await assert.rejects(() => setup(bad));
  }
});
