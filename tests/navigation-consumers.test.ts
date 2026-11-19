import assert from 'node:assert/strict';
import test from 'node:test';
import { NavigationRole } from '@bulkhead/sdk';
import { PushPuzzle } from '../games/puzzles/contracts/puzzle.ts';
import { Tactics, TacticsResolved } from '../games/tactics/contracts/tactics.ts';
import type { CatalogEntry } from '@bulkhead/sdk';
import type { PuzzleCommand } from '../games/puzzles/contracts/puzzle.ts';
import type { TacticsCommand, TacticsUnit } from '../games/tactics/contracts/tactics.ts';
import navigationManifest from '@bulkhead/std/mechanics-navigation/manifest.json' with { type: 'json' };
import puzzleManifest from '../games/puzzles/plugins/puzzle-rules/manifest.json' with { type: 'json' };
import tacticsManifest from '../games/tactics/plugins/board-tactics/manifest.json' with { type: 'json' };
import tacticsContent from '../games/tactics/plugins/board-mission/content.json' with { type: 'json' };
import puzzleContent from '../games/puzzles/plugins/puzzle-chambers/content.json' with { type: 'json' };
import { gateOpen } from '../games/puzzles/plugins/puzzle-rules/rules.ts';
import { alternateNavigation, alternateNavigationId } from './helpers/alternate-navigation.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const implementations: { id: string; entry: CatalogEntry }[] = [
  { id: navigationManifest.id, entry: { manifest: navigationManifest, load: () => import('@bulkhead/std/mechanics-navigation/index.ts') } },
  { id: alternateNavigationId, entry: alternateNavigation },
];

const unit = (id: string, team: 'squad' | 'enemy', x: number, y: number, hp = 10): TacticsUnit => ({
  id, name: id, team, x, y, hp, ap: 2,
});

