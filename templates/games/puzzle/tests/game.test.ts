import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRun } from '../../../../tests/helpers/replay.ts';
import { Game } from '../plugins/game/index.ts';
import preset from '../presets/default.json' with { type: 'json' };

const spec = { preset, plugins: [fileURLToPath(new URL('../plugins/game', import.meta.url))] };

test('__TITLE__: the seeded shuffle is solvable by undoing it, and illegal clicks are ignored', async () => {
  const run = await startRun(spec);
  const s = run.session.services.get(Game);
  assert.ok(!s.won && s.shuffle.length > 0);
  const before = [...s.tiles];
  const far = s.tiles.findIndex((_, i) => Math.abs((i % 3) - (s.tiles.indexOf(0) % 3)) + Math.abs(Math.floor(i / 3) - Math.floor(s.tiles.indexOf(0) / 3)) > 1);
  s.click(far); run.ticks(1);
  assert.deepEqual(s.tiles, before, 'a tile not next to the gap does not move');
  // Each shuffle step moved the gap away from position p; clicking p (newest first) moves it back.
  for (const p of [...s.shuffle].reverse()) { s.click(p); run.ticks(1); }
  assert.equal(s.won, true);
  assert.deepEqual(s.tiles, [1, 2, 3, 4, 5, 6, 7, 8, 0]);
  run.stop();
});
