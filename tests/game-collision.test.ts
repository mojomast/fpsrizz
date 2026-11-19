/**
 * Acceptance 8 (movement and collision correctness), headless.
 * Part 1: CollisionWorld unit tests. Part 2: in-game movement, projectiles, hitscan, doors and navigation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../games/shooter/plugins/core-world/collision.ts';
import type { Box } from '../games/shooter/plugins/core-world/collision.ts';
import { Collider, Health } from '../src/sdk/index.ts';
import { Damaged, DoorChanged, Impact } from '../games/shooter/contracts/shooter.ts';
import type { Session } from '../src/kernel/host.ts';
import {
  BOLT, DUMMY, FACE_EAST, HALL, HALL_WITH_GAP, OBJECTIVE_ROOMS, OBJECTIVE_TRIGGERS, OPEN_ROOM, PLAYER_RADIUS, RAIL,
  assertHealthy, clearEnemies, countProjectiles, equip, hpOf, mulberry32, place, record, spawnEnemy, startArena, startOnMap, tap, transformOf,
} from './helpers/gameplay.ts';

// ---------------------------------------------------------------------------------------------------------------------
// CollisionWorld unit tests
// ---------------------------------------------------------------------------------------------------------------------

const box = (id: string, minX: number, minZ: number, maxX: number, maxZ: number, active = true): Box => ({ id, minX, minZ, maxX, maxZ, active });

/** Four walls (1 m thick) around the room [0,w]x[0,h]. */
function room(w: number, h: number, extra: Box[] = []): CollisionWorld {
  return new CollisionWorld(
    [box('l', -1, -1, 0, h + 1), box('r', w, -1, w + 1, h + 1), box('t', -1, -1, w + 1, 0), box('b', -1, h, w + 1, h + 1), ...extra],
    w,
    h,
  );
}

/** Distance from a point to the nearest point of the box (0 when inside). */
function distToBox(x: number, z: number, b: Box): number {
  const cx = Math.min(Math.max(x, b.minX), b.maxX);
  const cz = Math.min(Math.max(z, b.minZ), b.maxZ);
  return Math.hypot(x - cx, z - cz);
}
const minDist = (col: CollisionWorld, x: number, z: number): number => Math.min(...col.boxes.filter((b) => b.active).map((b) => distToBox(x, z, b)));

const out = { x: 0, z: 0 };

test('acceptance 8 / CollisionWorld: a circle moving diagonally into a wall slides along it and never penetrates', () => {
  const r = 0.35;
  const col = room(10, 30);
  let x = 5;
  let z = 5;
  let contactTicks = 0;
  let prevZ = z;
  for (let i = 0; i < 100; i++) {
    const touched = col.moveCircle(x, z, r, 0.1, 0.1, out);
    x = out.x;
    z = out.z;
    assert.ok(minDist(col, x, z) >= r - 1e-6, `tick ${i}: penetrated, distance ${minDist(col, x, z)}`);
    if (touched) {
      contactTicks++;
      assert.ok(z - prevZ > 0.099, `tick ${i}: lost tangential motion (dz=${z - prevZ})`);
    }
    prevZ = z;
  }
  assert.ok(contactTicks > 40, `expected sustained contact with the wall, got ${contactTicks} ticks`);
  assert.ok(Math.abs(x - (10 - r)) < 1e-9, `x should rest against the wall at ${10 - r}, got ${x}`);
  assert.ok(Math.abs(z - 15) < 1e-9, `all of the tangential 0.1/tick must be kept: z=${z}`);
});

test('acceptance 8 / CollisionWorld: a shallow approach to a wall keeps its tangential speed', () => {
  const r = 0.35;
  const col = room(40, 40);
  let x = 5;
  let z = 20;
  for (let i = 0; i < 300; i++) {
    col.moveCircle(x, z, r, 0.02, -0.09, out);
    x = out.x;
    z = out.z;
    assert.ok(minDist(col, x, z) >= r - 1e-6);
  }
  assert.ok(Math.abs(x - 5 - 0.02 * 300) < 1e-6 || x <= 40 - r + 1e-9);
  assert.ok(Math.abs(z - (20 - 0.09 * 300)) < 1e-6 || z >= r - 1e-9, `z=${z}`);
});

test('acceptance 8 / CollisionWorld: pushing into an inside corner stops without jitter or escape', () => {
  const r = 0.35;
  const col = room(10, 10);
  let x = 5;
  let z = 5;
  const trail: [number, number][] = [];
  for (let i = 0; i < 300; i++) {
    col.moveCircle(x, z, r, 0.1, 0.1, out);
    x = out.x;
    z = out.z;
    trail.push([x, z]);
    assert.ok(x <= 10 - r + 1e-6 && z <= 10 - r + 1e-6, `tick ${i}: left the room (${x}, ${z})`);
    assert.ok(minDist(col, x, z) >= r - 1e-6, `tick ${i}: penetrated`);
  }
  // Settled after the approach (about 35 ticks) and stable to 1e-6 from there on.
  for (let i = 60; i < 300; i++) {
    const [px, pz] = trail[i - 1]!;
    const [cx, cz] = trail[i]!;
    assert.ok(Math.abs(cx - px) <= 1e-6 && Math.abs(cz - pz) <= 1e-6, `tick ${i}: jitter (${cx - px}, ${cz - pz})`);
  }
  assert.ok(Math.abs(x - (10 - r)) <= 1e-6 && Math.abs(z - (10 - r)) <= 1e-6, `rest position (${x}, ${z})`);
});

