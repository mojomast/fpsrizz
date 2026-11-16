import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Enemy, Flow, Player, Transform, definePlugin, spawnPrefab } from '../src/sdk/index.ts';
import type { CatalogEntry, SessionContext } from '../src/sdk/index.ts';
import manifest from '../src/plugins/example-stealth/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const maps: CatalogEntry = {
  manifest: { schema: 1, id: 'test/stealth-map', name: 'Map', version: '1.0.0', kind: 'content', sdk: '^1.0.0', dependencies: { 'core/world': '^1.0.0' } },
  content: [{ kind: 'map', id: 'test/stealth', data: {
    schema: 1, format: 'core/grid', name: 'Stealth', cellSize: 2, wallHeight: 3,
    legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
    grid: ['########', '#......#', '#..#...#', '#..#...#', '#......#', '########'],
    playerStart: { cell: [1, 1], yaw: 0 },
    triggers: [{ id: 'exit', kind: 'zone', cell: [6, 4], radius: 0.5, tags: ['exit'] }],
    spawns: [{ id: 'sentry', prefab: 'example/stealth-guard', cell: [2, 3], yaw: 0, params: { range: 8, angle: 90, delay: 0.5 } }],
  } }],
};

async function setup() {
  let context: SessionContext | undefined;
  const probe = {
    manifest: { schema: 1, id: 'test/probe', name: 'Probe', version: '1.0.0', kind: 'code', sdk: '^1.0.0' },
    load: async () => ({ default: definePlugin({ activate(ctx) { context = ctx; } }) }),
  } as unknown as CatalogEntry;
  const game = createHeadlessGame([maps, probe, { manifest, load: () => import('../src/plugins/example-stealth/index.ts') }]);
  await game.host.apply(headlessPreset({
    plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/stealth', 'test/stealth-map', 'test/probe'],
    options: { map: 'test/stealth' },
  }) as never);
  assert.ok(context);
  const ctx: SessionContext = context;
  const player = ctx.world.first(Player)!;
  const pose = ctx.world.get(player, Transform)!;
  const flow = ctx.services.get(Flow);
  const move = (x: number, z: number) => { pose.x = pose.prevX = x; pose.z = pose.prevZ = z; };
  return { game, ctx, flow, move };
}

test('map guard uses a continuous vision timer and resets when sight is lost', async () => {
  const { game, ctx, flow, move } = await setup();
  assert.equal(ctx.world.count(Enemy), 0);
  move(5, 3); // guard at (5,7), looking north
  game.ticks(20);
  assert.equal(flow.ended, false);
  move(5, 9); // behind the guard
  game.ticks(2);
  move(5, 3);
  game.ticks(29);
  assert.equal(flow.ended, false);
  game.ticks(1);
  assert.equal(flow.result?.outcome, 'defeat');
  game.host.stop();
});

test('walls, cone and range block vision, even with core enemy plugin enabled', async () => {
  const { game, flow, move } = await setup();
  move(9, 5); // wall between (5,7) and (9,5), inside the cone
  game.ticks(40);
  assert.equal(flow.ended, false);
  move(3, 7); // outside cone
  game.ticks(40);
  assert.equal(flow.ended, false);
  move(5, -2); // beyond range
  game.ticks(40);
  assert.equal(flow.ended, false);
  game.host.stop();
});

test('prefab parameters apply independently and session restart clears timers and resources', async () => {
  const { game, ctx, flow, move } = await setup();
  // A second guard faces east with an instantaneous, short-range cone.
  const guard = spawnPrefab(ctx, 'example/stealth-guard', { x: 3, z: 3, yaw: -Math.PI / 2 }, { range: 1, angle: 30, delay: 0 });
  move(5, 3);
  game.ticks(1);
  assert.equal(flow.ended, false);
  move(3.5, 3);
  game.ticks(1);
  assert.equal(flow.result?.outcome, 'defeat');
  await game.host.restart();
  assert.equal(game.session().services.get(Flow).ended, false);
  assert.equal(game.session().entities.isAlive(guard), false);
  game.host.stop();
  assert.equal(game.host.session, undefined);
});

test('map guard parameters are validated during staging; omitted values use defaults', async () => {
  const { game } = await setup();
  const original = game.session();
  const pack = (spawns: unknown[]): CatalogEntry => ({
    manifest: { schema: 1, id: 'test/guard-validation', name: 'Guard validation', version: '1.0.0', kind: 'content', sdk: '^1.0.0', dependencies: { 'core/world': '^1.0.0', 'example/stealth': '^1.0.0' } },
    content: [{ kind: 'map', id: 'test/guard-validation', data: {
      schema: 1, format: 'core/grid', name: 'Guard validation', cellSize: 2, wallHeight: 3,
      legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
      grid: ['######', '#....#', '#....#', '#....#', '######'],
      playerStart: { cell: [1, 1], yaw: 0 },
      triggers: [{ id: 'exit', kind: 'zone', cell: [4, 3], radius: 0.5, tags: ['exit'] }], spawns,
    } }],
  });
  const preset = headlessPreset({
    plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/stealth', 'test/stealth-map', 'test/probe', 'test/guard-validation'],
    options: { map: 'test/stealth' }, // validate even maps that aren't selected
  });
  try {
    await assert.rejects(game.host.apply(preset as never, [pack([
      { id: 'bad-types', prefab: 'example/stealth-guard', cell: [2, 2], params: { range: '8', angle: null, delay: false, extra: 1 } },
      { id: 'too-low', prefab: 'example/stealth-guard', cell: [2, 2], params: { range: -1, angle: -1, delay: -1 } },
      { id: 'too-high', prefab: 'example/stealth-guard', cell: [2, 2], params: { range: 1001, angle: 361, delay: 3601 } },
    ])]), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /failed at "validate"/);
      for (const [index, keys] of [[0, ['range', 'angle', 'delay', 'extra']], [1, ['range', 'angle', 'delay']], [2, ['range', 'angle', 'delay']]] as const) {
        for (const key of keys) assert.ok(error.message.includes(`map "test/guard-validation".spawns[${index}].params.${key}`), error.message);
      }
      assert.match(error.message, /unknown parameter "extra"/);
      return true;
    });
    assert.equal(game.session(), original, 'failed staging preserves the running session');
    await game.host.apply({ ...preset, options: { map: 'test/guard-validation' } } as never, [pack([
      { id: 'defaults', prefab: 'example/stealth-guard', cell: [2, 2] },
      { id: 'boundaries', prefab: 'example/stealth-guard', cell: [3, 2], params: { range: 0, angle: 360, delay: 3600 } },
      { id: 'other-prefab', prefab: 'core/bullets', cell: [4, 2], params: { arbitrary: true } },
    ])]);
    const ctx = game.session();
    const p = ctx.entities.get(ctx.entities.first(Player)!, Transform)!;
    Object.assign(p, { x: 5, z: 3, prevX: 5, prevZ: 3 });
    game.ticks(59);
    assert.equal(ctx.services.get(Flow).ended, false);
    game.ticks(1);
    assert.equal(ctx.services.get(Flow).result?.outcome, 'defeat');
  } finally { game.host.stop(); }
});
