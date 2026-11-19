import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Health, Player, Profile, Transform, definePlugin } from '../../../src/sdk/index.ts';
import { Combat, Enemies, Enemy, Pickup } from '../contracts/shooter.ts';
import type { ProfileService } from '../../../src/sdk/index.ts';
import { createProfileStore } from '../../../src/platform/profile-store.ts';
import manifest from '../plugins/example-arena/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';

const entry = { manifest: manifest as never, load: () => import('../plugins/example-arena/index.ts') };
const plugins = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/content', 'example/arena'];
const roles = { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/arena' };
const preset = (config: Record<string, unknown> = {}) => headlessPreset({ plugins, roles, config: { 'example/arena': config } }) as never;
async function setup(config: Record<string, unknown> = {}, profile?: ProfileService) {
  const provider = {
    manifest: { schema: 1, id: 'test/profile', name: 'Profile', version: '1.0.0', kind: 'code', sdk: '^2.0.0' },
    load: async () => ({ default: definePlugin({ activate(ctx) { ctx.services.provide(Profile, profile!); } }) }),
  };
  const game = createHeadlessGame(profile ? [entry, provider as never] : [entry]);
  const selected = profile ? { ...headlessPreset({ plugins: [...plugins, 'test/profile'], roles, config: { 'example/arena': config } }) } : preset(config);
  await game.host.apply(selected);
  return game;
}
function living(game: Awaited<ReturnType<typeof setup>>): number[] {
  const entities = game.session().entities;
  const ids: number[] = [];
  entities.each(Enemy, (id) => { if (!entities.get(id, Health)?.dead) ids.push(id); });
  return ids;
}
function kill(game: Awaited<ReturnType<typeof setup>>, id: number, source: number): void {
  const session = game.session();
  const p = session.entities.get(id, Transform)!;
  session.services.get(Combat).damage({ target: id, source, amount: 10000, kind: 'test', x: p.x, z: p.z });
  game.ticks(1);
}

test('arena scores player kills, enforces cap and kill limit, and resets on restart', async () => {
  const game = await setup({ killLimit: 2, maxAlive: 1, spawnInterval: 0.05 });
  try {
    game.ticks(30);
    assert.equal(living(game).length, 1);
    const session = game.session();
    const player = session.entities.first(Player)!;
    const first = living(game)[0]!;
    const enemy = session.entities.get(first, Enemy)!;
    const score = session.registries.require(Enemies, enemy.def).score;
    kill(game, first, player);
    const flow = session.services.get(Flow);
    assert.equal(flow.status.get('score')?.value, String(score));
    assert.equal(flow.status.get('kills')?.value, '1 / 2');
    game.ticks(5);
    const second = living(game)[0]!;
    assert.ok(second && second !== first);
    kill(game, second, player);
    assert.equal(flow.result?.title, 'Kill limit reached');
    const count = session.entities.count(Enemy);
    game.ticks(30);
    assert.equal(session.entities.count(Enemy), count);
    await game.host.restart();
    assert.equal(game.session().services.get(Flow).status.get('kills')?.value, '0 / 2');
    assert.equal(game.session().services.get(Flow).ended, false);
    game.ticks(1);
    assert.equal(living(game).length, 1);
  } finally { game.host.stop(); }
});

test('arena persists best scores and re-reads other profile values at run end', async () => {
  const data = new Map<string, string>();
  const store = createProfileStore({
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  });
  const game = await setup({ killLimit: 1, maxAlive: 1 }, store);
  try {
    game.ticks(1);
    const player = game.session().entities.first(Player)!;
    const enemy = living(game)[0]!;
    const score = game.session().registries.require(Enemies, game.session().entities.get(enemy, Enemy)!.def).score;
    assert.equal(store.save({ values: { unlock: true } }).ok, true);
    kill(game, enemy, player);
    assert.deepEqual(store.load(), { ok: true, value: { values: { unlock: true, 'example/arena.best-score': score } } });
    assert.equal(game.session().services.get(Flow).status.get('profile')?.value, 'Saved');
    await game.host.restart();
    assert.equal(game.session().services.get(Flow).status.get('best')?.value, String(score));
    assert.equal(store.save({ values: { unlock: true, 'example/arena.best-score': score + 100 } }).ok, true);
    game.ticks(1);
    kill(game, living(game)[0]!, game.session().entities.first(Player)!);
    assert.equal(game.session().services.get(Flow).status.get('best')?.value, String(score + 100));
    assert.equal(game.session().services.get(Flow).status.get('profile')?.value, 'Best unchanged');
  } finally { game.host.stop(); }
});

test('arena reports unavailable profile reads and writes without interrupting play', async () => {
  const unavailable = await setup({ timeLimit: 1 }, createProfileStore(null));
  try {
    unavailable.ticks(62);
    const flow = unavailable.session().services.get(Flow);
    assert.equal(flow.result?.title, 'Time up');
    assert.equal(flow.status.get('profile')?.value, 'Not saved (unavailable)');
    assert.ok(flow.result?.stats?.some(([key, value]) => key === 'Profile' && value === 'Not saved (unavailable)'));
  } finally { unavailable.host.stop(); }
  const quota = createProfileStore({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} });
  const game = await setup({ timeLimit: 1 }, quota);
  try {
    game.ticks(62);
    const flow = game.session().services.get(Flow);
    assert.equal(flow.status.get('profile')?.value, 'Not saved (unavailable)');
    assert.equal(flow.status.get('best')?.value, '—');
  } finally { game.host.stop(); }
});

