import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startRun } from '../../../../tests/helpers/replay.ts';
import { Game } from '../plugins/game/index.ts';
import preset from '../presets/default.json' with { type: 'json' };

const spec = { preset, plugins: [fileURLToPath(new URL('../plugins/game', import.meta.url))] };

test('__TITLE__: a mismatch flips back after a moment; flipping every pair wins', async () => {
  const run = await startRun(spec);
  const s = run.session.services.get(Game);
  const a = 0, b = s.cards.findIndex((c, i) => i > 0 && c.face !== s.cards[0]!.face);
  s.flip(a); s.flip(b); run.ticks(1);
  assert.ok(s.cards[a]!.up && s.cards[b]!.up && s.moves === 1);
  run.ticks(60);
  assert.ok(!s.cards[a]!.up && !s.cards[b]!.up, 'mismatched cards are hidden again');
  for (let face = 0; face < 8; face++) {
    const [x, y] = s.cards.flatMap((c, i) => (c.face === face ? [i] : []));
    s.flip(x!); s.flip(y!); run.ticks(1);
  }
  assert.equal(s.won, true);
  assert.equal(s.moves, 9);
  run.stop();
});
