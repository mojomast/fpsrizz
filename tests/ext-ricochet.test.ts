import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AttackBehaviors,
  Combat,
  Damaged,
  Enemy,
  Health,
  Impact,
  Inventory,
  Player,
  Transform,
  Visual,
  World,
  definePlugin,
  spawnPrefab,
  yawDirX,
  yawDirZ,
} from '../src/sdk/index.ts';
import type { CatalogEntry, EntityId, Params, SessionContext } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import manifest from '../src/plugins/example-ricochet/manifest.json' with { type: 'json' };

const BASE = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content'];
const DT = 1 / 60;
const R = 0.12;
// Room: 11x9 cells of 2 m. Interior x in [2, 20], z in [2, 16]. Contact centre of a radius-R circle: 20 - R etc.
const WALL_E = 20 - R;
const WALL_W = 2 + R;
const WALL_S = 16 - R;

const testMaps: CatalogEntry = {
  manifest: { schema: 1, id: 'test/maps', name: 't', version: '1.0.0', kind: 'content', sdk: '^1.0.0', dependencies: { 'core/world': '^1.0.0' } },
  content: [
    {
      kind: 'map',
      id: 'test/box',
      data: {
        schema: 1,
        format: 'core/grid',
        name: 'Box',
        cellSize: 2,
        wallHeight: 3,
        legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
        grid: [
          '###########',
          '#.........#',
          '#.........#',
          '#.........#',
          '#.........#',
          '#.........#',
          '#.........#',
          '#.........#',
          '###########',
        ],
        playerStart: { cell: [1, 1], yaw: 0 },
        triggers: [{ id: 'exit', kind: 'zone', cell: [9, 7], radius: 0.9, tags: ['exit'] }],
        spawns: [],
      },
    },
  ],
};

/** A tiny plugin whose only job is to hand the tests a session context (for spawnPrefab and services). */
function probeEntry(capture: (ctx: SessionContext) => void): CatalogEntry {
  return {
    manifest: {
      schema: 1,
      id: 'test/probe',
      name: 'probe',
      version: '1.0.0',
      kind: 'code',
      sdk: '^1.0.0',
      dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0' },
      capabilities: ['simulation'],
    },
    load: async () => ({ default: definePlugin({ activate: capture }) }),
  } as unknown as CatalogEntry;
}

async function setup(withPlugin = true, config: Record<string, unknown> = {}) {
  let captured: SessionContext | undefined;
  const game = createHeadlessGame([
    testMaps,
    probeEntry((c) => {
      captured = c;
    }),
    { manifest: manifest as never, load: () => import('../src/plugins/example-ricochet/index.ts') },
  ]);
  const plugins = [...BASE, 'test/maps', 'test/probe', ...(withPlugin ? ['example/ricochet'] : [])];
  await game.host.apply(headlessPreset({ plugins, options: { map: 'test/box' }, config }) as never);
  const ctx = captured;
  assert.ok(ctx, 'probe plugin activated');
  const world = ctx.services.get(World);
  const combat = ctx.services.get(Combat);
  const impacts: { sound: string; effect: string; target: EntityId; tick: number }[] = [];
  ctx.events.on(Impact, (e) => void impacts.push({ sound: e.sound, effect: e.effect, target: e.target, tick: ctx.time.tick }));
  const projectiles = (): EntityId[] => {
    const out: EntityId[] = [];
    ctx.world.each(Visual, (id, v) => {
      if (v.key === 'fx-ricochet') out.push(id);
    });
    return out;
  };
  const fire = (x: number, z: number, dx: number, dz: number, params: Params): EntityId => {
    const l = Math.hypot(dx, dz);
    const before = new Set(projectiles());
    combat.fireAttack({ shooter: 0, team: 'player', x, z, dirX: dx / l, dirZ: dz / l, attackId: 'test', params }, 'example/ricochet', '');
    const id = projectiles().find((p) => !before.has(p));
    assert.ok(id, 'projectile entity created');
    return id;
  };
  return { game, ctx, world, combat, impacts, projectiles, fire };
}

const P = (over: Params = {}): Params => ({ damage: 10, speed: 30, ...over });
const inRoom = (x: number, z: number): boolean => x >= 2 + R - 1e-6 && x <= 20 - R + 1e-6 && z >= 2 + R - 1e-6 && z <= 16 - R + 1e-6;

