import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tactics } from '../src/sdk/index.ts';
import type { TacticsCommand } from '../src/sdk/index.ts';
import tacticsManifest from '../src/plugins/board-tactics/manifest.json' with { type: 'json' };
import navigationManifest from '../src/plugins/mechanics-navigation/manifest.json' with { type: 'json' };
import outcomeRating from '../src/plugins/mechanics-outcome-rating/manifest.json' with { type: 'json' };
import presentationManifest from '../src/plugins/board-presentation/manifest.json' with { type: 'json' };
import themeManifest from '../src/plugins/theme-board/manifest.json' with { type: 'json' };
import breachManifest from '../src/plugins/portfolio-breach-tactics/manifest.json' with { type: 'json' };
import breachContent from '../src/plugins/portfolio-breach-tactics/content.json' with { type: 'json' };
import crossfireManifest from '../src/plugins/portfolio-crossfire-tactics/manifest.json' with { type: 'json' };
import crossfireContent from '../src/plugins/portfolio-crossfire-tactics/content.json' with { type: 'json' };
import breachPreset from '../src/content/presets/portfolio-breach-tactics.json' with { type: 'json' };
import crossfirePreset from '../src/content/presets/portfolio-crossfire-tactics.json' with { type: 'json' };
import { createHeadlessGame } from './helpers/game.ts';

function gameFor() {
  return createHeadlessGame([
    { manifest: navigationManifest, load: () => import('../src/plugins/mechanics-navigation/index.ts') },
    { manifest: outcomeRating, load: () => import('../src/plugins/mechanics-outcome-rating/index.ts') },
    { manifest: tacticsManifest, load: () => import('../src/plugins/board-tactics/index.ts') },
    { manifest: presentationManifest, load: () => import('../src/plugins/board-presentation/index.ts') },
    { manifest: themeManifest, load: () => import('../src/plugins/theme-board/index.ts') },
    { manifest: breachManifest, content: breachContent },
    { manifest: crossfireManifest, content: crossfireContent },
  ]);
}

test('Glasshouse breach: walls force a central approach, then the squad clears the defenders', async () => {
  const game = gameFor();
  await game.host.apply(breachPreset);
  const t = game.session().services.get(Tactics);
  let id = 0;
  const run = (command: Omit<Extract<TacticsCommand, { type: 'move' }>, 'id'> | Omit<Extract<TacticsCommand, { type: 'attack' }>, 'id'> | { type: 'end-turn' }) => {
    assert.equal(t.enqueue({ ...command, id: String(++id) } as TacticsCommand), true);
    game.ticks(1);
  };
  assert.equal(t.forecast('fern', 'thorn').legal, false);
  assert.equal(t.reachable('fern').some(p => p.x === 4 && p.y === 2), false);
  run({ type: 'move', unit: 'fern', x: 3, y: 3 });
  assert.equal(t.state.units.find(u => u.id === 'fern')!.ap, 1);
  run({ type: 'attack', unit: 'fern', target: 'warden' });
  run({ type: 'move', unit: 'moss', x: 2, y: 3 });
  run({ type: 'attack', unit: 'moss', target: 'warden' });
  assert.equal(t.state.units.find(u => u.id === 'warden')!.hp, 0);
  run({ type: 'move', unit: 'ash', x: 2, y: 2 });
  run({ type: 'end-turn' });
  run({ type: 'move', unit: 'fern', x: 5, y: 3 });
  run({ type: 'attack', unit: 'fern', target: 'thorn' });
  run({ type: 'attack', unit: 'moss', target: 'briar' });
  run({ type: 'attack', unit: 'moss', target: 'briar' });
  run({ type: 'move', unit: 'ash', x: 3, y: 3 });
  run({ type: 'attack', unit: 'ash', target: 'thorn' });
  run({ type: 'end-turn' });
  run({ type: 'attack', unit: 'ash', target: 'thorn' });
  assert.equal(t.state.outcome, 'victory');
  assert.equal(t.enqueue({ id: 'late', type: 'end-turn' }), false);
  await game.host.restart();
  assert.equal(game.session().services.get(Tactics).state.outcome, 'playing');
  await game.host.stop();
});

test('Salt Flats crossfire: cover and surrounding opponents change the opening priorities', async () => {
  const game = gameFor();
  await game.host.apply(crossfirePreset);
  const t = game.session().services.get(Tactics);
  let id = 0;
  const attack = (unit: string, target: string) => {
    assert.equal(t.enqueue({ id: String(++id), type: 'attack', unit, target }), true);
    game.ticks(1);
  };
  assert.equal(t.forecast('dune', 'west').damage, 1);
  assert.equal(t.forecast('dune', 'north').damage, 2);
  attack('dune', 'north');
  attack('dune', 'north');
  attack('salt', 'south');
  attack('salt', 'south');
  assert.equal(t.state.outcome, 'playing');
  assert.equal(t.enqueue({ id: String(++id), type: 'end-turn' }), true);
  game.ticks(1);
  assert.equal(t.state.turn, 2);
  attack('dune', 'west');
  attack('dune', 'west');
  attack('salt', 'west');
  attack('salt', 'east');
  assert.equal(t.enqueue({ id: String(++id), type: 'end-turn' }), true);
  game.ticks(1);
  attack('dune', 'east');
  attack('dune', 'east');
  assert.equal(t.state.outcome, 'victory');
  await game.host.stop();
});
