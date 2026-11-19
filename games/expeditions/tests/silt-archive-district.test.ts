import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleDistrict } from '../plugins/silt-game/district.ts';
import { loadChamber } from '../plugins/silt-game/chambers.ts';
import { Reporter } from '@bulkhead/kernel/validate.ts';

const rows = ['####D####', '#.......#', '#.~~~...#', '#.......#', 'D.......D', '#...^...#', '#.......#', '#.......#', '####D####'];
const chamber = loadChamber({ name: 'Intake', rows }, new Reporter([], 'test'))!;
function random(seed: number) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

test('district assembly is deterministic and every objective has a matching cardinal route', () => {
  const layouts = new Set<string>(), graphs = new Set<string>();
  for (let seed = 0; seed < 300; seed++) {
    const rooms = assembleDistrict([chamber], random(seed));
    assert.deepEqual(rooms, assembleDistrict([chamber], random(seed)));
    layouts.add(JSON.stringify(rooms.map(r => [r.x, r.y])));
    graphs.add(JSON.stringify(rooms.map(r => r.neighbors)));
    assert.equal(rooms.length, 9);
    assert.equal(new Set(rooms.map(r => `${r.x},${r.y}`)).size, 9);
    assert.deepEqual(rooms.slice(0, 6).map(r => r.purpose), ['entry', 'passage', 'fragment', 'passage', 'boss', 'lift']);
    const visited = new Set(['room-0']), todo = ['room-0'];
    for (let i = 0; i < todo.length; i++) {
      const room = rooms.find(r => r.id === todo[i])!;
      for (const id of room.neighbors) {
        const next = rooms.find(r => r.id === id)!;
        assert.ok(next.neighbors.includes(room.id));
        assert.equal(Math.abs(room.x - next.x) + Math.abs(room.y - next.y), 1);
        if (!visited.has(id)) { visited.add(id); todo.push(id); }
      }
    }
    assert.equal(visited.size, 9);
  }
  assert.ok(layouts.size > 1);
  assert.ok(graphs.size > 1);
});

test('district assembly refuses invalid template sockets and random values', () => {
  assert.throws(() => assembleDistrict([], random(0)), TypeError);
  assert.throws(() => assembleDistrict([{ name: 'bad', rows: [] }], random(0)), TypeError);
  assert.throws(() => assembleDistrict([chamber], () => 1), RangeError);
});
