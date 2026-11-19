import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SequenceProviders, SessionControl, sequenceMechanic } from '@bulkhead/sdk';
import type { MechanicSequence, SequenceDefinition, SessionContext } from '@bulkhead/sdk';
import { sequenceProviders } from './helpers/alternate-sequence.ts';
import type { SequenceProviderCase } from './helpers/alternate-sequence.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin } from './helpers/host.ts';

async function fixture(selected: SequenceProviderCase, control = true) {
  const owners: SessionContext[] = [], handles: MechanicSequence[] = [];
  let providerOwner: SessionContext | undefined, playing = true;
  const consumers = ['aaa/sequence-consumer', 'bbb/sequence-consumer'].map(id => codePlugin(id, { activate(ctx) {
    if (control && id.startsWith('aaa/')) ctx.services.provide(SessionControl, { get playing() { return playing; } });
    ctx.instantiate(SequenceProviders, selected.id, (factory, owner) => { providerOwner = owner; return factory.start(owner); });
    owners.push(ctx);
    handles.push(sequenceMechanic(ctx).create(ctx, 'same-id', { steps: ['A', 'B'], rounds: 2 }));
  } }, { roleDependencies: ['sdk/mechanic-sequence'] }));
  const game = createHeadlessGame([selected.entry, ...consumers]);
  try {
    await game.host.apply(headlessPreset({
      plugins: [selected.id, 'aaa/sequence-consumer', 'bbb/sequence-consumer'],
      roles: { 'sdk/mechanic-sequence': selected.id }, options: {},
    }));
  } catch (error) { game.host.stop(); throw error; }
  assert.deepEqual(game.session().registries.ids(SequenceProviders), [selected.id], 'only the selected implementation is installed');
  return { game, owners, handles, provider: () => providerOwner!, pause(value: boolean) { playing = !value; } };
}

const state = (handle: MechanicSequence) => ({ round: handle.round, index: handle.index, complete: handle.complete, revision: handle.revision });
function rejectsUnchanged(handle: MechanicSequence, step: unknown): void {
  const before = state(handle);
  assert.equal(handle.advance(step as string).ok, false);
  assert.deepEqual(state(handle), before);
}

