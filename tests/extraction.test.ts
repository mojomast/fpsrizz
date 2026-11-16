import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Combat, Flow, Pickup, Player, Transform } from '../src/sdk/index.ts';
import type { CatalogEntry } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import manifest from '../src/plugins/example-extraction/manifest.json' with { type: 'json' };

const map = {
  schema: 1, format: 'core/grid', name: 'Extraction test', cellSize: 2, wallHeight: 3,
  legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
  grid: ['#######', '#.....#', '#.....#', '#.....#', '#######'],
  playerStart: { cell: [1, 1], yaw: 0 },
  triggers: [{ id: 'exit', kind: 'zone', cell: [5, 3], radius: 0.8, tags: ['exit'] }],
  spawns: [{ id: 'loot-a', prefab: 'test/loot', cell: [2, 1] }, { id: 'loot-b', prefab: 'test/loot', cell: [3, 1] }],
};
const content: CatalogEntry = {
  manifest: { schema: 1, id: 'test/extraction-content', name: 'Extraction content', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0', 'example/extraction': '^1.0.0' } },
  content: [
    { kind: 'pickup', id: 'test/loot', data: { name: 'Loot', effect: 'example/loot', params: { amount: 5 }, visual: 'pickup-ammo' } },
    { kind: 'map', id: 'test/extraction-map', data: map },
  ],
};

async function setup(duration = 10) {
  const game = createHeadlessGame([{ manifest, load: () => import('../src/plugins/example-extraction/index.ts') }, content]);
  await game.host.apply(headlessPreset({
    plugins: ['core/world', 'core/combat', 'core/player', 'example/extraction', 'test/extraction-content'],
    roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/extraction' },
    options: { map: 'test/extraction-map' }, config: { 'example/extraction': { duration } },
  }) as never);
  const move = (x: number, z: number) => {
    const session = game.session();
    const pose = session.entities.get(session.entities.first(Player)!, Transform)!;
    pose.x = x; pose.z = z;
    game.ticks(1);
  };
  return { game, move, flow: () => game.session().services.get(Flow) };
}

test('collects distinct loot pickups and extracts their total', async () => {
  const { game, move, flow } = await setup();
  try {
    assert.equal(flow().status.get('loot')?.value, '0');
    move(5, 3);
    assert.equal(flow().status.get('loot')?.value, '5');
    assert.equal(game.session().entities.count(Pickup), 1);
    move(7, 3);
    assert.equal(flow().status.get('loot')?.value, '10');
    move(11, 7);
    assert.equal(flow().result?.outcome, 'victory');
    assert.deepEqual(flow().result?.stats, [['Loot extracted', '10']]);
  } finally { game.host.stop(); }
});

test('death loses loot even when standing at the exit', async () => {
  const { game, move, flow } = await setup();
  try {
    move(5, 3);
    const session = game.session();
    const player = session.entities.first(Player)!;
    const pose = session.entities.get(player, Transform)!;
    pose.x = 11; pose.z = 7;
    session.services.get(Combat).damage({ target: player, amount: 1000, source: 0, kind: 'test', x: 11, z: 7 });
    game.ticks(1);
    assert.equal(flow().result?.outcome, 'defeat');
    assert.deepEqual(flow().result?.stats, [['Loot extracted', '0']]);
    assert.equal(flow().status.get('loot')?.value, '0');
  } finally { game.host.stop(); }
});

test('timeout loses loot and restart restores timer and pickups', async () => {
  const { game, move, flow } = await setup(1);
  try {
    move(5, 3);
    game.ticks(65);
    assert.equal(flow().result?.title, 'Time expired');
    assert.deepEqual(flow().result?.stats, [['Loot extracted', '0']]);
    await game.host.restart();
    assert.equal(flow().ended, false);
    assert.equal(flow().status.get('loot')?.value, '0');
    assert.equal(flow().status.get('time')?.value, '1');
    assert.equal(game.session().entities.count(Pickup), 2);
    move(5, 3);
    assert.equal(flow().status.get('loot')?.value, '5');
  } finally { game.host.stop(); }
});

test('staging reports missing exit and loot and invalid effect parameters', async () => {
  const invalid: CatalogEntry = { ...content, content: [
    { kind: 'pickup', id: 'test/loot', data: { name: 'Loot', effect: 'example/loot', params: { amount: 0, typo: 1 }, visual: 'pickup-ammo' } },
    { kind: 'map', id: 'test/extraction-map', data: { ...map, triggers: [], spawns: [] } },
  ] };
  const game = createHeadlessGame([{ manifest, load: () => import('../src/plugins/example-extraction/index.ts') }, invalid]);
  try {
    await assert.rejects(game.host.apply(headlessPreset({
      plugins: ['core/world', 'core/combat', 'core/player', 'example/extraction', 'test/extraction-content'],
      roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/extraction' },
      options: { map: 'test/extraction-map' },
    }) as never), (error: unknown) => {
      const issues = JSON.stringify((error as { issues: unknown }).issues);
      assert.match(issues, /exit/); assert.match(issues, /example\/loot/);
      assert.match(issues, /amount/); assert.match(issues, /typo/);
      return true;
    });
  } finally { game.host.stop(); }
});
