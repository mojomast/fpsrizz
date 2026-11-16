import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Combat, Enemy, Flow, Health, Player, Transform } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import manifest from '../src/plugins/example-roguelite/manifest.json' with { type: 'json' };

async function setup(seed: number) {
  const game = createHeadlessGame([{ manifest: manifest as never, load: () => import('../src/plugins/example-roguelite/index.ts') }]);
  await game.host.apply(headlessPreset({
    seed,
    plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/content', 'example/roguelite'],
    roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/roguelite' },
  }) as never);
  return game;
}

function living(game: Awaited<ReturnType<typeof setup>>) {
  const session = game.session();
  const ids: number[] = [];
  session.entities.each(Enemy, (id) => { if (!session.entities.get(id, Health)?.dead) ids.push(id); });
  return ids;
}

function clear(game: Awaited<ReturnType<typeof setup>>) {
  const session = game.session();
  const combat = session.services.get(Combat);
  for (const id of living(game)) combat.damage({ target: id, source: 0, amount: 10000, kind: 'test', x: 0, z: 0 });
  game.ticks(1);
}

function snapshot(game: Awaited<ReturnType<typeof setup>>) {
  const session = game.session();
  return {
    encounters: living(game).map((id) => ({ def: session.entities.get(id, Enemy)!.def, pos: session.entities.get(id, Transform) })),
    upgrades: session.services.get(Flow).status.get('upgrades')?.value,
  };
}

test('seeded encounters and automatic rewards repeat, and seeds vary outcomes', async () => {
  async function run(seed: number) {
    const game = await setup(seed);
    const states = [snapshot(game)];
    clear(game); states.push(snapshot(game));
    clear(game); states.push(snapshot(game));
    clear(game);
    assert.equal(game.session().services.get(Flow).result?.outcome, 'victory');
    game.host.stop();
    return states;
  }
  const a = await run(7);
  assert.deepEqual(await run(7), a);
  const others = await Promise.all([8, 9, 10].map(run));
  assert.ok(others.some((other) => JSON.stringify(other) !== JSON.stringify(a)));
  assert.ok(a[2]!.upgrades?.includes('Power') && a[2]!.upgrades?.includes('Vitality'));
});

test('upgrades change health and outgoing damage; defeat and restart reset the run', async () => {
  const game = await setup(7);
  const session = game.session();
  const player = session.entities.first(Player)!;
  const hp = session.entities.get(player, Health)!;
  const initialMax = hp.max;
  clear(game);
  clear(game);
  assert.equal(hp.max, initialMax + 30);
  const target = living(game)[0]!;
  const targetHp = session.entities.get(target, Health)!;
  const before = targetHp.hp;
  session.services.get(Combat).damage({ target, source: player, amount: 10, kind: 'test', x: 0, z: 0 });
  game.ticks(1);
  assert.equal(targetHp.hp, before - 15);
  session.services.get(Combat).damage({ target: player, source: 0, amount: 10000, kind: 'test', x: 0, z: 0 });
  game.ticks(1);
  assert.equal(session.services.get(Flow).result?.outcome, 'defeat');
  game.ticks(5);
  assert.equal(session.services.get(Flow).result?.outcome, 'defeat');
  await game.host.restart();
  const restarted = game.session();
  assert.equal(restarted.services.get(Flow).ended, false);
  assert.equal(restarted.services.get(Flow).status.get('upgrades')?.value, 'None');
  assert.equal(restarted.entities.get(restarted.entities.first(Player)!, Health)!.max, initialMax);
  assert.equal(restarted.services.get(Flow).status.get('wave')?.value, '1 / 3');
  game.host.stop();
});

test('a map without enemy spawn templates is rejected before replacing the session', async () => {
  const game = await setup(7);
  const previous = game.session();
  const emptyMap = {
    manifest: { schema: 1, id: 'test/empty-map', name: 'Empty map', version: '1.0.0', kind: 'content', sdk: '^1.0.0', dependencies: { 'core/world': '^1.0.0' } },
    content: [{ kind: 'map', id: 'test/empty', data: {
      schema: 1, format: 'core/grid', name: 'Empty', cellSize: 2, wallHeight: 3,
      legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
      grid: ['#####', '#...#', '#...#', '#...#', '#####'], playerStart: { cell: [1, 1], yaw: 0 }, spawns: [],
    } }],
  };
  await assert.rejects(game.host.apply(headlessPreset({
    plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/content', 'example/roguelite', 'test/empty-map'],
    roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/roguelite' },
    options: { map: 'test/empty' },
  }) as never, [emptyMap] as never), /requires at least one map spawn/);
  assert.equal(game.session(), previous);
  game.host.stop();
});