test('(a) wall bounce mirrors the normal component and preserves the tangential one', async () => {
  const t = await setup();
  const id = t.fire(14, 5, 1, 1, P());
  const s = 30 * DT;
  let prev = { x: 14, z: 5 };
  const steps: { dx: number; dz: number }[] = [];
  for (let i = 0; i < 40 && t.ctx.world.isAlive(id); i++) {
    t.game.ticks(1);
    const tr = t.ctx.world.get(id, Transform);
    if (!tr) break;
    assert.ok(t.world.isFree(tr.x, tr.z, R), `free at tick ${i}`);
    assert.ok(inRoom(tr.x, tr.z));
    steps.push({ dx: tr.x - prev.x, dz: tr.z - prev.z });
    prev = { x: tr.x, z: tr.z };
  }
  const k = steps.findIndex((st) => st.dx < 0);
  assert.ok(k > 0, 'x direction flipped after the east wall');
  const before = steps[0]!;
  assert.ok(Math.abs(before.dx - s * Math.SQRT1_2) < 1e-6 && Math.abs(before.dz - s * Math.SQRT1_2) < 1e-6);
  // Ticks fully after the bounce tick: mirrored x, identical z.
  for (const st of steps.slice(k + 1, k + 6)) {
    assert.ok(Math.abs(st.dx + s * Math.SQRT1_2) < 1e-4, `dx mirrored ${st.dx}`);
    assert.ok(Math.abs(st.dz - s * Math.SQRT1_2) < 1e-4, `dz preserved ${st.dz}`);
  }
  assert.ok(t.impacts.some((i) => i.sound === 'ricochet-bounce' && i.effect === 'fx-spark'));
});

test('(b) corner: reversed direction, never escapes (including two bounces in one tick)', async () => {
  const t = await setup();
  // Exactly into the corner diagonal.
  for (const speed of [30, 600]) {
    const cx = WALL_E - 5;
    const cz = WALL_S - 5;
    const id = t.fire(cx, cz, 1, 1, P({ speed, range: 400 }));
    let last = { x: cx, z: cz };
    let moved: { dx: number; dz: number } | undefined;
    for (let i = 0; i < 40 && t.ctx.world.isAlive(id); i++) {
      t.game.ticks(1);
      const tr = t.ctx.world.get(id, Transform);
      if (!tr) break;
      assert.ok(inRoom(tr.x, tr.z), `inside room, speed ${speed}`);
      assert.ok(t.world.isFree(tr.x, tr.z, R));
      moved = { dx: tr.x - last.x, dz: tr.z - last.z };
      last = { x: tr.x, z: tr.z };
    }
    assert.ok(moved && moved.dx < 0 && moved.dz < 0, `comes back roughly reversed at speed ${speed}`);
    for (const e of t.projectiles()) t.ctx.world.destroy(e);
  }
  // Off-diagonal: two distinct wall bounces within a single tick (fast projectile).
  t.impacts.length = 0;
  const id = t.fire(WALL_E - 3, WALL_S - 1, 3, 1, P({ speed: 600, range: 400 }));
  t.game.ticks(1);
  const tick1 = t.impacts.filter((i) => i.sound === 'ricochet-bounce').length;
  assert.ok(tick1 >= 2, `two bounces in one tick, got ${tick1}`);
  const tr = t.ctx.world.get(id, Transform)!;
  assert.ok(inRoom(tr.x, tr.z));
});

test('(c) a tick consumes the whole travel distance, including the remainder after a bounce', async () => {
  const t = await setup();
  const x0 = WALL_E - 0.38;
  const id = t.fire(x0, 9, 1, 0, P({ speed: 60 })); // 1.0 m per tick
  t.game.ticks(1);
  const tr = t.ctx.world.get(id, Transform)!;
  const path = WALL_E - x0 + (WALL_E - tr.x);
  assert.ok(Math.abs(path - 60 * DT) < 0.01, `path ${path}`);
  assert.ok(tr.x < WALL_E - 0.5, 'travelling back west');
  // Fixed-point check over many ticks: moved distance per tick stays speed*dt while mid-flight.
  let prev = tr.x;
  for (let i = 0; i < 5; i++) {
    t.game.ticks(1);
    const now = t.ctx.world.get(id, Transform)!.x;
    assert.ok(Math.abs(prev - now - 1) < 1e-6);
    prev = now;
  }
});

test('(d) bounce cap destroys the projectile at the (bounces+1)-th wall hit', async () => {
  for (const [bounces, expectBounce] of [[2, 2], [0, 0], [1, 1]] as const) {
    const t = await setup();
    const id = t.fire(10, 9, 1, 0, P({ speed: 120, bounces }));
    for (let i = 0; i < 120 && t.ctx.world.isAlive(id); i++) t.game.ticks(1);
    assert.equal(t.ctx.world.isAlive(id), false, `destroyed (bounces=${bounces})`);
    assert.equal(t.impacts.filter((i) => i.sound === 'ricochet-bounce').length, expectBounce);
    const walls = t.impacts.filter((i) => i.sound === 'impact-wall');
    assert.equal(walls.length, 1);
    assert.equal(walls[0]!.effect, 'fx-spark');
  }
});

