/**
 * Acceptance 6 and 7 (fixed step, input edges, simulation-time cooldowns) and acceptance 2 (restart restores a clean
 * state, no leaks) for the headless game.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttackFired, Damaged, Died, DoorChanged, Enemy, EnemyAlerted, Health, Impact, Intent, Inventory, Player, WeaponDry, WeaponSwitched } from '../src/sdk/index.ts';
import type { EventToken } from '../src/sdk/index.ts';
import type { Session } from '../src/kernel/host.ts';
import {
  AUTO, HALL, OPEN_ROOM, RAIL, createHeadlessGame, gridMapData, handles, headlessPreset, place, presetFor, record, startArena, startOnMap, tap, testPack, transformOf, assertHealthy, equip, FACE_EAST, spawnEnemy, DUMMY,
} from './helpers/gameplay.ts';
import type { Started } from './helpers/gameplay.ts';

const BULLETS = 'core/bullets-ammo';

// ---------------------------------------------------------------------------------------------------------------------
// Scripted, tick-keyed input; two different render schedules
// ---------------------------------------------------------------------------------------------------------------------

/** A live fight: open room, player facing north at the west wall, awake enemies to the east. */
const FIGHT_MAP = {
  grid: OPEN_ROOM,
  spawns: [
    { id: 'g1', prefab: 'core/grunt', cell: [9, 3], yaw: 90, tags: ['enemy'] },
    { id: 'g2', prefab: 'core/grunt', cell: [11, 5], yaw: 90, tags: ['enemy'] },
    { id: 's1', prefab: 'core/spitter', cell: [13, 2], yaw: 90, tags: ['enemy'] },
    { id: 's2', prefab: 'core/spitter', cell: [13, 5], yaw: 90, tags: ['enemy'] },
    { id: 'm1', prefab: 'core/medkit', cell: [4, 5] },
  ],
};

type Step = (h: Started) => void;
const press = (a: string): Step => (h) => h.game.input.press(a);
const release = (a: string): Step => (h) => h.game.input.release(a);
const look = (dx: number): Step => (h) => h.game.input.addLook(dx, 0);

/** Input script keyed by TICK NUMBER. */
const SCRIPT = new Map<number, Step[]>([
  [0, [press('core/move-forward')]],
  [5, [look(654)]], // turn to face east
  [40, [press('core/fire')]],
  [41, [release('core/fire')]],
  [60, [look(-200)]],
  [90, [release('core/move-forward')]],
  [100, [press('core/fire')]],
  [101, [release('core/fire')]],
  [110, [press('core/weapon-2')]],
  [111, [release('core/weapon-2')]],
  [130, [press('core/fire')]],
  [131, [release('core/fire')]],
  [150, [press('core/strafe-left')]],
  [200, [release('core/strafe-left')]],
  [205, [look(120)]],
  [210, [press('core/weapon-1')]],
  [211, [release('core/weapon-1')]],
  [230, [press('core/fire')]],
  [231, [release('core/fire')]],
  [250, [press('core/use')]],
  [251, [release('core/use')]],
  [260, [press('core/fire')]],
  [261, [release('core/fire')]],
  [280, [press('core/move-forward'), look(-300)]],
  [290, [press('core/fire')]],
  [291, [release('core/fire')]],
  [330, [release('core/move-forward'), look(500)]],
  [340, [press('core/fire')]],
  [341, [release('core/fire')]],
]);
const TOTAL = 400;

const EVENTS: EventToken<unknown>[] = [Damaged, Died, AttackFired, Impact, WeaponSwitched, WeaponDry, EnemyAlerted, DoorChanged] as EventToken<unknown>[];

interface Trace {
  /** Entity snapshot (JSON) at the START of tick n, i.e. after n ticks, indexed by n. */
  states: string[];
  /** Every gameplay event with the tick it was emitted in. */
  events: string[];
  h: Started;
}

