import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRun } from '../../../../tests/helpers/replay.ts';
import { Game } from '../plugins/game/index.ts';
import preset from '../presets/default.json' with { type: 'json' };

const spec = { preset, plugins: ['packages/std/plugins/std-transform', 'packages/std/plugins/std-render-sync', fileURLToPath(new URL('../plugins/game', import.meta.url))] };

test('__TITLE__: the cube spins and the run snapshots', async () => {
  const run = await startRun(spec);
  run.ticks(400);
  assert.ok(run.session.services.get(Game).spins >= 1);
  assert.equal(run.snapshot().format, 'fpsrizz-snapshot');
  run.stop();
});