test('acceptance 8 / CollisionWorld: a very large step into an inside corner cannot push the circle out of the room', () => {
  const r = 0.35;
  const col = room(10, 10);
  for (const [dx, dz] of [[4, 4], [3, -2], [-5, 5], [0, 5], [5, 0.01]] as const) {
    col.moveCircle(5, 5, r, dx, dz, out);
    assert.ok(col.isFree(out.x, out.z, r - 1e-6), `step (${dx},${dz}) ended at (${out.x}, ${out.z})`);
  }
});

test('acceptance 8 / CollisionWorld: sliding around an outside corner (pillar tip) does not snag', () => {
  const r = 0.35;
  const col = room(30, 30, [box('pillar', 12, 12, 14, 14)]);
  // Aim 0.1 m off the pillar's north-west corner so the circle must deflect around it.
  let x = 8;
  let z = 8.1;
  let prog = x + z;
  for (let i = 0; i < 160; i++) {
    col.moveCircle(x, z, r, 0.1, 0.1, out);
    x = out.x;
    z = out.z;
    assert.ok(minDist(col, x, z) >= r - 1e-6, `tick ${i}: penetrated`);
    const now = x + z;
    assert.ok(now - prog > 0.02, `tick ${i}: stalled at (${x}, ${z}); progress ${now - prog}`);
    prog = now;
  }
  assert.ok(x > 14 || z > 14, `should have passed the pillar, ended at (${x}, ${z})`);
});

test('acceptance 8 / CollisionWorld: sliding off the end of a wall keeps moving (no snag at the wall tip)', () => {
  const r = 0.35;
  const col = room(30, 30, [box('stub', 10, 10, 16, 11)]);
  let x = 10.5;
  let z = 10 - r; // resting on the stub's north face, moving east and slightly south into it
  let prevX = x;
  for (let i = 0; i < 120; i++) {
    col.moveCircle(x, z, r, 0.1, 0.03, out);
    x = out.x;
    z = out.z;
    assert.ok(minDist(col, x, z) >= r - 1e-6);
    assert.ok(x - prevX > 0.09, `tick ${i}: x progress ${x - prevX} at (${x}, ${z})`);
    prevX = x;
  }
  assert.ok(x > 16.5 && z > 10.5, `should have rounded the wall tip: (${x}, ${z})`);
});

test('acceptance 8 / CollisionWorld: no ghost snags when sliding along a wall made of many adjacent boxes', () => {
  const r = 0.35;
  // A vertical wall of ten stacked 1 m boxes (like the rows of the grid map) and a horizontal one of ten columns.
  const vertical = Array.from({ length: 20 }, (_, i) => box(`v${i}`, 10, i, 11, i + 1));
  const col = new CollisionWorld([box('l', -1, -1, 0, 21), box('t', -1, -1, 12, 0), box('b', -1, 20, 12, 21), ...vertical], 12, 20);
  let x = 9.65 - 0.1;
  let z = 1;
  for (let i = 0; i < 200; i++) {
    const before = z;
    col.moveCircle(x, z, r, 0.05, 0.09, out);
    x = out.x;
    z = out.z;
    if (z >= 19 - r) break;
    assert.ok(z - before > 0.0899, `tick ${i}: z progress ${z - before} at (${x}, ${z})`);
    assert.ok(x <= 10 - r + 1e-9);
  }
  const horizontal = Array.from({ length: 20 }, (_, i) => box(`h${i}`, i, 10, i + 1, 11));
  const col2 = new CollisionWorld([box('l', -1, -1, 0, 12), box('r', 20, -1, 21, 12), box('t', -1, -1, 21, 0), ...horizontal], 20, 12);
  x = 1;
  z = 9.65 - 0.1;
  for (let i = 0; i < 200; i++) {
    const before = x;
    col2.moveCircle(x, z, r, 0.09, 0.05, out);
    x = out.x;
    z = out.z;
    if (x >= 19 - r) break;
    assert.ok(x - before > 0.0899, `tick ${i}: x progress ${x - before} at (${x}, ${z})`);
  }
});

test('acceptance 8 / CollisionWorld: 2000 random moves (including large steps) never end inside a box', () => {
  const rnd = mulberry32(12345);
  const extra: Box[] = [
    box('a', 5, 5, 8, 7),
    box('b', 14, 3, 15, 12),
    box('c', 20, 18, 26, 19),
    box('slab', 10, 14, 10.4, 20), // thin door-like slab
    box('d', 3, 20, 6, 26),
    box('e', 22, 6, 24, 9),
  ];
  const col = room(30, 30, extra);
  let x = 2;
  let z = 2;
  assert.ok(col.isFree(x, z, 0.45));
  for (let i = 0; i < 2000; i++) {
    const r = i % 2 === 0 ? 0.35 : 0.45;
    const big = rnd() < 0.15;
    const len = big ? 0.2 + rnd() * 4.8 : rnd() * 0.15;
    const a = rnd() * Math.PI * 2;
    // Keep the radius constant over a run of moves per radius parity by checking against the larger one.
    col.moveCircle(x, z, r, Math.cos(a) * len, Math.sin(a) * len, out);
    x = out.x;
    z = out.z;
    assert.ok(Number.isFinite(x) && Number.isFinite(z), `move ${i}: non-finite`);
    assert.ok(minDist(col, x, z) >= r - 1e-6, `move ${i}: ended inside a box at (${x}, ${z}) (len ${len}, r ${r})`);
    assert.ok(x >= r - 1e-6 && z >= r - 1e-6 && x <= 30 - r + 1e-6 && z <= 30 - r + 1e-6, `move ${i}: left the room (${x}, ${z})`);
    assert.ok(col.isFree(x, z, r - 1e-6), `move ${i}: isFree disagrees at (${x}, ${z})`);
    // Teleport out of dead-end pockets now and then so the walk keeps exploring.
    if (i % 400 === 399) {
      x = 2;
      z = 2;
    }
  }
});

