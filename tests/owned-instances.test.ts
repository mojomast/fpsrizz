import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOwnedInstances, defineRegistry, SessionControl } from '@bulkhead/sdk';
import type { SessionContext } from '@bulkhead/sdk';
import { codePlugin, newHost, presetOf } from './helpers/host.ts';

type Instances = ReturnType<typeof createOwnedInstances>;
const Factories = defineRegistry<{ start(provider: SessionContext): Instances }>('test/owned-instance-factories');
const PROVIDER = 'test/instance-provider';
const SECOND = 'test/second-factory';
const CONSUMERS = ['test/consumer-a', 'test/consumer-b'] as const;
const KIND = 'test-instance';

/** Real scopes and lazy, owner-bound factory instantiation, without gameplay definitions or algorithms. */
async function fixture() {
  let starts = 0;
  const host = newHost([
    codePlugin(PROVIDER, { register(ctx) {
      for (const id of [PROVIDER, SECOND]) ctx.register(Factories, id, { start(provider) {
        starts++;
        return createOwnedInstances(provider, KIND);
      } });
    } }),
    ...CONSUMERS.map(id => codePlugin(id, {}, { dependencies: { [PROVIDER]: '^1.0.0' } })),
  ]);
  try { await host.apply(presetOf('test/owned-instances', [PROVIDER, ...CONSUMERS])); }
  catch (error) { host.stop(); throw error; }
  const owner = (index = 0) => host.session!.contexts.get(CONSUMERS[index]!)!;
  const provider = () => host.session!.contexts.get(PROVIDER)!;
  const pool = (consumer = owner(), id = PROVIDER) => consumer.instantiate(Factories, id, (factory, context) => factory.start(context));
  return { host, owner, provider, pool, starts: () => starts };
}

test('one lazy factory isolates equal live IDs by consumer context and rejects duplicates without acquiring resources', async () => {
  const f = await fixture();
  try {
    const a = f.owner(), b = f.owner(1), provider = f.provider();
    const instances = f.pool(a);
    assert.equal(f.pool(b), instances, 'ctx.instantiate shares the factory, not its consumers\' ID namespace');
    assert.equal(f.starts(), 1);
    const baseline = [a.scope.size(), b.scope.size(), provider.scope.size(), f.host.session!.scope.size()];
    const first = instances.acquire(a, 'same'), second = instances.acquire(b, 'same');
    const acquired = [a.scope.size(), b.scope.size(), provider.scope.size(), f.host.session!.scope.size()];
    assert.deepEqual(acquired, baseline.map((value, index) => value + [1, 1, 2, 4][index]!));
    assert.equal(first.active, true); assert.equal(second.active, true);
    for (const consumer of [a, b]) assert.throws(() => instances.acquire(consumer, 'same'), /Duplicate live/);
    assert.deepEqual([a.scope.size(), b.scope.size(), provider.scope.size(), f.host.session!.scope.size()], acquired);
    first.dispose();
    assert.equal(first.active, false); assert.equal(second.active, true);
    assert.throws(() => instances.acquire(b, 'same'), /Duplicate live/);
    instances.acquire(a, 'same').dispose();
    second.dispose();
    assert.deepEqual([a.scope.size(), b.scope.size(), provider.scope.size(), f.host.session!.scope.size()], baseline);
  } finally { f.host.stop(); }
});

test('early release removes both scope entries and a stale lease cannot release a replacement or unrelated ID', async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), provider = f.provider(), instances = f.pool();
    const keep = instances.acquire(owner, 'keep');
    const baseline = [owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()];
    for (let i = 0; i < 20; i++) {
      const old = instances.acquire(owner, 'reuse');
      assert.deepEqual([owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()], baseline.map((n, index) => n + (index === 2 ? 2 : 1)));
      old.dispose(); old.dispose();
      assert.deepEqual([owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()], baseline);
      const replacement = instances.acquire(owner, 'reuse');
      old.dispose();
      assert.equal(old.active, false); assert.equal(replacement.active, true); assert.equal(keep.active, true);
      assert.throws(() => instances.acquire(owner, 'reuse'), /Duplicate live/);
      assert.equal(owner.scope.stats()[owner.pluginId]?.[KIND], 2);
      assert.equal(provider.scope.stats()[provider.pluginId]?.[KIND], 2);
      replacement.dispose();
      assert.deepEqual([owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()], baseline);
    }
    keep.dispose();
    assert.equal(owner.scope.stats()[owner.pluginId]?.[KIND], undefined);
    assert.equal(provider.scope.stats()[provider.pluginId]?.[KIND], undefined);
  } finally { f.host.stop(); }
});

