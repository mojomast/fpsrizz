import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockMechanic, conditionMechanic, SessionControl } from '../src/sdk/index.ts';
import { codePlugin, newHost, presetOf } from './helpers/host.ts';
import clockManifest from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import conditionManifest from '../src/plugins/mechanics-conditions/manifest.json' with { type: 'json' };

async function fixture() {
  const gate = { playing: true };
  const host = newHost([
    { manifest: clockManifest, load: () => import('../src/plugins/mechanics-clock/index.ts') },
    { manifest: conditionManifest, load: () => import('../src/plugins/mechanics-conditions/index.ts') },
    codePlugin('test/condition-user', { activate(ctx) { ctx.services.provide(SessionControl, gate); } }),
  ]);
  await host.apply(presetOf('test/conditions', ['mechanics/clock', 'mechanics/conditions', 'test/condition-user'], { roles: { 'sdk/mechanic-clock': 'mechanics/clock', 'sdk/mechanic-conditions': 'mechanics/conditions' } }));
  const owner = host.session!.contexts.get('test/condition-user')!;
  const clock = clockMechanic(owner).create(owner, 'test/clock', 'turns');
  const provider = conditionMechanic(owner);
  const conditions = provider.create(owner, 'test/conditions', clock);
  return { host, owner, gate, clock, provider, conditions };
}

test('conditions refresh independently, expire at exact clock boundaries and reject paused or invalid mutations', async () => {
  const f = await fixture();
  try {
    assert.equal(f.conditions.apply('player', 'poison', 3).ok, true);
    assert.equal(f.conditions.apply('enemy', 'poison', 2).ok, true);
    f.clock.advance(1);
    assert.equal(f.conditions.apply('player', 'poison', 4).ok, true);
    assert.deepEqual(f.conditions.snapshot(), [{ target: 'player', condition: 'poison', remaining: 4 }, { target: 'enemy', condition: 'poison', remaining: 1 }]);
    assert.equal(f.conditions.apply('player', 'poison', 1.5).ok, false);
    f.gate.playing = false;
    assert.equal(f.conditions.remove('player', 'poison').ok, false);
    assert.equal(f.conditions.apply('player', 'poison', 1).ok, false);
    assert.equal(f.clock.advance(1).ok, false);
    f.gate.playing = true;
    f.clock.advance(1);
    assert.equal(f.conditions.has('enemy', 'poison'), false);
    assert.equal(f.conditions.has('player', 'poison'), true);
    f.clock.advance(3);
    assert.deepEqual(f.conditions.snapshot(), []);
  } finally { f.host.stop(); }
});

test('provider or consumer disposal invalidates conditions and permits no stale mutation', async () => {
  for (const scope of ['provider', 'consumer'] as const) {
    const f = await fixture();
    try {
      f.conditions.apply('a', 'guard', 2);
      assert.throws(() => f.provider.create(f.owner, 'test/conditions', f.clock), /Duplicate live/);
      const dying = scope === 'provider' ? f.host.session!.contexts.get('mechanics/conditions')! : f.owner;
      dying.scope.dispose();
      assert.equal(f.conditions.active, false);
      assert.equal(f.conditions.apply('a', 'guard', 2).ok, false);
      assert.deepEqual(f.conditions.snapshot(), []);
    } finally { f.host.stop(); }
  }
});

test('seconds clocks accept fractional durations and disposing a borrowed clock invalidates the ledger', async () => {
  const f = await fixture();
  try {
    const clock = clockMechanic(f.owner).create(f.owner, 'seconds', 'seconds');
    const effects = f.provider.create(f.owner, 'seconds', clock);
    assert.equal(effects.apply('actor', 'ward', 0.5).ok, true);
    clock.advance(0.25);
    assert.equal(effects.snapshot()[0]!.remaining, 0.25);
    clock.advance(0.25);
    assert.equal(effects.has('actor', 'ward'), false);
    clock.dispose();
    assert.equal(effects.active, false);
    assert.equal(effects.apply('actor', 'ward', 1).ok, false);
    effects.dispose();
  } finally { f.host.stop(); }
});
