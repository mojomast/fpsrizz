import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog } from '../../../src/app/catalog.ts';
import { SessionControl, Ui, hintMechanic } from '../../../src/sdk/index.ts';
import { PortfolioCards } from '../contracts/portfolio-cards.ts';
import { PushPuzzle } from '../contracts/puzzle.ts';
import type { HintLedger, SessionContext, UiService } from '../../../src/sdk/index.ts';
import hintsManifest from '../../../src/plugins/mechanics-hints/manifest.json' with { type: 'json' };
import assistManifest from '../plugins/portfolio-assist/manifest.json' with { type: 'json' };
import ashPreset from '../presets/portfolio-cards-ash.json' with { type: 'json' };
import puzzlePreset from '../presets/stonewake.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import { codePlugin } from '../../../tests/helpers/host.ts';

const hintsEntry = { manifest: hintsManifest, load: () => import('../../../src/plugins/mechanics-hints/index.ts') };
const assistEntry = { manifest: assistManifest, load: () => import('../plugins/portfolio-assist/index.ts') };

test('hint ledgers isolate owners and topics, reject paused and exhausted requests, reset and release on restart', async () => {
  const handles: HintLedger[] = [], owners: SessionContext[] = [];
  let playing = true;
  const consumers = ['test/a', 'test/b'].map(id => codePlugin(id, { activate(ctx) {
    if (id === 'test/a') ctx.services.provide(SessionControl, { get playing() { return playing; } });
    owners.push(ctx); handles.push(hintMechanic(ctx).create(ctx, 'hints', [{ id: 'one', levels: 2 }, { id: 'two', levels: 1 }]));
  } }, { roleDependencies: ['sdk/mechanic-hints'] }));
  const game = createHeadlessGame([hintsEntry, ...consumers]);
  try {
    await game.host.apply(headlessPreset({ plugins: ['mechanics/hints', 'test/a', 'test/b'], roles: { 'sdk/mechanic-hints': 'mechanics/hints' }, options: {} }));
    const [a, b] = handles as [HintLedger, HintLedger];
    const factory = hintMechanic(owners[0]!);
    assert.throws(() => factory.create(owners[0]!, 'bad', [{ id: 'x', levels: 0 }]));
    assert.throws(() => factory.create(owners[0]!, 'bad', [{ id: 'x', levels: 1 }, { id: 'x', levels: 1 }]));
    assert.throws(() => factory.create(owners[0]!, 'hints', [{ id: 'x', levels: 1 }]));
    assert.equal(a.reveal('unknown').ok, false);
    playing = false; assert.equal(a.reveal('one').ok, false); assert.equal(a.reset('one').ok, false); playing = true;
    assert.equal(a.reveal('one').ok, true); assert.equal(a.reveal('one').ok, true);
    assert.equal(a.reveal('one').ok, false); assert.equal(a.level('one'), 2); assert.equal(a.revision, 2);
    assert.equal(a.level('two'), 0); assert.equal(b.level('one'), 0);
    assert.equal(a.reset('one').ok, true); assert.equal(a.reset('one').ok, true); assert.equal(a.revision, 3);
    assert.equal(a.reveal('one').ok, true);
    await game.host.restart();
    assert.equal(a.active, false); assert.equal(a.reveal('one').ok, false); assert.equal(handles[2]!.level('one'), 0);
  } finally { await game.host.stop(); }
});

class FakeElement {
  hidden = false; disabled = false; textContent = ''; innerHTML = '';
  handler: (() => void) | undefined;
  button = { disabled: false, textContent: '', addEventListener: (_: string, fn: () => void) => { this.handler = fn; }, removeEventListener: () => { this.handler = undefined; } };
  output = { textContent: '' };
  querySelector(selector: string) { return selector === 'button' ? this.button : this.output; }
  click() { this.handler?.(); }
}

for (const [name, preset, presentation] of [['cards', ashPreset, 'portfolio-cards/presentation'], ['puzzle', puzzlePreset, 'puzzle/presentation']] as const) {
  test(`assist reveals on demand against the real ${name} service, blocks paused input and resets on restart`, async () => {
    let playing = true;
    const roots: FakeElement[] = [];
    const platform = codePlugin('aaa/test-platform', { activate(ctx) {
      ctx.services.provide(SessionControl, { get playing() { return playing; } });
      ctx.services.provide(Ui, {
        mount(owner: SessionContext) { const root = new FakeElement(); roots.push(root); owner.scope.add(() => { root.hidden = true; }, 'fake-ui'); return root as unknown as HTMLElement; },
        addStyles() {},
      } as UiService);
    } });
    const game = createHeadlessGame([...catalog.filter(entry => preset.plugins.includes((entry.manifest as { id: never }).id) && ![presentation, 'mechanics/hints', 'portfolio/assist'].includes((entry.manifest as { id: string }).id)), hintsEntry, assistEntry, platform]);
    try {
      await game.host.apply({ ...preset, plugins: [...preset.plugins.filter(id => ![presentation, 'mechanics/hints', 'portfolio/assist'].includes(id)), 'aaa/test-platform', 'mechanics/hints', 'portfolio/assist'], roles: { ...preset.roles, 'sdk/mechanic-hints': 'mechanics/hints' } });
      game.ticks(1); game.session().scheduler.runFrame(0, 0);
      const root = roots[0]!;
      assert.equal(root.hidden, false); assert.equal(root.output.textContent, '');
      playing = false; root.click(); assert.equal(root.output.textContent, '');
      playing = true; root.click(); assert.match(root.output.textContent, name === 'cards' ? /hand has/ : /plates|exit/i);
      root.click(); assert.match(root.output.textContent, name === 'cards' ? /ash|ink/i : /.+/);
      assert.equal(root.button.disabled, true);
      if (name === 'cards') game.session().services.get(PortfolioCards).enqueue('restart');
      else game.session().services.get(PushPuzzle).enqueue({ type: 'restart' });
      game.ticks(1); game.session().scheduler.runFrame(0, 0);
      assert.equal(root.output.textContent, ''); assert.equal(root.button.disabled, false);
      await game.host.restart();
      assert.equal(root.hidden, true);
      game.ticks(1); game.session().scheduler.runFrame(0, 0);
      assert.equal(roots[1]!.output.textContent, '');
    } finally { await game.host.stop(); }
  });
}
