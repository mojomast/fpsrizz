import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import type { HeadlessGame } from './helpers/game.ts';
import { Flow, FlowEnded, Health, Maps, Player, Transform } from '../src/sdk/index.ts';
import { Combat, Enemies, Enemy, Pickup, World } from '../games/shooter/contracts/shooter.ts';
import type { EntityId, FlowResult } from '../src/sdk/index.ts';
import manifest from '../games/shooter/plugins/example-survival/manifest.json' with { type: 'json' };

const ID = 'example/survival';
const defaults = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content'];
const defaultRoles = { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera' };
const survivalEntry = { manifest, load: () => import('../games/shooter/plugins/example-survival/index.ts') };

// A walled room with a player start and a medkit but no enemy spawns.
const emptyMap = {
  schema: 1,
  format: 'core/grid',
  name: 'Empty Room',
  cellSize: 2,
  wallHeight: 3,
  legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
  grid: ['#####', '#...#', '#...#', '#####'],
  playerStart: { cell: [1, 1], yaw: 0 },
  spawns: [{ id: 'med', prefab: 'core/medkit', cell: [3, 2] }],
};
const emptyMapPack = {
  manifest: { schema: 1, id: 'test/empty-map', name: 'Empty map', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0' } },
  content: [{ kind: 'map', id: 'test/empty', data: emptyMap }],
};

const survivalPreset = (config: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  headlessPreset({
    plugins: [...defaults, ID],
    roles: { ...defaultRoles, 'sdk/mode': ID },
    config: { [ID]: { intermission: 1, ...config } },
    ...over,
  });

interface Run {
  game: HeadlessGame;
  results: FlowResult[];
}
async function start(config: Record<string, unknown> = {}, over: Record<string, unknown> = {}, extra: object[] = []): Promise<Run> {
  const game = createHeadlessGame([survivalEntry, ...(extra as never[])]);
  await game.host.apply(survivalPreset(config, over));
  const results: FlowResult[] = [];
  const s = game.session();
  s.events.on(FlowEnded, (r) => void results.push(r), 'test', s.scope);
  return { game, results };
}

const enemies = (g: HeadlessGame): EntityId[] => {
  const out: EntityId[] = [];
  g.session().entities.each(Enemy, (id) => void out.push(id));
  return out;
};
const alive = (g: HeadlessGame): EntityId[] => enemies(g).filter((id) => !g.session().entities.get(id, Health)?.dead);
const player = (g: HeadlessGame): EntityId => g.session().entities.first(Player)!;
const flow = (g: HeadlessGame) => g.session().services.get(Flow);
const status = (g: HeadlessGame, key: string): string | undefined => flow(g).status.get(key)?.value;
const invulnerable = (g: HeadlessGame): void => {
  const h = g.session().entities.get(player(g), Health)!;
  h.hp = h.max = 1e9;
};
const kill = (g: HeadlessGame, id: EntityId): void =>
  g.session().services.get(Combat).damage({ target: id, amount: 1e6, kind: 'test', source: player(g), x: 0, z: 0 });
function killAll(g: HeadlessGame): number {
  const list = alive(g);
  for (const id of list) kill(g, id);
  g.ticks(1);
  return list.length;
}
function ticksUntil(g: HeadlessGame, pred: () => boolean, max: number): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    g.ticks(1);
  }
  assert.ok(pred(), `condition not reached within ${max} ticks`);
  return max;
}
/** Waits for the next wave to be fully spawned (wave `n` with its full count). */
function untilWaveSpawned(g: HeadlessGame, n: number, count: number): void {
  ticksUntil(g, () => status(g, 'wave')?.startsWith(`${n} /`) === true && alive(g).length === count, 1200);
}
const defScore = (g: HeadlessGame, id: EntityId): number => g.session().registries.require(Enemies, g.session().entities.get(id, Enemy)!.def).score;

test('starts with no enemies, all doors open, player at start; wave 1 spawns exactly baseCount staggered', async () => {
  const { game } = await start();
  invulnerable(game);
  const s = game.session();
  const w = s.services.get(World);
  assert.equal(s.entities.count(Player), 1);
  assert.equal(enemies(game).length, 0);
  assert.ok(w.doors().length > 0);
  for (const d of w.doors()) assert.equal(d.open, true, `door ${d.desc.id} must be open (including locked exit-gate)`);
  const t = s.entities.get(player(game), Transform)!;
  assert.ok(Math.abs(t.x - w.desc.playerStart.x) < 1e-6 && Math.abs(t.z - w.desc.playerStart.z) < 1e-6);
  assert.match(flow(game).objective, /Wave 1 incoming/);

  // Stagger: after wave start the count climbs one by one rather than all in a tick.
  ticksUntil(game, () => alive(game).length >= 1, 200);
  assert.equal(alive(game).length, 1);
  assert.match(flow(game).objective, /Survive — wave 1 of 5/);
  untilWaveSpawned(game, 1, 3);
  game.ticks(120);
  assert.equal(alive(game).length, 3, 'exactly baseCount, no more');
  assert.equal(status(game, 'hostiles'), '3');
});

test('spawns respect distance, free space and prefer hidden points; never inside walls', async () => {
  const { game } = await start({ baseCount: 6, growth: 0, minSpawnDistance: 8 });
  invulnerable(game);
  const s = game.session();
  const w = s.services.get(World);
  const p = s.entities.get(player(game), Transform)!;
  const seen = new Set<EntityId>();
  for (let i = 0; i < 400 && seen.size < 6; i++) {
    game.ticks(1);
    for (const id of alive(game)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const t = s.entities.get(id, Transform)!;
      const r = s.registries.require(Enemies, s.entities.get(id, Enemy)!.def).radius;
      assert.ok(w.isFree(t.x, t.z, r), 'spawned in a free spot');
      assert.ok(Math.hypot(t.x - p.x, t.z - p.z) >= 8, 'at least minSpawnDistance away');
    }
  }
  assert.equal(seen.size, 6);
});

test('clearing a wave starts wave 2 after the intermission with baseCount + growth; score = def scores + wave bonus', async () => {
  const { game } = await start({ intermission: 2 });
  invulnerable(game);
  untilWaveSpawned(game, 1, 3);
  const w1 = alive(game);
  const expected1 = w1.reduce((a, id) => a + defScore(game, id), 0);
  assert.equal(killAll(game), 3);
  game.ticks(2);
  assert.equal(status(game, 'score'), String(expected1 + 100), 'wave 1 kills + 100 * 1');
  assert.match(flow(game).objective, /Wave 2 incoming/);
  assert.equal(enemies(game).filter((id) => !game.session().entities.get(id, Health)?.dead).length, 0);

  // Intermission is 2 s = 120 ticks: nothing spawns before it elapses.
  game.ticks(90);
  assert.equal(alive(game).length, 0);
  untilWaveSpawned(game, 2, 5);
  assert.equal(status(game, 'hostiles'), '5');
  const w2 = alive(game);
  const expected2 = w2.reduce((a, id) => a + defScore(game, id), 0);
  killAll(game);
  game.ticks(2);
  assert.equal(status(game, 'score'), String(expected1 + 100 + expected2 + 200));
});

test('waves: 2 -> clearing wave 2 ends in victory exactly once with stats', async () => {
  const { game, results } = await start({ waves: 2 });
  invulnerable(game);
  untilWaveSpawned(game, 1, 3);
  killAll(game);
  untilWaveSpawned(game, 2, 5);
  killAll(game);
  game.ticks(300);
  assert.equal(results.length, 1);
  const r = results[0]!;
  assert.equal(r.outcome, 'victory');
  assert.equal(flow(game).ended, true);
  const stats = Object.fromEntries(r.stats);
  assert.equal(stats['Wave reached'], '2 / 2');
  assert.equal(stats['Kills'], '8');
  assert.ok(Number(stats['Score']) >= 300 + 8 * 100);
  assert.match(stats['Time']!, /^\d+:\d\d$/);
  assert.equal(enemies(game).length, 8, 'no further wave spawned after victory');
});

test('player death ends in defeat and no further waves spawn', async () => {
  const { game, results } = await start();
  untilWaveSpawned(game, 1, 3);
  const h = game.session().entities.get(player(game), Health)!;
  kill(game, player(game));
  game.ticks(2);
  assert.equal(h.dead, true);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.outcome, 'defeat');
  assert.equal(results[0]!.title, 'Overrun');
  assert.equal(Object.fromEntries(results[0]!.stats)['Wave reached'], '1 / 5');
  const count = enemies(game).length;
  game.ticks(600);
  assert.equal(enemies(game).length, count, 'nothing spawns after defeat');
  assert.equal(results.length, 1, 'ends once');
});

