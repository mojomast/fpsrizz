import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../src/app/catalog.ts';
import { Profile, PushPuzzle, SessionControl, definePlugin } from '../src/sdk/index.ts';
import { Adventure, AdventureActionResolved } from '../games/adventure/contracts/adventure.ts';
import type { ProfileData, PuzzleCommand, PuzzleDirection } from '../src/sdk/index.ts';
import type { AdventureCommand } from '../games/adventure/contracts/adventure.ts';
import { createHeadlessGame } from './helpers/game.ts';

async function game(family: 'puzzle' | 'story') {
  const ids = family === 'puzzle' ? ['puzzle/rules', 'puzzle/chambers', 'mechanics/navigation'] : ['story/adventure', 'story/chapter'];
  const control = { playing: true };
  let stored: ProfileData | null = null;
  let profileHook = () => {};
  const saved: string[] = [];
  const g = createHeadlessGame([
    ...catalog.filter(entry => ids.includes((entry.manifest as { id: string }).id)),
    {
      manifest: { schema: 1, id: 'a-test/commands', name: 'Command test services', version: '1.0.0', kind: 'code', sdk: '^2.0.0' },
      load: async () => ({ default: definePlugin({ activate(ctx) {
        ctx.services.provide(SessionControl, control);
        ctx.services.provide(Profile, {
          load: () => { profileHook(); return { ok: true, value: stored }; },
          save: value => { stored = value; saved.push(String(value.values['story/save/story/last-light'])); return { ok: true, value: undefined }; },
          clear: () => { stored = null; return { ok: true, value: undefined }; },
        });
      } }) }),
    },
  ]);
  await g.host.apply({ schema: 1, id: 'test/commands', name: 'Commands', plugins: ['a-test/commands', ...ids],
    roles: family === 'puzzle'
      ? { 'sdk/experience': 'puzzle/stonewake', 'sdk/mechanic-navigation': 'mechanics/navigation' }
      : { 'sdk/experience': 'story/adventure' },
    options: family === 'puzzle' ? { campaign: 'puzzle/sleeping-ruins' } : { chapter: 'story/last-light' }, seed: 1 });
  return { ...g, control, saved, onProfileLoad: (hook: () => void) => { profileHook = hook; } };
}

test('command consumers: Stonewake detaches move payloads and retains one-command-per-tick cadence', async () => {
  const g = await game('puzzle');
  try {
    const puzzle = g.session().services.get(PushPuzzle), start = puzzle.state();
    const command: PuzzleCommand = { type: 'move', direction: 'north' };
    assert.equal(puzzle.enqueue(command), true);
    command.direction = 'south';
    assert.equal(puzzle.enqueue({ type: 'move', direction: 'east' }), true);
    g.ticks(1);
    assert.deepEqual(puzzle.state().player, { x: start.player.x, y: start.player.y - 1 });
    assert.equal(puzzle.state().turns, 1);
    g.ticks(1);
    assert.deepEqual(puzzle.state().player, { x: start.player.x + 1, y: start.player.y - 1 });
    assert.equal(puzzle.state().turns, 2);
  } finally { g.host.stop(); }
});

test('command consumers: Stonewake clears pending commands on undo, restart, replay, next, clear and capture', async () => {
  const g = await game('puzzle');
  try {
    const puzzle = g.session().services.get(PushPuzzle);
    for (const type of ['undo', 'restart', 'replay', 'next'] as const) {
      puzzle.enqueue({ type: 'wait' }); g.ticks(1);
      const before = puzzle.state().turns;
      puzzle.enqueue({ type }); puzzle.enqueue({ type: 'wait' });
      g.ticks(2);
      assert.equal(puzzle.state().turns, type === 'next' ? before : 0, type);
    }
    puzzle.enqueue({ type: 'restart' }); g.ticks(1);
    const directions: Record<string, PuzzleDirection> = { N: 'north', E: 'east' };
    for (const letter of 'NEENNEEE') puzzle.enqueue({ type: 'move', direction: directions[letter]! });
    puzzle.enqueue({ type: 'restart' });
    g.ticks(9);
    assert.equal(puzzle.state().status, 'cleared', 'winning drops the queued restart');
    puzzle.enqueue({ type: 'next' }); puzzle.enqueue({ type: 'wait' });
    g.ticks(2);
    assert.equal(puzzle.state().chamber, 1);
    assert.equal(puzzle.state().turns, 0, 'next drops work from the previous chamber');
    for (let i = 0; i < 31; i++) assert.equal(puzzle.enqueue({ type: 'wait' }), true);
    assert.equal(puzzle.enqueue({ type: 'restart' }), true);
    assert.equal(puzzle.enqueue({ type: 'wait' }), false);
    g.ticks(32);
    assert.equal(puzzle.state().status, 'caught', 'capture drops the queued restart');
  } finally { g.host.stop(); }
});