/**
 * Plays the script. The script is applied from a `session.addBeforeTick` hook registered after session start. The
 * host's own hook (which calls `input.beginTick()` to snapshot edges and look for the tick) was registered first, so
 * hooks run: beginTick -> my hook. Consequently `held` changes made in my hook for tick N are visible to tick N
 * immediately, while press/release EDGES and look deltas become visible from tick N+1. That is the same in every run
 * because both schedules go through this one hook, keyed by `scheduler.tick` (the number of the tick about to run).
 * The only difference between runs is how real time is chopped into frames:
 *   'ticks'  : scheduler.runTick() repeatedly, no frames at all
 *   'frames' : scheduler.advance(dt) with irregular frame times (1/144, 1/30, 50 ms, 5 whole ticks in one frame, ...)
 */
async function play(mode: 'ticks' | 'frames'): Promise<Trace> {
  const h = await startOnMap(FIGHT_MAP, { seed: 4242 });
  const { session } = h;
  const states: string[] = [];
  const events: string[] = [];
  for (const token of EVENTS) session.events.on(token, (p) => void events.push(`${token.id}@${session.scheduler.tick}:${JSON.stringify(p)}`), 'test', session.scope);
  session.addBeforeTick(() => {
    const tick = session.scheduler.tick;
    states[tick] = JSON.stringify(session.entities.snapshot());
    for (const step of SCRIPT.get(tick) ?? []) step(h);
  }, session.scope);

  const target = TOTAL + 1; // state at the start of tick TOTAL is recorded when tick TOTAL begins
  if (mode === 'ticks') {
    while (session.scheduler.tick < target) session.scheduler.runTick();
  } else {
    const dts = [1 / 144, 1 / 30, 0.05, 1 / 60, 0.0133, 0.0417, 5 / 60, 0.004, 1 / 90, 0.021, 0.0167];
    let i = 0;
    while (session.scheduler.tick < target) {
      session.scheduler.advance(dts[i++ % dts.length]!);
      assert.ok(i < 100000, 'frame loop did not make progress');
    }
    assert.equal(session.scheduler.droppedTime, 0, 'the schedule must not exceed the 5-ticks-per-frame budget');
  }
  assertHealthy(h);
  return { states, events, h };
}

test('acceptance 6 / fixed step: the same tick-keyed inputs give identical state and events under different frame schedules', async () => {
  const a = await play('ticks');
  const b = await play('frames');
  assert.equal(a.states.length, TOTAL + 1);
  assert.ok(b.states.length >= TOTAL + 1);
  for (let t = 0; t <= TOTAL; t++) {
    if (a.states[t] !== b.states[t]) assert.fail(`state diverged after ${t} ticks:\n ticks : ${a.states[t]!.slice(0, 600)}\n frames: ${b.states[t]!.slice(0, 600)}`);
  }
  const ea = a.events.filter((e) => Number(e.slice(e.indexOf('@') + 1, e.indexOf(':'))) <= TOTAL);
  const eb = b.events.filter((e) => Number(e.slice(e.indexOf('@') + 1, e.indexOf(':'))) <= TOTAL);
  assert.deepEqual(eb, ea);

  // The scenario really exercised the game: movement, firing, enemies awake, damage dealt.
  const p = transformOf(a.h.session, a.h.player);
  const start = JSON.parse(a.states[0]!)[0].components['sdk/transform'] as { x: number; z: number };
  assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 3, 'the player should have moved');
  assert.ok(ea.some((e) => e.startsWith('sdk/attack-fired')), 'something should have attacked');
  assert.ok(ea.some((e) => e.startsWith('sdk/damaged')), 'something should have been damaged');
  assert.ok(ea.some((e) => e.startsWith('sdk/weapon-switched')));
  const pistolAmmoStart = JSON.parse(a.states[0]!).find((e: { components: Record<string, unknown> }) => e.components['sdk/player']).components['sdk/inventory'].ammo[BULLETS] as number;
  assert.ok(a.h.session.entities.get(a.h.player, Inventory)!.ammo[BULLETS]! < pistolAmmoStart, 'ammo was spent');
});

