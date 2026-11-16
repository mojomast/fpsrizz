import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalog } from '../src/app/catalog.ts';
import { Hearth, SaltLedger, SessionControl, Silt, Ui } from '../src/sdk/index.ts';
import type { SessionContext, UiService } from '../src/sdk/index.ts';
import type { HearthService, SaltLedgerService, SiltService } from '../src/sdk/index.ts';
import hintsManifest from '../src/plugins/mechanics-hints/manifest.json' with { type: 'json' };
import assistManifest from '../src/plugins/expedition-assist/manifest.json' with { type: 'json' };
import siltPreset from '../src/content/presets/silt-archive.json' with { type: 'json' };
import saltPreset from '../src/content/presets/salt-ledger.json' with { type: 'json' };
import hearthPreset from '../src/content/presets/common-ground.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin } from './helpers/host.ts';

const hints = { manifest: hintsManifest, load: () => import('../src/plugins/mechanics-hints/index.ts') };
const assist = { manifest: assistManifest, load: () => import('../src/plugins/expedition-assist/index.ts') };
class FakeElement {
  hidden = false; innerHTML = '';
  handler: (() => void) | undefined;
  button = { disabled: false, textContent: '', addEventListener: (_: string, fn: () => void) => { this.handler = fn; }, removeEventListener: () => { this.handler = undefined; } };
  output = { textContent: '' };
  querySelector(selector: string) { return selector === 'button' ? this.button : this.output; }
  click() { this.handler?.(); }
}

test('context-specific guidance uses public observations and defers changed-context reset during pause', async () => {
  let playing = true, family: 'silt' | 'salt' | 'hearth' = 'silt';
  let siltState = { status: 'playing', pendingUpgrades: 0, enemies: [{ threat: [{ x: 2, y: 3 }] }], x: 2, y: 3 };
  const saltState = { ending: '', pending: 0, battle: null, journal: [{ status: 'active', title: 'Find evidence', instruction: 'Search the hall', location: 'Hall', action: 'Inspect' }], location: 'hall' };
  const hearthState = { selected: 'a', paused: false, residents: [{ id: 'a', name: 'Ari', needs: { energy: 12, nourishment: 70, comfort: 70 } }], furniture: ['bed'] };
  const roots: FakeElement[] = [];
  const platform = codePlugin('aaa/assist-fixture', { activate(ctx) {
    ctx.services.provide(SessionControl, { get playing() { return playing; } });
    ctx.services.provide(Ui, { mount(owner: SessionContext) { const root = new FakeElement(); roots.push(root); owner.scope.add(() => { root.hidden = true; }, 'fake-ui'); return root as unknown as HTMLElement; }, addStyles() {} } as UiService);
    // Independent service leases allow exercising optional family detection in one session.
    if (family === 'silt') ctx.services.provide(Silt, { state: () => siltState } as unknown as SiltService);
    if (family === 'salt') ctx.services.provide(SaltLedger, { state: () => saltState, campaign: { locations: [] } } as unknown as SaltLedgerService);
    if (family === 'hearth') ctx.services.provide(Hearth, { state: () => hearthState, household: { objects: [{ id: 'bed', category: 'sleep' }] } } as unknown as HearthService);
  } });
  const game = createHeadlessGame([hints, assist, platform]);
  try {
    await game.host.apply(headlessPreset({ plugins: ['aaa/assist-fixture', 'mechanics/hints', 'expedition/assist'], roles: { 'sdk/mechanic-hints': 'mechanics/hints' }, options: {} }));
    const root = roots[0]!;
    root.click(); assert.match(root.output.textContent, /marked/);
    root.click(); assert.match(root.output.textContent, /Move out/);
    playing = false; siltState = { ...siltState, pendingUpgrades: 1 };
    game.session().scheduler.runFrame(0, 0); assert.equal(root.hidden, true); assert.equal(root.output.textContent, '');
    playing = true; game.session().scheduler.runFrame(0, 0); assert.equal(root.hidden, false);
    root.click(); assert.match(root.output.textContent, /upgrade/);
    family = 'salt'; await game.host.restart();
    roots[1]!.click(); assert.match(roots[1]!.output.textContent, /Find evidence/);
    roots[1]!.click(); assert.match(roots[1]!.output.textContent, /Search the hall/);
    family = 'hearth'; await game.host.restart();
    roots[2]!.click(); assert.match(roots[2]!.output.textContent, /low energy/);
    roots[2]!.click(); assert.match(roots[2]!.output.textContent, /Sleep/);
    hearthState.paused = true; game.session().scheduler.runFrame(0, 0);
    assert.equal(roots[2]!.output.textContent, ''); assert.equal(roots[2]!.button.disabled, true);
    roots[2]!.click(); assert.equal(roots[2]!.output.textContent, '');
    hearthState.paused = false; game.session().scheduler.runFrame(0, 0);
    roots[2]!.click(); assert.match(roots[2]!.output.textContent, /low energy/);
  } finally { await game.host.stop(); }
});