test('(e) extreme speed never leaves the room or tunnels', async () => {
  const t = await setup();
  for (let a = 0; a < 360; a += 17) {
    const id = t.fire(11.3, 8.7, Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), P({ speed: 5000, range: 10000, bounces: 8 }));
    for (let i = 0; i < 20; i++) {
      t.game.ticks(1);
      const tr = t.ctx.world.get(id, Transform);
      if (!tr) break;
      assert.ok(inRoom(tr.x, tr.z), `angle ${a} tick ${i}: ${tr.x},${tr.z}`);
      assert.ok(t.world.isFree(tr.x, tr.z, R));
    }
    t.ctx.world.destroy(id);
  }
});

test('(f) damage after a bounce: exactly once, with the shooter as source', async () => {
  const t = await setup();
  const playerId = t.ctx.world.first(Player)!;
  const grunt = spawnPrefab(t.ctx, 'core/grunt', { x: 8, z: 9, yaw: 0 });
  const hp0 = t.ctx.world.get(grunt, Health)!.hp;
  const damaged: { source: EntityId; target: EntityId; amount: number }[] = [];
  t.ctx.events.on(Damaged, (e) => void damaged.push(e));
  // Shooter fires from east of the enemy, toward the east wall: the enemy is behind the muzzle.
  const before = new Set(t.projectiles());
  t.combat.fireAttack({ shooter: playerId, team: 'player', x: 14, z: 9, dirX: 1, dirZ: 0, attackId: 'test', params: P({ speed: 150, damage: 10 }) }, 'example/ricochet', '');
  const proj = t.projectiles().find((p) => !before.has(p))!;
  let ticksBeforeBounce = 0;
  for (let i = 0; i < 60; i++) {
    t.game.ticks(1);
    if (damaged.length === 0 && t.impacts.every((im) => im.sound !== 'ricochet-bounce')) {
      ticksBeforeBounce++;
      assert.equal(t.ctx.world.get(grunt, Health)!.hp, hp0, 'unhurt before the bounce');
    }
  }
  assert.ok(ticksBeforeBounce >= 1);
  assert.equal(t.ctx.world.isAlive(proj), false);
  const hits = damaged.filter((d) => d.target === grunt);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.source, playerId);
  assert.equal(t.ctx.world.get(grunt, Health)!.hp, hp0 - 10);
  assert.ok(t.impacts.some((i) => i.sound === 'impact-flesh' && i.effect === 'fx-blood' && i.target === grunt));
  assert.ok(t.ctx.world.get(grunt, Enemy));
});

test('(g) the weapon is in the loadout, selectable on slot 3, and consumes one cell per shot', async () => {
  const t = await setup();
  const player = t.ctx.world.first(Player)!;
  const inv = t.ctx.world.get(player, Inventory)!;
  assert.ok(inv.weapons.includes('example/ricochet-rifle'));
  t.game.input.press('core/weapon-3');
  t.game.ticks(40); // weapon switch delay
  assert.equal(inv.current, 'example/ricochet-rifle');
  const cells = inv.ammo['core/cells-ammo']!;
  const tr = t.ctx.world.get(player, Transform)!;
  tr.yaw = Math.atan2(-1, 0); // face east-ish (any open direction works)
  assert.ok(Math.abs(yawDirX(tr.yaw) ** 2 + yawDirZ(tr.yaw) ** 2 - 1) < 1e-9);
  t.game.input.press('core/fire');
  t.game.ticks(3);
  assert.equal(inv.ammo['core/cells-ammo'], cells - 1);
  assert.equal(t.projectiles().length, 1);
});

test('param validation rejects unknown and out-of-range params', async () => {
  const t = await setup();
  const reg = t.ctx.registries.require(AttackBehaviors, 'example/ricochet');
  const errors: string[] = [];
  const probe = { error: (m: string) => void errors.push(m) } as never;
  reg.validateParams?.({ damage: 1, speed: 1, bogus: 1 }, probe, t.ctx.registries);
  reg.validateParams?.({ damage: 1, speed: 1, bounces: 9 }, probe, t.ctx.registries);
  reg.validateParams?.({ speed: 1 }, probe, t.ctx.registries);
  assert.equal(errors.length, 3, errors.join(' | '));
});

test('(h) without the plugin nothing of it exists', async () => {
  const off = await setup(false);
  assert.equal(off.ctx.registries.has(AttackBehaviors, 'example/ricochet'), false);
  assert.ok(!JSON.stringify(off.game.session().scheduler.describe()).includes('example/'));
  assert.equal(off.projectiles().length, 0);
  const on = await setup(true);
  on.fire(10, 9, 1, 0, P()); // behaviour factories start lazily, on first use
  assert.ok(on.ctx.registries.has(AttackBehaviors, 'example/ricochet'));
  assert.ok(JSON.stringify(on.game.session().scheduler.describe()).includes('example/ricochet.move'));
});