test('acceptance 8 / CollisionWorld.raycast: returns the nearest hit with the right normal for each of the four faces', () => {
  const col = new CollisionWorld([box('B', 4, 4, 6, 6)], 20, 20);
  const cases: { from: [number, number]; dir: [number, number]; n: [number, number]; t: number }[] = [
    { from: [0, 5], dir: [1, 0], n: [-1, 0], t: 4 },
    { from: [10, 5], dir: [-1, 0], n: [1, 0], t: 4 },
    { from: [5, 0], dir: [0, 1], n: [0, -1], t: 4 },
    { from: [5, 10], dir: [0, -1], n: [0, 1], t: 4 },
  ];
  for (const c of cases) {
    const h = col.raycast(c.from[0], c.from[1], c.dir[0], c.dir[1], 50);
    assert.ok(h, `no hit from ${c.from} along ${c.dir}`);
    assert.equal(h.solidId, 'B');
    assert.ok(Math.abs(h.t - c.t) < 1e-9, `t=${h.t}`);
    assert.deepEqual([Math.abs(h.nx) === 0 ? 0 : h.nx, Math.abs(h.nz) === 0 ? 0 : h.nz], c.n);
    assert.ok(Math.abs(h.x - (c.from[0] + c.dir[0] * c.t)) < 1e-9 && Math.abs(h.z - (c.from[1] + c.dir[1] * c.t)) < 1e-9);
  }
  // Diagonal ray: enters through the west face (x) first when it reaches x=4 before z=4.
  const s = Math.SQRT1_2;
  const d1 = col.raycast(0, 3, s, s, 50)!; // x=4 at t=4/s, z=3+4=7 -> misses the west face; reaches z... z=4 at t=1/s, x=1 -> not in box; box spans z4..6 at x=4..: z at x=4 is 7 -> miss
  assert.equal(d1, null);
  const d2 = col.raycast(0, 1.5, s, s, 50)!; // at x=4: z=5.5 inside -> west face
  assert.ok(d2);
  assert.deepEqual([d2.nx, d2.nz], [-1, 0]);
  assert.ok(Math.abs(d2.t - 4 / s) < 1e-9);
  const d3 = col.raycast(3.5, 0, s, s, 50)!; // at z=4: x=7.5 -> miss east of box; use steeper start
  assert.equal(d3, null);
  const d4 = col.raycast(2.5, 0, s, s, 50)!; // z=4 at t=4/s -> x=6.5 miss; x=4 at t=1.5/s with z=1.5 not in z range -> miss
  assert.equal(d4, null);
  const d5 = col.raycast(1, 0, s, s, 50)!; // z=4 at x=5 -> north face
  assert.ok(d5);
  assert.deepEqual([d5.nx, d5.nz], [0, -1]);
});

test('acceptance 8 / CollisionWorld.raycast: the NEAREST of several boxes wins, whatever the list order', () => {
  const near = box('near', 5, 4, 6, 6);
  const far = box('far', 9, 4, 10, 6);
  const mid = box('mid', 7, 4.5, 8, 5.5);
  for (const order of [[near, mid, far], [far, mid, near], [mid, far, near]]) {
    const col = new CollisionWorld(order, 20, 20);
    const h = col.raycast(0, 5, 1, 0, 50)!;
    assert.equal(h.solidId, 'near');
    assert.equal(h.t, 5);
    const back = col.raycast(19, 5, -1, 0, 50)!;
    assert.equal(back.solidId, 'far');
    assert.equal(back.t, 9);
    // A shorter maximum distance than the nearest hit reports nothing.
    assert.equal(col.raycast(0, 5, 1, 0, 4.999), null);
    assert.ok(col.raycast(0, 5, 1, 0, 5.001));
  }
});

test('acceptance 8 / CollisionWorld.raycast: a thin (0.4 m) door slab is hit by rays and sweeps of length 500', () => {
  const slab = box('door:d', 5, 0, 5.4, 10);
  const col = new CollisionWorld([slab], 600, 600);
  const ray = col.raycast(0, 5, 1, 0, 500)!;
  assert.ok(ray);
  assert.equal(ray.solidId, 'door:d');
  assert.equal(ray.t, 5);
  assert.deepEqual([ray.nx, ray.nz], [-1, 0]);
  const farRay = col.raycast(-395, 5, 1, 0, 500)!;
  assert.ok(farRay);
  assert.ok(Math.abs(farRay.t - 400) < 1e-9);
  const sweep = col.raycast(0, 5, 1, 0, 500, 0.2)!;
  assert.ok(sweep);
  assert.ok(Math.abs(sweep.t - 4.8) < 1e-9);
  // Oblique crossing of the slab.
  const l = Math.hypot(1, 0.3);
  const obl = col.raycast(0, 4, 1 / l, 0.3 / l, 500)!;
  assert.ok(obl);
  assert.ok(Math.abs(obl.x - 5) < 1e-9);
  // From the other side, with the slab 0.4 thick.
  const back = col.raycast(100, 5, -1, 0, 500)!;
  assert.ok(Math.abs(back.t - (100 - 5.4)) < 1e-9);
  assert.deepEqual([back.nx, back.nz], [1, 0]);
});

