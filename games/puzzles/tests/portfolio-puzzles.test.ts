import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../../../src/app/catalog.ts';
import { PushPuzzle } from '../contracts/puzzle.ts';
import type { PuzzleCommand, PuzzleDirection } from '../contracts/puzzle.ts';
import atelierManifest from '../plugins/portfolio-atelier-puzzle/manifest.json' with { type: 'json' };
import atelierContent from '../plugins/portfolio-atelier-puzzle/content.json' with { type: 'json' };
import watchManifest from '../plugins/portfolio-watch-puzzle/manifest.json' with { type: 'json' };
import watchContent from '../plugins/portfolio-watch-puzzle/content.json' with { type: 'json' };
import atelierPreset from '../presets/portfolio-atelier-puzzle.json' with { type: 'json' };
import watchPreset from '../presets/portfolio-watch-puzzle.json' with { type: 'json' };
import { createHeadlessGame } from '../../../tests/helpers/game.ts';

const directions: Record<string, PuzzleDirection> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const games = [
  { preset: atelierPreset, manifest: atelierManifest, content: atelierContent, routes: ['NNWNENEEEE', 'NWNNEEEESSWNNENNE', 'NNNSSWWNNEEESSENNENNE', 'WSEEEWNNWNEEENNEEE'] },
  { preset: watchPreset, manifest: watchManifest, content: watchContent, routes: ['NNSEENNEEEEE', 'NENSEEENEESWWNNEEE', 'NEENNEEEESEEEN', 'NNSSWSEEEENNEENNNE'] },
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
      const board = () => {
        const { player, rocks, golems, turns, pushes, status, chamber, totalTurns, canUndo } = puzzle().state();
        return { player, rocks, golems, turns, pushes, status, chamber, totalTurns, canUndo };
      };
      const initial = board();
      send({ type: 'move', direction: directions[route[0]!]! });
      send({ type: 'restart' });
      assert.deepEqual(board(), initial, `restart chamber ${index + 1}`);
      for (const [step, letter] of [...route].entries()) {
        const before = puzzle().state();
        const beforeBoard = board();
        const after = send({ type: 'move', direction: directions[letter]! });
        assert.equal(after.turns, before.turns + 1, `rejected move ${letter} in ${game.preset.name} chamber ${index + 1}`);
        assert.notEqual(after.status, 'caught');
        if (step === Math.floor(route.length / 2) || step === route.length - 1) {
          const completedBoard = board();
          send({ type: 'undo' });
          assert.deepEqual(board(), beforeBoard, `undo chamber ${index + 1} step ${step + 1}`);
          send({ type: 'move', direction: directions[letter]! });
          assert.deepEqual(board(), completedBoard, `redo chamber ${index + 1} step ${step + 1}`);
        }
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
