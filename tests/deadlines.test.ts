import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry } from '@bulkhead/kernel/host.ts';
import { ClockMechanicRole, PHASES, SDK_COMPAT, SDK_VERSION, SessionControl, clockMechanic, createDeadline } from '@bulkhead/sdk';
import type { MechanicClock, MechanicTimeDomain, SessionContext } from '@bulkhead/sdk';
import clockManifest from '@bulkhead/std/mechanics-clock/manifest.json' with { type: 'json' };

async function fixture() {
  const owners: SessionContext[] = [], gate = { playing: true };
  const consumers: CatalogEntry[] = ['test/deadline-a', 'test/deadline-b'].map(id => ({
    manifest: { schema: 1, id, name: id, version: '1.0.0', sdk: '^2.0.0', kind: 'code', roleDependencies: [ClockMechanicRole.id] },
    load: async () => ({ default: { activate(owner) { owners.push(owner); } } }),
  }));
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) {
    session.services.provide(SessionControl, gate, 'test', scope);
  } });
  assert.deepEqual(host.setCatalog([{ manifest: clockManifest, load: () => import('@bulkhead/std/mechanics-clock/index.ts') }, ...consumers]), []);
  try { await host.apply({ schema: 1, id: 'test/deadlines', name: 'Deadlines', plugins: [clockManifest.id, 'test/deadline-a', 'test/deadline-b'], roles: { [ClockMechanicRole.id]: clockManifest.id } }); }
  catch (error) { host.stop(); throw error; }
  const clock = (domain: MechanicTimeDomain, owner = owners[0]!, id: string = domain) => clockMechanic(owner).create(owner, id, domain);
  return { host, owners, gate, clock };
}

for (const domain of ['seconds', 'turns'] as const) test(`${domain} deadline: explicit arm, exact equality, overshoot, rearm and cancel without advancing a real clock`, async () => {
  const f = await fixture();
  try {
    const clock = f.clock(domain), deadline = createDeadline(f.owners[0]!, clock);
    assert.equal(Object.isFrozen(deadline), true);
    assert.equal(deadline.active, true); assert.equal(deadline.armed, false); assert.equal(deadline.domain, domain);
    assert.equal(deadline.remaining(), 0); assert.equal(deadline.due(), false);
    assert.deepEqual(deadline.arm(2), { ok: true });
    for (let tick = 0; tick < 120; tick++) f.host.session!.scheduler.runTick();
    assert.equal(clock.now, 0); assert.equal(deadline.remaining(), 2); assert.equal(deadline.due(), false);
    const before = domain === 'seconds' ? 1.75 : 1;
    assert.equal(clock.advance(before).ok, true);
    assert.equal(deadline.remaining(), 2 - before); assert.equal(deadline.due(), false);
    assert.equal(clock.advance(2 - before).ok, true);
    assert.equal(deadline.remaining(), 0); assert.equal(deadline.due(), true); assert.equal(deadline.armed, true);
    assert.equal(deadline.due(), true, 'reading due never consumes the deadline');
    assert.deepEqual(deadline.arm(1), { ok: true });
    assert.equal(deadline.remaining(), 1); assert.equal(deadline.due(), false);
    assert.equal(clock.advance(20).ok, true);
    assert.equal(deadline.remaining(), 0); assert.equal(deadline.due(), true, 'overshoot has no implicit recurrence or catch-up');
    assert.deepEqual(deadline.cancel(), { ok: true }); assert.deepEqual(deadline.cancel(), { ok: true });
    assert.equal(deadline.armed, false); assert.equal(deadline.remaining(), 0); assert.equal(deadline.due(), false);
    assert.equal(clock.now, 22);
    assert.deepEqual(deadline.arm(5), { ok: true }); assert.deepEqual(deadline.arm(3), { ok: true });
    assert.equal(deadline.remaining(), 3, 'rearm replaces rather than extends the old deadline');
  } finally { f.host.stop(); }
});

for (const domain of ['seconds', 'turns'] as const) test(`${domain} deadline rejects invalid durations atomically, including zero and unrepresentable endpoints`, async () => {
  const f = await fixture();
  try {
    const owner = f.owners[0]!, clock = f.clock(domain), deadline = createDeadline(owner, clock, 2);
    const invalid = [0, -0, -1, NaN, Infinity, -Infinity, ...(domain === 'turns' ? [0.25, Number.MAX_SAFE_INTEGER + 1] : [])];
    for (const duration of invalid) {
      assert.deepEqual(deadline.arm(duration), { ok: false, code: 'invalid-duration' });
      assert.equal(deadline.remaining(), 2); assert.equal(deadline.armed, true); assert.equal(deadline.due(), false);
      const owned = owner.scope.size();
      assert.throws(() => createDeadline(owner, clock, duration), /duration/);
      assert.equal(owner.scope.size(), owned, 'invalid construction acquires nothing');
    }
    assert.equal(clock.advance(domain === 'seconds' ? 2 ** 53 : Number.MAX_SAFE_INTEGER).ok, true);
    assert.equal(deadline.due(), true);
    assert.deepEqual(deadline.arm(domain === 'seconds' ? 0.5 : 1), { ok: false, code: 'invalid-duration' });
    assert.equal(deadline.due(), true, 'rejected rearm leaves an expired deadline armed');
    if (domain === 'seconds') {
      assert.equal(clock.advance(Number.MAX_VALUE / 2).ok, true);
      assert.deepEqual(deadline.arm(Number.MAX_VALUE), { ok: false, code: 'invalid-duration' });
      const tiny = f.clock('seconds', owner, 'tiny');
      const tinyDeadline = createDeadline(owner, tiny, Number.MIN_VALUE);
      assert.equal(tinyDeadline.remaining(), Number.MIN_VALUE);
      assert.equal(tiny.advance(Number.MIN_VALUE).ok, true); assert.equal(tinyDeadline.due(), true);
    }
  } finally { f.host.stop(); }
});

