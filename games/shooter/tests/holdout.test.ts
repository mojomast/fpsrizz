import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Flow, Health, Player, Transform } from '../../../src/sdk/index.ts';
import { Combat, Enemies, Enemy, World } from '../contracts/shooter.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import manifest from '../plugins/example-holdout/manifest.json' with { type: 'json' };

const ID = 'example/holdout';
const entry = { manifest, load: () => import('../plugins/example-holdout/index.ts') };
const preset = (config: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => headlessPreset({
  plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', ID],
  roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': ID },
  config: { [ID]: { holdSeconds: 1, spawnInterval: 1, ...config } }, ...over,
});

test('occupancy accumulates only inside; score, victory and restart are deterministic', async () => {
  const game = createHeadlessGame([entry]);
  try {
    await game.host.apply(preset());
    const session = game.session();
    const world = session.services.get(World);
    const zone = world.desc.triggers.find((t) => t.kind === 'zone' && t.tags.includes('exit'))!;
    const player = session.entities.first(Player)!;
    const pose = session.entities.get(player, Transform)!;
    const health = session.entities.get(player, Health)!;
    health.hp = health.max = 1e9;
    const flow = session.services.get(Flow);
    game.ticks(1);
    const enemy = session.entities.first(Enemy)!;
    assert.ok(enemy);
    const score = session.registries.require(Enemies, session.entities.get(enemy, Enemy)!.def).score;
    session.services.get(Combat).damage({ target: enemy, amount: 1e6, kind: 'test', source: player, x: 0, z: 0 });
    game.ticks(1);
    assert.equal(flow.status.get('score')?.value, String(score));
    pose.x = zone.x; pose.z = zone.z;
    game.ticks(30);
    assert.equal(flow.status.get('hold')?.value, '0.5 / 1.0 s');
    pose.x = world.desc.playerStart.x; pose.z = world.desc.playerStart.z;
    game.ticks(90);
    assert.equal(flow.status.get('hold')?.value, '0.5 / 1.0 s');
    assert.equal(flow.ended, false);
    pose.x = zone.x; pose.z = zone.z;
    game.ticks(29);
    assert.equal(flow.ended, false);
    game.ticks(1);
    assert.equal(flow.result?.outcome, 'victory');
    assert.equal(Object.fromEntries(flow.result!.stats)['Kills'], '1');
    const count = session.entities.count(Enemy);
    game.ticks(180);
    assert.equal(session.entities.count(Enemy), count);
    await game.host.restart();
    assert.equal(game.session().services.get(Flow).status.get('hold')?.value, '0.0 / 1.0 s');
    assert.equal(game.session().entities.count(Enemy), 0);
    game.ticks(1);
    assert.equal(game.session().entities.count(Enemy), 1);
  } finally { game.host.stop(); }
});

test('player death ends the run and stops spawns', async () => {
  const game = createHeadlessGame([entry]);
  try {
    await game.host.apply(preset());
    const s = game.session();
    const player = s.entities.first(Player)!;
    s.services.get(Combat).damage({ target: player, amount: 1e6, kind: 'test', source: 0, x: 0, z: 0 });
    game.ticks(1);
    assert.equal(s.services.get(Flow).result?.outcome, 'defeat');
    game.ticks(180);
    assert.equal(s.entities.count(Enemy), 0);
  } finally { game.host.stop(); }
});

test('selected mode validates exit zone and enemy points before replacing a running session', async () => {
  const map = {
    schema: 1, format: 'core/grid', name: 'Empty', cellSize: 2, wallHeight: 3,
    legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
    grid: ['#####', '#...#', '#...#', '#####'], playerStart: { cell: [1, 1], yaw: 0 }, spawns: [],
  };
  const pack = { manifest: { schema: 1, id: 'test/empty-map', name: 'Empty map', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0' } }, content: [{ kind: 'map', id: 'test/empty', data: map }] };
  const game = createHeadlessGame([entry, pack]);
  try {
    await game.host.apply(headlessPreset());
    const before = game.session();
    await assert.rejects(game.host.apply(preset({}, { plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', ID, 'test/empty-map'], options: { map: 'test/empty' } })), (err: unknown) => {
      const text = String(err);
      assert.match(text, /zone trigger tagged "exit"/);
      assert.match(text, /spawn tagged "enemy"/);
      return true;
    });
    assert.equal(game.session(), before);
  } finally { game.host.stop(); }
});