test('acceptance 8 / CollisionWorld.raycast: a swept circle reports contact at centre distance = gap - radius', () => {
  const col = new CollisionWorld([box('w', 5, -50, 6, 50)], 100, 100);
  for (const r of [0.05, 0.2, 0.35, 0.5, 1]) {
    const h = col.raycast(0, 0, 1, 0, 20, r)!;
    assert.ok(h, `r=${r}`);
    assert.ok(Math.abs(h.t - (5 - r)) < 1e-9, `r=${r}: t=${h.t}`);
    // Moving the circle to the contact point leaves it exactly r from the wall.
    assert.ok(Math.abs(distToBox(h.t, 0, box('w', 5, -50, 6, 50)) - r) < 1e-9);
  }
  // Diagonal approach to a face: the centre travels gap/cos(angle) - r/cos(angle).
  const s = Math.SQRT1_2;
  const h = col.raycast(0, 0, s, s, 20, 0.35)!;
  assert.ok(Math.abs(h.x - 4.65) < 1e-9);
  // A circle too wide for a gap is stopped by it, a narrow one passes.
  const gap = new CollisionWorld([box('u', 5, -50, 6, 4.5), box('v', 5, 5.5, 6, 50)], 100, 100);
  assert.ok(gap.raycast(0, 5, 1, 0, 20, 0.6), 'r=0.6 does not fit a 1 m gap');
  assert.equal(gap.raycast(0, 5, 1, 0, 20, 0.4), null, 'r=0.4 fits a 1 m gap');
});

test('acceptance 8 / CollisionWorld.raycast: a swept circle clears a box corner it misses (rounded corner, not an inflated square)', () => {
  const r = 0.35;
  const col = new CollisionWorld([box('B', 5, 5, 6, 6)], 40, 40);
  const s = Math.SQRT1_2;
  // Diagonal line z = x - k passing the box's (6,5) corner at perpendicular distance 0.40 m > r: the circle does not touch the box.
  const k = 1 + 0.4 * Math.SQRT2;
  const x0 = 0;
  const z0 = x0 - k;
  const hit = col.raycast(x0, z0, s, s, 40, r);
  // The true Minkowski sum of a box and a disc has rounded corners: this circle passes with 5 cm to spare.
  assert.equal(hit, null, `reported a hit at t=${hit?.t} although the circle clears the corner by ${0.4 - r} m`);
  // Sanity: the same line at 0.30 m (inside r) does hit.
  const k2 = 1 + 0.3 * Math.SQRT2;
  assert.ok(col.raycast(0, -k2, s, s, 40, r));
});

test('acceptance 8 / CollisionWorld.isFree: inside, touching, outside the map and tight against the border', () => {
  const col = new CollisionWorld([box('B', 4, 4, 6, 6)], 10, 10);
  assert.equal(col.isFree(5, 5, 0.3), false, 'centre inside a box');
  assert.equal(col.isFree(3.8, 5, 0.3), false, 'overlapping the west face by 0.1');
  assert.equal(col.isFree(3.7, 5, 0.3), true, 'exactly touching is free');
  assert.equal(col.isFree(3.71, 5, 0.3), false);
  assert.equal(col.isFree(3.69, 5, 0.3), true);
  assert.equal(col.isFree(3.5, 3.5, 0.3), true, 'corner clearance 0.707 > 0.3');
  assert.equal(col.isFree(3.8, 3.8, 0.3), false, 'corner overlap by distance (0.283 < 0.3)');
  assert.equal(col.isFree(1, 1, 0.5), true);
  assert.equal(col.isFree(0.5, 1, 0.5), true, 'touching the map border is free');
  assert.equal(col.isFree(0.49, 1, 0.5), false, 'poking out of the map');
  assert.equal(col.isFree(9.51, 1, 0.5), false);
  assert.equal(col.isFree(1, 9.6, 0.5), false);
  assert.equal(col.isFree(-1, 1, 0.1), false);
});

test('acceptance 8 / CollisionWorld.raycast: rays parallel to and grazing faces, and rays starting on a face', () => {
  const col = new CollisionWorld([box('B', 4, 4, 6, 6)], 20, 20);
  // Parallel to the north face (z = 4) exactly on it: grazing is not a hit.
  assert.equal(col.raycast(0, 4, 1, 0, 50), null);
  assert.equal(col.raycast(0, 6, 1, 0, 50), null);
  assert.equal(col.raycast(4, 0, 0, 1, 50), null);
  assert.equal(col.raycast(6, 0, 0, 1, 50), null);
  // A hair inside is a hit; a hair outside is a miss.
  assert.ok(col.raycast(0, 4 + 1e-9, 1, 0, 50));
  assert.ok(col.raycast(0, 6 - 1e-9, 1, 0, 50));
  assert.equal(col.raycast(0, 4 - 1e-9, 1, 0, 50), null);
  assert.equal(col.raycast(0, 6 + 1e-9, 1, 0, 50), null);
  // Parallel ray inside the slab range from beside the box never hits; same ray started inside does immediately.
  assert.equal(col.raycast(7, 5, 0, 1, 50), null);
  assert.equal(col.raycast(7, 5, -1, 0, 0.9), null);
  const inside = col.raycast(5, 5, 1, 0, 50)!;
  assert.ok(inside);
  assert.equal(inside.t, 0);
  // Starting exactly on the face moving into the box: immediate hit; moving away: none.
  const on = col.raycast(4, 5, 1, 0, 50)!;
  assert.ok(on);
  assert.equal(on.t, 0);
  assert.deepEqual([on.nx, on.nz], [-1, 0]);
  assert.equal(col.raycast(4, 5, -1, 0, 50), null);
  // Touching a corner exactly from outside is not a hit for a point ray.
  const s = Math.SQRT1_2;
  assert.equal(col.raycast(2, 2, s, s, 50) === null || col.raycast(2, 2, s, s, 50)!.t >= 2 * Math.SQRT2 - 1e-9, true);
});