for (const [name, preset, presentation] of [['silt', siltPreset, 'silt/presentation'], ['salt', saltPreset, 'salt/presentation'], ['hearth', hearthPreset, 'common/presentation']] as const) {
  test(`${name} assistance reveals progressively, resets on state and session changes, and respects pause`, async () => {
    let playing = true;
    const roots: FakeElement[] = [];
    const platform = codePlugin('aaa/assist-platform', { activate(ctx) {
      ctx.services.provide(SessionControl, { get playing() { return playing; } });
      ctx.services.provide(Ui, { mount(owner: SessionContext) { const root = new FakeElement(); roots.push(root); owner.scope.add(() => { root.hidden = true; }, 'fake-ui'); return root as unknown as HTMLElement; }, addStyles() {} } as UiService);
    } });
    const excluded = [presentation, 'mechanics/hints', 'expedition/assist'];
    const selected = preset.plugins.filter(id => !excluded.includes(id));
    const game = createHeadlessGame([...catalog.filter(entry => selected.includes((entry.manifest as { id: never }).id)), hints, assist, platform]);
    try {
      const roles: Record<string, string> = { ...preset.roles, 'sdk/mechanic-hints': 'mechanics/hints' };
      if (name === 'hearth') delete roles['sdk/experience']; // The omitted presentation supplies this role.
      await game.host.apply({ ...preset, plugins: [...selected, 'aaa/assist-platform', 'mechanics/hints', 'expedition/assist'], roles });
      game.ticks(1); game.session().scheduler.runFrame(0, 0);
      const root = roots[0]!;
      assert.equal(root.hidden, false); assert.equal(root.output.textContent, '');
      playing = false; root.click(); assert.equal(root.output.textContent, '');
      playing = true; root.click(); assert.match(root.output.textContent, /.+/);
      const first = root.output.textContent; root.click(); assert.match(root.output.textContent, /.+/); assert.notEqual(root.output.textContent, first); assert.equal(root.button.disabled, true);
      if (name === 'silt') game.session().services.get(Silt).enqueue({ type: 'wait' });
      else if (name === 'salt') game.session().services.get(SaltLedger).enqueue({ type: 'reset' });
      else game.session().services.get(Hearth).enqueue({ type: 'act', action: 'wait' });
      game.ticks(1); game.session().scheduler.runFrame(0, 0);
      // Salt reset can reproduce the same first state except for its revision.
      assert.equal(root.output.textContent, ''); assert.equal(root.button.disabled, false);
      root.click(); assert.match(root.output.textContent, /.+/);
      await game.host.restart();
      assert.equal(root.hidden, true); assert.equal(root.handler, undefined);
      game.ticks(1); game.session().scheduler.runFrame(0, 0);
      assert.equal(roots[1]!.output.textContent, '');
    } finally { await game.host.stop(); }
  });
}