test('uncredited deaths do not score, time limit completes and death defeats', async () => {
  const game = await setup({ killLimit: 3, timeLimit: 1, maxAlive: 1, spawnInterval: 0.05 });
  try {
    game.ticks(1);
    kill(game, living(game)[0]!, 0);
    assert.equal(game.session().services.get(Flow).status.get('kills')?.value, '0 / 3');
    game.ticks(61);
    assert.equal(game.session().services.get(Flow).result?.title, 'Time up');
    await game.host.restart();
    const player = game.session().entities.first(Player)!;
    kill(game, player, 0);
    assert.equal(game.session().services.get(Flow).result?.outcome, 'defeat');
  } finally { game.host.stop(); }
});

test('seeded spawn sequence repeats on restart and collected pickups respawn', async () => {
  const game = await setup({ spawnInterval: 0.05, maxAlive: 4, pickupRespawn: 1 });
  try {
    const sample = () => living(game).map((id) => {
      const entities = game.session().entities;
      const pos = entities.get(id, Transform)!;
      return [entities.get(id, Enemy)!.def, pos.x, pos.z];
    });
    game.ticks(10);
    const first = sample();
    assert.ok(first.length > 1);
    const pickup = game.session().entities.first(Pickup)!;
    assert.ok(pickup);
    const count = game.session().entities.count(Pickup);
    game.session().entities.destroy(pickup);
    game.ticks(62);
    assert.equal(game.session().entities.count(Pickup), count);
    await game.host.restart();
    game.ticks(10);
    assert.deepEqual(sample(), first);
  } finally { game.host.stop(); }
});

test('settings and player prefab are validated before replacing a running session', async () => {
  const game = await setup();
  try {
    const original = game.session();
    for (const config of [{ killLimit: 1.5 }, { maxAlive: 2.5 }, { timeLimit: 0 }, { playerPrefab: 'missing/player' }]) {
      await assert.rejects(game.host.apply(preset(config)));
      assert.equal(game.session(), original);
    }
  } finally { game.host.stop(); }
});

test('arena rejects a map without enemy spawn points before commit', async () => {
  const map = {
    manifest: { schema: 1, id: 'test/empty-map', name: 'Empty map', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0' } },
    content: [{ kind: 'map', id: 'test/empty', data: {
      schema: 1, format: 'core/grid', name: 'Empty', cellSize: 2, wallHeight: 3,
      legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
      grid: ['#####', '#...#', '#...#', '#...#', '#####'], playerStart: { cell: [1, 1], yaw: 0 }, spawns: [],
    } }],
  };
  const game = createHeadlessGame([entry, map as never]);
  try {
    await game.host.apply(preset());
    const original = game.session();
    await assert.rejects(game.host.apply(headlessPreset({ plugins: [...plugins, 'test/empty-map'], roles, options: { map: 'test/empty' } }) as never), /enemy-tagged spawn/);
    assert.equal(game.session(), original);
  } finally { game.host.stop(); }
});