test('collected pickups respawn at wave start; untouched pickups are not duplicated', async () => {
  const { game } = await start();
  invulnerable(game);
  const s = game.session();
  const w = s.services.get(World);
  const nonEnemy = w.desc.spawns.filter((x) => !x.tags.includes('enemy'));
  assert.ok(nonEnemy.length >= 2);
  const pickupIds: EntityId[] = [];
  s.entities.each(Pickup, (id) => void pickupIds.push(id));
  assert.equal(pickupIds.length, nonEnemy.length);
  s.entities.destroy(pickupIds[0]!); // simulate collection
  untilWaveSpawned(game, 1, 3);
  const after: EntityId[] = [];
  s.entities.each(Pickup, (id) => void after.push(id));
  assert.equal(after.length, nonEnemy.length, 'the collected pickup came back, nothing was duplicated');
});

function spawnLog(g: HeadlessGame, ticks: number): string[] {
  const s = g.session();
  const seen = new Set<EntityId>();
  const log: string[] = [];
  for (let i = 0; i < ticks; i++) {
    g.ticks(1);
    for (const id of alive(g)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const t = s.entities.get(id, Transform)!;
      log.push(`${s.entities.get(id, Enemy)!.def}@${t.x.toFixed(3)},${t.z.toFixed(3)}`);
    }
  }
  return log;
}
async function logFor(seed: number): Promise<string[]> {
  const { game } = await start({ baseCount: 8, growth: 0 }, { seed });
  invulnerable(game);
  return spawnLog(game, 600);
}