for (const implementation of implementations) {
  function assertSubstitution(game: ReturnType<typeof createHeadlessGame>) {
    if (implementation.id === navigationManifest.id) return;
    assert.equal(game.host.catalogStatus().some(entry => entry.id === navigationManifest.id), false, 'default provider absent from catalog');
    assert.equal(game.session().order.includes(navigationManifest.id), false, 'default provider absent from active graph');
  }

  async function puzzleGame(rows?: string[]) {
    const game = createHeadlessGame([
      implementation.entry,
      { manifest: puzzleManifest, load: () => import('../games/puzzles/plugins/puzzle-rules/index.ts') },
      { manifest: { schema: 1, id: 'test/puzzle-content', name: 'Puzzle content', version: '1.0.0', kind: 'content', sdk: '^2.0.0',
        dependencies: { 'puzzle/rules': '^1.0.0' } },
        content: rows ? [{ kind: 'push-puzzle', id: 'test/navigation-chamber', data: {
          name: 'Navigation cases', chambers: [{ name: 'Navigation chamber', hint: 'Wait and inspect pursuit.', par: 30, rows }],
        } }] : puzzleContent },
    ]);
    await game.host.apply(headlessPreset({
      plugins: [implementation.id, 'puzzle/rules', 'test/puzzle-content'],
      roles: { 'sdk/experience': 'puzzle/stonewake', [NavigationRole.id]: implementation.id },
      options: { campaign: rows ? 'test/navigation-chamber' : 'puzzle/sleeping-ruins' },
    }));
    assertSubstitution(game);
    const puzzle = () => game.session().services.get(PushPuzzle);
    const send = (command: PuzzleCommand) => {
      assert.equal(puzzle().enqueue(command), true);
      game.ticks(1);
      assert.equal(game.session().state, 'running');
      return puzzle().state();
    };
    return { ...game, puzzle, send };
  }

  async function tacticsGame(rows?: string[], units?: TacticsUnit[]) {
    const game = createHeadlessGame([
      implementation.entry,
      { manifest: tacticsManifest, load: () => import('../games/tactics/plugins/board-tactics/index.ts') },
      { manifest: { schema: 1, id: 'test/tactics-content', name: 'Tactics content', version: '1.0.0', kind: 'content', sdk: '^2.0.0',
        dependencies: { 'board/tactics': '^1.0.0' } },
        content: rows ? [{ kind: 'board-mission', id: 'test/navigation-mission', data: { name: 'Navigation mission', rows,
          units: units!.map(u => ({ ...u })) } }] : tacticsContent },
    ]);
    await game.host.apply(headlessPreset({
      plugins: [implementation.id, 'board/tactics', 'test/tactics-content'],
      roles: { 'sdk/experience': 'board/tactics', [NavigationRole.id]: implementation.id },
      options: { mission: rows ? 'test/navigation-mission' : 'board/signal-break' },
    }));
    assertSubstitution(game);
    const tactics = () => game.session().services.get(Tactics);
    const send = (command: TacticsCommand) => {
      assert.equal(tactics().enqueue(command), true);
      game.ticks(1);
      assert.equal(game.session().state, 'running');
    };
    return { ...game, tactics, send };
  }

  test(`${implementation.id}: Stonewake equal routes choose north and rejected moves preserve the pursuit beat`, async () => {
    const g = await puzzleGame(['#######', '#P....#', '#.....#', '#..G..#', '#.....#', '#BO..E#', '#######']);
    try {
      const initial = g.puzzle().state();
      const one = g.send({ type: 'wait' });
      assert.equal(one.turns, 1);
      assert.deepEqual(one.golems, [{ x: 3, y: 3 }]);
      const rejected = g.send({ type: 'move', direction: 'north' });
      assert.equal(rejected.turns, 1);
      assert.deepEqual(rejected.golems, one.golems);
      assert.match(rejected.message, /Stone wall/);
      assert.deepEqual(g.send({ type: 'wait' }).golems, [{ x: 3, y: 2 }]);
      g.send({ type: 'wait' });
      assert.deepEqual(g.send({ type: 'wait' }).golems, [{ x: 3, y: 1 }]);
      g.send({ type: 'wait' });
      assert.deepEqual(g.send({ type: 'wait' }).golems, [{ x: 2, y: 1 }]);
      const beforeCapture = g.send({ type: 'wait' });
      const caught = g.send({ type: 'wait' });
      assert.equal(caught.status, 'caught');
      assert.equal(caught.turns, 8);
      assert.deepEqual(caught.golems, [{ x: 1, y: 1 }]);
      const undone = g.send({ type: 'undo' });
      assert.equal(undone.status, 'playing');
      assert.equal(undone.turns, beforeCapture.turns);
      assert.deepEqual(undone.golems, beforeCapture.golems);
      await g.host.restart();
      assert.deepEqual(g.puzzle().state(), initial);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: Stonewake later golems query occupancy after earlier golems move`, async () => {
    const g = await puzzleGame(['#######', '#P....#', '#..G..#', '#..G..#', '#BO..E#', '#######']);
    try {
      g.send({ type: 'wait' });
      const state = g.send({ type: 'wait' });
      // The first golem vacates (3,2). The second now goes north into it; a stale graph goes west instead.
      assert.deepEqual(state.golems, [{ x: 3, y: 1 }, { x: 3, y: 2 }]);
      assert.equal(state.status, 'playing');
      assert.equal(state.turns, 2);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: Stonewake forbids an open exit to golems and boulders block routes`, async () => {
    const g = await puzzleGame(['#######', '#PBO###', '#...#G#', '#...E.#', '#######']);
    try {
      const opened = g.send({ type: 'move', direction: 'east' });
      assert.equal(gateOpen(g.puzzle().campaign.chambers[0]!, opened), true);
      assert.equal(opened.pushes, 1);
      // The only route begins south then west through E. The weighted plate is off that route.
      for (let i = 0; i < 5; i++) g.send({ type: 'wait' });
      assert.deepEqual(g.puzzle().state().golems, [{ x: 5, y: 2 }]);
      assert.equal(g.puzzle().state().status, 'playing');
    } finally { g.host.stop(); }
    const blocked = await puzzleGame(['#####', '#PBG#', '#.OE#', '#...#', '#####']);
    try {
      for (let i = 0; i < 8; i++) blocked.send({ type: 'wait' });
      assert.deepEqual(blocked.puzzle().state().golems, [{ x: 3, y: 1 }]);
      assert.equal(blocked.puzzle().state().status, 'playing');
      const before = blocked.puzzle().state();
      const rejected = blocked.send({ type: 'move', direction: 'east' });
      assert.equal(rejected.turns, before.turns, 'a boulder cannot be pushed onto a golem');
      assert.deepEqual(rejected.player, before.player);
      assert.deepEqual(rejected.rocks, before.rocks);
    } finally { blocked.host.stop(); }
  });

  test(`${implementation.id}: Tactics ordered reachability retains inclusive radius and AP conversion`, async () => {
    const g = await tacticsGame(['..........', '....C.....', '..........'], [unit('a', 'squad', 0, 1), unit('e', 'enemy', 9, 1)]);
    try {
      const t = g.tactics();
      const before = JSON.stringify(t.state);
      const reached = t.reachable('a');
      assert.equal(JSON.stringify(t.state), before, 'query spends nothing');
      assert.deepEqual(reached.slice(0, 3), [{ x: 0, y: 0, cost: 1 }, { x: 1, y: 1, cost: 1 }, { x: 0, y: 2, cost: 1 }]);
      const at = (x: number) => reached.find(p => p.x === x && p.y === 1);
      assert.equal(at(0), undefined, 'origin is omitted');
      assert.equal(at(3)?.cost, 1);
      assert.equal(at(4)?.cost, 2, 'cover remains an ordinary unit-distance tile');
      assert.equal(at(6)?.cost, 2);
      assert.equal(at(7), undefined);
      g.send({ id: 'move', type: 'move', unit: 'a', x: 6, y: 1 });
      assert.equal(t.state.units[0]!.ap, 0);
      assert.equal(t.state.units[0]!.x, 6);
      assert.deepEqual(t.reachable('a'), []);
      g.send({ id: 'too-far', type: 'move', unit: 'a', x: 7, y: 1 });
      assert.equal(t.state.units[0]!.x, 6);
      assert.equal(t.state.units[0]!.ap, 0);
      assert.equal(t.state.message, 'Destination unreachable.');
    } finally { g.host.stop(); }
    const middle = await tacticsGame(Array.from({ length: 5 }, () => '.....'), [unit('a', 'squad', 2, 2), unit('e', 'enemy', 4, 4)]);
    try {
      assert.deepEqual(middle.tactics().reachable('a').slice(0, 4), [
        { x: 2, y: 1, cost: 1 }, { x: 1, y: 2, cost: 1 }, { x: 3, y: 2, cost: 1 }, { x: 2, y: 3, cost: 1 },
      ]);
    } finally { middle.host.stop(); }
  });

  test(`${implementation.id}: Tactics queued moves recheck living ally occupancy without spending rejected AP`, async () => {
    const g = await tacticsGame(['.......', '.......', '.......'], [
      unit('a', 'squad', 0, 1), unit('b', 'squad', 4, 1), unit('e', 'enemy', 6, 2),
    ]);
    try {
      const t = g.tactics();
      const cues: string[] = [];
      g.session().events.on(TacticsResolved, event => cues.push(event.cue), 'test', g.session().scope);
      for (const id of ['a', 'b']) assert.ok(t.reachable(id).some(p => p.x === 2 && p.y === 1));
      assert.equal(t.reachable('a').some(p => p.x === 4 && p.y === 1), false, 'living ally is occupied');
      assert.equal(t.enqueue({ id: 'first', type: 'move', unit: 'a', x: 2, y: 1 }), true);
      assert.equal(t.enqueue({ id: 'second', type: 'move', unit: 'b', x: 2, y: 1 }), true);
      g.ticks(1);
      assert.deepEqual(t.state.units.slice(0, 2).map(u => ({ id: u.id, x: u.x, y: u.y, ap: u.ap })), [
        { id: 'a', x: 2, y: 1, ap: 1 }, { id: 'b', x: 4, y: 1, ap: 2 },
      ]);
      assert.equal(t.state.message, 'Destination unreachable.');
      assert.deepEqual(cues, ['tactics-move']);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: Tactics living enemies block chokepoints while dead enemies do not`, async () => {
    const g = await tacticsGame(['#########', '#.......#', '#########'], [
      unit('a', 'squad', 1, 1), unit('blocker', 'enemy', 3, 1, 2), unit('remaining', 'enemy', 7, 1),
    ]);
    try {
      const t = g.tactics();
      assert.deepEqual(t.reachable('a'), [{ x: 2, y: 1, cost: 1 }]);
      g.send({ id: 'blocked', type: 'move', unit: 'a', x: 4, y: 1 });
      assert.equal(t.state.units[0]!.ap, 2);
      g.send({ id: 'clear', type: 'attack', unit: 'a', target: 'blocker' });
      assert.equal(t.state.units[1]!.hp, 0);
      assert.equal(t.state.outcome, 'playing');
      assert.deepEqual(t.reachable('a'), [{ x: 2, y: 1, cost: 1 }, { x: 3, y: 1, cost: 1 }, { x: 4, y: 1, cost: 1 }]);
      g.send({ id: 'through', type: 'move', unit: 'a', x: 4, y: 1 });
      assert.equal(t.state.units[0]!.x, 4);
      assert.equal(t.state.units[0]!.ap, 0);
    } finally { g.host.stop(); }
  });

  test(`${implementation.id}: Tactics enemy movement keeps distance then y then x policy before firing`, async () => {
    for (const scenario of [
      { rows: ['......', '......', '......', '...#..', '......', '......'],
        units: [unit('a', 'squad', 1, 1), unit('e', 'enemy', 4, 4)], expected: { x: 4, y: 1 } },
      { rows: ['.......', '.......', '.......', '.......', '...#...', '.......', '.......'],
        units: [unit('a', 'squad', 3, 1), unit('e', 'enemy', 3, 5)], expected: { x: 2, y: 3 } },
    ]) {
      const g = await tacticsGame(scenario.rows, scenario.units);
      try {
        assert.equal(g.tactics().forecast('e', 'a').legal, false, 'wall initially blocks fire');
        g.send({ id: 'end', type: 'end-turn' });
        const t = g.tactics(), enemy = t.state.units[1]!;
        assert.deepEqual({ x: enemy.x, y: enemy.y }, scenario.expected);
        assert.equal(enemy.ap, 0, 'one move and one shot');
        assert.equal(t.state.units[0]!.hp, 8);
        assert.equal(t.state.units[0]!.ap, 2);
        assert.equal(t.state.turn, 2);
      } finally { g.host.stop(); }
    }
  });

  test(`${implementation.id}: both authored games complete through their normal command services`, async () => {
    const puzzle = await puzzleGame();
    try {
      const directions = { N: 'north', E: 'east', S: 'south', W: 'west' } as const;
      for (const route of ['NEENNEEE', 'NEENNEEEE', 'NNSSWSEEEENNEENNNE']) {
        for (const letter of route) puzzle.send({ type: 'move', direction: directions[letter as keyof typeof directions] });
        assert.equal(puzzle.puzzle().state().status, 'cleared');
        puzzle.send({ type: 'next' });
      }
      const final = puzzle.puzzle().state();
      assert.equal(final.totalTurns + final.turns, 35);
    } finally { puzzle.host.stop(); }
    const tactics = await tacticsGame();
    try {
      const commands: TacticsCommand[] = [
        { id: '1', type: 'move', unit: 'raven', x: 2, y: 3 },
        { id: '2', type: 'attack', unit: 'raven', target: 'guard' },
        { id: '3', type: 'move', unit: 'rook', x: 3, y: 4 },
        { id: '4', type: 'attack', unit: 'rook', target: 'guard' },
        { id: '5', type: 'end-turn' },
        { id: '6', type: 'attack', unit: 'raven', target: 'sentry' },
        { id: '7', type: 'attack', unit: 'raven', target: 'sentry' },
      ];
      for (const command of commands) tactics.send(command);
      assert.equal(tactics.tactics().state.outcome, 'victory');
    } finally { tactics.host.stop(); }
  });
}
