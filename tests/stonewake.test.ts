import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../src/app/catalog.ts';
import { NavigationRole, PushPuzzle, PuzzleResolved, Reporter, SessionControl } from '../src/sdk/index.ts';
import type { PuzzleCommand, PuzzleDirection } from '../src/sdk/index.ts';
import preset from '../src/content/presets/stonewake.json' with { type: 'json' };
import content from '../src/plugins/puzzle-chambers/content.json' with { type: 'json' };
import { loadCampaign } from '../src/plugins/puzzle-rules/content.ts';
import { gateOpen, initialBoard, takeTurn } from '../src/plugins/puzzle-rules/rules.ts';
import { createHeadlessGame } from './helpers/game.ts';

const directions: Record<string, PuzzleDirection> = { N: 'north', E: 'east', S: 'south', W: 'west' };
const routes = ['NEENNEEE', 'NEENNEEEE', 'NNSSWSEEEENNEENNNE'];
const puzzleCatalog = () => catalog.filter(entry => {
  const id = (entry.manifest as { id: string }).id;
  return id.startsWith('puzzle/') || id === 'theme/board' || id === 'mechanics/navigation';
});
async function game() {
  const g = createHeadlessGame(puzzleCatalog());
  await g.host.apply(preset);
  const puzzle = () => g.session().services.get(PushPuzzle);
  const send = (command: PuzzleCommand) => { assert.equal(puzzle().enqueue(command), true); g.ticks(1); return puzzle().state(); };
  const navigation = () => g.session().contexts.get('puzzle/rules')!.role(NavigationRole)!.provider;
  return { ...g, puzzle, send, navigation };
}

test('Stonewake: all authored chambers complete through legal queued moves; replay resets campaign', async () => {
  const g = await game();
  try {
    const cues: string[] = [];
    g.session().events.on(PuzzleResolved, e => cues.push(e.cue), 'test', g.session().scope);
    for (let chamber = 0; chamber < routes.length; chamber++) {
      assert.equal(g.puzzle().state().chamber, chamber);
      for (const letter of routes[chamber]!) {
        const before = g.puzzle().state();
        const after = g.send({ type: 'move', direction: directions[letter]! });
        assert.equal(after.turns, before.turns + 1);
        assert.notEqual(after.status, 'caught');
      }
      assert.equal(g.puzzle().state().status, 'cleared');
      assert.ok(g.puzzle().state().turns <= g.puzzle().campaign.chambers[chamber]!.par);
      g.send({ type: 'next' });
    }
    const end = g.puzzle().state();
    assert.equal(end.chamber, 2);
    assert.equal(end.totalTurns + end.turns, 35);
    assert.equal(cues.filter(c => c === 'puzzle-clear').length, 3);
    assert.ok(cues.includes('puzzle-push') && cues.includes('puzzle-gate'));
    const reset = g.send({ type: 'replay' });
    assert.equal(reset.turns, 0); assert.equal(reset.totalTurns, 0); assert.equal(reset.chamber, 0); assert.equal(reset.canUndo, false);
  } finally { g.host.stop(); }
});

test('Stonewake: idle time, malformed input, queue bounds and a paused session cannot spend turns', async () => {
  const g = await game();
  try {
    const initial = g.puzzle().state();
    g.ticks(1800); assert.deepEqual(g.puzzle().state(), initial);
    for (const command of [null, [], {}, { type: 'teleport' }, { type: 'move', direction: 'diagonal' }, { type: 'move', direction: null }])
      assert.equal(g.puzzle().enqueue(command as unknown as PuzzleCommand), false);
    const control = { playing: true };
    g.session().services.provide(SessionControl, control, 'test', g.session().scope);
    assert.equal(g.puzzle().enqueue({ type: 'wait' }), true);
    control.playing = false;
    assert.equal(g.puzzle().enqueue({ type: 'wait' }), false);
    g.ticks(1); control.playing = true; g.ticks(2);
    assert.deepEqual(g.puzzle().state(), initial, 'queued ingress is discarded while not playing');
    for (let i = 0; i < 32; i++) assert.equal(g.puzzle().enqueue({ type: 'wait' }), true);
    assert.equal(g.puzzle().enqueue({ type: 'wait' }), false);
    g.ticks(1); assert.equal(g.puzzle().state().turns, 1, 'only one command commits per tick');
    g.ticks(31); assert.equal(g.puzzle().state().turns, 32);
  } finally { g.host.stop(); }
});