test('determinism: same seed -> identical spawn order and positions; different seed differs', async () => {
  const a = await logFor(11);
  const b = await logFor(11);
  assert.equal(a.length, 8);
  assert.deepEqual(a, b);
  const others = await Promise.all([12, 13, 14, 15].map(logFor));
  assert.ok(others.some((o) => JSON.stringify(o) !== JSON.stringify(a)), 'some other seed produces a different sequence');
});

test('core/objective still works when the plugin is enabled but not selected', async () => {
  const game = createHeadlessGame([survivalEntry]);
  await game.host.apply(headlessPreset({ plugins: [...defaults, ID], roles: { ...defaultRoles, 'sdk/mode': 'core/objective' } }));
  const s = game.session();
  const pre = enemies(game).length;
  assert.equal(pre, s.services.get(World).desc.spawns.filter((x) => x.tags.includes('enemy')).length, 'every map enemy is pre-spawned as usual');
  game.ticks(600);
  assert.equal(enemies(game).length, pre, 'no waves');
  assert.equal(flow(game).status.has('wave'), false);
  assert.ok(!JSON.stringify(s.scheduler.describe()).includes(`${ID}.waves`));
  const w = s.services.get(World);
  assert.ok(w.doors().some((d) => !d.open), 'doors are not force-opened');
});

test('removing the plugin from the preset leaves nothing from example/ behind', async () => {
  const baseline = createHeadlessGame([survivalEntry]);
  await baseline.host.apply(headlessPreset());
  const baseReport = baseline.host.resourceReport();

  const game = createHeadlessGame([survivalEntry]);
  await game.host.apply(survivalPreset());
  assert.ok(JSON.stringify(game.session().scheduler.describe()).includes('example/'), 'sanity: survival registers a system');
  assert.ok('example/survival' in game.host.resourceReport().byOwner);
  await game.host.apply(headlessPreset());
  const s = game.session();
  assert.ok(!JSON.stringify(s.scheduler.describe()).includes('example/'));
  const report = game.host.resourceReport();
  assert.ok(!Object.keys(report.byOwner).some((k) => k.startsWith('example/')));
  assert.deepEqual(report, baseReport);
});

test('selecting survival on a map without enemy spawns is rejected at validation; session unchanged', async () => {
  const game = createHeadlessGame([survivalEntry, { manifest: emptyMapPack.manifest, content: emptyMapPack.content } as never]);
  await game.host.apply(headlessPreset());
  const before = game.session();
  const reportBefore = game.host.resourceReport();
  await assert.rejects(
    game.host.apply(survivalPreset({}, { plugins: [...defaults, ID, 'test/empty-map'], options: { map: 'test/empty' } })),
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      assert.match(msg, /test\/empty/);
      assert.match(msg, /enemy/);
      assert.match(msg, /spawns/);
      return true;
    },
  );
  assert.equal(game.host.session, before);
  assert.deepEqual(game.host.resourceReport(), reportBefore);

  // Survival on the arena is accepted.
  await game.host.apply(survivalPreset());
  assert.ok(game.session().registries.has(Maps, 'core/arena'));
});

test('unknown player prefab is rejected at validation', async () => {
  const game = createHeadlessGame([survivalEntry]);
  await assert.rejects(game.host.apply(survivalPreset({ playerPrefab: 'nope/hero' })), /nope\/hero/);
});

test('config bounds are enforced by the host', async () => {
  const game = createHeadlessGame([survivalEntry]);
  await assert.rejects(game.host.apply(survivalPreset({ waves: 0 })));
  await assert.rejects(game.host.apply(survivalPreset({ waves: 51 })));
});
