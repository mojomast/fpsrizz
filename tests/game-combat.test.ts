/**
 * Acceptance 9 (enemy attacks and damage correctness), headless: ranged and melee enemies respect walls, damage and
 * death happen exactly once, damage modifiers run in order, pickups, and the objective flow (victory / defeat once).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collider, FlowEnded, Health, Inventory, Player, definePlugin } from '../src/sdk/index.ts';
import { AttackFired, Damaged, DamageModifiers, Died, Enemy, Impact, PickupCollected, TriggerFired, UseFailed } from '../games/shooter/contracts/shooter.ts';
import type { CatalogEntry } from '../src/sdk/index.ts';
import {
  DUMMY, FACE_EAST, FACE_NORTH, FACE_SOUTH, FACE_WEST, HALL, OBJECTIVE_ROOMS, OBJECTIVE_TRIGGERS, OPEN_ROOM,
  assertHealthy, cellCenter, countProjectiles, hpOf, place, record, runUntil, spawnAt, spawnEnemy, startOnMap, tap, transformOf,
} from './helpers/gameplay.ts';

/** HALL without the door: a solid partition. */
const WALLED: string[] = [
  '#############',
  '#.....#.....#',
  '#.....#.....#',
  '#S....#.....#',
  '#.....#.....#',
  '#.....#.....#',
  '#############',
];

const alert = (h: Awaited<ReturnType<typeof startOnMap>>, enemy: number): void =>
  h.combat.damage({ target: enemy, amount: 1, kind: 'bullet', source: h.player, x: 0, z: 0 });

// ---------------------------------------------------------------------------------------------------------------------
// Ranged enemy
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 9 / ranged: a spitter with a clear line of sight fires and eventually damages the stationary player', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const fired = record(session, AttackFired);
  const damaged = record(session, Damaged);
  const spitter = spawnEnemy(session, 'core/spitter', 13, 7, 0);
  place(session, player, 3, 7, FACE_EAST);
  const ticks = runUntil(game, () => damaged.some((d) => d.target === player), 600);
  assert.ok(ticks > 0, 'the spitter never hurt the player');
  const shots = fired.filter((f) => f.shooter === spitter);
  assert.ok(shots.length >= 1);
  assert.equal(shots[0]!.attackId, 'core/spitter');
  assert.equal(shots[0]!.behavior, 'core/projectile');
  const hit = damaged.find((d) => d.target === player)!;
  assert.equal(hit.source, spitter);
  assert.equal(hit.amount, 10);
  assert.equal(hit.kind, 'acid');
  assert.equal(hpOf(session, player), 90);
  // It fires more than once over a longer time (cooldown 1.7 s) and only ever at the player.
  game.ticks(400);
  assert.ok(fired.filter((f) => f.shooter === spitter).length >= 3);
  assert.ok(damaged.every((d) => d.target === player || d.target === spitter));
  assertHealthy(h);
});

test('acceptance 9 / ranged: with a solid wall between them the spitter never fires and the player is never hurt (600 ticks)', async () => {
  const h = await startOnMap({ grid: WALLED });
  const { session, game, player } = h;
  const fired = record(session, AttackFired);
  const damaged = record(session, Damaged);
  const spitter = spawnEnemy(session, 'core/spitter', 15, 7, Math.PI / 2);
  place(session, player, 3, 7, FACE_EAST);
  alert(h, spitter); // make sure it is hunting the player, not merely idle
  assert.equal(session.entities.get(spitter, Enemy)!.state, 'idle');
  game.ticks(600);
  assert.notEqual(session.entities.get(spitter, Enemy)!.state, 'idle', 'the spitter should have been alerted by the damage');
  assert.equal(fired.filter((f) => f.shooter === spitter).length, 0);
  assert.equal(damaged.filter((d) => d.target === player).length, 0);
  assert.equal(hpOf(session, player), 100);
  assertHealthy(h);
});

test('acceptance 9 / ranged: with a CLOSED door between them the spitter never fires and the player is never hurt (600 ticks)', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const fired = record(session, AttackFired);
  const damaged = record(session, Damaged);
  const spitter = spawnEnemy(session, 'core/spitter', 15, 7, Math.PI / 2);
  place(session, player, 3, 7, FACE_EAST);
  alert(h, spitter);
  game.ticks(600);
  assert.equal(world.door('door1')!.open, false);
  assert.equal(fired.filter((f) => f.shooter === spitter).length, 0);
  assert.equal(damaged.filter((d) => d.target === player).length, 0);
  // Positive control: open the door and the very same spitter starts shooting.
  world.setDoorOpen('door1', true);
  const t = runUntil(game, () => fired.some((f) => f.shooter === spitter), 600);
  assert.ok(t > 0, 'once the door is open the spitter should attack');
  assertHealthy(h);
});

