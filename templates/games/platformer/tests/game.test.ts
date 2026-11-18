import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRun } from '../../../../tests/helpers/replay.ts';
import { Transform3D } from '../../../../src/sdk/index.ts';
import { Game } from '../plugins/game/index.ts';
import preset from '../presets/default.json' with { type: 'json' };

const spec = { preset, plugins: ['src/plugins/std-transform', 'src/plugins/std-render-sync', 'src/plugins/std-physics-rapier', fileURLToPath(new URL('../plugins/game', import.meta.url))] };

test('__TITLE__: run right to the first coin, jump, and fall back to the start', async () => {
  const run = await startRun(spec);
  const s = run.session.services.get(Game);
  const pos = () => run.session.entities.get(s.hero, Transform3D)!.position;
  run.ticks(30); // land
  run.input.press('__NS__/right'); run.ticks(45);
  assert.ok(pos().x > 3.5, `ran right (${pos().x.toFixed(2)})`);
  assert.equal(s.collected, 1, 'picked up the coin at x = 4');
  run.input.press('__NS__/jump'); run.ticks(8); run.input.release('__NS__/jump');
  assert.ok(pos().y > 1.5, `jumped (${pos().y.toFixed(2)})`);
  run.input.release('__NS__/right');
  run.input.press('__NS__/left'); run.ticks(200);
  assert.ok(s.falls >= 1, 'ran off the left edge and respawned');
  run.stop();
});
