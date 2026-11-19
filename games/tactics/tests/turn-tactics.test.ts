import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExperienceRole, SessionControl, definePlugin } from '@bulkhead/sdk';
import { Tactics, TacticsResolved } from '../contracts/tactics.ts';
import manifest from '../plugins/board-tactics/manifest.json' with { type: 'json' };
import pack from '../plugins/board-mission/manifest.json' with { type: 'json' };
import content from '../plugins/board-mission/content.json' with { type: 'json' };
import navigationManifest from '@bulkhead/std/mechanics-navigation/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';

function gameFor(entries: unknown[] = content) {
  const game = createHeadlessGame([
    { manifest: navigationManifest, load: () => import('@bulkhead/std/mechanics-navigation/index.ts') },
    { manifest, load: () => import('../plugins/board-tactics/index.ts') },
    { manifest: pack, content: entries as typeof content },
  ]);
  const preset = headlessPreset({
    plugins: ['board/tactics', 'board/mission', 'mechanics/navigation'],
    roles: { 'sdk/experience': 'board/tactics', 'sdk/mechanic-navigation': 'mechanics/navigation' },
    options: { mission: 'board/signal-break' },
  });
  return { game, preset };
}
function scenario(squadHp: number, enemyHp: number) {
  return [
    {
      kind: 'board-mission',
      id: 'board/signal-break',
      data: {
        name: 'Test',
        rows: ['.....', '.....', '.....'],
        units: [
          {
            id: 'a',
            name: 'Alpha',
            team: 'squad',
            x: 0,
            y: 1,
            hp: squadHp,
            ap: 2,
          },
          {
            id: 'b',
            name: 'Bravo',
            team: 'enemy',
            x: 3,
            y: 1,
            hp: enemyHp,
            ap: 2,
          },
        ],
      },
    },
  ];
}
test('waiting and rejected commands do not spend AP; queued commands are ordered and IDs resolve once', async () => {
  const { game, preset } = gameFor();
  await game.host.apply(preset);
  const tactics = game.session().services.get(Tactics);
  const snapshot = JSON.stringify(tactics.state);
  game.ticks(1800);
  assert.equal(JSON.stringify(tactics.state), snapshot);
  assert.equal(tactics.enqueue({ id: 'bad', type: 'move', unit: 'raven', x: 6, y: 1 }), true);
  game.ticks(1);
  assert.equal(tactics.state.units[0]!.ap, 2);
  assert.equal(tactics.enqueue({ id: 'one', type: 'move', unit: 'raven', x: 1, y: 4 }), true);
  assert.equal(tactics.enqueue({ id: 'one', type: 'move', unit: 'raven', x: 1, y: 3 }), false);
  assert.equal(tactics.enqueue({ id: 'two', type: 'move', unit: 'raven', x: 1, y: 3 }), true);
  game.ticks(1);
  assert.equal(tactics.state.units[0]!.y, 3);
  assert.equal(tactics.state.units[0]!.ap, 0);
  game.ticks(10);
  assert.equal(tactics.state.units[0]!.ap, 0);
  await game.host.stop();
});
test('cover forecast agrees with damage and blocked attacks cost nothing', async () => {
  const { game, preset } = gameFor();
  await game.host.apply(preset);
  const t = game.session().services.get(Tactics);
  const ap = t.state.units.find((u) => u.id === 'raven')!.ap;
  const f = t.forecast('raven', 'guard');
  assert.equal(f.legal, false);
  t.enqueue({ id: 'blocked', type: 'attack', unit: 'raven', target: 'guard' });
  game.ticks(1);
  assert.equal(t.state.units.find((u) => u.id === 'raven')!.ap, ap);
  await game.host.stop();
});
test('enemy turn is deterministic, defeat is terminal, and restart restores mission', async () => {
  const run = async () => {
    const { game, preset } = gameFor(scenario(1, 20));
    await game.host.apply(preset);
    const t = game.session().services.get(Tactics);
    t.enqueue({ id: 'end', type: 'end-turn' });
    game.ticks(1);
    assert.equal(t.state.outcome, 'defeat');
    const snap = JSON.stringify(t.state.units);
    assert.equal(t.enqueue({ id: 'late', type: 'end-turn' }), false);
    await game.host.restart();
    assert.equal(game.session().services.get(Tactics).state.outcome, 'playing');
    await game.host.stop();
    return snap;
  };
  assert.equal(await run(), await run());
});
test('winning attack resolves once and victory is terminal', async () => {
  const { game, preset } = gameFor(scenario(6, 2));
  await game.host.apply(preset);
  const t = game.session().services.get(Tactics);
  assert.equal(t.forecast('a', 'b').damage, 2);
  t.enqueue({ id: 'fire', type: 'attack', unit: 'a', target: 'b' });
  game.ticks(1);
  assert.equal(t.state.outcome, 'victory');
  assert.equal(t.state.units[1]!.hp, 0);
  assert.equal(t.state.units[0]!.ap, 1);
  assert.equal(t.enqueue({ id: 'fire', type: 'attack', unit: 'a', target: 'b' }), false);
  await game.host.stop();
});
test('cover reduces forecast and committed damage consistently', async () => {
  const entries = scenario(6, 4);
  entries[0]!.data.rows = ['.....', '...C.', '.....'];
  const { game, preset } = gameFor(entries);
  await game.host.apply(preset);
  const t = game.session().services.get(Tactics);
  assert.equal(t.forecast('a', 'b').cover, true);
  assert.equal(t.forecast('a', 'b').damage, 1);
  t.enqueue({ id: 'covered', type: 'attack', unit: 'a', target: 'b' });
  game.ticks(1);
  assert.equal(t.state.units[1]!.hp, 3);
  assert.equal(t.state.units[0]!.ap, 1);
  await game.host.stop();
});
test('authored mission is completable using legal player commands', async () => {
  const { game, preset } = gameFor();
  await game.host.apply(preset);
  const t = game.session().services.get(Tactics);
  const run = (c: Parameters<typeof t.enqueue>[0]) => {
    assert.equal(t.enqueue(c), true);
    game.ticks(1);
  };
  run({ id: '1', type: 'move', unit: 'raven', x: 2, y: 3 });
  run({ id: '2', type: 'attack', unit: 'raven', target: 'guard' });
  run({ id: '3', type: 'move', unit: 'rook', x: 3, y: 4 });
  run({ id: '4', type: 'attack', unit: 'rook', target: 'guard' });
  assert.equal(t.state.units.find((u) => u.id === 'guard')!.hp, 0);
  run({ id: '5', type: 'end-turn' });
  run({ id: '6', type: 'attack', unit: 'raven', target: 'sentry' });
  run({ id: '7', type: 'attack', unit: 'raven', target: 'sentry' });
  assert.equal(t.state.outcome, 'victory');
  await game.host.stop();
});
test('service rejects paused, malformed and over-capacity ingress without spending AP', async () => {
  const { game, preset } = gameFor();
  await game.host.apply(preset);
  const session = game.session();
  const t = session.services.get(Tactics);
  let playing = false;
  session.services.provide(
    SessionControl,
    {
      get playing() {
        return playing;
      },
    },
    'test',
    session.scope,
  );
  const snapshot = JSON.stringify(t.state);
  assert.equal(t.enqueue({ id: 'paused', type: 'end-turn' }), false);
  game.ticks(1);
  assert.equal(JSON.stringify(t.state), snapshot);
  playing = true;
  for (const bad of [
    null,
    {},
    { id: '', type: 'end-turn' },
    { id: 'x', type: 'move', unit: 'raven', x: NaN, y: 1 },
    { id: 'x', type: 'attack', unit: 'raven' },
    { id: 'x', type: 'unknown' },
  ])
    assert.equal(t.enqueue(bad as never), false);
  for (let i = 0; i < 128; i++)
    assert.equal(
      t.enqueue({
        id: `invalid-${i}`,
        type: 'move',
        unit: 'raven',
        x: 100,
        y: 100,
      }),
      true,
    );
  assert.equal(t.enqueue({ id: 'overflow', type: 'end-turn' }), false);
  game.ticks(1);
  assert.equal(t.state.turn, 1);
  assert.equal(t.state.units[0]!.ap, 2);
  for (let batch = 1; batch < 32; batch++) {
    for (let i = 0; i < 128; i++)
      assert.equal(t.enqueue({ id: `invalid-${batch * 128 + i}`, type: 'move', unit: 'raven', x: 100, y: 100 }), true);
    game.ticks(1);
  }
  assert.equal(t.enqueue({ id: 'history-overflow', type: 'end-turn' }), false);
  assert.equal(t.state.turn, 1);
  assert.equal(t.state.units[0]!.ap, 2);
  await game.host.stop();
});
test('only committed actions emit gameplay sound cues', async () => {
  const { game, preset } = gameFor();
  await game.host.apply(preset);
  const session = game.session();
  const t = session.services.get(Tactics);
  const cues: string[] = [];
  session.events.on(TacticsResolved, (e) => cues.push(e.cue), 'test', session.scope);
  t.enqueue({ id: 'bad', type: 'attack', unit: 'raven', target: 'guard' });
  game.ticks(1);
  assert.deepEqual(cues, []);
  t.enqueue({ id: 'move', type: 'move', unit: 'raven', x: 2, y: 3 });
  game.ticks(1);
  assert.deepEqual(cues, ['tactics-move']);
  t.enqueue({ id: 'fire', type: 'attack', unit: 'raven', target: 'guard' });
  game.ticks(1);
  assert.deepEqual(cues, ['tactics-move', 'tactics-attack']);
  await game.host.stop();
});
test('staging rejects a missing or incompatible experience and mixed families', async () => {
  const otherManifest = { ...manifest, id: 'story/other', requiresRoles: [] };
  const other = definePlugin({
    register(ctx) {
      ctx.provideRole(ExperienceRole, 'story/other', { name: 'Other', description: 'Other family', pointer: 'free' });
    },
  });
  const game = createHeadlessGame([
    { manifest: navigationManifest, load: () => import('@bulkhead/std/mechanics-navigation/index.ts') },
    { manifest, load: () => import('../plugins/board-tactics/index.ts') },
    { manifest: pack, content },
    { manifest: otherManifest, load: async () => ({ default: other }) },
  ]);
  const preset = headlessPreset({
    plugins: ['board/tactics', 'board/mission', 'mechanics/navigation'],
    roles: { 'sdk/experience': 'board/tactics', 'sdk/mechanic-navigation': 'mechanics/navigation' },
    options: { mission: 'board/signal-break' },
  });
  await assert.rejects(game.host.apply({ ...preset, roles: {} }));
  await assert.rejects(
    game.host.apply({
      ...preset,
      plugins: ['board/tactics', 'board/mission', 'mechanics/navigation', 'story/other'],
      roles: { 'sdk/experience': 'story/other', 'sdk/mechanic-navigation': 'mechanics/navigation' },
    }),
    /select board\/tactics/,
  );
  await assert.rejects(
    game.host.apply({ ...preset, plugins: ['board/tactics', 'board/mission', 'mechanics/navigation', 'story/other'] }),
    /cannot be combined with other game families/,
  );
  await game.host.stop();
});
