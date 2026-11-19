import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRun } from '../../../../tests/helpers/replay.ts';
import { Transform3D } from '@bulkhead/sdk';
import { Game } from '../plugins/game/index.ts';
import preset from '../presets/default.json' with { type: 'json' };

const spec = { preset, plugins: ['packages/std/plugins/std-transform', 'packages/std/plugins/std-render-sync', 'packages/std/plugins/std-physics-rapier', fileURLToPath(new URL('../plugins/game', import.meta.url))] };

test('__TITLE__: firing straight ahead hits the first target; mouse look turns; forward walks the view direction', async () => {
  const run = await startRun(spec);
  const s = run.session.services.get(Game);
  run.ticks(20);
  run.input.pressKey('Mouse0', ['__NS__/fire']); run.ticks(1); run.input.releaseKey('Mouse0'); run.ticks(1);
  assert.equal(s.hits, 1, 'hit the target in front of the spawn');
  assert.equal(s.shots, 1);
  run.input.addLook(-400, 0); run.ticks(1); // look left by ~1 rad at the default sensitivity
  assert.ok(s.yaw > 0.5, `turned left (${s.yaw.toFixed(2)})`);
  const before = { ...run.session.entities.get(s.player, Transform3D)!.position };
  run.input.press('__NS__/forward'); run.ticks(30); run.input.release('__NS__/forward');
  const after = run.session.entities.get(s.player, Transform3D)!.position;
  assert.ok(after.x < before.x - 1, `walked towards -X after turning left (${before.x.toFixed(2)} -> ${after.x.toFixed(2)})`);
  run.stop();
});
