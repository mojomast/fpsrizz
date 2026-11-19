import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, OutcomeRatingProviders, outcomeRatingMechanic } from '../src/sdk/index.ts';
import { Tactics } from '../games/tactics/contracts/tactics.ts';
import { Race } from '../games/racing/contracts/racing.ts';
import type { OutcomeRating, SessionContext } from '../src/sdk/index.ts';
import ratingManifest from '../src/plugins/mechanics-outcome-rating/manifest.json' with { type: 'json' };
import sequenceManifest from '../src/plugins/mechanics-sequence/manifest.json' with { type: 'json' };
import navigationManifest from '../src/plugins/mechanics-navigation/manifest.json' with { type: 'json' };
import racingManifest from '../games/racing/plugins/vehicle-racing/manifest.json' with { type: 'json' };
import trackManifest from '../games/racing/plugins/vehicle-track/manifest.json' with { type: 'json' };
import track from '../games/racing/plugins/vehicle-track/content.json' with { type: 'json' };
import tacticsManifest from '../games/tactics/plugins/board-tactics/manifest.json' with { type: 'json' };
import missionManifest from '../games/tactics/plugins/board-mission/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin } from './helpers/host.ts';

const ratingEntry = { manifest: ratingManifest, load: () => import('../src/plugins/mechanics-outcome-rating/index.ts') };
const definition = () => ({ tiers: [
  { id: 'bronze', conditions: [{ metric: 'time', operator: 'at-most' as const, value: 10 }] },
  { id: 'gold', conditions: [{ metric: 'time', operator: 'at-most' as const, value: 5 }, { metric: 'survivors', operator: 'at-least' as const, value: 2 }] },
] });

test('rating conformance: immutable definitions, finite metrics, precedence and dual-scope ownership', async () => {
  const owners: SessionContext[] = [], handles: OutcomeRating[] = [];
  let provider: SessionContext | undefined;
  const consumers = ['aaa/ratings', 'bbb/ratings'].map(id => codePlugin(id, { activate(ctx) {
    owners.push(ctx);
    ctx.instantiate(OutcomeRatingProviders, 'mechanics/outcome-rating', (factory, owner) => { provider = owner; return factory.start(owner); });
    handles.push(outcomeRatingMechanic(ctx).create(ctx, 'same', definition()));
  } }, { roleDependencies: ['sdk/mechanic-outcome-rating'] }));
  const game = createHeadlessGame([ratingEntry, ...consumers]);
  await game.host.apply(headlessPreset({ plugins: ['mechanics/outcome-rating', 'aaa/ratings', 'bbb/ratings'], roles: { 'sdk/mechanic-outcome-rating': 'mechanics/outcome-rating' }, options: {} }));
  try {
    const factory = outcomeRatingMechanic(owners[0]!);
    const input = definition(), rating = factory.create(owners[0]!, 'detached', input);
    input.tiers[0]!.conditions[0]!.value = 0;
    assert.equal(rating.evaluate({ time: 5, survivors: 2 }), 'gold');
    assert.equal(rating.evaluate({ time: 5, survivors: 1 }), 'bronze');
    assert.equal(rating.evaluate({ time: 11, survivors: 2 }), undefined);
    assert.ok(Object.isFrozen(rating.definition.tiers[0]!.conditions[0]));
    for (const metrics of [{ time: 1 }, { time: NaN, survivors: 2 }, { time: 2, survivors: Infinity }]) assert.throws(() => rating.evaluate(metrics as Record<string, number>));
    assert.throws(() => factory.create(owners[0]!, 'bad', { tiers: [] }));
    assert.throws(() => factory.create(owners[0]!, 'bad', { tiers: [{ id: 'x', conditions: [{ metric: 'a', operator: 'at-most', value: NaN }] }] }));
    factory.create(owners[0]!, 'bad', definition()).dispose();
    assert.throws(() => factory.create(owners[0]!, 'same', definition()), /Duplicate/);
    handles[0]!.dispose();
    const replacement = factory.create(owners[0]!, 'same', definition());
    assert.throws(() => handles[0]!.evaluate({ time: 1, survivors: 2 }));
    owners[0]!.scope.dispose();
    assert.equal(replacement.active, false);
    assert.equal(handles[1]!.active, true);
    provider!.scope.dispose();
    assert.equal(handles[1]!.active, false);
  } finally { await game.host.stop(); }
});