for (const first of ['consumer', 'provider'] as const) test(`${first}-first teardown invalidates leases during abort, before registered cleanup runs`, async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), other = f.owner(1), provider = f.provider(), instances = f.pool();
    const ownerBaseline = owner.scope.size(), otherBaseline = other.scope.size(), providerBaseline = provider.scope.size();
    const lease = instances.acquire(owner, 'same'), sibling = instances.acquire(other, 'same');
    const dying = first === 'consumer' ? owner : provider;
    const counterpart = first === 'consumer' ? provider : owner;
    const observations: { phase: string; active: boolean; sibling: boolean; registrations: number }[] = [];
    let rejectedDuringAbort: unknown;
    dying.signal.addEventListener('abort', () => {
      observations.push({ phase: 'abort', active: lease.active, sibling: sibling.active, registrations: counterpart.scope.size() });
      try { instances.acquire(owner, 'late'); } catch (error) { rejectedDuringAbort = error; }
    }, { once: true });
    // Scope runs this newest disposer before the lease's cleanup registration.
    dying.scope.add(() => {
      observations.push({ phase: 'cleanup', active: lease.active, sibling: sibling.active, registrations: counterpart.scope.size() });
    }, 'test-observer');
    const registrations = counterpart.scope.size();
    dying.scope.dispose();
    assert.deepEqual(observations, ['abort', 'cleanup'].map(phase => ({ phase, active: false, sibling: first === 'consumer', registrations })));
    assert.match(String(rejectedDuringAbort), /disposed scope/);
    assert.equal(dying.signal.aborted, true);
    assert.equal(dying.scope.size(), 0);
    if (first === 'consumer') {
      assert.equal(provider.scope.size(), providerBaseline + 1, 'only the surviving consumer retains a provider entry');
      assert.equal(other.scope.size(), otherBaseline + 1);
      provider.scope.dispose();
    } else {
      assert.equal(owner.scope.size(), ownerBaseline, 'provider teardown unregisters the live consumer entry');
      assert.equal(other.scope.size(), otherBaseline);
      owner.scope.dispose();
    }
    assert.equal(lease.active, false); assert.equal(sibling.active, false);
    assert.equal(other.scope.size(), otherBaseline);
    lease.dispose(); sibling.dispose();
    assert.equal(provider.scope.size(), 0);
  } finally { f.host.stop(); }
});

for (const first of ['consumer', 'provider'] as const) test(`${first} abort can reenter the other scope's teardown without retaining either lease registration`, async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), provider = f.provider(), instances = f.pool();
    const lease = instances.acquire(owner, 'nested');
    const dying = first === 'consumer' ? owner : provider, counterpart = first === 'consumer' ? provider : owner;
    const observations: boolean[] = [];
    dying.signal.addEventListener('abort', () => {
      observations.push(lease.active);
      counterpart.scope.dispose();
      lease.dispose();
      observations.push(lease.active);
    }, { once: true });
    dying.scope.dispose();
    assert.deepEqual(observations, [false, false]);
    assert.equal(owner.signal.aborted, true); assert.equal(provider.signal.aborted, true);
    assert.equal(owner.scope.size(), 0); assert.equal(provider.scope.size(), 0);
    assert.equal(lease.active, false);
    lease.dispose(); dying.scope.dispose(); counterpart.scope.dispose();
    assert.throws(() => instances.acquire(owner, 'nested'), /disposed scope/);
  } finally { f.host.stop(); }
});

test('a provider consuming its own factory still owns exactly two registrations and releases both', async () => {
  const f = await fixture();
  try {
    const provider = f.provider(), instances = f.pool(provider), before = provider.scope.size();
    const lease = instances.acquire(provider, 'self');
    assert.equal(provider.scope.size(), before + 2);
    assert.equal(provider.scope.stats()[provider.pluginId]?.[KIND], 2);
    assert.throws(() => instances.acquire(provider, 'self'), /Duplicate live/);
    lease.dispose(); lease.dispose();
    assert.equal(provider.scope.size(), before);
    const replacement = instances.acquire(provider, 'self');
    lease.dispose();
    assert.equal(replacement.active, true); assert.equal(provider.scope.size(), before + 2);
    let activeAtAbort: boolean | undefined;
    provider.signal.addEventListener('abort', () => { activeAtAbort = replacement.active; }, { once: true });
    provider.scope.dispose();
    assert.equal(activeAtAbort, false); assert.equal(replacement.active, false);
    assert.equal(provider.scope.size(), 0);
    replacement.dispose();
  } finally { f.host.stop(); }
});

test('invalid IDs acquire nothing; valid opaque IDs retain exact spelling and the 128-character boundary', async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), provider = f.provider(), instances = f.pool();
    const baseline = [owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()];
    for (const id of ['', 'x'.repeat(129), undefined, null, 42, {}, ['id']]) {
      assert.throws(() => instances.acquire(owner, id as string), /Instance id/);
      assert.deepEqual([owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()], baseline);
    }
    const ids = ['x'.repeat(128), ' ', 'ID', 'id', '__proto__'];
    const leases = ids.map(id => instances.acquire(owner, id));
    for (const id of ids) assert.throws(() => instances.acquire(owner, id), /Duplicate live/);
    assert.equal(f.host.session!.scope.size(), baseline[2]! + 2 * ids.length);
    for (const lease of leases) lease.dispose();
    assert.deepEqual([owner.scope.size(), provider.scope.size(), f.host.session!.scope.size()], baseline);
  } finally { f.host.stop(); }
});

