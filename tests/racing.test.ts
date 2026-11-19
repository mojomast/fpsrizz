import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Player, SequenceMechanicRole, Transform, World, definePlugin } from '../src/sdk/index.ts';
import type { CatalogEntry, SessionContext } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin, hostFailure } from './helpers/host.ts';
import { sequenceProviders } from './helpers/alternate-sequence.ts';
import type { SequenceProviderCase } from './helpers/alternate-sequence.ts';
import manifest from '../games/shooter/plugins/example-racing/manifest.json' with { type: 'json' };

const gate = (id: string, cell: number, tag: string) => ({ id, kind: 'zone', cell: [cell, 2], radius: 0.3, tags: [tag] });
function maps(triggers: ReturnType<typeof gate>[]): CatalogEntry {
  return { manifest: { schema: 1, id: 'test/race-map', name: 'Race map', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0' } }, content: [{ kind: 'map', id: 'test/race', data: {
    schema: 1, format: 'core/grid', name: 'Race', cellSize: 2, wallHeight: 3,
    legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } },
    grid: ['##########', '#........#', '#........#', '#........#', '##########'],
    playerStart: { cell: [1, 2], yaw: 0 }, triggers, spawns: [],
  } }] } as CatalogEntry;
}
const gates = [gate('one', 3, 'race/checkpoint/1'), gate('two', 5, 'race/checkpoint/2'), gate('finish', 7, 'race/finish')];
async function setup(triggers = gates, limit = 90, selected: SequenceProviderCase = sequenceProviders[0]) {
  let move: { x: number; z: number } | undefined;
  const probe = { manifest: { schema: 1, id: 'test/race-probe', name: 'Probe', version: '1.0.0', kind: 'code', sdk: '^2.0.0' }, load: async () => ({ default: definePlugin({ activate(ctx: SessionContext) {
    ctx.systems.add({ id: 'test/race-move', phase: 'movement', update() {
      const id = ctx.world.first(Player); const t = id === undefined ? undefined : ctx.world.get(id, Transform);
      if (t && move) { t.x = move.x; t.z = move.z; move = undefined; }
    } });
  } }) }) } as CatalogEntry;
  const game = createHeadlessGame([selected.entry, maps(triggers), probe, { manifest: manifest as never, load: () => import('../games/shooter/plugins/example-racing/index.ts') }]);
  const preset = headlessPreset({ plugins: ['core/world', 'core/combat', 'core/player', 'example/racing', 'test/race-map', 'test/race-probe', selected.id], roles: { 'sdk/controller': 'example/racing-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/race', 'sdk/mechanic-sequence': selected.id }, options: { map: 'test/race' }, config: { 'example/racing': { timeLimit: limit } } });
  try { await game.host.apply(preset as never); } catch (error) { game.host.stop(); throw error; }
  const session = game.session();
  const id = session.entities.first(Player)!;
  return { game, session, id, flow: session.services.get(Flow), pose: session.entities.get(id, Transform)!, go(x: number, z = 5) { move = { x, z }; game.ticks(1); } };
}

