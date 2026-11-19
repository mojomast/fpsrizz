import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collider, Health, Intent, Player, Transform } from '@bulkhead/sdk';
import { World } from '../contracts/shooter.ts';
import type { CatalogEntry } from '@bulkhead/sdk';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import manifest from '../plugins/example-dash-controller/manifest.json' with { type: 'json' };

const map: CatalogEntry = {
  manifest: { schema: 1, id: 'test/dash-map', name: 'Dash map', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0' } },
  content: [{ kind: 'map', id: 'test/dash-box', data: {
    schema: 1, format: 'core/grid', name: 'Box', cellSize: 2, wallHeight: 3,
    legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
    grid: ['###########', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '###########'],
    playerStart: { cell: [5, 4], yaw: 0 }, triggers: [{ id: 'exit', kind: 'zone', cell: [9, 7], radius: 0.9, tags: ['exit'] }], spawns: [],
  } }],
};

async function setup() {
  const game = createHeadlessGame([map, { manifest, load: () => import('../plugins/example-dash-controller/index.ts') }]);
  await game.host.apply(headlessPreset({
    plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'test/dash-map', 'example/dash-controller'],
    roles: { 'sdk/controller': 'example/dash-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'core/objective' },
    options: { map: 'test/dash-box' },
  }) as never);
  const session = game.session();
  const id = session.entities.first(Player);
  assert.ok(id !== undefined);
  const transform = session.entities.get(id, Transform)!;
  return { game, session, id, transform };
}

test('sprint increases sustained speed and diagonal movement stays normalized', async () => {
  const { game, transform: t } = await setup();
  try {
    game.input.press('core/move-forward');
    game.ticks(30);
    const z = t.z;
    game.ticks(1);
    const walk = z - t.z;
    game.input.press('example/sprint');
    game.ticks(30);
    const z2 = t.z;
    game.ticks(1);
    assert.ok(z2 - t.z > walk * 1.4);
    t.x = 11; t.z = 9;
    game.input.release('example/sprint');
    game.input.press('core/strafe-right');
    game.ticks(40);
    const x = t.x, z3 = t.z;
    game.ticks(1);
    assert.ok(Math.hypot(t.x - x, t.z - z3) <= 5.4 / 60 + 1e-6);
  } finally { game.host.stop(); }
});

test('dash locks direction, has a cooldown, collides, and stops on death', async () => {
  const { game, session, id, transform: t } = await setup();
  try {
    game.input.press('core/strafe-right');
    game.input.press('example/dash');
    const x = t.x, z = t.z;
    game.ticks(1);
    assert.ok(t.x - x > 0.25);
    game.input.release('core/strafe-right');
    game.input.press('core/move-forward');
    game.ticks(5);
    assert.ok(t.x - x > 1.5 && Math.abs(t.z - z) < 1e-6);
    game.input.release('example/dash');
    game.ticks(20);
    game.input.press('example/dash');
    const before = t.z;
    game.ticks(1);
    assert.ok(before - t.z < 0.2, 'dash press during cooldown is ignored');
    game.input.release('example/dash');
    game.ticks(40);
    t.x = 19.5; t.z = 9; t.yaw = 0;
    game.input.release('core/move-forward');
    game.input.press('core/strafe-right');
    game.input.press('example/dash');
    game.ticks(12);
    assert.ok(t.x <= 19.65 + 1e-6);
    assert.ok(session.services.get(World).isFree(t.x, t.z, session.entities.get(id, Collider)!.radius));
    session.entities.get(id, Health)!.dead = true;
    const at = { x: t.x, z: t.z };
    game.ticks(2);
    assert.deepEqual({ x: t.x, z: t.z }, at);
    assert.equal(session.entities.get(id, Player)!.speed, 0);
  } finally { game.host.stop(); }
});

test('combat and interaction intent edges survive the alternate controller', async () => {
  const { game, session, id } = await setup();
  try {
    for (const action of ['core/fire', 'core/use', 'core/weapon-2', 'core/weapon-next']) game.input.press(action);
    game.ticks(1);
    const intent = session.entities.get(id, Intent)!;
    assert.equal(intent.fire, true);
    assert.equal(intent.firePressed, true);
    assert.equal(intent.use, true);
    assert.equal(intent.weaponSlot, 2);
    assert.equal(intent.weaponCycle, 1);
    game.ticks(1);
    assert.equal(intent.fire, true);
    assert.equal(intent.firePressed, false);
    assert.equal(intent.use, false);
    assert.equal(intent.weaponSlot, 0);
    assert.equal(intent.weaponCycle, 0);
  } finally { game.host.stop(); }
});

test('dash movement replays identically after restart and cooldown state is fresh', async () => {
  const { game } = await setup();
  try {
    const replay = () => {
      const session = game.session();
      const id = session.entities.first(Player)!;
      const t = session.entities.get(id, Transform)!;
      const path: number[][] = [];
      game.input.press('core/move-forward');
      game.input.press('example/dash');
      for (let i = 0; i < 30; i++) {
        if (i === 4) game.input.release('example/dash');
        if (i === 10) game.input.press('example/sprint');
        game.ticks(1);
        path.push([t.x, t.z, t.yaw]);
      }
      return path;
    };
    const first = replay();
    await game.host.restart();
    assert.deepEqual(replay(), first);
  } finally { game.host.stop(); }
});