test('acceptance 9 / ranged: closing the door in the middle of the windup means the attack is not released', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const fired = record(session, AttackFired);
  const spitter = spawnEnemy(session, 'core/spitter', 15, 7, Math.PI / 2);
  place(session, player, 3, 7, FACE_EAST);
  world.setDoorOpen('door1', true);
  const enemy = session.entities.get(spitter, Enemy)!;
  const t = runUntil(game, () => enemy.state === 'windup', 300);
  assert.ok(t > 0, 'the spitter should start a windup (it can see the player through the open door)');
  assert.equal(fired.length, 0, 'nothing fired yet: still winding up');
  assert.equal(world.setDoorOpen('door1', false), true);
  game.ticks(240);
  assert.notEqual(enemy.state, 'windup', 'the windup must have ended');
  assert.equal(fired.filter((f) => f.shooter === spitter).length, 0, 'the attack must not be released through a closed door');
  assert.equal(hpOf(session, player), 100);
  assertHealthy(h);
});

test('acceptance 9 / ranged: moving the player behind a wall in the middle of the windup means the attack is not released', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const fired = record(session, AttackFired);
  const spitter = spawnEnemy(session, 'core/spitter', 15, 7, Math.PI / 2);
  place(session, player, 3, 7, FACE_EAST);
  world.setDoorOpen('door1', true);
  const enemy = session.entities.get(spitter, Enemy)!;
  assert.ok(runUntil(game, () => enemy.state === 'windup', 300) > 0);
  place(session, player, 3, 1.5, FACE_EAST); // west room, around the corner of the partition
  const st = transformOf(session, spitter);
  assert.equal(world.lineOfSight(st.x, st.z, 3, 1.5), false, 'precondition: the partition hides the player');
  game.ticks(30); // longer than the 0.45 s windup
  assert.notEqual(enemy.state, 'windup');
  assert.equal(fired.filter((f) => f.shooter === spitter).length, 0);
  assertHealthy(h);
});

// ---------------------------------------------------------------------------------------------------------------------
// Melee enemy
// ---------------------------------------------------------------------------------------------------------------------

/** Grunt and player pressed against the two faces of the 0.4 m door slab (centres 1.2 m apart, within melee reach). */
async function acrossTheSlab() {
  const h = await startOnMap({ grid: HALL });
  const { session, player } = h;
  const slab = h.world.door('door1')!.desc;
  const grunt = spawnEnemy(session, 'core/grunt', slab.minX - 0.45, 7, FACE_EAST);
  place(session, player, slab.maxX + 0.35, 7, FACE_WEST);
  assert.ok(Math.hypot(transformOf(session, grunt).x - transformOf(session, player).x, 0) < 1.35, 'precondition: within the grunt attack range');
  return { ...h, grunt };
}

test('acceptance 9 / melee: a grunt adjacent across a thin wall (closed door) cannot hurt the player', async () => {
  const h = await acrossTheSlab();
  const { session, game, player, grunt } = h;
  const damaged = record(session, Damaged);
  const fired = record(session, AttackFired);
  alert(h, grunt);
  game.ticks(400);
  assert.equal(fired.filter((f) => f.shooter === grunt).length, 0, 'it must not even start a swing it cannot land');
  assert.equal(damaged.filter((d) => d.target === player).length, 0);
  assert.equal(hpOf(session, player), 100);
  assertHealthy(h);
});

test('acceptance 9 / melee: the melee attack itself is blocked by the wall, and lands once the door is open', async () => {
  const h = await acrossTheSlab();
  const { session, game, player, grunt, combat, world } = h;
  const damaged = record(session, Damaged);
  const t = transformOf(session, grunt);
  const swing = (): void =>
    combat.fireAttack({ shooter: grunt, team: 'enemy', x: t.x, z: t.z, dirX: 1, dirZ: 0, attackId: 'core/grunt', params: { damage: 12, range: 1.5 } }, 'core/melee', '');
  swing();
  game.ticks(2);
  assert.equal(damaged.length, 0, 'a swing through the closed door must not connect');
  world.setDoorOpen('door1', true);
  swing();
  game.ticks(2);
  assert.equal(damaged.length, 1);
  assert.equal(damaged[0]!.amount, 12);
  assert.equal(damaged[0]!.kind, 'melee');
  assert.equal(hpOf(session, player), 88);
});