test('Stonewake: rocks weight plates, undo restores every piece and beat, invalid pushes spend nothing', async () => {
  const g = await game();
  try {
    g.send({ type: 'move', direction: 'north' });
    g.send({ type: 'move', direction: 'east' });
    const before = g.puzzle().state();
    const after = g.send({ type: 'move', direction: 'east' });
    const level = g.puzzle().campaign.chambers[0]!;
    assert.equal(gateOpen(level, before), false); assert.equal(gateOpen(level, after), true);
    const undone = g.send({ type: 'undo' });
    for (const key of ['player', 'rocks', 'golems', 'turns', 'pushes', 'status'] as const) assert.deepEqual(undone[key], before[key]);
    assert.equal(gateOpen(level, undone), false);
    const againstWall = { ...initialBoard(level), player: { x: 3, y: 1 } };
    const rejected = takeTurn(level, againstWall, 'south', g.navigation());
    assert.ok('reason' in rejected);
    assert.equal(againstWall.turns, 0);
    const rockAtWall = { ...initialBoard(level), player: { x: 1, y: 2 }, rocks: [{ x: 1, y: 1 }] };
    assert.ok('reason' in takeTurn(level, rockAtWall, 'north', g.navigation()));
    const chain = { ...initialBoard(level), player: { x: 2, y: 3 }, rocks: [{ x: 3, y: 3 }, { x: 4, y: 3 }] };
    assert.ok('reason' in takeTurn(level, chain, 'east', g.navigation()), 'cannot push chains');
  } finally { g.host.stop(); }
});

test('Stonewake: locked exits reject entry and a rock cannot be pushed into the gate', async () => {
  const g = await game();
  try {
    const r = new Reporter([], 'test');
    const campaign = loadCampaign(content[0]!.data, r)!;
    const level = campaign.chambers[0]!;
    const state = { ...initialBoard(level), player: { x: 6, y: 1 } };
    assert.ok('reason' in takeTurn(level, state, 'east', g.navigation()));
    state.rocks = [{ x: 5, y: 3 }];
    const escaped = takeTurn(level, state, 'east', g.navigation());
    assert.ok('board' in escaped);
    if ('board' in escaped) assert.equal(escaped.board.status, 'cleared');
    const blocked = { ...initialBoard(level), player: { x: 5, y: 1 }, rocks: [{ x: 6, y: 1 }] };
    assert.ok('reason' in takeTurn(level, blocked, 'east', g.navigation()));
  } finally { g.host.stop(); }
});

test('Stonewake: golems pursue on every second committed turn; defeat can be rewound', async () => {
  const g = await game();
  try {
    for (const letter of routes[0]!) g.send({ type: 'move', direction: directions[letter]! });
    g.send({ type: 'next' });
    const start = g.puzzle().state();
    const first = g.send({ type: 'wait' });
    assert.deepEqual(first.golems, start.golems);
    const second = g.send({ type: 'wait' });
    assert.notDeepEqual(second.golems, start.golems);
    let previous = second;
    for (let i = 0; i < 30 && g.puzzle().state().status === 'playing'; i++) { previous = g.puzzle().state(); g.send({ type: 'wait' }); }
    assert.equal(g.puzzle().state().status, 'caught');
    const undone = g.send({ type: 'undo' });
    assert.equal(undone.status, 'playing'); assert.equal(undone.turns, previous.turns);
    assert.deepEqual(undone.golems, previous.golems); assert.deepEqual(undone.player, previous.player);
    g.send({ type: 'restart' }); assert.deepEqual(g.puzzle().state().golems, start.golems);
  } finally { g.host.stop(); }
});

