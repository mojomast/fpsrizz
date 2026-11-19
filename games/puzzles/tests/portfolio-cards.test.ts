import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionControl } from '@bulkhead/sdk';
import { PortfolioCards, cardPilesMechanic } from '../contracts/portfolio-cards.ts';
import type { SessionContext } from '@bulkhead/sdk';
import type { CardPiles } from '../contracts/portfolio-cards.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import { codePlugin } from '../../../tests/helpers/host.ts';
import pilesManifest from '../plugins/portfolio-cards-piles/manifest.json' with { type: 'json' };
import ashManifest from '../plugins/portfolio-cards-ash/manifest.json' with { type: 'json' };
import cloudManifest from '../plugins/portfolio-cards-cloud/manifest.json' with { type: 'json' };
import hintsManifest from '@bulkhead/std/mechanics-hints/manifest.json' with { type: 'json' };
import assistManifest from '../plugins/portfolio-assist/manifest.json' with { type: 'json' };
import ashPreset from '../presets/portfolio-cards-ash.json' with { type: 'json' };
import cloudPreset from '../presets/portfolio-cards-cloud.json' with { type: 'json' };

const pilesEntry = { manifest: pilesManifest, load: () => import('../plugins/portfolio-cards-piles/index.ts') };
const ashEntry = { manifest: ashManifest, load: () => import('../plugins/portfolio-cards-ash/index.ts') };
const cloudEntry = { manifest: cloudManifest, load: () => import('../plugins/portfolio-cards-cloud/index.ts') };
const hintsEntry = { manifest: hintsManifest, load: () => import('@bulkhead/std/mechanics-hints/index.ts') };
const assistEntry = { manifest: assistManifest, load: () => import('../plugins/portfolio-assist/index.ts') };

test('ordered piles conserve unique IDs, reject invalid moves, isolate owners and restart', async () => {
  const handles: CardPiles[] = [], owners: SessionContext[] = [];
  let playing = true;
  const consumers = ['test/a', 'test/b'].map(id => codePlugin(id, { activate(ctx) {
    if (id === 'test/a') ctx.services.provide(SessionControl, { get playing() { return playing; } });
    owners.push(ctx); handles.push(cardPilesMechanic(ctx).create(ctx, 'deck', ['A','B','C']));
  } }, { roleDependencies: ['sdk/portfolio-card-piles'] }));
  const game = createHeadlessGame([pilesEntry, ...consumers]);
  try {
    await game.host.apply(headlessPreset({ plugins: ['portfolio-cards/piles','test/a','test/b'], roles: { 'sdk/portfolio-card-piles': 'portfolio-cards/piles' }, options: {} }));
    const a = handles[0]!, b = handles[1]!, owner = owners[0]!, provider = cardPilesMechanic(owner);
    assert.throws(() => provider.create(owner, 'bad', ['A','A']));
    assert.throws(() => provider.create(owner, 'bad', Array(1)));
    assert.throws(() => provider.create(owner, 'deck', ['A']));
    const first = a.snapshot();
    for (const n of [0, -1, 4, 1.5, NaN]) assert.equal(a.draw(n).ok, false);
    assert.equal(a.discard('A').ok, false); assert.deepEqual(a.snapshot(), first);
    playing = false; assert.equal(a.draw(1).ok, false); assert.deepEqual(a.snapshot(), first); playing = true;
    assert.equal(a.draw(2).ok, true); assert.equal(a.discard('A').ok, true);
    assert.deepEqual(a.snapshot(), { draw: ['C'], hand: ['B'], discard: ['A'] });
    assert.deepEqual(first, { draw: ['A','B','C'], hand: [], discard: [] });
    assert.ok(Object.isFrozen(first.draw));
    assert.equal(a.draw(2).ok, false); assert.equal(a.draw(1).ok, true);
    assert.equal(a.discard('B').ok, true); assert.equal(a.discard('C').ok, true);
    assert.deepEqual(a.snapshot(), { draw: [], hand: [], discard: ['A','B','C'] });
    assert.deepEqual(b.snapshot(), first);
    await game.host.restart();
    assert.equal(a.active, false); assert.equal(a.draw(1).ok, false);
    assert.deepEqual(handles[2]!.snapshot(), first);
  } finally { await game.host.stop(); }
});