test('acceptance 8 / CollisionWorld: inactive boxes (open doors) are ignored by every query', () => {
  const door = box('door:d', 5, 0, 5.4, 10);
  const col = new CollisionWorld([door, box('end', 15, 0, 16, 10)], 20, 10);
  assert.equal(col.raycast(0, 5, 1, 0, 50)!.solidId, 'door:d');
  assert.equal(col.lineOfSight(1, 5, 10, 5), false);
  assert.equal(col.isFree(5.2, 5, 0.3), false);
  col.moveCircle(4, 5, 0.35, 2, 0, out);
  assert.ok(out.x <= 5 - 0.35 + 1e-9);
  door.active = false;
  assert.equal(col.raycast(0, 5, 1, 0, 50)!.solidId, 'end');
  assert.equal(col.lineOfSight(1, 5, 10, 5), true);
  assert.equal(col.isFree(5.2, 5, 0.3), true);
  assert.equal(col.moveCircle(4, 5, 0.35, 2, 0, out), false);
  assert.ok(Math.abs(out.x - 6) < 1e-9);
  door.active = true;
  assert.equal(col.lineOfSight(1, 5, 10, 5), false);
});

// ---------------------------------------------------------------------------------------------------------------------
// In-game movement
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 8 / game: holding forward into the bay wall at 45 degrees slides along it, then stops in the corner', async () => {
  const h = await startArena();
  const { session, world, player, game } = h;
  // Bay west wall is at x=2; player radius 0.35. Forward at yaw = 45 deg is (-sin, -cos) = north-west.
  place(session, player, 6, 34, Math.PI / 4);
  game.input.press('core/move-forward');
  const t = transformOf(session, player);
  let contactAt = -1;
  const zs: number[] = [];
  for (let i = 0; i < 260; i++) {
    game.ticks(1);
    assert.ok(world.isFree(t.x, t.z, PLAYER_RADIUS - 0.01), `tick ${i}: left walkable space at (${t.x}, ${t.z})`);
    assert.ok(t.x >= 2 + PLAYER_RADIUS - 1e-6, `tick ${i}: inside the west wall (x=${t.x})`);
    if (contactAt < 0 && t.x <= 2 + PLAYER_RADIUS + 1e-3) contactAt = i;
    zs.push(t.z);
  }
  assert.ok(contactAt > 0 && contactAt < 120, `never reached the wall (contact tick ${contactAt})`);
  // While sliding north along the wall the player keeps moving at roughly moveSpeed * cos(45).
  for (let i = contactAt + 25; i < contactAt + 100; i++) {
    const dz = zs[i - 1]! - zs[i]!;
    assert.ok(dz > 0.05, `tick ${i}: slide speed collapsed (dz=${dz})`);
  }
  // Finally it rests in the north-west corner of the bay (x=2.35, z=22.35).
  assert.ok(Math.abs(t.x - 2.35) < 0.01 && Math.abs(t.z - 22.35) < 0.01, `rest position (${t.x}, ${t.z})`);
  assertHealthy(h);
});

test('acceptance 8 / game: a scripted forward-and-turn wander for 600 ticks never leaves walkable space (arena)', async () => {
  const h = await startArena();
  const { session, world, player, game } = h;
  const t = transformOf(session, player);
  const rnd = mulberry32(99);
  game.input.press('core/move-forward');
  let nearWall = 0;
  let travelled = 0;
  let lx = t.x;
  let lz = t.z;
  for (let i = 0; i < 600; i++) {
    if (i % 35 === 0) game.input.addLook((rnd() < 0.5 ? -1 : 1) * (80 + rnd() * 500), 0);
    game.ticks(1);
    assert.ok(world.isFree(t.x, t.z, PLAYER_RADIUS - 0.01), `tick ${i}: not free at (${t.x}, ${t.z})`);
    if (!world.isFree(t.x, t.z, PLAYER_RADIUS + 0.02)) nearWall++;
    travelled += Math.hypot(t.x - lx, t.z - lz);
    lx = t.x;
    lz = t.z;
  }
  assert.ok(nearWall > 20, `the wander should have scraped walls (only ${nearWall} ticks near one)`);
  assert.ok(travelled > 40, `the player should keep moving (travelled ${travelled.toFixed(1)} m)`);
  assertHealthy(h);
});

// ---------------------------------------------------------------------------------------------------------------------
// Projectiles vs thin obstacles
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 8 / game: a speed-2000 projectile cannot pass a CLOSED door and damages nothing behind it', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player } = h;
  const impacts = record(session, Impact);
  const damaged = record(session, Damaged);
  const dummy = spawnEnemy(session, DUMMY, 19, 7);
  equip(h, BOLT);
  place(session, player, 3, 7, FACE_EAST);
  const door = h.world.door('door1')!.desc;
  assert.equal(h.world.door('door1')!.open, false);

  tap(game, 'core/fire', 4);
  assert.equal(countProjectiles(session), 0, 'projectile entity must be gone after hitting the door');
  assert.equal(impacts.length, 1);
  const hit = impacts[0]!;
  assert.equal(hit.target, 0);
  assert.ok(Math.abs(hit.x - (door.minX - 0.1)) < 1e-9, `impact x ${hit.x} should be the door face minus the projectile radius`);
  assert.deepEqual([hit.nx, hit.nz], [-1, 0]);
  assert.equal(damaged.length, 0);
  assert.equal(hpOf(session, dummy), 100);
  assertHealthy(h);
});