for (const selected of sequenceProviders) {
  test(`sequence accepts a finite ordered trace, rolls rounds atomically and completes once (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const sequence = f.handles[0]!;
      assert.deepEqual(state(sequence), { round: 1, index: 0, complete: false, revision: 0 });
      for (const invalid of ['B', 'missing', '', null, undefined, 0, {}, ['A']]) rejectsUnchanged(sequence, invalid);
      assert.equal(sequence.advance('A').ok, true);
      assert.deepEqual(state(sequence), { round: 1, index: 1, complete: false, revision: 1 });
      rejectsUnchanged(sequence, 'A');
      assert.equal(sequence.advance('B').ok, true);
      assert.deepEqual(state(sequence), { round: 2, index: 0, complete: false, revision: 2 });
      rejectsUnchanged(sequence, 'B');
      assert.equal(sequence.advance('A').ok, true);
      assert.deepEqual(state(sequence), { round: 2, index: 1, complete: false, revision: 3 });
      assert.equal(sequence.advance('B').ok, true);
      assert.deepEqual(state(sequence), { round: 2, index: 2, complete: true, revision: 4 });
      for (const key of ['A', 'B', undefined]) rejectsUnchanged(sequence, key);
      assert.equal(sequence.active, true, 'complete does not dispose the observation handle');
      assert.deepEqual(state(f.handles[1]!), { round: 1, index: 0, complete: false, revision: 0 }, 'same ID in another consumer is isolated');
      f.game.ticks(120);
      assert.equal(f.handles[1]!.revision, 0, 'there is no implicit progression system');
    } finally { f.game.host.stop(); }
  });

  test(`sequence freezes detached definitions and handles, and one-step rounds intentionally repeat (${selected.id})`, async () => {
    const f = await fixture(selected, false);
    try {
      const owner = f.owners[0]!, input = { steps: ['wave/clear'], rounds: 3 };
      const sequence = sequenceMechanic(owner).create(owner, 'single', input);
      input.steps[0] = 'changed'; input.steps.push('extra'); input.rounds = 99;
      assert.deepEqual(sequence.definition, { steps: ['wave/clear'], rounds: 3 });
      assert.ok(Object.isFrozen(sequence) && Object.isFrozen(sequence.definition) && Object.isFrozen(sequence.definition.steps));
      assert.throws(() => { (sequence.definition.steps as string[])[0] = 'tampered'; });
      assert.throws(() => { (sequence as { index: number }).index = 4; });
      for (const expected of [
        { round: 2, index: 0, complete: false, revision: 1 },
        { round: 3, index: 0, complete: false, revision: 2 },
        { round: 3, index: 1, complete: true, revision: 3 },
      ]) {
        assert.equal(sequence.advance('wave/clear').ok, true, 'absent SessionControl permits headless commits');
        assert.deepEqual(state(sequence), expected);
      }
      rejectsUnchanged(sequence, 'wave/clear');
    } finally { f.game.host.stop(); }
  });

  test(`sequence rejects malformed definitions before reserving identity and keeps total math integral (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const owner = f.owners[0]!, factory = sequenceMechanic(owner), baseline = f.game.host.resourceReport();
      const invalid: unknown[] = [null, {}, { steps: [], rounds: 1 }, { steps: 'A', rounds: 1 },
        ...[['A', 'A'], [''], ['  '], ['x'.repeat(129)], ['A', 1], Array(2)].map(steps => ({ steps, rounds: 1 })),
        ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', undefined].map(rounds => ({ steps: ['A'], rounds })),
        { steps: ['A', 'B'], rounds: Number.MAX_SAFE_INTEGER },
      ];
      for (const definition of invalid) {
        assert.throws(() => factory.create(owner, 'invalid-then-valid', definition as SequenceDefinition));
        assert.deepEqual(f.game.host.resourceReport(), baseline, 'failed construction acquires no owned resource');
        factory.create(owner, 'invalid-then-valid', { steps: ['A'], rounds: 1 }).dispose();
        assert.deepEqual(f.game.host.resourceReport(), baseline);
      }
      for (const id of ['', 'x'.repeat(129), null, 3]) {
        assert.throws(() => factory.create(owner, id as string, { steps: ['A'], rounds: 1 }));
        assert.deepEqual(f.game.host.resourceReport(), baseline);
      }
      const large = factory.create(owner, 'large', { steps: ['A'], rounds: Number.MAX_SAFE_INTEGER });
      assert.equal(large.advance('A').ok, true);
      assert.deepEqual(state(large), { round: 2, index: 0, complete: false, revision: 1 });
      const longKey = factory.create(owner, 'long-key', { steps: ['x'.repeat(128)], rounds: 1 });
      assert.equal(longKey.advance('x'.repeat(128)).ok, true);
    } finally { f.game.host.stop(); }
  });

  test(`sequence pause, early release, both owners, ID reuse and restart preserve lifetime invariants (${selected.id})`, async () => {
    const f = await fixture(selected);
    try {
      const owner = f.owners[0]!, factory = sequenceMechanic(owner), sequence = f.handles[0]!, other = f.handles[1]!;
      f.pause(true); rejectsUnchanged(sequence, 'A'); f.pause(false);
      assert.equal(sequence.advance('A').ok, true);
      const baseline = f.game.host.resourceReport();
      assert.throws(() => factory.create(owner, 'same-id', { steps: ['X'], rounds: 1 }), /Duplicate/);
      assert.deepEqual(f.game.host.resourceReport(), baseline);
      for (let i = 0; i < 20; i++) {
        const temporary = factory.create(owner, 'reusable', { steps: ['X'], rounds: 1 });
        temporary.dispose(); temporary.dispose(); rejectsUnchanged(temporary, 'X');
        assert.deepEqual(f.game.host.resourceReport(), baseline, 'early disposal releases both scope registrations');
      }
      sequence.dispose(); sequence.dispose();
      const replacement = factory.create(owner, 'same-id', { steps: ['A'], rounds: 1 });
      rejectsUnchanged(sequence, 'B'); sequence.dispose();
      assert.equal(replacement.active, true); assert.equal(replacement.advance('A').ok, true);
      assert.equal(sequence.active, false);
      owner.scope.dispose();
      assert.equal(replacement.active, false); assert.equal(other.active, true);
      assert.throws(() => factory.create(owner, 'late-owner', { steps: ['A'], rounds: 1 }), /disposed/);
      f.provider().scope.dispose();
      assert.equal(other.active, false); rejectsUnchanged(other, 'A');
      assert.throws(() => factory.create(f.owners[1]!, 'late-provider', { steps: ['A'], rounds: 1 }), /disposed/);
      await f.game.host.restart();
      assert.deepEqual(state(f.handles[2]!), { round: 1, index: 0, complete: false, revision: 0 });
      assert.equal(f.handles[2]!.advance('A').ok, true);
      rejectsUnchanged(sequence, 'B');
      const fresh = f.handles[2]!;
      await f.game.host.stop();
      assert.equal(fresh.active, false); rejectsUnchanged(fresh, 'B');
      assert.equal(f.game.host.resourceReport().sessionScope, 0);
    } finally { f.game.host.stop(); }
  });
}