test('acceptance 9 / melee: positive control - with the door open the same grunt hurts the player', async () => {
  const h = await acrossTheSlab();
  const { session, game, player, grunt, world } = h;
  const damaged = record(session, Damaged);
  world.setDoorOpen('door1', true);
  alert(h, grunt);
  const t = runUntil(game, () => damaged.some((d) => d.target === player), 200);
  assert.ok(t > 0, 'the grunt should reach and hit the player');
  assert.equal(damaged.find((d) => d.target === player)!.source, grunt);
});

// ---------------------------------------------------------------------------------------------------------------------
// Damage and death exactly once
// ---------------------------------------------------------------------------------------------------------------------

const lethal = (target: number, source: number) => ({ target, amount: 500, kind: 'bullet', source, x: 1, z: 1 });

test('acceptance 9 / damage: two lethal requests in the same tick produce exactly one Damaged, one Died and hp 0', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const died = record(session, Died);
  const e = spawnEnemy(session, DUMMY, 10, 5);
  combat.damage(lethal(e, player));
  combat.damage(lethal(e, player));
  game.ticks(1);
  const hp = session.entities.get(e, Health)!;
  assert.equal(hp.hp, 0);
  assert.equal(hp.dead, true);
  assert.equal(damaged.filter((d) => d.target === e).length, 1);
  assert.equal(damaged.find((d) => d.target === e)!.lethal, true);
  assert.equal(died.filter((d) => d.entity === e).length, 1);
  assert.equal(session.entities.get(e, Enemy)!.state, 'dead');
  // Later damage to the corpse does nothing at all.
  combat.damage(lethal(e, player));
  combat.damage({ target: e, amount: 1, kind: 'bullet', source: player, x: 0, z: 0 });
  game.ticks(3);
  assert.equal(damaged.filter((d) => d.target === e).length, 1);
  assert.equal(died.filter((d) => d.entity === e).length, 1);
  assert.equal(hp.hp, 0);
  assertHealthy(h);
});

test('acceptance 9 / damage: a non-lethal hit followed by a lethal one in one tick is two Damaged and one Died, in order', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const died = record(session, Died);
  const e = spawnEnemy(session, DUMMY, 10, 5);
  combat.damage({ target: e, amount: 60, kind: 'bullet', source: player, x: 0, z: 0 });
  combat.damage({ target: e, amount: 60, kind: 'bullet', source: player, x: 0, z: 0 });
  combat.damage({ target: e, amount: 60, kind: 'bullet', source: player, x: 0, z: 0 });
  game.ticks(1);
  assert.deepEqual(damaged.map((d) => [d.hp, d.lethal]), [[40, false], [0, true]]);
  assert.equal(died.length, 1);
});

test('acceptance 9 / damage: stale (destroyed) and never-existing entity ids are ignored without throwing', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const died = record(session, Died);
  const e = spawnEnemy(session, DUMMY, 10, 5);
  // Destroyed but not yet flushed.
  session.entities.destroy(e);
  assert.equal(session.entities.isAlive(e), false);
  combat.damage(lethal(e, player));
  game.ticks(1);
  // Fully purged id, and an id that never existed.
  combat.damage(lethal(e, player));
  combat.damage(lethal(987654, player));
  combat.damage({ target: 0, amount: 5, kind: 'bullet', source: player, x: 0, z: 0 });
  assert.doesNotThrow(() => game.ticks(3));
  assert.equal(damaged.length, 0);
  assert.equal(died.length, 0);
  assertHealthy(h);
});