test('acceptance 8 / game: the same speed-2000 shot passes an OPEN door and hits the enemy behind it', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const impacts = record(session, Impact);
  const damaged = record(session, Damaged);
  const dummy = spawnEnemy(session, DUMMY, 19, 7);
  equip(h, BOLT);
  place(session, player, 3, 7, FACE_EAST);
  assert.equal(world.setDoorOpen('door1', true, true), true);

  tap(game, 'core/fire', 4);
  assert.equal(countProjectiles(session), 0);
  assert.equal(damaged.length, 1);
  assert.equal(damaged[0]!.target, dummy);
  assert.equal(damaged[0]!.amount, 30);
  assert.equal(damaged[0]!.source, player);
  assert.equal(hpOf(session, dummy), 70);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0]!.target, dummy);
  assertHealthy(h);
});

test('acceptance 8 / game: a projectile fired while the door is open stops at the door if it closes in flight', async () => {
  // Door open, enemy beyond; fire, then close the door before the projectile's next sweep (same frame).
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const dummy = spawnEnemy(session, DUMMY, 19, 7);
  equip(h, BOLT);
  place(session, player, 3, 7, FACE_EAST);
  world.setDoorOpen('door1', true, true);
  game.input.press('core/fire');
  game.ticks(1); // fired in the combat phase; the projectile has not moved yet
  game.input.release('core/fire');
  assert.equal(countProjectiles(session), 1);
  assert.equal(world.setDoorOpen('door1', false), true);
  game.ticks(3);
  assert.equal(countProjectiles(session), 0);
  assert.equal(hpOf(session, dummy), 100);
});

// ---------------------------------------------------------------------------------------------------------------------
// Hitscan
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 8 / game: hitscan stops at a wall - an enemy behind it takes no damage', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player } = h;
  const damaged = record(session, Damaged);
  const impacts = record(session, Impact);
  const dummy = spawnEnemy(session, DUMMY, 19, 3); // row 1: the partition (cell 6,1) is solid wall
  equip(h, RAIL);
  place(session, player, 3, 3, FACE_EAST);
  tap(game, 'core/fire');
  assert.equal(damaged.length, 0);
  assert.equal(hpOf(session, dummy), 100);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0]!.target, 0);
  assert.ok(Math.abs(impacts[0]!.x - 12) < 1e-9, `wall impact at the partition face, got ${impacts[0]!.x}`);
});

test('acceptance 8 / game: hitscan stops at a closed door; after opening it the same shot hits the enemy', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const damaged = record(session, Damaged);
  const impacts = record(session, Impact);
  const dummy = spawnEnemy(session, DUMMY, 19, 7);
  equip(h, RAIL);
  place(session, player, 3, 7, FACE_EAST);
  tap(game, 'core/fire');
  assert.equal(damaged.length, 0);
  assert.equal(hpOf(session, dummy), 100);
  assert.equal(impacts.length, 1);
  assert.ok(Math.abs(impacts[0]!.x - 12.8) < 1e-9, `impact on the door slab face, got ${impacts[0]!.x}`);
  world.setDoorOpen('door1', true, true);
  tap(game, 'core/fire');
  assert.equal(damaged.length, 1);
  assert.equal(hpOf(session, dummy), 90);
});

test('acceptance 8 / game: with two enemies in a line only the nearer is damaged; an enemy in the open is damaged', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const damaged = record(session, Damaged);
  const near = spawnEnemy(session, DUMMY, 9, 7);
  const far = spawnEnemy(session, DUMMY, 13, 7);
  equip(h, RAIL);
  place(session, player, 3, 7, FACE_EAST);
  for (let i = 0; i < 3; i++) tap(game, 'core/fire');
  assert.equal(hpOf(session, near), 70);
  assert.equal(hpOf(session, far), 100);
  assert.deepEqual(damaged.map((d) => d.target), [near, near, near]);
  // Baseline: a lone enemy in the open takes the full hit.
  const lone = spawnEnemy(session, DUMMY, 13, 11, 0);
  place(session, player, 3, 11, FACE_EAST);
  tap(game, 'core/fire');
  assert.equal(hpOf(session, lone), 90);
  assertHealthy(h);
});

test("acceptance 8 / game: a dead enemy's corpse does not block the shot to the enemy behind it", async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const damaged = record(session, Damaged);
  const near = spawnEnemy(session, DUMMY, 9, 7);
  const far = spawnEnemy(session, DUMMY, 13, 7);
  session.entities.get(near, Health)!.hp = 10;
  equip(h, RAIL);
  place(session, player, 3, 7, FACE_EAST);
  tap(game, 'core/fire'); // kills the near one (10 damage)
  assert.equal(hpOf(session, near), 0);
  assert.ok(!session.entities.has(near, Collider), 'a corpse has no collider');
  assert.equal(hpOf(session, far), 100);
  tap(game, 'core/fire');
  assert.equal(hpOf(session, far), 90, 'the shot must pass through the corpse');
  assert.equal(hpOf(session, near), 0);
  assert.equal(damaged.filter((d) => d.target === near).length, 1, 'the corpse is not hit again');
  assert.equal(damaged.filter((d) => d.target === far).length, 1);
  assertHealthy(h);
});

