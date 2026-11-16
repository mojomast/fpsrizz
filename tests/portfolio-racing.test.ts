import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessGame } from './helpers/game.ts';
import { Race } from '../src/sdk/index.ts';
import racing from '../src/plugins/vehicle-racing/manifest.json' with { type: 'json' };
import presentation from '../src/plugins/vehicle-presentation/manifest.json' with { type: 'json' };
import theme from '../src/plugins/theme-arcade/manifest.json' with { type: 'json' };
import sequence from '../src/plugins/mechanics-sequence/manifest.json' with { type: 'json' };
import outcomeRating from '../src/plugins/mechanics-outcome-rating/manifest.json' with { type: 'json' };
import pack from '../src/plugins/portfolio-racing/manifest.json' with { type: 'json' };
import content from '../src/plugins/portfolio-racing/content.json' with { type: 'json' };
import salt from '../src/content/presets/portfolio-salt-racing.json' with { type: 'json' };
import copper from '../src/content/presets/portfolio-copper-racing.json' with { type: 'json' };

const catalog = [
  { manifest: racing, load: () => import('../src/plugins/vehicle-racing/index.ts') },
  { manifest: presentation, load: () => import('../src/plugins/vehicle-presentation/index.ts') },
  { manifest: theme, load: () => import('../src/plugins/theme-arcade/index.ts') },
  { manifest: sequence, load: () => import('../src/plugins/mechanics-sequence/index.ts') },
  { manifest: outcomeRating, load: () => import('../src/plugins/mechanics-outcome-rating/index.ts') },
  { manifest: pack, content },
];

for (const preset of [salt, copper]) {
  test(`${preset.name}: full preset wins by driving, restarts and times out`, async () => {
    const game = createHeadlessGame(catalog);
    try {
      await game.host.apply(preset);
      const race = game.session().services.get(Race);
      const points = race.track.points;
      let next = 1;
      const key = (action: string, on: boolean): void => {
        if (on) game.input.press(action);
        else game.input.release(action);
      };
      for (let i = 0; i < race.track.timeLimit * 60 && race.status === 'racing'; i++) {
        const point = points[next]!;
        if (Math.hypot(point.x - race.x, point.z - race.z) < 3.8) next = (next + 1) % points.length;
        const target = points[next]!;
        const desired = Math.atan2(-(target.x - race.x), -(target.z - race.z));
        const error = Math.atan2(Math.sin(desired - race.yaw), Math.cos(desired - race.yaw));
        key('vehicle/left', error > 0.09);
        key('vehicle/right', error < -0.09);
        key('vehicle/gas', race.speed < (Math.abs(error) > 0.45 ? 7 : 12));
        key('vehicle/brake', race.speed > (Math.abs(error) > 0.45 ? 9 : 14));
        game.ticks(1);
      }
      assert.equal(race.status, 'won', `gate ${race.nextGate}, lap ${race.lap}, position ${race.x},${race.z}, time ${race.elapsed}`);
      assert.equal(race.revision, race.track.gates.length * race.track.laps);
      assert.equal(race.nextGate, race.track.gates.length);
      assert.ok(race.elapsed <= race.track.timeLimit);
      await game.host.restart();
      const restarted = game.session().services.get(Race);
      assert.equal(restarted.status, 'racing');
      assert.equal(restarted.nextGate, 0);
      assert.equal(restarted.elapsed, 0);
      for (const action of ['vehicle/left', 'vehicle/right', 'vehicle/gas', 'vehicle/brake']) game.input.release(action);
      game.ticks(Math.ceil(restarted.track.timeLimit * 60) + 1);
      assert.equal(restarted.status, 'lost');
    } finally {
      await game.host.stop();
    }
  });
}

test('drift turns more sharply but retains more sideways motion', async () => {
  const normal = createHeadlessGame(catalog);
  const drift = createHeadlessGame(catalog);
  try {
    await normal.host.apply(salt);
    await drift.host.apply(salt);
    for (const game of [normal, drift]) {
      game.input.press('vehicle/gas');
      game.ticks(55);
      game.input.press('vehicle/left');
    }
    drift.input.press('vehicle/drift');
    normal.ticks(20);
    drift.ticks(20);
    const a = normal.session().services.get(Race);
    const b = drift.session().services.get(Race);
    const sideways = (r: typeof a): number => Math.abs(r.vx * -Math.cos(r.yaw) - r.vz * -Math.sin(r.yaw));
    assert.ok(b.drifting);
    assert.ok(b.yaw > a.yaw);
    assert.ok(sideways(b) > sideways(a));
  } finally {
    await normal.host.stop();
    await drift.host.stop();
  }
});

test('fractional deadline stops simulation on the first tick at or beyond the limit', async () => {
  const shortContent = content.map(entry => entry.id === 'portfolio/salt-flats'
    ? { ...entry, data: { ...entry.data, timeLimit: 5.005 } }
    : entry);
  const game = createHeadlessGame(catalog.map(entry => entry.manifest.id === pack.id ? { manifest: pack, content: shortContent } : entry));
  try {
    await game.host.apply(salt);
    game.input.press('vehicle/gas');
    game.ticks(400);
    const race = game.session().services.get(Race);
    assert.equal(race.status, 'lost');
    assert.ok(race.elapsed >= 5.005 && race.elapsed < 5.005 + 1 / 60);
    const position = [race.x, race.z];
    game.ticks(20);
    assert.deepEqual([race.x, race.z], position);
  } finally {
    await game.host.stop();
  }
});