for (const [name, preset, entry] of [['ash', ashPreset, ashEntry], ['cloud', cloudPreset, cloudEntry]] as const) {
  test(`${name} initializes its opening hand only after the launcher permits play`, async () => {
    let playing = false;
    const gate = codePlugin('aaa/control', { activate(ctx) {
      ctx.services.provide(SessionControl, { get playing() { return playing; } });
    } });
    const game = createHeadlessGame([pilesEntry, entry, hintsEntry, assistEntry, gate]);
    try {
      await game.host.apply({ ...preset, plugins: [...preset.plugins.filter(id => id !== 'portfolio-cards/presentation'), 'aaa/control'] });
      const cards = game.session().services.get(PortfolioCards);
      game.ticks(2);
      assert.deepEqual(cards.state().hand, []);
      playing = true;
      game.ticks(1);
      assert.equal(cards.state().hand.length, 3);
      assert.equal(cards.state().revision, 1);
      game.ticks(2);
      assert.equal(cards.state().hand.length, 3);
    } finally { await game.host.stop(); }
  });
}

test('ash transcribes a mismatched glyph at a higher ink cost and can run dry', async () => {
  const game = createHeadlessGame([pilesEntry, ashEntry, hintsEntry, assistEntry]);
  try {
    await game.host.apply({ ...ashPreset, plugins: ashPreset.plugins.filter(id => id !== 'portfolio-cards/presentation') });
    const cards = game.session().services.get(PortfolioCards);
    game.ticks(1);
    assert.match(cards.state().actions.find(a => a.id === 'transcribe:ink-1')!.detail, /5 → 3/);
    cards.enqueue('transcribe:ink-1'); game.ticks(1);
    assert.match(cards.state().summary, /Glyphs 1\/6.*ink 3\/7/);
    cards.enqueue('transcribe:ash-1'); game.ticks(1);
    cards.enqueue('transcribe:ink-2'); game.ticks(1);
    assert.equal(cards.state().status, 'lost');
  } finally { await game.host.stop(); }
});

test('cloud bold surveys trade storm for progress and completed islands reject them', async () => {
  const game = createHeadlessGame([pilesEntry, cloudEntry, hintsEntry, assistEntry]);
  try {
    await game.host.apply({ ...cloudPreset, plugins: cloudPreset.plugins.filter(id => id !== 'portfolio-cards/presentation') });
    const cards = game.session().services.get(PortfolioCards);
    game.ticks(1);
    assert.match(cards.state().actions.find(a => a.id === 'bold:sun-1')!.detail, /2 mark.*0 → 2/);
    cards.enqueue('bold:sun-1'); game.ticks(1);
    assert.match(cards.state().summary, /Sun 2\/2.*storm 2\/4.*turn 1\/10/);
    cards.enqueue('bold:sun-2'); game.ticks(1);
    assert.match(cards.state().summary, /turn 1\/10/);
    assert.match(cards.state().message, /already charted/);
    cards.enqueue('bold:wind-1'); game.ticks(1);
    assert.equal(cards.state().status, 'lost');
  } finally { await game.host.stop(); }
});

for (const [name, preset, entry, route, loss] of [
  ['ash', ashPreset, ashEntry, ['play:ash-1','play:ink-1','play:ink-2','play:ember-1','restore:ash-3','play:ember-2','play:ash-2'], ['restore:ash-1','restore:ink-1','restore:ink-2','restore:ember-1','restore:ember-2','restore:ash-2','restore:ash-3','restore:ink-3']],
  ['cloud', cloudPreset, cloudEntry, ['survey:sun-1','survey:wind-1','survey:rain-1','shelter:sun-2','survey:wind-2','survey:rain-2','shelter:wind-3','survey:sun-3'], ['survey:sun-1','survey:wind-1','survey:rain-1','survey:sun-2']],
] as const) {
  test(`${name} winning and losing routes and in-game restart`, async () => {
    // Presentation is browser-only; gameplay is exercised with the same selected provider.
    const game = createHeadlessGame([pilesEntry, entry, hintsEntry, assistEntry]);
    try {
      await game.host.apply({ ...preset, plugins: preset.plugins.filter(id => id !== 'portfolio-cards/presentation') });
      const service = game.session().services.get(PortfolioCards);
      const act = (cmd: string) => { assert.equal(service.enqueue(cmd), true); game.ticks(1); };
      for (const cmd of route) act(cmd);
      assert.equal(service.state().status, 'won');
      act('restart'); assert.equal(service.state().status, 'playing');
      for (const cmd of loss) act(cmd);
      assert.equal(service.state().status, 'lost');
      act('restart'); assert.equal(service.state().status, 'playing');
    } finally { await game.host.stop(); }
  });
}
