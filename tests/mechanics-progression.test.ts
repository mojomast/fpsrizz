import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProgressionProviders, SessionControl, progressionMechanic } from '../src/sdk/index.ts';
import type { MechanicProgression, ProgressionDefinition, SessionContext } from '../src/sdk/index.ts';
import { progressionProviders } from './helpers/alternate-progression.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin } from './helpers/host.ts';

async function fixture(selected: (typeof progressionProviders)[number]) {
  let playing = true;
  const owners: SessionContext[] = [], handles: MechanicProgression[] = [];
  let providerOwner: SessionContext | undefined;
  const consumer = codePlugin('test/progression-consumer', { activate(ctx) {
    ctx.services.provide(SessionControl, { get playing() { return playing; } });
    ctx.instantiate(ProgressionProviders, selected.id, (factory, owner) => { providerOwner = owner; return factory.start(owner); });
    owners.push(ctx);
    handles.push(progressionMechanic(ctx).create(ctx, 'xp', { startLevel: 1, baseXp: 30, growth: 20, maxLevel: 4 }));
  } }, { roleDependencies: ['sdk/mechanic-progression'] });
  const game = createHeadlessGame([selected.entry, consumer]);
  try {
    await game.host.apply(headlessPreset({
      plugins: [selected.id, 'test/progression-consumer'],
      roles: { 'sdk/mechanic-progression': selected.id }, options: {},
    }));
  } catch (error) { game.host.stop(); throw error; }
  return { game, owners, handles, provider: () => providerOwner!, pause(value: boolean) { playing = !value; } };
}

const snapshot = (p: MechanicProgression) => ({
  level: p.level, xp: p.xp, next: p.xpToNext, total: p.totalXp, pending: p.pending, revision: p.revision,
});

for (const selected of progressionProviders) {
  test(`progression completes levels atomically, queues rewards and honours the cap (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const p = f.handles[0]!;
      assert.deepEqual(snapshot(p), { level: 1, xp: 0, next: 30, total: 0, pending: 0, revision: 0 });
      assert.deepEqual(p.grant(10), { ok: true, reason: '', levels: 0 });
      assert.deepEqual(snapshot(p), { level: 1, xp: 10, next: 30, total: 10, pending: 0, revision: 1 });
      f.pause(true);
      const paused = snapshot(p);
      assert.equal(p.grant(25).ok, false);
      assert.equal(p.consumeLevel().ok, false);
      assert.deepEqual(snapshot(p), paused);
      f.pause(false);
      assert.deepEqual(p.grant(25), { ok: true, reason: '', levels: 1 });
      assert.deepEqual(snapshot(p), { level: 2, xp: 5, next: 50, total: 35, pending: 1, revision: 2 });
      assert.equal(p.consumeLevel().ok, true);
      assert.deepEqual(snapshot(p), { level: 2, xp: 5, next: 50, total: 35, pending: 0, revision: 3 });
      const noReward = snapshot(p);
      assert.equal(p.consumeLevel().ok, false);
      assert.deepEqual(snapshot(p), noReward);
      assert.equal(p.grant(75).levels, 1);
      assert.deepEqual(snapshot(p), { level: 3, xp: 30, next: 70, total: 110, pending: 1, revision: 4 });
      assert.equal(p.grant(45).levels, 1);
      assert.deepEqual(snapshot(p), { level: 4, xp: 5, next: 90, total: 155, pending: 2, revision: 5 });
      const atCap = p.grant(200);
      assert.deepEqual(atCap, { ok: true, reason: '', levels: 0 });
      assert.equal(p.level, 4); assert.equal(p.pending, 2); assert.equal(p.xp, 90);
      assert.equal(p.consumeLevel().ok, true); assert.equal(p.consumeLevel().ok, true);
      assert.equal(p.pending, 0); assert.equal(p.consumeLevel().ok, false);
      for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null]) {
        const before = snapshot(p);
        assert.equal(p.grant(bad as number).ok, false);
        assert.deepEqual(snapshot(p), before);
      }
    } finally { f.game.host.stop(); }
  });

  test(`progression can complete several levels from one grant and freezes its definition (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const owner = f.owners[0]!, factory = progressionMechanic(owner);
      const input = { startLevel: 1, baseXp: 10, growth: 0, maxLevel: 3 };
      const p = factory.create(owner, 'burst', input);
      input.baseXp = 999;
      assert.equal(p.definition.baseXp, 10);
      assert.ok(Object.isFrozen(p) && Object.isFrozen(p.definition));
      assert.throws(() => { (p.definition as { baseXp: number }).baseXp = 1; });
      assert.deepEqual(p.grant(35), { ok: true, reason: '', levels: 2 });
      assert.deepEqual(snapshot(p), { level: 3, xp: 10, next: 10, total: 35, pending: 2, revision: 1 });
      assert.equal(snapshot(f.handles[0]!).level, 1, 'instance state is isolated');
    } finally { f.game.host.stop(); }
  });

  test(`progression rejects malformed definitions without reserving identity or leaking ownership (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const owner = f.owners[0]!, factory = progressionMechanic(owner), baseline = f.game.host.resourceReport();
      const invalid: unknown[] = [null, {}, { startLevel: 0, baseXp: 1, growth: 0 }, { startLevel: 1, baseXp: 0, growth: 0 },
        { startLevel: 1, baseXp: 1, growth: -1 }, { startLevel: 2, baseXp: 1, growth: 0, maxLevel: 1 },
        { startLevel: 1.5, baseXp: 1, growth: 0 }, { startLevel: 1, baseXp: 1, growth: 0, maxLevel: 10001 }];
      for (const definition of invalid) {
        assert.throws(() => factory.create(owner, 'invalid', definition as ProgressionDefinition));
        assert.deepEqual(f.game.host.resourceReport(), baseline);
      }
      assert.throws(() => factory.create(owner, 'xp', { startLevel: 1, baseXp: 1, growth: 0 }));
      const reusable = factory.create(owner, 'reusable', { startLevel: 1, baseXp: 1, growth: 0 });
      reusable.dispose(); reusable.dispose();
      assert.deepEqual(f.game.host.resourceReport(), baseline);
      factory.create(owner, 'reusable', { startLevel: 1, baseXp: 1, growth: 0 }).dispose();
    } finally { f.game.host.stop(); }
  });

  test(`progression ownership releases through either scope and restart creates a fresh ledger (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const first = f.handles[0]!, other = await (async () => {
        const owner = f.owners[0]!, factory = progressionMechanic(owner);
        return factory.create(owner, 'other', { startLevel: 1, baseXp: 5, growth: 0 });
      })();
      assert.equal(first.grant(30).ok, true);
      first.dispose(); first.dispose();
      assert.equal(first.active, false); assert.equal(first.grant(5).ok, false);
      assert.equal(other.active, true); assert.equal(other.grant(5).ok, true);
      f.owners[0]!.scope.dispose();
      assert.equal(other.active, false);
      await f.game.host.restart();
      const fresh = f.handles[1]!;
      assert.deepEqual(snapshot(fresh), { level: 1, xp: 0, next: 30, total: 0, pending: 0, revision: 0 });
      assert.equal(fresh.grant(30).ok, true);
      f.provider().scope.dispose();
      assert.equal(fresh.active, false); assert.equal(fresh.grant(1).ok, false);
    } finally { f.game.host.stop(); }
  });
}