test('disposed consumers and retained or newly created factories over a disposed provider cannot acquire', async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), other = f.owner(1), provider = f.provider(), instances = f.pool();
    owner.scope.dispose();
    const baseline = f.host.session!.scope.size();
    assert.throws(() => instances.acquire(owner, 'unused'), /disposed scope/);
    assert.throws(() => instances.acquire(owner, ''), /disposed scope/);
    assert.equal(f.host.session!.scope.size(), baseline);
    const surviving = instances.acquire(other, 'unused');
    assert.equal(surviving.active, true);
    provider.scope.dispose();
    const after = f.host.session!.scope.size();
    assert.equal(surviving.active, false);
    assert.throws(() => instances.acquire(other, 'unused'), /disposed scope/);
    assert.throws(() => createOwnedInstances(provider, KIND).acquire(other, 'unused'), /disposed scope/);
    assert.equal(f.host.session!.scope.size(), after);
  } finally { f.host.stop(); }
});

test('separate factory pools have independent namespaces even with identical provider, consumer, kind and ID', async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), provider = f.provider(), a = f.pool(owner), b = f.pool(owner, SECOND);
    assert.notEqual(a, b); assert.equal(f.starts(), 2);
    const baseline = f.host.session!.scope.size();
    const first = a.acquire(owner, 'same'), second = b.acquire(owner, 'same');
    assert.equal(f.host.session!.scope.size(), baseline + 4);
    first.dispose();
    assert.equal(second.active, true);
    assert.throws(() => b.acquire(owner, 'same'), /Duplicate live/);
    const replacement = a.acquire(owner, 'same');
    provider.scope.dispose();
    assert.equal(replacement.active, false); assert.equal(second.active, false);
    assert.equal(f.host.session!.scope.size(), baseline);
  } finally { f.host.stop(); }
});

test('lease acquisition and disposal are available while paused and add no gameplay systems or services', async () => {
  const f = await fixture();
  try {
    const owner = f.owner(), instances = f.pool();
    owner.services.provide(SessionControl, { playing: false });
    const before = f.host.resourceReport(), lease = instances.acquire(owner, 'paused-activation');
    const after = f.host.resourceReport();
    assert.equal(lease.active, true); assert.equal(after.sessionScope, before.sessionScope + 2);
    for (const key of ['entities', 'systems', 'eventHandlers', 'commandHandlers', 'services'] as const) assert.equal(after[key], before[key]);
    f.host.session!.scheduler.runTick();
    assert.equal(lease.active, true, 'ticks do not expire a lifetime lease');
    lease.dispose();
    assert.equal(f.host.resourceReport().sessionScope, before.sessionScope);
  } finally { f.host.stop(); }
});

test('interleaved hosts and restart isolate factories; stale leases and factories cannot affect a fresh session', async () => {
  const a = await fixture();
  try {
    const b = await fixture();
    try {
      const oldOwner = a.owner(), oldPool = a.pool(), otherPool = b.pool();
      const old = oldPool.acquire(oldOwner, 'same'), other = otherPool.acquire(b.owner(), 'same');
      const otherSize = b.host.session!.scope.size();
      assert.equal(oldOwner.pluginId, b.owner().pluginId);
      assert.notEqual(oldOwner, b.owner()); assert.notEqual(oldPool, otherPool);
      await a.host.restart();
      assert.equal(old.active, false); assert.equal(other.active, true);
      assert.equal(b.host.session!.scope.size(), otherSize);
      const owner = a.owner(), freshPool = a.pool();
      assert.notEqual(owner, oldOwner); assert.notEqual(freshPool, oldPool); assert.equal(a.starts(), 2);
      const replacement = freshPool.acquire(owner, 'same');
      old.dispose();
      assert.equal(replacement.active, true);
      assert.throws(() => oldPool.acquire(owner, 'same'), /disposed scope/);
      assert.throws(() => freshPool.acquire(oldOwner, 'same'), /disposed scope/);
      assert.throws(() => freshPool.acquire(owner, 'same'), /Duplicate live/);
      a.host.stop();
      assert.equal(replacement.active, false); assert.equal(other.active, true);
      assert.equal(a.host.resourceReport().sessionScope, 0);
      other.dispose();
      assert.equal(b.host.session!.scope.size(), otherSize - 2);
    } finally { b.host.stop(); }
    assert.equal(b.host.resourceReport().sessionScope, 0);
  } finally { a.host.stop(); }
});