test('acceptance 6 / fixed step: two runs with the same seed and the same schedule are identical (no state leaks between sessions)', async () => {
  const a = await play('frames');
  const b = await play('frames');
  const n = Math.min(a.states.length, b.states.length);
  for (let t = 0; t < n; t++) assert.equal(b.states[t], a.states[t], `diverged after ${t} ticks`);
  assert.deepEqual(b.events, a.events);
});

test('acceptance 6 / fixed step: a different seed really changes the outcome (the determinism check is not vacuous)', async () => {
  const run = async (seed: number): Promise<string> => {
    const h = await startOnMap(FIGHT_MAP, { seed });
    h.session.addBeforeTick(() => {
      for (const step of SCRIPT.get(h.session.scheduler.tick) ?? []) step(h);
    }, h.session.scope);
    while (h.session.scheduler.tick < TOTAL) h.session.scheduler.runTick();
    return JSON.stringify(h.session.entities.snapshot());
  };
  assert.notEqual(await run(1), await run(2));
});

test('acceptance 6 / fixed step: at most 5 ticks per frame; a long stall does not release a burst of shots', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game } = h;
  equip(h, AUTO);
  const ammo = (): number => session.entities.get(h.player, Inventory)!.ammo['test/ammo']!;
  const before = ammo();
  game.input.press('core/fire');
  const ran = session.scheduler.advance(1.0); // a one second stall
  assert.equal(ran, 5);
  assert.equal(session.scheduler.tick, 5);
  assert.ok(session.scheduler.droppedTime > 0.8, `dropped ${session.scheduler.droppedTime}`);
  assert.equal(before - ammo(), 1, 'only the shot of the first tick fits in 5 ticks (cooldown 6 ticks)');
  assert.equal(session.scheduler.time, 5 / 60);
});

// ---------------------------------------------------------------------------------------------------------------------
// Press edges
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 7 / input: one press followed by a 5-tick catch-up frame fires exactly one shot; holding fires no more', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const inv = session.entities.get(player, Inventory)!;
  const fired = record(session, AttackFired);
  assert.equal(inv.current, 'core/pistol');
  assert.equal(inv.ammo[BULLETS], 48);

  game.input.press('core/fire');
  assert.equal(session.scheduler.advance(5 / 60), 5, 'precondition: five ticks ran in one frame');
  assert.equal(inv.ammo[BULLETS], 47, 'exactly one round spent');
  assert.equal(fired.length, 1);

  // Still held: more catch-up frames, repeated press events from key auto-repeat; nothing more fires (not an auto weapon).
  for (let i = 0; i < 4; i++) {
    game.input.press('core/fire');
    assert.equal(session.scheduler.advance(5 / 60), 5);
  }
  assert.equal(inv.ammo[BULLETS], 47);
  assert.equal(fired.length, 1);

  // Release, then press again: exactly one more.
  game.input.release('core/fire');
  session.scheduler.advance(5 / 60);
  assert.equal(inv.ammo[BULLETS], 47);
  game.input.press('core/fire');
  assert.equal(session.scheduler.advance(5 / 60), 5);
  assert.equal(inv.ammo[BULLETS], 46);
  assert.equal(fired.length, 2);
  game.input.release('core/fire');
  assertHealthy(h);
});

test('acceptance 7 / input: the press edge lands in the FIRST tick of a catch-up frame only', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const intent = session.entities.get(player, Intent)!;
  const seen: boolean[] = [];
  session.scheduler.addSystem({ id: 'test/watch-intent', phase: 'rules', update: () => void seen.push(intent.firePressed) }, 'test');
  game.input.press('core/fire');
  session.scheduler.advance(5 / 60);
  assert.deepEqual(seen, [true, false, false, false, false]);
  game.input.release('core/fire');
});