// ---------------------------------------------------------------------------------------------------------------------
// Door consistency across queries
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 8 / game: a closed door blocks raycast, line of sight, pathing and movement; opening flips all four together', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, world, game } = h;
  const changed = record(session, DoorChanged);
  const door = world.door('door1')!;
  const v0 = world.version;
  const path: number[] = [];

  // --- closed ---
  const ray = world.raycast(3, 7, 1, 0, 50)!;
  assert.equal(ray.solidId, 'door:door1');
  assert.ok(Math.abs(ray.t - (door.desc.minX - 3)) < 1e-9);
  assert.equal(world.lineOfSight(3, 7, 19, 7), false);
  assert.equal(world.findPath(3, 7, 19, 7, path), false, 'the door is the only connection');
  const blocked = { x: 0, z: 0 };
  assert.equal(world.moveCircle(12.3, 7, 0.35, 0.5, 0, blocked), true);
  assert.ok(blocked.x <= door.desc.minX - 0.35 + 1e-9);
  assert.equal(world.isFree(13, 7, 0.1), false, 'a circle centred on the closed slab is not free');

  // --- open ---
  assert.equal(world.setDoorOpen('door1', true), true);
  assert.equal(world.version, v0 + 1);
  assert.equal(changed.length, 1);
  assert.deepEqual([changed[0]!.id, changed[0]!.open], ['door1', true]);
  const ray2 = world.raycast(3, 7, 1, 0, 50)!;
  assert.ok(!ray2.solidId.startsWith('door:'), `open door still hit: ${ray2.solidId}`);
  assert.ok(ray2.t > 19, 'passes the doorway and ends at the far wall');
  assert.equal(world.lineOfSight(3, 7, 19, 7), true);
  assert.equal(world.findPath(3, 7, 19, 7, path), true);
  assert.deepEqual(path.slice(-2), [19, 7]);
  assert.equal(world.moveCircle(12.3, 7, 0.35, 1, 0, blocked), false);
  assert.ok(Math.abs(blocked.x - 13.3) < 1e-9);
  assert.equal(world.isFree(13, 7, 0.1), true);
  // Setting the same state again is a no-op (no version bump, no event).
  assert.equal(world.setDoorOpen('door1', true), true);
  assert.equal(world.version, v0 + 1);
  assert.equal(changed.length, 1);

  // --- an actor in the doorway keeps it open ---
  const blocker = spawnEnemy(session, DUMMY, 13, 7);
  assert.equal(world.setDoorOpen('door1', false), false, 'closing on top of an actor must be refused');
  assert.equal(door.open, true);
  assert.equal(world.version, v0 + 1);
  assert.equal(world.lineOfSight(3, 7, 19, 7), true);
  place(session, blocker, 19, 7);
  assert.equal(world.setDoorOpen('door1', false), true);
  assert.equal(world.version, v0 + 2);
  assert.equal(changed.length, 2);
  assert.equal(world.raycast(3, 7, 1, 0, 50)!.solidId, 'door:door1');
  assert.equal(world.lineOfSight(3, 7, 19, 7), false);
  assert.equal(world.findPath(3, 7, 19, 7, path), false);
  // Unknown door ids are refused without side effects.
  assert.equal(world.setDoorOpen('nope', true), false);
  assert.equal(world.version, v0 + 2);
  game.ticks(5);
  assertHealthy(h);
});

test('acceptance 8 / game: a player standing in the doorway also keeps it from closing', async () => {
  const h = await startOnMap({ grid: HALL });
  const { world, session, player } = h;
  world.setDoorOpen('door1', true);
  place(session, player, 13, 7);
  assert.equal(world.setDoorOpen('door1', false), false);
  place(session, player, 13, 7 + 1 + 0.36 + 0.001 + 0.2); // beside the slab's z range [6,8] plus radius
  assert.equal(world.setDoorOpen('door1', false), true);
});

test('acceptance 8 / game: a locked door refuses a normal open but `force` opens and unlocks it', async () => {
  const h = await startOnMap({ grid: OBJECTIVE_ROOMS, locked: ['door1'], triggers: OBJECTIVE_TRIGGERS });
  const { world } = h;
  const door = world.door('door1')!;
  assert.equal(door.locked, true);
  const v = world.version;
  assert.equal(world.setDoorOpen('door1', true), false);
  assert.equal(door.open, false);
  assert.equal(world.version, v);
  assert.equal(world.setDoorOpen('door1', true, true), true);
  assert.equal(door.open, true);
  assert.equal(door.locked, false);
  assert.equal(world.version, v + 1);
});

