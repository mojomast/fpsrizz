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