test('acceptance 7 / input: a click that is pressed and released between two ticks is not lost (non-auto weapon)', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const inv = session.entities.get(player, Inventory)!;
  game.input.press('core/fire');
  game.input.release('core/fire');
  session.scheduler.advance(1 / 60);
  assert.equal(inv.ammo[BULLETS], 47);
});

test('acceptance 7 / input: a click that is pressed and released between two ticks is not lost (AUTO weapon)', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const inv = equip(h, AUTO);
  const before = inv.ammo['test/ammo']!;
  game.input.press('core/fire');
  game.input.release('core/fire');
  session.scheduler.advance(1 / 60);
  assert.equal(before - inv.ammo['test/ammo']!, 1, 'a quick tap on an automatic weapon should still fire one round');
  assert.ok(player > 0);
});

test('acceptance 7 / input: core/use toggles a door exactly once per press, even in a 5-tick catch-up frame', async () => {
  const h = await startOnMap({ grid: HALL });
  const { session, game, player, world } = h;
  const changed = record(session, DoorChanged);
  place(session, player, 11.5, 7, FACE_EAST);
  const v0 = world.version;

  game.input.press('core/use');
  assert.equal(session.scheduler.advance(5 / 60), 5);
  assert.equal(world.door('door1')!.open, true);
  assert.equal(changed.length, 1);
  assert.equal(world.version, v0 + 1);

  // Held: no re-toggle, however many ticks pass or key-repeat presses arrive.
  for (let i = 0; i < 3; i++) {
    game.input.press('core/use');
    session.scheduler.advance(5 / 60);
  }
  assert.equal(world.door('door1')!.open, true);
  assert.equal(changed.length, 1);

  game.input.release('core/use');
  session.scheduler.advance(5 / 60);
  assert.equal(changed.length, 1);
  game.input.press('core/use');
  assert.equal(session.scheduler.advance(5 / 60), 5);
  assert.equal(world.door('door1')!.open, false);
  assert.equal(changed.length, 2);
  assert.equal(world.version, v0 + 2);
  assertHealthy(h);
});

// ---------------------------------------------------------------------------------------------------------------------
// Simulation-time cooldowns
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 6 / cooldowns: an automatic weapon (cooldown 0.1 s) fires the same number of shots in 120 ticks under any frame schedule', async () => {
  const run = async (mode: 'ticks' | 'frames'): Promise<{ shots: number; ammoByTick: number[] }> => {
    const h = await startOnMap({ grid: OPEN_ROOM });
    const { session, game } = h;
    const inv = equip(h, AUTO);
    const ammoByTick: number[] = [];
    session.addBeforeTick(() => void (ammoByTick[session.scheduler.tick] = inv.ammo['test/ammo']!), session.scope);
    game.input.press('core/fire');
    const target = 121;
    if (mode === 'ticks') while (session.scheduler.tick < target) session.scheduler.runTick();
    else {
      const dts = [1 / 144, 1 / 30, 0.05, 1 / 60, 0.0133, 5 / 60, 0.0417, 0.007];
      let i = 0;
      while (session.scheduler.tick < target) session.scheduler.advance(dts[i++ % dts.length]!);
      assert.equal(session.scheduler.droppedTime, 0);
    }
    return { shots: 500 - ammoByTick[120]!, ammoByTick };
  };
  const a = await run('ticks');
  const b = await run('frames');
  assert.equal(a.shots, 20, '120 ticks / 6 ticks per shot');
  assert.equal(b.shots, 20);
  assert.deepEqual(b.ammoByTick.slice(0, 121), a.ammoByTick.slice(0, 121), 'identical shot timing, tick by tick');
  // Shots land every 6th tick exactly.
  for (let t = 1; t <= 120; t++) assert.equal(500 - a.ammoByTick[t]!, Math.ceil(t / 6), `ammo spent after ${t} ticks`);
});