test('acceptance 9 / damage: damage queued for an entity destroyed later in the same tick (before the damage phase) is ignored', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const died = record(session, Died);
  const victim = spawnEnemy(session, DUMMY, 10, 5);
  const survivor = spawnEnemy(session, DUMMY, 10, 9);
  let armed = true;
  const remove = session.scheduler.addSystem(
    {
      id: 'test/queue-then-destroy',
      phase: 'combat',
      order: 50,
      update() {
        if (!armed) return;
        armed = false;
        combat.damage(lethal(victim, player));
        combat.damage({ target: survivor, amount: 10, kind: 'bullet', source: player, x: 0, z: 0 });
        session.entities.destroy(victim);
      },
    },
    'test',
  );
  assert.doesNotThrow(() => game.ticks(3));
  remove();
  assert.equal(damaged.filter((d) => d.target === victim).length, 0);
  assert.equal(died.length, 0);
  assert.equal(damaged.filter((d) => d.target === survivor).length, 1, 'other queued damage in the same tick still resolves');
  assert.equal(hpOf(session, survivor), 90);
  assertHealthy(h);
});

test('acceptance 9 / damage: a projectile whose shooter was destroyed after firing still resolves and hurts its target', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const impacts = record(session, Impact);
  const shooter = spawnEnemy(session, DUMMY, 13, 7);
  place(session, player, 3, 7, FACE_EAST);
  combat.fireAttack({ shooter, team: 'enemy', x: 13, z: 7, dirX: -1, dirZ: 0, attackId: 'test/dummy', params: { damage: 15, speed: 20, radius: 0.15, range: 50 } }, 'core/projectile', '');
  assert.equal(countProjectiles(session), 1);
  session.entities.destroy(shooter);
  assert.doesNotThrow(() => game.ticks(90));
  assert.equal(countProjectiles(session), 0);
  assert.equal(damaged.length, 1);
  assert.equal(damaged[0]!.target, player);
  assert.equal(damaged[0]!.source, shooter, 'the stale source id is kept for attribution');
  assert.equal(hpOf(session, player), 85);
  assert.equal(impacts.length, 1);
  assertHealthy(h);
});

test('acceptance 9 / damage: a projectile whose shooter DIED mid-flight still lands, and the dead shooter is not blamed twice', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const died = record(session, Died);
  const shooter = spawnEnemy(session, DUMMY, 13, 7);
  place(session, player, 3, 7, FACE_EAST);
  combat.fireAttack({ shooter, team: 'enemy', x: 13, z: 7, dirX: -1, dirZ: 0, attackId: 'test/dummy', params: { damage: 15, speed: 20, radius: 0.15, range: 50 } }, 'core/projectile', '');
  combat.damage(lethal(shooter, player));
  game.ticks(90);
  assert.equal(hpOf(session, player), 85);
  assert.equal(died.filter((d) => d.entity === shooter).length, 1);
  assert.equal(died.filter((d) => d.entity === player).length, 0);
  assertHealthy(h);
});

