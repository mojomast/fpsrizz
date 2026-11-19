import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Maps, ModeRole, Prefabs } from '@bulkhead/sdk';
import { World } from '../games/shooter/contracts/shooter.ts';
import type { WorldDescription } from '@bulkhead/sdk';
import generatorManifest from '@bulkhead/std/dungeon-generator/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin, contentPack, hostFailure } from './helpers/host.ts';

const generator = { manifest: generatorManifest as never, load: () => import('@bulkhead/std/dungeon-generator/index.ts') };
const mode = codePlugin('test/map-mode', { register(ctx) {
  ctx.provideRole(ModeRole, 'test/map-mode', { name: 'Map test', description: 'No-op mode for map format tests', activate() {} });
} }, { dependencies: { 'core/world': '^1.0.0' } });
const recipe = (seed = 42, floors = [6, 7, 8]) => ({
  schema: 1, format: 'dungeon/generator', name: 'Test Dungeon', seed,
  cellSize: 2, wallHeight: 4, floorWidth: 30, floorHeight: 30, gap: 2,
  floors: floors.map((rooms, index) => ({ name: `Floor ${index + 1}`, rooms })),
  surfaces: { border: 'wall-brick', wall: 'wall-panel', room: 'floor-concrete', corridor: 'floor-plate', ceiling: 'ceiling-panel' },
  ambient: { color: '#c9b89b', intensity: 0.9 }, fog: { color: '#241e1b', near: 8, far: 46 },
  torch: { color: '#ffbc64', intensity: 1.5, distance: 12 },
});
const pack = (data: Record<string, unknown>, id = 'test/dungeon') => contentPack('test/dungeon-pack',
  [{ kind: 'map', id, data }], { dependencies: { 'core/world': '^1.0.0', 'dungeon/generator': '^1.0.0' } });

async function build(data = recipe(), mapId = 'test/dungeon') {
  const game = createHeadlessGame([generator, pack(data, mapId), mode]);
  try {
    await game.host.apply(headlessPreset({
      plugins: ['core/world', 'dungeon/generator', 'test/dungeon-pack', 'test/map-mode'],
      roles: { 'sdk/mode': 'test/map-mode' }, options: { map: mapId },
    }) as never);
  } catch (error) { game.host.stop(); throw error; }
  return { game, map: game.session().registries.require(Maps, mapId) };
}

function cellOf(world: WorldDescription, x: number, z: number) {
  return world.cells[z * world.width + x]!;
}
function reachable(world: WorldDescription, start: { x: number; z: number }): Set<number> {
  const cx = Math.floor(start.x / world.cellSize), cz = Math.floor(start.z / world.cellSize);
  const seen = new Set<number>(); const queue: [number, number][] = [[cx, cz]];
  while (queue.length) {
    const next = queue.pop()!;
    const x = next[0], z = next[1];
    if (x < 0 || z < 0 || x >= world.width || z >= world.height) continue;
    const key = z * world.width + x;
    if (seen.has(key) || cellOf(world, x, z).solid) continue;
    seen.add(key);
    queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  return seen;
}

test('dungeon generator builds deterministic, connected room wings with descent and role markers', async () => {
  const a = await build();
  const b = await build();
  try {
    assert.deepEqual(a.map.world.width, 94);
    assert.deepEqual(a.map.world.height, 30);
    assert.deepEqual(a.map.world.cells.length, 94 * 30);
    assert.deepEqual(a.map.world.spawns.map(s => [s.id, s.x, s.z]), b.map.world.spawns.map(s => [s.id, s.x, s.z]));
    assert.deepEqual(a.map.world.playerStart, b.map.world.playerStart);
    assert.ok(a.game.session().registries.has(Prefabs, 'dungeon/marker'));
    // Outer border is sealed and each wing is separated by solid cells.
    for (let x = 0; x < a.map.world.width; x++) {
      assert.equal(cellOf(a.map.world, x, 0).solid, true);
      assert.equal(cellOf(a.map.world, x, a.map.world.height - 1).solid, true);
    }
    for (let z = 0; z < a.map.world.height; z++) {
      assert.equal(cellOf(a.map.world, 0, z).solid, true);
      assert.equal(cellOf(a.map.world, a.map.world.width - 1, z).solid, true);
    }
    for (let depth = 1; depth <= 3; depth++) {
      const markers = a.map.world.spawns.filter(s => s.tags.includes(`dungeon-depth-${depth}`));
      const roles = (role: string) => markers.filter(s => s.tags.includes(`dungeon-role-${role}`));
      assert.equal(roles('start').length, 1);
      assert.equal(roles('exit').length, 1);
      assert.equal(roles('warden').length, 1);
      assert.ok(roles('loot').length >= 2);
      assert.ok(a.map.world.triggers.some(t => t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depth}`)));
      const start = roles('start')[0]!;
      const seen = reachable(a.map.world, start);
      for (const marker of markers) {
        const cx = Math.floor(marker.x / a.map.world.cellSize), cz = Math.floor(marker.z / a.map.world.cellSize);
        assert.equal(seen.has(cz * a.map.world.width + cx), true, `${marker.id} is reachable from its start`);
      }
    }
    assert.equal(a.map.world.spawns.filter(s => s.tags.includes('dungeon-room')).length, 21);
    assert.equal(a.map.world.triggers.filter(t => t.tags.includes('dungeon-exit')).length, 3);
    assert.ok(a.map.world.lights.length >= 9);
    assert.equal(a.map.world.playerStart.x > 0 && a.map.world.playerStart.z > 0, true);
    assert.equal(a.game.session().services.get(World).isFree(a.map.world.playerStart.x, a.map.world.playerStart.z, 0.35), true);
    for (const spawn of a.map.world.spawns) assert.equal(a.game.session().services.get(World).isFree(spawn.x, spawn.z, 0.25), true, spawn.id);
  } finally { a.game.host.stop(); b.game.host.stop(); }
});

test('dungeon generator varies layouts by seed, supports one to three wings and rejects invalid recipes', async () => {
  const first = await build(recipe(1, [5]));
  const second = await build(recipe(2, [5]));
  try {
    assert.notDeepEqual(first.map.world.spawns.map(s => [s.x, s.z]), second.map.world.spawns.map(s => [s.x, s.z]));
    assert.equal(first.map.world.width, 30);
    assert.equal(first.map.world.spawns.filter(s => s.tags.includes('dungeon-room')).length, 5);
  } finally { first.game.host.stop(); second.game.host.stop(); }
  for (const bad of [
    { ...recipe(), floors: [] },
    { ...recipe(), floors: [{ rooms: 3 }] },
    { ...recipe(), floorWidth: 48, gap: 4, floors: [{ rooms: 5 }, { rooms: 5 }, { rooms: 5 }] },
    { ...recipe(), floors: [{ rooms: 4 }, { rooms: 4 }, { rooms: 4 }, { rooms: 4 }] },
    { ...recipe(), seed: -1 },
  ]) {
    const game = createHeadlessGame([generator, pack(bad), mode]);
    const error = await hostFailure(game.host.apply(headlessPreset({
      plugins: ['core/world', 'dungeon/generator', 'test/dungeon-pack', 'test/map-mode'],
      roles: { 'sdk/mode': 'test/map-mode' }, options: { map: 'test/dungeon' },
    }) as never));
    assert.match(error.message, /floors|room|seed/i);
    game.host.stop();
  }
});