test('acceptance 6 / cooldowns: a non-auto weapon cannot be re-fired before its cooldown, whatever the frame rate', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game } = h;
  const inv = equip(h, RAIL); // cooldown 0.1 s = 6 ticks
  const before = inv.ammo['test/ammo']!;
  for (let i = 0; i < 5; i++) {
    game.input.press('core/fire');
    session.scheduler.advance(1 / 60); // one tick per click: ticks 0..4
    game.input.release('core/fire');
  }
  assert.equal(before - inv.ammo['test/ammo']!, 1, 'clicks within the cooldown are ignored');
  session.scheduler.advance(1 / 60);
  game.input.press('core/fire');
  session.scheduler.advance(1 / 60); // tick 6: cooldown elapsed
  assert.equal(before - inv.ammo['test/ammo']!, 2);
});

// ---------------------------------------------------------------------------------------------------------------------
// input.clear() (blur / pause)
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 7 / input.clear(): held movement is dropped - the player stops accelerating and then stops', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const intent = session.entities.get(player, Intent)!;
  const p = session.entities.get(player, Player)!;
  const t = transformOf(session, player);
  place(session, player, 3, 7, FACE_EAST);
  game.input.press('core/move-forward');
  game.ticks(30);
  assert.equal(intent.moveZ, 1);
  assert.ok(p.speed > 0.95, `at full speed (${p.speed})`);
  const x0 = t.x;
  assert.ok(x0 - 3 > 1, `moved ${x0 - 3} m`);

  game.input.clear(); // window blur / pointer lock lost
  game.ticks(1);
  assert.equal(intent.moveZ, 0);
  assert.equal(intent.moveX, 0);
  let last = p.speed;
  for (let i = 0; i < 40; i++) {
    game.ticks(1);
    assert.ok(p.speed <= last + 1e-12, `tick ${i}: speed grew from ${last} to ${p.speed} after clear()`);
    last = p.speed;
  }
  assert.ok(p.speed < 0.01, `still moving (${p.speed})`);
  const x1 = t.x;
  game.ticks(30);
  assert.ok(Math.abs(t.x - x1) < 0.01, 'the player stays put');
  assert.ok(x1 - x0 < 1.0, `coasted ${x1 - x0} m after clear()`);
  assertHealthy(h);
});

test('acceptance 7 / input.clear(): held fire is dropped - an automatic weapon stops firing', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game } = h;
  const inv = equip(h, AUTO);
  const fired = record(session, AttackFired);
  game.input.press('core/fire');
  game.ticks(30);
  const n = fired.length;
  assert.ok(n >= 5, `precondition: it was firing (${n})`);
  game.input.clear();
  game.ticks(120);
  assert.equal(fired.length, n, 'no shots after clear()');
  const ammo = inv.ammo['test/ammo'];
  game.ticks(30);
  assert.equal(inv.ammo['test/ammo'], ammo);
});

test('acceptance 7 / input.clear(): a pending press edge and pending look are dropped too', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, game, player } = h;
  const inv = session.entities.get(player, Inventory)!;
  const t = transformOf(session, player);
  const yaw = t.yaw;
  game.input.press('core/fire');
  game.input.press('core/use');
  game.input.addLook(500, 0);
  game.input.clear();
  game.ticks(3);
  assert.equal(inv.ammo[BULLETS], 48);
  assert.equal(t.yaw, yaw);
  // Input works normally again afterwards (keys must be pressed anew).
  game.input.press('core/fire');
  game.ticks(2);
  assert.equal(inv.ammo[BULLETS], 47);
});

// ---------------------------------------------------------------------------------------------------------------------
// Restart restores a clean state (acceptance 2)
// ---------------------------------------------------------------------------------------------------------------------

