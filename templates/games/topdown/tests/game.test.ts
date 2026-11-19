import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRun } from '../../../../tests/helpers/replay.ts';
import { Game } from '../plugins/game/index.ts';
import preset from '../presets/default.json' with { type: 'json' };

const spec = { preset, plugins: ['packages/std/plugins/std-transform', 'packages/std/plugins/std-render-sync', 'packages/std/plugins/std-physics-rapier', fileURLToPath(new URL('../plugins/game', import.meta.url))] };

test('__TITLE__: walking right collects the first gem; a hazard costs a life', async () => {
  const run = await startRun(spec);
  const s = run.session.services.get(Game);
  run.input.press('__NS__/right'); run.ticks(40); run.input.release('__NS__/right');
  assert.equal(s.collected, 1);
  // Stand in the first hazard's lane (z = -8) until it sweeps through.
  run.input.press('__NS__/forward'); run.ticks(80); run.input.release('__NS__/forward');
  run.ticks(400);
  assert.ok(s.lives < 3, `a hazard hit (${s.lives} lives)`);
  run.stop();
});
