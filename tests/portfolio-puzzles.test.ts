import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../src/app/catalog.ts';
import { PushPuzzle } from '../src/sdk/index.ts';
import type { PuzzleCommand, PuzzleDirection } from '../src/sdk/index.ts';
import atelierManifest from '../src/plugins/portfolio-atelier-puzzle/manifest.json' with { type: 'json' };
import atelierContent from '../src/plugins/portfolio-atelier-puzzle/content.json' with { type: 'json' };
import watchManifest from '../src/plugins/portfolio-watch-puzzle/manifest.json' with { type: 'json' };
import watchContent from '../src/plugins/portfolio-watch-puzzle/content.json' with { type: 'json' };
import atelierPreset from '../src/content/presets/portfolio-atelier-puzzle.json' with { type: 'json' };
import watchPreset from '../src/content/presets/portfolio-watch-puzzle.json' with { type: 'json' };
import { createHeadlessGame } from './helpers/game.ts';

const directions: Record<string, PuzzleDirection> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const games = [
  { preset: atelierPreset, manifest: atelierManifest, content: atelierContent, routes: ['NNWNENEEEE', 'NWNNEEEESSWNNENNE', 'NNNSSWWNNEEESSENNENNE'] },
  { preset: watchPreset, manifest: watchManifest, content: watchContent, routes: ['NNSEENNEEEEE', 'NENSEEENEESWWNNEEE', 'NEENNEEEESEEEN'] },
];

for (const game of games) test(`${game.preset.name}: every chamber completes through the real command queue`, async () => {
  const entries = catalog.filter(entry => (entry.manifest as { id: string }).id !== game.manifest.id);
  const g = createHeadlessGame([...entries, { manifest: game.manifest, content: game.content }]);
  await g.host.apply(game.preset);
  try {
    const puzzle = () => g.session().services.get(PushPuzzle);
    const send = (command: PuzzleCommand) => { assert.equal(puzzle().enqueue(command), true); g.ticks(1); return puzzle().state(); };
    assert.equal(puzzle().campaign.chambers.length, game.routes.length);
    for (const [index, route] of game.routes.entries()) {
      assert.equal(puzzle().state().chamber, index);
      for (const letter of route) {
        const before = puzzle().state();
        const after = send({ type: 'move', direction: directions[letter]! });
        assert.equal(after.turns, before.turns + 1, `rejected move ${letter} in ${game.preset.name} chamber ${index + 1}`);
        assert.notEqual(after.status, 'caught');
      }
      assert.equal(puzzle().state().status, 'cleared');
      assert.ok(puzzle().state().turns <= puzzle().campaign.chambers[index]!.par);
      if (index + 1 < game.routes.length) send({ type: 'next' });
    }
    const reset = send({ type: 'replay' });
    assert.equal(reset.chamber, 0);
    assert.equal(reset.totalTurns, 0);
    assert.equal(reset.turns, 0);
  } finally { await g.host.stop(); }
});
