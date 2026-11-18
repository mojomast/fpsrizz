import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Pickup, Player, Transform } from '../src/sdk/index.ts';
import extraction from '../games/shooter/plugins/example-extraction/manifest.json' with { type: 'json' };
import manifest from '../games/shooter/plugins/example-extraction-map/manifest.json' with { type: 'json' };
import content from '../games/shooter/plugins/example-extraction-map/content.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const map = content.find((entry) => entry.kind === 'map')!.data;
type Cell = [number, number];

// Find a cardinal route through walkable map cells, rather than assuming a direct line through walls.
function route(start: Cell, goal: Cell): Cell[] {
  const queue: Cell[][] = [[start]];
  const seen = new Set([start.join(',')]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i]!;
    const [x, z] = path[path.length - 1]!;
    if (x === goal[0] && z === goal[1]) return path;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Cell[]) {
      const next: Cell = [x + dx, z + dz];
      const tile = map.grid?.[next[1]]?.[next[0]];
      if ((tile !== '.' && tile !== ',') || seen.has(next.join(','))) continue;
      seen.add(next.join(','));
      queue.push([...path, next]);
    }
  }
  throw new Error(`No walkable route from ${start} to ${goal}`);
}

async function setup(duration = 120) {
  const game = createHeadlessGame([
    { manifest: extraction, load: () => import('../games/shooter/plugins/example-extraction/index.ts') },
    { manifest, content },
  ]);
  await game.host.apply(headlessPreset({
    plugins: ['core/world', 'core/combat', 'core/player', 'example/extraction', 'example/extraction-map'],
    roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/extraction' },
    options: { map: 'example/salvage-run' },
    config: { 'example/extraction': { duration } },
  }) as never);
  const flow = () => game.session().services.get(Flow);
  const visit = ([x, z]: Cell) => {
    const session = game.session();
    const pose = session.entities.get(session.entities.first(Player)!, Transform)!;
    pose.x = (x + 0.5) * map.cellSize!;
    pose.z = (z + 0.5) * map.cellSize!;
    game.ticks(1);
  };
  return { game, flow, visit };
}

test('salvage route connects all caches to extraction and banks their values', async () => {
  const { game, flow, visit } = await setup();
  try {
    assert.equal(game.session().entities.count(Pickup), 4);
    let current = map.playerStart!.cell as Cell;
    for (const spawn of map.spawns!) {
      const target = spawn.cell as Cell;
      for (const cell of route(current, target).slice(1)) visit(cell);
      assert.equal(flow().ended, false);
      current = target;
    }
    assert.equal(game.session().entities.count(Pickup), 0);
    assert.equal(flow().status.get('loot')?.value, '55');
    for (const cell of route(current, map.triggers![0]!.cell as Cell).slice(1)) visit(cell);
    assert.equal(flow().result?.outcome, 'victory');
    assert.deepEqual(flow().result?.stats, [['Loot extracted', '55']]);
  } finally { game.host.stop(); }
});

test('salvage carried at timeout is lost and a restart restores the pack', async () => {
  const { game, flow, visit } = await setup(1);
  try {
    visit(map.spawns![0]!.cell as Cell);
    assert.equal(flow().status.get('loot')?.value, '10');
    game.ticks(65);
    assert.equal(flow().result?.title, 'Time expired');
    assert.deepEqual(flow().result?.stats, [['Loot extracted', '0']]);
    await game.host.restart();
    assert.equal(flow().ended, false);
    assert.equal(flow().status.get('loot')?.value, '0');
    assert.equal(game.session().entities.count(Pickup), 4);
  } finally { game.host.stop(); }
});
