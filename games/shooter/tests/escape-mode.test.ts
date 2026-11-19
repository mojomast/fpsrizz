import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Player, Transform } from '../../../src/sdk/index.ts';
import { Combat, Pickup, TriggerFired, World } from '../contracts/shooter.ts';
import escape from '../plugins/example-escape/manifest.json' with { type: 'json' };
import keys from '../plugins/example-keys/manifest.json' with { type: 'json' };
import dungeon from '../plugins/example-key-dungeon/manifest.json' with { type: 'json' };
import content from '../plugins/example-key-dungeon/content.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';

const entries = [
  { manifest: escape, load: () => import('../plugins/example-escape/index.ts') },
  { manifest: keys, load: () => import('../plugins/example-keys/index.ts') },
  { manifest: dungeon, content },
] as never;
const plugins = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/content', 'example/escape', 'example/keys', 'example/key-dungeon'];
const roles = { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/escape' };
const preset = (config: Record<string, unknown> = {}) => headlessPreset({ plugins, roles, options: { map: 'example/key-dungeon' }, config: { 'example/escape': config } }) as never;

test('escape respects the keyed gate and wins on reaching the exit, including after restart', async () => {
  const game = createHeadlessGame(entries);
  try {
    await game.host.apply(preset());
    const pose = () => game.session().entities.get(game.session().entities.first(Player)!, Transform)!;
    const walk = (x: number, z: number) => {
      game.input.press('core/move-forward');
      for (let i = 0; i < 400 && Math.hypot(pose().x - x, pose().z - z) > 0.25; i++) {
        pose().yaw = Math.atan2(-(x - pose().x), -(z - pose().z));
        game.ticks(1);
      }
      game.input.release('core/move-forward');
      game.ticks(12);
      assert.ok(Math.hypot(pose().x - x, pose().z - z) < 0.6);
    };
    const use = () => { game.input.press('core/use'); game.ticks(1); game.input.release('core/use'); game.ticks(1); };
    const run = () => {
      const session = game.session();
      const world = session.services.get(World);
      const flow = session.services.get(Flow);
      assert.equal(flow.objective, 'Find a route to the exit');
      assert.equal(world.findPath(pose().x, pose().z, 19, 7, []), false);
      assert.equal(session.entities.count(Pickup), 1);
      session.events.emit(TriggerFired, { id: 'other', kind: 'zone', tags: ['exit'], by: 9999, x: 0, z: 0 });
      assert.equal(flow.ended, false);
      walk(9, 7);
      pose().yaw = -Math.PI / 2;
      use();
      assert.equal(world.door('vault-door')!.locked, true);
      assert.equal(world.door('vault-door')!.open, false);
      assert.equal(flow.ended, false);
      walk(3, 3);
      assert.equal(session.entities.count(Pickup), 0);
      walk(9, 7);
      pose().yaw = -Math.PI / 2;
      use();
      assert.equal(world.door('vault-door')!.open, true);
      walk(19, 7);
      assert.equal(flow.result?.outcome, 'victory');
    };
    run();
    await game.host.restart();
    run();
  } finally { game.host.stop(); }
});

test('player death defeats and restart resets the run', async () => {
  const game = createHeadlessGame(entries);
  try {
    await game.host.apply(preset());
    const session = game.session();
    const player = session.entities.first(Player)!;
    const p = session.entities.get(player, Transform)!;
    session.services.get(Combat).damage({ target: player, source: 0, amount: 10000, kind: 'test', x: p.x, z: p.z });
    game.ticks(1);
    assert.equal(session.services.get(Flow).result?.outcome, 'defeat');
    await game.host.restart();
    assert.equal(game.session().services.get(Flow).ended, false);
    assert.equal(game.session().services.get(World).door('vault-door')!.locked, true);
  } finally { game.host.stop(); }
});

test('invalid player prefab or map without an exit is rejected before commit', async () => {
  const map = {
    manifest: { schema: 1, id: 'test/no-exit', name: 'No exit', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0' } },
    content: [{ kind: 'map', id: 'test/no-exit', data: {
      schema: 1, format: 'core/grid', name: 'No exit', cellSize: 2, wallHeight: 3,
      legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
      grid: ['#####', '#...#', '#...#', '#...#', '#####'], playerStart: { cell: [1, 1], yaw: 0 }, spawns: [],
    } }],
  };
  const game = createHeadlessGame([...entries, map] as never);
  try {
    await game.host.apply(preset());
    const original = game.session();
    await assert.rejects(game.host.apply(preset({ playerPrefab: 'missing/player' })), /unknown prefab "missing\/player"/);
    await assert.rejects(game.host.apply(headlessPreset({ plugins: [...plugins, 'test/no-exit'], roles, options: { map: 'test/no-exit' } }) as never), /zone trigger tagged "exit"/);
    assert.equal(game.session(), original);
  } finally { game.host.stop(); }
});
