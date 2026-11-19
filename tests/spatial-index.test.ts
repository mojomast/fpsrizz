import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../games/shooter/plugins/core-world/collision.ts';
import type { Box } from '../games/shooter/plugins/core-world/collision.ts';
import { createRng } from '@bulkhead/kernel/rng.ts';
import { SpatialHash } from '@bulkhead/sdk';

test('spatial hash: set/move/delete, insertion-ordered results, Y filtering', () => {
  const g = new SpatialHash<string>(2);
  g.set('a', { minX: 0, minZ: 0, maxX: 1, maxZ: 1 });
  g.set('b', { minX: 5, minZ: 5, maxX: 9, maxZ: 6 });
  g.set('c', { minX: 0.5, minZ: 0.5, maxX: 6, maxZ: 0.8, minY: 2, maxY: 3 });
  assert.deepEqual(g.query({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 }), ['a', 'c']);
  assert.deepEqual(g.query({ minX: 0, minZ: 0, maxX: 1, maxZ: 1, minY: 0, maxY: 1 }), ['a']);
  assert.deepEqual(g.near(7, 7, 1.1), ['b']);
  g.set('a', { minX: 8, minZ: 5.5, maxX: 8.5, maxZ: 5.8 });
  assert.deepEqual(g.query({ minX: 7, minZ: 5, maxX: 9, maxZ: 6 }), ['a', 'b'], 'a moved but keeps its original order');
  assert.ok(g.delete('b'));
  assert.deepEqual(g.near(7, 7, 2), ['a']);
  assert.equal(g.size, 2);
  assert.deepEqual(g.segment(-10, 0.6, 1, 0, Infinity), ['c']);
  assert.deepEqual(g.segment(-10, 0.6, -1, 0, 100), []);
});

function randomWorld(seed: number, n: number, grid: boolean): CollisionWorld {
  const rng = createRng(seed);
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    const x = rng.next() * 190 + 2, z = rng.next() * 190 + 2, w = 0.3 + rng.next() * 6, d = 0.3 + rng.next() * 6;
    boxes.push({ id: `b${i}`, minX: x, minZ: z, maxX: x + w, maxZ: z + d, active: rng.next() > 0.1 });
  }
  return new CollisionWorld(boxes, 200, 200, { grid });
}

test('collision grid: isFree and raycast match brute force exactly on a 600-box map', () => {
  const brute = randomWorld(7, 600, false), grid = randomWorld(7, 600, true);
  assert.ok(grid.grid && !brute.grid);
  const rng = createRng(11);
  for (let i = 0; i < 3000; i++) {
    const x = rng.next() * 200, z = rng.next() * 200, r = rng.next() * 1.5;
    assert.equal(grid.isFree(x, z, r), brute.isFree(x, z, r));
    const a = rng.next() * Math.PI * 2, dist = rng.next() < 0.2 ? 1e6 : rng.next() * 80, rr = rng.next() < 0.5 ? 0 : rng.next();
    assert.deepEqual(grid.raycast(x, z, Math.cos(a), Math.sin(a), dist, rr), brute.raycast(x, z, Math.cos(a), Math.sin(a), dist, rr), `ray ${i}`);
  }
  // Axis-aligned and boundary rays.
  for (let i = 0; i < 200; i++) {
    const v = i; 
    assert.deepEqual(grid.raycast(0.5, v, 1, 0, 300), brute.raycast(0.5, v, 1, 0, 300));
    assert.deepEqual(grid.raycast(v, 199.5, 0, -1, 300, 0.4), brute.raycast(v, 199.5, 0, -1, 300, 0.4));
  }
});

test('collision grid: moveCircle ends free and agrees with brute force', () => {
  const brute = randomWorld(3, 400, false), grid = randomWorld(3, 400, true);
  const rng = createRng(5);
  let same = 0, n = 0;
  const a = { x: 0, z: 0 }, b = { x: 0, z: 0 };
  for (let i = 0; i < 1500; i++) {
    const x = 5 + rng.next() * 190, z = 5 + rng.next() * 190, r = 0.3 + rng.next() * 0.4;
    if (!brute.isFree(x, z, r)) continue;
    const dx = (rng.next() - 0.5) * 2, dz = (rng.next() - 0.5) * 2;
    brute.moveCircle(x, z, r, dx, dz, a); grid.moveCircle(x, z, r, dx, dz, b);
    n++;
    if (a.x === b.x && a.z === b.z) same++;
  }
  assert.ok(n > 500);
  assert.equal(same, n, `grid moveCircle matched brute force in ${same}/${n} moves`);
});

test('collision grid: a 2000-box map answers queries far faster than brute force', () => {
  const brute = randomWorld(9, 2000, false), grid = randomWorld(9, 2000, true);
  const time = (w: CollisionWorld): number => {
    const rng = createRng(1); const t0 = performance.now();
    for (let i = 0; i < 4000; i++) { const x = rng.next() * 200, z = rng.next() * 200; w.isFree(x, z, 0.5); w.raycast(x, z, 0.6, 0.8, 12, 0.3); }
    return performance.now() - t0;
  };
  time(grid); time(brute);
  const tg = time(grid), tb = time(brute);
  console.log(`grid ${tg.toFixed(1)} ms vs brute ${tb.toFixed(1)} ms`);
  assert.ok(tg * 2 < tb, `grid ${tg.toFixed(1)} ms vs brute ${tb.toFixed(1)} ms`);
});
