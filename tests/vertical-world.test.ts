import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VerticalWorld, VERTICAL_LIMIT } from '../games/shooter/plugins/core-world/vertical.ts';
import type { Vec3, Volume } from '../games/shooter/plugins/core-world/vertical.ts';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const box = (min: Vec3, max: Vec3): Volume => ({ min, max });
const bounds = box(v(-10, -10, -10), v(10, 10, 10));
const slab = box(v(-2, 2, -2), v(2, 3, 2));
const world = (): VerticalWorld => new VerticalWorld(bounds, [slab]);

test('bridge slab blocks rays from above and below with outward normals', () => {
  const w = world();
  assert.deepEqual(w.ray(v(0, 0, 0), v(0, 4, 0), 4), { t: 0.5, point: v(0, 2, 0), normal: v(0, -1, 0), solidIndex: 0 });
  assert.deepEqual(w.ray(v(0, 5, 0), v(0, -1, 0), 4), { t: 0.5, point: v(0, 3, 0), normal: v(0, 1, 0), solidIndex: 0 });
  assert.equal(w.ray(v(3, 0, 0), v(0, 1, 0), 8), null);
  assert.equal(w.ray(v(0, 0, 0), v(0, 1, 0), 1), null);
});

test('horizontal faces, parallel segments, corners and endpoints', () => {
  const w = world();
  assert.deepEqual(w.segment(v(-4, 2.5, 0), v(0, 2.5, 0)), { t: 0.5, point: v(-2, 2.5, 0), normal: v(-1, 0, 0), solidIndex: 0 });
  assert.deepEqual(w.segment(v(0, 2.5, 4), v(0, 2.5, 2)), { t: 1, point: v(0, 2.5, 2), normal: v(0, 0, 1), solidIndex: 0 });
  assert.equal(w.segment(v(-4, 1, 0), v(4, 1, 0)), null);
  assert.deepEqual(w.segment(v(-3, 1, 0), v(-2, 2, 0))?.normal, v(-1, 0, 0));
  assert.equal(w.segment(v(-3, 3, 0), v(3, 3, 0))?.t, 1 / 6);
});

test('start inside and on boundary hits at zero, ties and zero-length are deterministic', () => {
  const w = world();
  assert.deepEqual(w.segment(v(0, 2.5, 0), v(0, 2.5, 0))?.normal, v(0, -1, 0));
  assert.deepEqual(w.segment(v(-2, 2, 0), v(-3, 1, 0))?.normal, v(-1, 0, 0));
  assert.equal(w.segment(v(0, 0, 0), v(0, 0, 0)), null);
  const two = new VerticalWorld(bounds, [slab, slab]);
  assert.equal(two.segment(v(0, 0, 0), v(0, 4, 0))?.solidIndex, 0);
  const ordered = new VerticalWorld(bounds, [box(v(-1, 5, -1), v(1, 6, 1)), slab]);
  assert.equal(ordered.segment(v(0, 0, 0), v(0, 8, 0))?.solidIndex, 1);
});

test('cylinders can occupy the same XZ above and below the bridge', () => {
  const w = world();
  const c = { x: 0, z: 0, bottom: 0, top: 1.9, radius: 0.5 };
  assert.equal(w.isCylinderFree(c), true);
  assert.equal(w.isCylinderFree({ ...c, bottom: 3, top: 4 }), true);
  assert.equal(w.isCylinderFree({ ...c, top: 2 }), true);
  assert.equal(w.isCylinderFree({ ...c, top: 2.01 }), false);
  assert.equal(w.isCylinderFree({ ...c, x: 2.5, bottom: 2, top: 3 }), true);
  assert.equal(w.isCylinderFree({ ...c, x: 2.49, bottom: 2, top: 3 }), false);
  assert.equal(w.isCylinderFree({ ...c, x: 2.4, z: 2.4, bottom: 2, top: 3 }), true);
  assert.equal(w.isCylinderFree({ ...c, x: 2.3, z: 2.3, bottom: 2, top: 3 }), false);
  assert.equal(w.isCylinderFree({ ...c, x: 9.5 }), true);
  assert.equal(w.isCylinderFree({ ...c, x: 9.51 }), false);
  assert.equal(w.isCylinderFree({ ...c, bottom: -10.01 }), false);
});

test('rejects invalid and unsafe geometry and queries', () => {
  assert.throws(() => new VerticalWorld(box(v(0, 0, 0), v(0, 1, 1)), []), RangeError);
  assert.throws(() => new VerticalWorld(bounds, [box(v(0, 0, 0), v(11, 1, 1))]), RangeError);
  assert.throws(() => new VerticalWorld(bounds, [box(v(0, NaN, 0), v(1, 1, 1))]), RangeError);
  assert.throws(() => new VerticalWorld(box(v(-Infinity, 0, 0), v(1, 1, 1)), []), RangeError);
  const w = world();
  assert.throws(() => w.segment(v(NaN, 0, 0), v(0, 0, 0)), RangeError);
  assert.throws(() => w.segment(v(0, 0, 0), v(VERTICAL_LIMIT + 1, 0, 0)), RangeError);
  assert.throws(() => w.ray(v(0, 0, 0), v(0, 0, 0), 1), RangeError);
  assert.throws(() => w.ray(v(0, 0, 0), v(0, 1, 0), Infinity), RangeError);
  assert.throws(() => w.ray(v(VERTICAL_LIMIT, 0, 0), v(1, 0, 0), 1), RangeError);
  for (const c of [
    { x: NaN, z: 0, bottom: 0, top: 1, radius: 1 },
    { x: 0, z: 0, bottom: 0, top: 1, radius: 0 },
    { x: 0, z: 0, bottom: 1, top: 1, radius: 1 },
    { x: 0, z: 0, bottom: 0, top: Infinity, radius: 1 },
  ]) assert.throws(() => w.isCylinderFree(c), RangeError);
});

test('copies input volumes and permits finite coordinates at the supported limit', () => {
  const original = box(v(-1, -1, -1), v(1, 1, 1));
  const w = new VerticalWorld(bounds, [original]);
  original.min.x = 5;
  assert.equal(w.segment(v(-2, 0, 0), v(0, 0, 0))?.t, 0.5);
  const large = new VerticalWorld(box(v(-VERTICAL_LIMIT, -1, -1), v(VERTICAL_LIMIT, 1, 1)), [box(v(-1, -1, -1), v(1, 1, 1))]);
  assert.equal(large.segment(v(-VERTICAL_LIMIT, 0, 0), v(VERTICAL_LIMIT, 0, 0))?.normal.x, -1);
});