test('command consumers: Story retains strict normalization, detached payloads and a 128-command batch', async () => {
  const g = await game('story');
  try {
    const adventure = g.session().services.get(Adventure), receipts: string[] = [];
    g.session().events.on(AdventureActionResolved, e => receipts.push(e.id), 'test', g.session().scope);
    for (const bad of [null, [], {}, { type: 'action' }, { type: 'action', id: 'x'.repeat(65) }, { type: 'save', extra: true }, { type: 'action', id: 'inspect-sea', extra: true }]) {
      assert.equal(adventure.enqueue(bad as AdventureCommand), false);
    }
    const command: AdventureCommand = { type: 'action', id: 'inspect-sea' };
    for (let i = 0; i < 128; i++) assert.equal(adventure.enqueue(command), true);
    command.id = 'speak-kind';
    assert.equal(adventure.enqueue(command), false);
    g.ticks(1);
    assert.deepEqual(receipts, Array<string>(128).fill('inspect-sea'));
    assert.deepEqual(adventure.state().inventory, []);
    assert.equal(adventure.enqueue({ type: 'action', id: 'light-beacon' }), true, 'queue acceptance does not imply gameplay legality');
    g.ticks(1);
    assert.equal(receipts.length, 128);
  } finally { g.host.stop(); }
});

test('command consumers: Story processes the original batch across reset, save and replay-validated load', async () => {
  const g = await game('story');
  try {
    const adventure = g.session().services.get(Adventure), receipts: string[] = [];
    g.session().events.on(AdventureActionResolved, e => receipts.push(e.id), 'test', g.session().scope);
    const commands: AdventureCommand[] = [
      { type: 'action', id: 'speak-kind' }, { type: 'save' }, { type: 'action', id: 'workshop-door' },
      { type: 'reset' }, { type: 'load' }, { type: 'action', id: 'workshop-door' }, { type: 'action', id: 'take-lens' }, { type: 'save' },
    ];
    for (const command of commands) assert.equal(adventure.enqueue(command), true);
    g.ticks(1);
    assert.deepEqual(receipts, ['speak-kind', 'workshop-door', 'workshop-door', 'take-lens'], 'save replay emits no action receipts');
    assert.equal(adventure.state().room, 'workshop');
    assert.deepEqual(adventure.state().inventory, ['key', 'lens']);
    assert.deepEqual(g.saved.map(raw => (JSON.parse(raw) as { history: string[] }).history), [
      ['speak-kind'], ['speak-kind', 'workshop-door', 'take-lens'],
    ]);
  } finally { g.host.stop(); }
});

test('command consumers: synchronous Story profile callbacks enqueue only for the next bounded batch', async () => {
  const g = await game('story');
  try {
    const adventure = g.session().services.get(Adventure), receipts: string[] = [];
    g.session().events.on(AdventureActionResolved, e => receipts.push(e.id), 'test', g.session().scope);
    g.onProfileLoad(() => {
      for (let i = 0; i < 128; i++) assert.equal(adventure.enqueue({ type: 'action', id: 'inspect-sea' }), true);
      assert.equal(adventure.enqueue({ type: 'action', id: 'inspect-sea' }), false);
    });
    adventure.enqueue({ type: 'save' }); adventure.enqueue({ type: 'reset' }); adventure.enqueue({ type: 'action', id: 'speak-kind' });
    g.ticks(1);
    assert.deepEqual(receipts, ['speak-kind']);
    g.ticks(1);
    assert.deepEqual(receipts, ['speak-kind', ...Array<string>(128).fill('inspect-sea')]);
  } finally { g.host.stop(); }
});

test('command consumers: both families discard observed paused ingress and reject stale services after restart', async () => {
  for (const family of ['puzzle', 'story'] as const) {
    const g = await game(family);
    try {
      const get = () => {
        if (family === 'puzzle') {
          const service = g.session().services.get(PushPuzzle);
          return { state: service.state, enqueue: () => service.enqueue({ type: 'wait' }) };
        }
        const service = g.session().services.get(Adventure);
        return { state: service.state, enqueue: () => service.enqueue({ type: 'action', id: 'inspect-sea' }) };
      };
      const send = () => get().enqueue();
      const initial = get().state();
      send(); g.control.playing = false;
      assert.equal(send(), false);
      g.control.playing = true; g.ticks(2);
      assert.deepEqual(get().state(), initial, `${family}: observed paused ingress clears without a paused tick`);
      send(); g.control.playing = false; g.ticks(1); g.control.playing = true; g.ticks(1);
      assert.deepEqual(get().state(), initial, `${family}: paused drain clears pending work`);
      const resources = g.host.resourceReport();
      for (let i = 0; i < 3; i++) {
        const old = get(), oldScope = g.session().scope;
        send();
        await g.host.restart();
        assert.equal(oldScope.size(), 0);
        assert.equal(old.enqueue(), false, `${family}: stale ingress`);
        g.ticks(1);
        assert.deepEqual(get().state(), initial);
        assert.deepEqual(g.host.resourceReport(), resources);
      }
      const old = get();
      g.host.stop();
      assert.equal(old.enqueue(), false);
    } finally { g.host.stop(); }
  }
});