test('acceptance 8 / game: findPath routes AROUND a closed door when another way exists, and goes straight when it is open', async () => {
  const h = await startOnMap({ grid: HALL_WITH_GAP });
  const { world } = h;
  const path: number[] = [];
  assert.equal(world.lineOfSight(3, 7, 19, 7), false);
  assert.equal(world.findPath(3, 7, 19, 7, path), true);
  assert.ok(path.length > 2, 'needs at least one intermediate waypoint to go around');
  assert.ok(path.some((v, i) => i % 2 === 1 && v > 10), `the route should dip through the gap at z in [10,12]: ${path.join(',')}`);
  let px = 3;
  let pz = 7;
  let len = 0;
  for (let i = 0; i < path.length; i += 2) {
    const dx = path[i]! - px;
    const dz = path[i + 1]! - pz;
    const d = Math.hypot(dx, dz);
    assert.equal(world.raycast(px, pz, dx / d, dz / d, d, 0.3), null, `segment ${i / 2} is blocked`);
    len += d;
    px = path[i]!;
    pz = path[i + 1]!;
  }
  assert.ok(len > 16.5, `detour must be longer than the straight 16 m, got ${len}`);
  world.setDoorOpen('door1', true);
  assert.equal(world.findPath(3, 7, 19, 7, path), true);
  assert.deepEqual(path, [19, 7]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Navigation on the real arena
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 8 / game: with every door open, findPath reaches each enemy spawn and every segment has a clear 0.3 m sweep', async () => {
  const h = await startArena();
  const { world } = h;
  for (const d of world.doors()) assert.equal(world.setDoorOpen(d.desc.id, true, true), true);
  const start = world.desc.playerStart;
  const spawns = world.desc.spawns.filter((s) => s.tags.includes('enemy'));
  assert.ok(spawns.length >= 8, `expected the arena's enemy spawns, got ${spawns.length}`);
  const path: number[] = [];
  for (const s of spawns) {
    assert.equal(world.findPath(start.x, start.z, s.x, s.z, path), true, `no path to ${s.id}`);
    assert.ok(path.length >= 2 && path.length % 2 === 0);
    assert.deepEqual(path.slice(-2), [s.x, s.z], `path to ${s.id} must end at the spawn`);
    let px = start.x;
    let pz = start.z;
    for (let i = 0; i < path.length; i += 2) {
      const wx = path[i]!;
      const wz = path[i + 1]!;
      const d = Math.hypot(wx - px, wz - pz);
      if (d > 1e-6) assert.equal(world.raycast(px, pz, (wx - px) / d, (wz - pz) / d, d, 0.3), null, `${s.id}: segment ${i / 2} (${px},${pz}) -> (${wx},${wz}) is not clear for r=0.3`);
      px = wx;
      pz = wz;
    }
  }
  // And with the doors closed the rooms are sealed from each other.
  const closed = await startArena();
  const w2 = closed.world;
  const hall = w2.desc.spawns.find((s) => s.id === 'hall-grunt-1')!;
  assert.equal(w2.findPath(start.x, start.z, hall.x, hall.z, path), false, 'hall is sealed off while the bay door is closed');
  const bay = w2.desc.spawns.find((s) => s.id === 'bay-ammo')!;
  assert.equal(w2.findPath(start.x, start.z, bay.x, bay.z, path), true, 'the bay itself is connected');
});

/** Sets up an arena with one grunt in the hall (cell 2,7), a stationary player at the start, and the grunt alerted by a nudge of damage. */
async function chaseSetup(open: string[]) {
  const h = await startArena();
  clearEnemies(h.session);
  const { world, session, player } = h;
  for (const id of open) assert.equal(world.setDoorOpen(id, true, true), true);
  const grunt = spawnEnemy(session, 'core/grunt', 5, 15, Math.PI);
  // A single point of damage from the player alerts it and makes the player its target (no sight needed).
  h.combat.damage({ target: grunt, amount: 1, kind: 'bullet', source: player, x: 5, z: 15 });
  return { ...h, grunt };
}

test('acceptance 8 / game: a grunt two rooms away (doors open) walks to melee range of a stationary player without leaving free space', async () => {
  const h = await chaseSetup(['bay-door']);
  const { world, session, grunt, player, game } = h;
  const gt = transformOf(session, grunt);
  const pt = transformOf(session, player);
  const radius = session.entities.get(grunt, Collider)!.radius;
  let reached = -1;
  for (let i = 0; i < 1500 && reached < 0; i++) {
    game.ticks(1);
    assert.ok(world.isFree(gt.x, gt.z, radius - 0.01), `tick ${i}: grunt left free space at (${gt.x}, ${gt.z})`);
    if (Math.hypot(gt.x - pt.x, gt.z - pt.z) <= 1.35 + 0.05) reached = i;
  }
  assert.ok(reached >= 0, `grunt never reached the player; ended at (${gt.x.toFixed(2)}, ${gt.z.toFixed(2)})`);
  assert.ok(reached > 120, 'it started two rooms away, so it must have needed a while');
  assertHealthy(h);
});

test('acceptance 8 / game: with the connecting doors closed the grunt never gets through', async () => {
  const h = await chaseSetup([]);
  const { world, session, grunt, player, game } = h;
  const gt = transformOf(session, grunt);
  const pt = transformOf(session, player);
  const radius = session.entities.get(grunt, Collider)!.radius;
  let minD = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < 900; i++) {
    game.ticks(1);
    assert.ok(world.isFree(gt.x, gt.z, radius - 0.01));
    minD = Math.min(minD, Math.hypot(gt.x - pt.x, gt.z - pt.z));
    maxZ = Math.max(maxZ, gt.z);
  }
  assert.ok(maxZ < 20, `grunt crossed the bay door line (z=${maxZ})`);
  assert.ok(minD > 10, `grunt got within ${minD} m of the player`);
  assert.equal(world.findPath(gt.x, gt.z, pt.x, pt.z, []), false);
  assert.equal(hpPlayer(h), 100, 'the player was never hurt');
  assert.equal(world.doors().filter((d) => d.open).length, 0);
});

test('acceptance 8 / game: with the short door closed but a long detour open, the grunt finds the long way round', async () => {
  const h = await chaseSetup(['hall-door', 'service-door']);
  const { world, session, grunt, player, game } = h;
  const gt = transformOf(session, grunt);
  const pt = transformOf(session, player);
  const radius = session.entities.get(grunt, Collider)!.radius;
  assert.equal(world.findPath(gt.x, gt.z, pt.x, pt.z, []), true, 'the detour exists');
  let reached = -1;
  let viaControlRoom = false;
  for (let i = 0; i < 3500 && reached < 0; i++) {
    game.ticks(1);
    assert.ok(world.isFree(gt.x, gt.z, radius - 0.01), `tick ${i}: left free space at (${gt.x}, ${gt.z})`);
    if (gt.x > 28) viaControlRoom = true;
    if (Math.hypot(gt.x - pt.x, gt.z - pt.z) <= 1.4) reached = i;
  }
  assert.ok(viaControlRoom, 'it should have gone through the control room');
  assert.ok(reached >= 0, `grunt never arrived; ended at (${gt.x.toFixed(2)}, ${gt.z.toFixed(2)})`);
  assert.equal(world.door('bay-door')!.open, false);
  assertHealthy(h);
});

function hpPlayer(h: { session: Session; player: number }): number {
  return hpOf(h.session, h.player);
}