test('Stonewake: boulders physically block pursuing golems', async () => {
  const g = await game();
  try {
    const r = new Reporter([], 'test');
    const campaign = loadCampaign({ name: 'Blockade', chambers: [{ name: 'Blockade', hint: 'Wait.', par: 20,
      rows: ['#####', '#PBG#', '#.OE#', '#...#', '#####'] }] }, r)!;
    assert.deepEqual(r.issues, []);
    const level = campaign.chambers[0]!;
    let board = initialBoard(level);
    for (let i = 0; i < 12; i++) {
      const result = takeTurn(level, board, null, g.navigation());
      assert.ok('board' in result); if ('board' in result) board = result.board;
    }
    assert.equal(board.status, 'playing'); assert.deepEqual(board.golems, level.golems);
    board.rocks = [{ x: 2, y: 2 }];
    for (let i = 0; i < 4; i++) { const result = takeTurn(level, board, null, g.navigation()); if ('board' in result) board = result.board; }
    assert.equal(board.status, 'caught', 'opening the blockade lets the golem reach the explorer');
  } finally { g.host.stop(); }
});

test('Stonewake: content validation reports malformed and unreachable chambers at actionable paths', () => {
  const malformed = [
    { name: 'Wrong', chambers: [] },
    { name: 'Wrong', chambers: [{ name: 'Bad', hint: 'Bad', par: 1, rows: ['#####', '#PBE#', '##O##', '#.G.#', '#####'], typo: 1 }] },
    { name: 'Wrong', chambers: [{ name: 'Bad', hint: 'Bad', par: 0, rows: ['#####', '#PBX#', '#.OE#', '#.P.#', '#####'] }] },
    { name: 'Wrong', chambers: [{ name: 'Bad', hint: 'Bad', par: 1, rows: ['#####', '#PBE#', '#####', '#O..#', '#####'] }] },
  ];
  for (const value of malformed) {
    const r = new Reporter([], 'authored-puzzle');
    assert.equal(loadCampaign(value, r), undefined);
    assert.ok(r.issues.length > 0 && r.issues.every(i => i.path.startsWith('chambers')));
  }
});

test('Stonewake: snapshots are detached, campaign definitions frozen, restarts release old ownership', async () => {
  const g = await game();
  try {
    const old = g.puzzle(), before = old.state();
    const changed = old.state(); changed.rocks.length = 0; changed.player = { x: 99, y: 99 };
    assert.deepEqual(old.state(), before);
    assert.equal(Object.isFrozen(old.campaign.chambers[0]!.rocks[0]), true);
    const resources = g.host.resourceReport();
    g.send({ type: 'move', direction: 'north' });
    await g.host.restart();
    assert.equal(old.enqueue({ type: 'wait' }), false, 'disposed services reject ingress');
    assert.deepEqual(g.puzzle().state(), before);
    assert.deepEqual(g.host.resourceReport(), resources);
  } finally { g.host.stop(); }
});

test('Stonewake: mismatched experience and mixed game families fail during staging', async () => {
  const g = await game();
  try {
    const session = g.session();
    await assert.rejects(g.host.apply({ ...preset, roles: { 'sdk/theme': 'theme/board' } }));
    assert.equal(g.session(), session);
    await assert.rejects(g.host.apply({ ...preset, plugins: [...preset.plugins, 'core/combat'] }));
    assert.equal(g.session(), session);
  } finally { g.host.stop(); }
});

test('Stonewake: undo retains the latest 256 turns and restart still restores the chamber origin', async () => {
  const g = await game();
  try {
    for (let i = 0; i < 300; i++) g.send({ type: 'wait' });
    for (let i = 0; i < 256; i++) g.send({ type: 'undo' });
    const oldest = g.puzzle().state();
    assert.equal(oldest.turns, 44); assert.equal(oldest.canUndo, false);
    g.send({ type: 'undo' }); assert.deepEqual(g.puzzle().state(), oldest);
    assert.equal(g.send({ type: 'restart' }).turns, 0);
  } finally { g.host.stop(); }
});