test('acceptance 9 / damage: Player.kills counts each enemy exactly once, however many lethal hits or later hits it takes', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const kills = (): number => session.entities.get(player, Player)!.kills;
  const a = spawnEnemy(session, DUMMY, 8, 3);
  const b = spawnEnemy(session, DUMMY, 8, 7);
  const c = spawnEnemy(session, DUMMY, 8, 11);
  assert.equal(kills(), 0);
  combat.damage(lethal(a, player));
  combat.damage(lethal(a, player));
  game.ticks(1);
  assert.equal(kills(), 1);
  combat.damage(lethal(a, player)); // corpse
  game.ticks(1);
  assert.equal(kills(), 1);
  combat.damage(lethal(b, player));
  game.ticks(1);
  assert.equal(kills(), 2);
  // An enemy killed by something that is not the player does not count.
  combat.damage(lethal(c, 0));
  game.ticks(1);
  assert.equal(kills(), 2);
  assert.equal(session.entities.get(c, Health)!.dead, true);
  // Killing yourself does not count either.
  combat.damage({ target: player, amount: 1000, kind: 'bullet', source: player, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(kills(), 2);
  assertHealthy(h);
});

test('acceptance 9 / damage: non-positive and non-finite damage amounts are ignored when requested', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  for (const amount of [0, -5, NaN, Infinity, -Infinity]) combat.damage({ target: player, amount, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(2);
  assert.equal(damaged.length, 0);
  assert.equal(hpOf(session, player), 100);
});

// ---------------------------------------------------------------------------------------------------------------------
// Damage modifiers
// ---------------------------------------------------------------------------------------------------------------------

const modsPlugin: CatalogEntry = {
  manifest: { schema: 1, id: 'test/mods', name: 'Test damage modifiers', version: '1.0.0', kind: 'code', sdk: '^2.0.0', dependencies: { 'core/combat': '^1.0.0' } },
  load: async () => ({
    default: definePlugin({
      register(ctx) {
        // Registered so that sorting by id would give the WRONG order: "a-add5" sorts before "z-mul2".
        ctx.register(DamageModifiers, 'test/a-add5', { description: '+5 for kind "modded" (order 20)', order: 20, start: () => (req, amount) => (req.kind === 'modded' ? amount + 5 : amount) });
        ctx.register(DamageModifiers, 'test/z-mul2', { description: 'x2 for kind "modded" (order 10)', order: 10, start: () => (req, amount) => (req.kind === 'modded' ? amount * 2 : amount) });
        ctx.register(DamageModifiers, 'test/void', { description: 'cancels kind "void"', order: 30, start: () => (req, amount) => (req.kind === 'void' ? 0 : amount) });
        // Same order: ties break on id (tie-a then tie-b).
        ctx.register(DamageModifiers, 'test/tie-b', { description: '+1 for kind "tie" (order 40)', order: 40, start: () => (req, amount) => (req.kind === 'tie' ? amount + 1 : amount) });
        ctx.register(DamageModifiers, 'test/tie-a', { description: 'x3 for kind "tie" (order 40)', order: 40, start: () => (req, amount) => (req.kind === 'tie' ? amount * 3 : amount) });
      },
    }),
  }),
};

test('acceptance 9 / modifiers: orders 10 and 20 apply as (base x 2) + 5, regardless of registration or id order', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM }, { extra: [modsPlugin] });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  combat.damage({ target: player, amount: 10, kind: 'modded', source: 0, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(damaged.length, 1);
  assert.equal(damaged[0]!.amount, 25, '(10 x 2) + 5, not (10 + 5) x 2 = 30');
  assert.equal(hpOf(session, player), 75);
  // Unrelated kinds are untouched by these modifiers.
  combat.damage({ target: player, amount: 10, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(damaged[1]!.amount, 10);
  assert.equal(hpOf(session, player), 65);
});

test('acceptance 9 / modifiers: equal orders break ties by id', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM }, { extra: [modsPlugin] });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  combat.damage({ target: player, amount: 10, kind: 'tie', source: 0, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(damaged[0]!.amount, 31, 'tie-a (x3) before tie-b (+1): 10 x 3 + 1');
});

test('acceptance 9 / modifiers: a modifier returning 0 drops the event entirely (no Damaged, no hp change, no Died)', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM }, { extra: [modsPlugin] });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const died = record(session, Died);
  combat.damage({ target: player, amount: 9999, kind: 'void', source: 0, x: 0, z: 0 });
  game.ticks(2);
  assert.equal(damaged.length, 0);
  assert.equal(died.length, 0);
  assert.equal(hpOf(session, player), 100);
  assert.equal(session.entities.get(player, Health)!.dead, false);
});