test('deadline activation may initialize while paused; arm/cancel reject pause and disposed takes precedence', async () => {
  const f = await fixture();
  try {
    f.gate.playing = false;
    const owner = f.owners[0]!, clock = f.clock('turns'), deadline = createDeadline(owner, clock, 3);
    assert.equal(deadline.remaining(), 3); assert.equal(clock.now, 0);
    assert.deepEqual(deadline.arm(0), { ok: false, code: 'paused' });
    assert.deepEqual(deadline.arm(1), { ok: false, code: 'paused' });
    assert.deepEqual(deadline.cancel(), { ok: false, code: 'paused' });
    assert.equal(clock.advance(3).ok, false); assert.equal(deadline.remaining(), 3);
    f.gate.playing = true;
    assert.equal(clock.advance(3).ok, true); assert.equal(deadline.due(), true);
    f.gate.playing = false;
    assert.equal(deadline.due(), true, 'pause does not conceal an already-due observation');
    deadline.dispose(); deadline.dispose();
    assert.deepEqual(deadline.arm(0), { ok: false, code: 'disposed' });
    assert.deepEqual(deadline.cancel(), { ok: false, code: 'disposed' });
    assert.equal(deadline.active, false); assert.equal(deadline.armed, false); assert.equal(deadline.remaining(), 0); assert.equal(deadline.due(), false);
    assert.equal(clock.active, true, 'disposing a deadline never destroys the borrowed clock');
  } finally { f.host.stop(); }
});

test('deadline ownership isolates handles and owners; borrowed clock/provider teardown invalidates reads and writes', async () => {
  const f = await fixture();
  try {
    const [a, b] = f.owners as [SessionContext, SessionContext];
    const clock = f.clock('turns', b), first = createDeadline(a, clock, 1), other = createDeadline(b, clock, 3);
    assert.equal(clock.advance(1).ok, true);
    assert.equal(first.due(), true); assert.equal(other.due(), false); assert.equal(other.remaining(), 2);
    a.scope.dispose();
    assert.equal(first.active, false); assert.equal(first.armed, false); assert.equal(first.due(), false); assert.equal(first.remaining(), 0);
    assert.equal(clock.active, true); assert.equal(other.active, true);
    assert.throws(() => createDeadline(a, clock), /disposed/);
    clock.dispose();
    assert.equal(other.active, false); assert.equal(other.armed, false); assert.equal(other.due(), false); assert.equal(other.remaining(), 0);
    assert.deepEqual(other.arm(1), { ok: false, code: 'disposed' }); assert.deepEqual(other.cancel(), { ok: false, code: 'disposed' });
    assert.throws(() => createDeadline(b, clock), /disposed/);
    other.dispose();
    const replacement = f.clock('turns', b), next = createDeadline(b, replacement, 1);
    assert.equal(replacement.advance(1).ok, true); assert.equal(next.due(), true);
    f.host.session!.contexts.get(clockManifest.id)!.scope.dispose();
    assert.equal(next.active, false); assert.equal(next.remaining(), 0); assert.equal(next.due(), false);
    assert.deepEqual(next.arm(1), { ok: false, code: 'disposed' });
    await f.host.restart();
    const freshClock = f.clock('turns', f.owners[2]!);
    assert.equal(createDeadline(f.owners[2]!, freshClock, 3).remaining(), 3);
    assert.equal(next.active, false);
  } finally { f.host.stop(); }
});

test('early deadline disposal releases its scope entry and accepts structurally borrowed clocks without disposal coupling', async () => {
  const f = await fixture();
  try {
    const owner = f.owners[0]!, real = f.clock('seconds');
    let advances = 0, disposals = 0;
    // Only the public contract is forwarded; the helper cannot assume provider identity or private clock methods.
    const borrowed: MechanicClock = {
      id: 'test/structural', domain: real.domain, get active() { return real.active; }, get now() { return real.now; },
      advance(amount) { advances++; return real.advance(amount); }, dispose() { disposals++; real.dispose(); },
    };
    const owned = owner.scope.size();
    for (let i = 0; i < 20; i++) {
      const deadline = createDeadline(owner, borrowed, 1.5);
      assert.equal(owner.scope.size(), owned + 1);
      assert.equal(deadline.due(), false); assert.equal(deadline.remaining(), 1.5);
      deadline.cancel(); deadline.arm(2); deadline.dispose(); deadline.dispose();
      assert.equal(owner.scope.size(), owned);
    }
    assert.equal(advances, 0); assert.equal(disposals, 0); assert.equal(real.now, 0);
    const last = createDeadline(owner, borrowed, 1.5);
    assert.equal(borrowed.advance(1.5).ok, true); assert.equal(last.due(), true);
    owner.scope.dispose();
    assert.equal(disposals, 0); assert.equal(last.active, false);
  } finally { f.host.stop(); }
});

test('deadline construction rejects incompatible clock state without acquiring ownership', async () => {
  const f = await fixture();
  try {
    const owner = f.owners[0]!, real = f.clock('seconds'), owned = owner.scope.size();
    for (const bad of [
      { ...real, domain: 'frames' as MechanicTimeDomain }, { ...real, now: -1 }, { ...real, now: NaN },
      { ...real, now: Infinity }, { ...real, domain: 'turns' as const, now: 0.5 },
    ]) assert.throws(() => createDeadline(owner, bad));
    assert.equal(owner.scope.size(), owned);
  } finally { f.host.stop(); }
});