for (const selected of sequenceProviders) {
test(`swept gates are ordered, including multiple gates in one tick, and restart resets the race (${selected.id})`, async () => {
  const t = await setup(gates, 90, selected);
  t.go(16); // crosses both checkpoints and the finish in one tick
  assert.equal(t.flow.result?.outcome, 'victory');
  await t.game.host.restart();
  assert.equal(t.game.session().services.get(Flow).ended, false);
  assert.equal(t.game.session().services.get(Flow).status.get('race-checkpoints')?.value, '0 / 2');
  t.game.host.stop();
});

test(`out of order crossings do not count and timer causes defeat (${selected.id})`, async () => {
  const t = await setup(gates, 1, selected);
  t.go(16, 3); // bypass checkpoints
  t.go(16, 5);
  t.go(14, 5); // cross finish first
  assert.equal(t.flow.ended, false);
  assert.equal(t.flow.status.get('race-checkpoints')?.value, '0 / 2');
  t.game.ticks(61);
  assert.equal(t.flow.result?.outcome, 'defeat');
  t.game.host.stop();
});

test(`driving accelerates, steers, brakes and respects walls (${selected.id})`, async () => {
  const t = await setup(gates, 90, selected);
  t.game.input.press('example/racing-gas');
  t.game.ticks(20);
  assert.ok(t.pose.z < 5);
  t.game.input.press('example/racing-left');
  t.game.ticks(10);
  assert.ok(t.pose.yaw > 0);
  t.game.input.release('example/racing-left');
  t.game.ticks(180);
  assert.ok(t.session.services.get(World).isFree(t.pose.x, t.pose.z, 0.35));
  t.game.input.release('example/racing-gas');
  t.game.input.press('example/racing-brake');
  t.game.ticks(40);
  assert.ok(t.session.entities.get(t.id, Player)!.speed > 0);
  t.game.host.stop();
});

test(`invalid racing maps are rejected during staging (${selected.id})`, async () => {
  await assert.rejects(() => setup([gate('two', 3, 'race/checkpoint/2'), gate('end', 7, 'race/finish')], 90, selected));
  await assert.rejects(() => setup([gate('one', 3, 'race/checkpoint/1')], 90, selected));
});

test(`physical crossing order cannot retroactively credit an earlier rejected gate (${selected.id})`, async () => {
  const t = await setup([gate('one', 5, 'race/checkpoint/1'), gate('two', 3, 'race/checkpoint/2'), gate('finish', 7, 'race/finish')], 90, selected);
  try {
    t.go(16); // Travel encounters checkpoint 2, then 1, then finish.
    assert.equal(t.flow.ended, false);
    assert.equal(t.flow.status.get('race-checkpoints')?.value, '1 / 2');
    t.go(3); // Finish is rejected again, then checkpoint 2 is credited on the return sweep.
    assert.equal(t.flow.ended, false);
    assert.equal(t.flow.status.get('race-checkpoints')?.value, '2 / 2');
    t.go(16);
    assert.equal(t.flow.result?.outcome, 'victory');
  } finally { t.game.host.stop(); }
});

test(`swept finish uses its fractional tick deadline, with earlier checkpoint credit preserved (${selected.id})`, async () => {
  for (const [limit, expected, checkpoints] of [[1.016, 'victory', '2 / 2'], [1.005, 'defeat', '1 / 2']] as const) {
    const t = await setup(gates, limit, selected);
    try {
      t.game.ticks(60);
      assert.equal(t.flow.ended, false);
      // Entry fractions for start x=3, endpoint=16: first=3.7/13, finish=11.7/13.
      // At 1.016 the finish is in time although the whole tick ends after the limit.
      // At 1.005 only the first checkpoint is reached in time.
      t.go(16);
      assert.equal(t.flow.result?.outcome, expected);
      assert.equal(t.flow.status.get('race-checkpoints')?.value, checkpoints);
      const result = t.flow.result;
      t.game.ticks(60);
      assert.equal(t.flow.result, result, 'the race terminates once');
    } finally { t.game.host.stop(); }
  }
});
}

test('racing controller alone needs no sequence role, while the selected race mode requires a real factory', async () => {
  const metadataOnly = codePlugin('test/sequence-metadata', { register(ctx) {
    ctx.provideRole(SequenceMechanicRole, 'test/sequence-metadata', { name: 'Missing factory', description: 'Role metadata only' });
  } });
  const game = createHeadlessGame([metadataOnly, maps(gates), { manifest, load: () => import('../games/shooter/plugins/example-racing/index.ts') }]);
  try {
    await game.host.apply(headlessPreset({
      plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/racing'],
      roles: { 'sdk/controller': 'example/racing-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'core/objective' },
    }));
    const previous = game.session();
    const player = previous.entities.first(Player)!;
    const before = previous.entities.get(player, Transform)!.z;
    game.input.press('example/racing-gas'); game.ticks(20);
    assert.notEqual(previous.entities.get(player, Transform)!.z, before, 'the independent controller actually drives');
    for (const select of [false, true]) {
      const error = await hostFailure(game.host.apply(headlessPreset({
        plugins: ['core/world', 'core/combat', 'core/player', 'example/racing', 'test/race-map', 'test/sequence-metadata'],
        roles: { 'sdk/controller': 'example/racing-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/race', ...(select ? { 'sdk/mechanic-sequence': 'test/sequence-metadata' } : {}) },
        options: { map: 'test/race' },
      })));
      assert.equal(error.stage, 'validate');
      assert.ok(error.issues.some(issue => issue.path === 'roles.sdk/mechanic-sequence' && issue.message.includes('SequenceProviders')));
      assert.equal(game.session(), previous, 'failed staging preserves the controller-only session');
    }
  } finally { game.host.stop(); }
});