test('acceptance 9 / modifiers: team immunity - enemies never damage enemies, but still damage the player; self damage is allowed', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM }, { extra: [modsPlugin] });
  const { session, game, combat, player } = h;
  const damaged = record(session, Damaged);
  const a = spawnEnemy(session, DUMMY, 8, 3);
  const b = spawnEnemy(session, DUMMY, 8, 11);
  combat.damage({ target: b, amount: 10, kind: 'bullet', source: a, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(damaged.length, 0, 'enemy -> enemy yields no damage');
  assert.equal(hpOf(session, b), 100);
  combat.damage({ target: player, amount: 10, kind: 'bullet', source: a, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(damaged.length, 1);
  assert.equal(hpOf(session, player), 90);
  combat.damage({ target: a, amount: 10, kind: 'bullet', source: a, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(hpOf(session, a), 90, 'self damage is not team damage');
  // The player damaging an enemy works too.
  combat.damage({ target: b, amount: 10, kind: 'bullet', source: player, x: 0, z: 0 });
  game.ticks(1);
  assert.equal(hpOf(session, b), 90);
});

// ---------------------------------------------------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 9 / pickups: a medkit is not consumed at full health, and is consumed (once) when hurt', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const collected = record(session, PickupCollected);
  place(session, player, 8, 7, FACE_EAST);
  const kit = spawnAt(session, 'core/medkit', 8.2, 7);
  game.ticks(30);
  assert.equal(session.entities.isAlive(kit), true, 'full health: the medkit stays');
  assert.equal(collected.length, 0);
  assert.equal(hpOf(session, player), 100);

  combat.damage({ target: player, amount: 30, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(2);
  assert.equal(session.entities.isAlive(kit), false);
  assert.equal(hpOf(session, player), 95, '70 + 25');
  assert.equal(collected.length, 1);
  assert.equal(collected[0]!.pickup, kit);
  assert.equal(collected[0]!.def, 'core/medkit');
  assert.equal(collected[0]!.by, player);
  game.ticks(60);
  assert.equal(collected.length, 1);
  assert.equal(hpOf(session, player), 95);
});

test('acceptance 9 / pickups: a medkit never heals past max and is still consumed when it heals a little', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  place(session, player, 8, 7);
  combat.damage({ target: player, amount: 10, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(1);
  const kit = spawnAt(session, 'core/medkit', 8, 7);
  game.ticks(2);
  assert.equal(hpOf(session, player), 100);
  assert.equal(session.entities.isAlive(kit), false);
});

test('acceptance 9 / pickups: a pickup out of reach is not collected, and a dead player collects nothing', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, combat, player } = h;
  const collected = record(session, PickupCollected);
  place(session, player, 3, 7);
  combat.damage({ target: player, amount: 30, kind: 'bullet', source: 0, x: 0, z: 0 });
  const far = spawnAt(session, 'core/medkit', 3 + 0.5 + 0.35 + 0.05, 7);
  game.ticks(5);
  assert.equal(session.entities.isAlive(far), true);
  assert.equal(collected.length, 0);
  combat.damage({ target: player, amount: 1000, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(1);
  place(session, player, 3 + 0.5 + 0.35 + 0.05, 7);
  game.ticks(5);
  assert.equal(session.entities.isAlive(far), true, 'dead players do not pick things up');
});

test('acceptance 9 / pickups: ammo pickups respect the maximum and are not consumed when full', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const collected = record(session, PickupCollected);
  const inv = session.entities.get(player, Inventory)!;
  place(session, player, 8, 7);
  // 190 + 24 would be 214: capped at 200, and the pickup is still used up.
  inv.ammo['core/bullets-ammo'] = 190;
  const p1 = spawnAt(session, 'core/bullets', 8, 7);
  game.ticks(2);
  assert.equal(inv.ammo['core/bullets-ammo'], 200);
  assert.equal(session.entities.isAlive(p1), false);
  assert.equal(collected.length, 1);
  // At the cap a further pickup stays on the floor.
  const p2 = spawnAt(session, 'core/bullets', 8, 7);
  game.ticks(30);
  assert.equal(inv.ammo['core/bullets-ammo'], 200);
  assert.equal(session.entities.isAlive(p2), true);
  assert.equal(collected.length, 1);
  // Another ammo type with its own max (cells: 40).
  inv.ammo['core/cells-ammo'] = 40;
  const p3 = spawnAt(session, 'core/cells', 8, 7);
  game.ticks(10);
  assert.equal(session.entities.isAlive(p3), true);
  inv.ammo['core/cells-ammo'] = 36;
  game.ticks(2);
  assert.equal(inv.ammo['core/cells-ammo'], 40);
  assert.equal(session.entities.isAlive(p3), false);
  assert.equal(collected.length, 2);
  assertHealthy(h);
});

// ---------------------------------------------------------------------------------------------------------------------
// Objective flow
// ---------------------------------------------------------------------------------------------------------------------

const objective = (): Promise<Awaited<ReturnType<typeof startOnMap>>> =>
  startOnMap({ grid: OBJECTIVE_ROOMS, locked: ['door1'], triggers: OBJECTIVE_TRIGGERS });

test('acceptance 9 / objective: the exit before the switch does not end the run; switch -> door opens -> exit -> victory exactly once', async () => {
  const h = await objective();
  const { session, game, player, world, flow } = h;
  const ended = record(session, FlowEnded);
  const triggers = record(session, TriggerFired);
  const useFailed = record(session, UseFailed);
  const exit = cellCenter(10, 2);
  assert.equal(world.door('door1')!.locked, true);

  // 1. Entering the exit zone before the override switch is fired: nothing ends.
  place(session, player, exit.x, exit.z, FACE_EAST);
  game.ticks(5);
  assert.equal(triggers.filter((t) => t.tags.includes('exit')).length, 1);
  assert.equal(flow.ended, false);
  assert.equal(ended.length, 0);
  assert.match(flow.notice.text, /sealed/i);
  place(session, player, 17, 5, FACE_EAST);
  game.ticks(5);

  // 2. Pressing Use at the locked door fails and does not open it.
  place(session, player, 11.5, 5, FACE_EAST);
  tap(game, 'core/use', 2);
  assert.deepEqual(useFailed.map((u) => u.reason), ['locked']);
  assert.equal(world.door('door1')!.open, false);

  // 3. Facing away from the switch does nothing; facing it fires it.
  const sw = world.desc.triggers.find((t) => t.id === 'override')!;
  place(session, player, sw.x, sw.z + 1.5, FACE_SOUTH);
  tap(game, 'core/use', 2);
  assert.equal(world.triggers().find((t) => t.desc.id === 'override')!.fired, false, 'facing away from the switch must not fire it');
  assert.equal(useFailed.length, 2);
  assert.equal(useFailed[1]!.reason, 'nothing');
  place(session, player, sw.x, sw.z + 1.5, FACE_NORTH);
  tap(game, 'core/use', 2);
  assert.equal(world.triggers().find((t) => t.desc.id === 'override')!.fired, true);
  assert.ok(triggers.some((t) => t.id === 'override' && t.kind === 'switch' && t.tags.includes('objective')));
  assert.equal(world.door('door1')!.open, true, 'the switch opens the locked door');
  assert.equal(world.door('door1')!.locked, false);
  assert.equal(flow.ended, false, 'the exit has not been reached yet');
  assert.equal(ended.length, 0);

  // 4. Walk through the open door into the exit zone.
  place(session, player, 17, 5, FACE_EAST);
  game.input.press('core/move-forward');
  const t = runUntil(game, () => flow.ended, 240);
  game.input.release('core/move-forward');
  assert.ok(t > 0, 'the player should reach the exit');
  assert.equal(flow.result!.outcome, 'victory');
  assert.equal(ended.length, 1);
  assert.equal(ended[0]!.outcome, 'victory');

  // 5. Standing in the zone, leaving and re-entering never produces a second end.
  game.ticks(90);
  place(session, player, 17, 5);
  game.ticks(3);
  place(session, player, exit.x, exit.z);
  game.ticks(30);
  assert.equal(ended.length, 1);
  assert.equal(flow.result!.outcome, 'victory');
  assertHealthy(h);
});

test('acceptance 9 / objective: the player dying ends the run with defeat exactly once, and a later exit cannot turn it into a victory', async () => {
  const h = await objective();
  const { session, game, player, combat, flow, world } = h;
  const ended = record(session, FlowEnded);
  const died = record(session, Died);
  combat.damage({ target: player, amount: 1000, kind: 'bullet', source: 0, x: 0, z: 0 });
  combat.damage({ target: player, amount: 1000, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(2);
  assert.equal(died.filter((d) => d.entity === player).length, 1);
  assert.equal(flow.ended, true);
  assert.equal(flow.result!.outcome, 'defeat');
  assert.equal(ended.length, 1);
  assert.equal(ended[0]!.outcome, 'defeat');
  // Even if the objective were somehow completed afterwards, the first result stands.
  world.setDoorOpen('door1', true, true);
  world.triggers().find((t) => t.desc.id === 'override')!.fired = true;
  const exit = cellCenter(10, 2);
  place(session, player, exit.x, exit.z);
  game.ticks(30);
  assert.equal(ended.length, 1);
  assert.equal(flow.result!.outcome, 'defeat');
  // A dead player takes no movement or fire input.
  game.input.press('core/move-forward');
  const before = { x: transformOf(session, player).x, z: transformOf(session, player).z };
  game.ticks(30);
  assert.ok(Math.hypot(transformOf(session, player).x - before.x, transformOf(session, player).z - before.z) < 0.5, 'a dead player decelerates to a stop');
  assertHealthy(h);
});

test('acceptance 9 / objective: a map with no objective switch lets the exit end the run at once (victory once)', async () => {
  const h = await startOnMap({ grid: OBJECTIVE_ROOMS }); // no switch, door not locked
  const { session, game, player, flow } = h;
  const ended = record(session, FlowEnded);
  const exit = cellCenter(10, 2);
  place(session, player, exit.x, exit.z);
  game.ticks(5);
  assert.equal(ended.length, 1);
  assert.equal(flow.result!.outcome, 'victory');
  assert.ok(session.entities.has(player, Collider));
});