/** Plays 300 ticks with damage taken, ammo spent, a door opened and an enemy killed. */
function playSomething(h: Started): void {
  const { game, session, combat, world, player } = h;
  world.setDoorOpen('bay-door', true);
  combat.damage({ target: player, amount: 30, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(5);
  for (let i = 0; i < 6; i++) tap(game, 'core/fire', 20);
  const enemy = session.entities.first(Enemy)!;
  combat.damage({ target: enemy, amount: 1000, kind: 'bullet', source: player, x: 0, z: 0 });
  game.ticks(300 - 5 - 6 * 21);
}

const systemIds = (s: Session): string[] => s.scheduler.describe().map((d) => d.id);

test('acceptance 2 / restart: after 300 ticks of play, restart() gives the same entities and resources as a fresh session', async () => {
  const h = await startArena();
  const { game } = h;
  const fresh = JSON.stringify(h.session.entities.snapshot());
  const report0 = JSON.parse(JSON.stringify(game.host.resourceReport()));
  const systems0 = systemIds(h.session).sort();
  assert.equal(new Set(systems0).size, systems0.length, 'no duplicate system ids');

  playSomething(h);
  const afterPlay = JSON.stringify(h.session.entities.snapshot());
  assert.notEqual(afterPlay, fresh, 'precondition: the session really changed');
  const played = h.session;
  assert.ok(played.entities.get(h.player, Health)!.hp < 100);
  assert.ok(h.session.entities.get(h.player, Inventory)!.ammo[BULLETS]! < 48);
  assert.ok(h.world.door('bay-door')!.open);
  assert.ok(played.entities.get(played.entities.first(Player)!, Player)!.kills >= 1);

  const s2 = await game.host.restart();
  assert.notEqual(s2, played);
  assert.equal(played.state, 'disposed');
  assert.equal(played.entities.count(), 0);
  assert.equal(s2.state, 'running');
  assert.equal(game.host.session, s2);
  assert.equal(s2.scheduler.tick, 0);
  assert.equal(JSON.stringify(s2.entities.snapshot()), fresh, 'restart restores the tick-0 entity snapshot (same seed)');
  assert.deepEqual(game.host.resourceReport(), report0, 'resource report including byOwner equals the first session\'s initial report');
  const systems1 = systemIds(s2).sort();
  assert.deepEqual(systems1, systems0);
  assert.equal(new Set(systems1).size, systems1.length);

  // The new session is fully playable and the door/health/ammo state is fresh.
  const h2 = handles(game);
  assert.equal(h2.world.door('bay-door')!.open, false);
  assert.equal(h2.world.version, 0);
  assert.equal(s2.entities.get(h2.player, Inventory)!.ammo[BULLETS], 48);
  assert.equal(h2.flow.ended, false);
  assertHealthy(h2);
});

test('acceptance 2 / restart: a restarted session replays the same scripted play identically (nothing survives in module state)', async () => {
  const h = await startArena({ seed: 99 });
  playSomething(h);
  const first = JSON.stringify(h.session.entities.snapshot());
  const firstTick = h.session.scheduler.tick;
  await h.game.host.restart();
  const h2 = handles(h.game);
  playSomething(h2);
  assert.equal(h2.session.scheduler.tick, firstTick);
  assert.equal(JSON.stringify(h2.session.entities.snapshot()), first);
});

test('acceptance 2 / restart: 10 restart cycles with play in between leak nothing and always start clean', async () => {
  const h = await startArena();
  const { game } = h;
  const fresh = JSON.stringify(h.session.entities.snapshot());
  const report0 = JSON.parse(JSON.stringify(game.host.resourceReport()));
  const installed0 = [...game.host.installed().keys()].sort();
  const generations: number[] = [h.session.generation];
  let current = h.session;
  for (let i = 0; i < 10; i++) {
    const hh = handles(game);
    game.input.press('core/move-forward');
    game.input.press('core/fire');
    game.ticks(40);
    hh.combat.damage({ target: hh.player, amount: 5, kind: 'bullet', source: 0, x: 0, z: 0 });
    hh.world.setDoorOpen('bay-door', true);
    game.ticks(20);
    const old = current;
    current = await game.host.restart();
    generations.push(current.generation);
    assert.equal(old.state, 'disposed', `cycle ${i}`);
    assert.equal(old.entities.count(), 0);
    assert.equal(JSON.stringify(current.entities.snapshot()), fresh, `cycle ${i}: snapshot differs from a fresh session`);
    assert.deepEqual(game.host.resourceReport(), report0, `cycle ${i}: resource report drifted`);
    const ids = systemIds(current);
    assert.equal(new Set(ids).size, ids.length, `cycle ${i}: duplicate systems`);
    assert.deepEqual([...game.host.installed().keys()].sort(), installed0);
    // Held keys from the previous session do not leak into the new one.
    game.ticks(10);
    assert.equal(handles(game).session.entities.get(handles(game).player, Intent)!.moveZ, 0, `cycle ${i}: input still held after restart`);
  }
  assert.equal(new Set(generations).size, generations.length, 'every restart is a new session');
  assert.equal(game.host.log.filter((l) => l.level === 'error').length, 0, game.host.log.map((l) => l.message).join('\n'));
});

test('acceptance 2 / apply: alternating between two presets (arena objective vs a test map) gives identical reports for the same preset every time', async () => {
  const game = createHeadlessGame([testPack({ 'test/map': gridMapData({ grid: HALL }) })]);
  const presetA = headlessPreset({ id: 'test/preset-a' });
  const presetB = presetFor('test/map', { id: 'test/preset-b' });
  const snapshots: Record<string, string> = {};
  const reports: Record<string, unknown> = {};
  const installed0 = (): string => [...game.host.installed().keys()].sort().join(',');
  const catalog0 = installed0();

  for (let i = 0; i < 10; i++) {
    const [name, preset] = i % 2 === 0 ? (['A', presetA] as const) : (['B', presetB] as const);
    const s = await game.host.apply(preset);
    const snap = JSON.stringify(s.entities.snapshot());
    const report = JSON.parse(JSON.stringify(game.host.resourceReport()));
    const ids = systemIds(s);
    assert.equal(new Set(ids).size, ids.length, `apply ${i} (${name}): duplicate systems`);
    if (i < 2) {
      snapshots[name] = snap;
      reports[name] = report;
    } else {
      assert.equal(snap, snapshots[name], `apply ${i} (${name}): snapshot differs from the first ${name} session`);
      assert.deepEqual(report, reports[name], `apply ${i} (${name}): resource report differs from the first ${name} session`);
    }
    // Play a little in between, with a click and some movement, so a leak would show up in the next report.
    game.input.press('core/move-forward');
    game.ticks(30);
    tap(game, 'core/fire', 5);
    game.input.release('core/move-forward');
    assert.equal(installed0(), catalog0, 'the installed catalog never changes');
  }
  assert.notDeepEqual(reports['A'], reports['B'], 'the two presets are really different');
  // And restart inside each preset keeps its own report.
  await game.host.apply(presetA);
  await game.host.restart();
  assert.deepEqual(JSON.parse(JSON.stringify(game.host.resourceReport())), reports['A']);
  assert.equal(game.host.log.filter((l) => l.level === 'error').length, 0);
});

test('acceptance 2 / restart: restarting a session that already ended (victory/defeat) starts a fresh, running game', async () => {
  const h = await startOnMap({ grid: OPEN_ROOM });
  const { session, combat, player, game } = h;
  const e = spawnEnemy(session, DUMMY, 10, 7);
  assert.ok(e);
  combat.damage({ target: player, amount: 1000, kind: 'bullet', source: 0, x: 0, z: 0 });
  game.ticks(3);
  assert.equal(h.flow.ended, true);
  assert.equal(h.flow.result!.outcome, 'defeat');
  await game.host.restart();
  const h2 = handles(game);
  assert.equal(h2.flow.ended, false);
  assert.equal(h2.session.entities.get(h2.player, Health)!.hp, 100);
  assert.equal(h2.session.entities.count(Enemy), 0);
  game.ticks(30);
  assertHealthy(h2);
});