test('tactics victory uses the selected evaluator to report a medal', async () => {
  const mission = [{ kind: 'board-mission', id: 'board/test', data: { name: 'Test', rows: ['.....', '.....'], units: [
    { id: 'a', name: 'A', team: 'squad', x: 0, y: 0, hp: 6, ap: 2 },
    { id: 'b', name: 'B', team: 'enemy', x: 3, y: 0, hp: 2, ap: 2 },
  ] } }];
  const game = createHeadlessGame([ratingEntry, { manifest: navigationManifest, load: () => import('../src/plugins/mechanics-navigation/index.ts') },
    { manifest: tacticsManifest, load: () => import('../games/tactics/plugins/board-tactics/index.ts') }, { manifest: missionManifest, content: mission }]);
  await game.host.apply(headlessPreset({ plugins: ['mechanics/outcome-rating', 'mechanics/navigation', 'board/tactics', 'board/mission'], roles: { 'sdk/experience': 'board/tactics', 'sdk/mechanic-navigation': 'mechanics/navigation', 'sdk/mechanic-outcome-rating': 'mechanics/outcome-rating' }, options: { mission: 'board/test' } }));
  try {
    game.session().services.get(Tactics).enqueue({ id: 'shot', type: 'attack', unit: 'a', target: 'b' });
    game.ticks(1);
    assert.deepEqual(game.session().services.get(Flow).result?.stats, [['Turns', '1'], ['Medal', 'Gold']]);
  } finally { await game.host.stop(); }
});

test('racing victory rates the actual elapsed time', async () => {
  const game = createHeadlessGame([ratingEntry, { manifest: sequenceManifest, load: () => import('../src/plugins/mechanics-sequence/index.ts') },
    { manifest: racingManifest, load: () => import('../games/racing/plugins/vehicle-racing/index.ts') }, { manifest: trackManifest, content: track }]);
  await game.host.apply(headlessPreset({ plugins: ['mechanics/outcome-rating', 'mechanics/sequence', 'vehicle/racing', 'vehicle/track'], roles: { 'sdk/experience': 'vehicle/arcade-race', 'sdk/mechanic-sequence': 'mechanics/sequence', 'sdk/mechanic-outcome-rating': 'mechanics/outcome-rating' }, options: { track: 'vehicle/neon-circuit' } }));
  try {
    const race = game.session().services.get(Race), points = race.track.points;
    let next = 1;
    const key = (action: string, on: boolean) => on ? game.input.press(action) : game.input.release(action);
    for (let i = 0; i < 8500 && race.status === 'racing'; i++) {
      const point = points[next]!;
      if (Math.hypot(point.x - race.x, point.z - race.z) < 3.8) next = (next + 1) % points.length;
      const target = points[next]!, desired = Math.atan2(-(target.x - race.x), -(target.z - race.z));
      const error = Math.atan2(Math.sin(desired - race.yaw), Math.cos(desired - race.yaw));
      key('vehicle/left', error > 0.09); key('vehicle/right', error < -0.09);
      key('vehicle/gas', race.speed < (Math.abs(error) > 0.45 ? 7 : 12));
      key('vehicle/brake', race.speed > (Math.abs(error) > 0.45 ? 9 : 14));
      game.ticks(1);
    }
    assert.equal(race.status, 'won');
    const expected = race.elapsed <= race.track.timeLimit * 0.5 ? 'Gold' : race.elapsed <= race.track.timeLimit * 0.75 ? 'Silver' : 'Bronze';
    assert.deepEqual(game.session().services.get(Flow).result?.stats?.[1], ['Medal', expected]);
  } finally { await game.host.stop(); }
});
