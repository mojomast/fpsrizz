import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost, HostError } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry } from '@bulkhead/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION, SessionControl, ResourceMechanicRole, ResourcePoolProviders, MechanicResourcesChanged, resourceMechanic } from '@bulkhead/sdk';
import type { ResourceAmounts, ResourceDefinition, ResourcePool, ResourceTransaction } from '@bulkhead/sdk';
import resourcesManifest from '@bulkhead/std/mechanics-resources/manifest.json' with { type: 'json' };
import { ALTERNATE, alternateEntry } from './alternate-resources.ts';

export interface ResourceProviderCase { readonly id: string; readonly entry: CatalogEntry }
export const resourceProviders: readonly [ResourceProviderCase, ResourceProviderCase] = [
  { id: resourcesManifest.id, entry: { manifest: resourcesManifest, load: () => import('@bulkhead/std/mechanics-resources/index.ts') } },
  { id: ALTERNATE, entry: alternateEntry },
];

interface ResourceReceipt { owner: string; instance: string; reason: string; revision: number; values: ResourceAmounts }
const ownerIds = ['a-test/owner', 'b-test/owner'] as const;
const definitions = (): ResourceDefinition[] => [
  { id: 'fuel', label: 'Fuel', initial: 5, max: 10 }, { id: 'ore', label: 'Ore', initial: 0, max: 10 },
];

/** Real registration, role selection, activation and owner scopes; no fake SessionContext or direct factory calls. */
async function fixture(candidate: ResourceProviderCase, options: { control?: boolean; playing?: boolean; selected?: boolean } = {}) {
  const events: ResourceReceipt[] = [], gate = { playing: options.playing ?? true };
  const selected = options.selected ?? true;
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) {
    session.events.on(MechanicResourcesChanged, event => events.push(event), 'test', scope);
    if (options.control) session.services.provide(SessionControl, gate, 'test', scope);
  } });
  const consumers: CatalogEntry[] = ownerIds.map(id => ({
    manifest: { schema: 1, id, name: id, version: '1.0.0', sdk: '^2.0.0', kind: 'code', roleDependencies: selected ? [ResourceMechanicRole.id] : [] },
    load: async () => ({ default: { activate(ctx) { if (selected) resourceMechanic(ctx); } } }),
  }));
  const preset = { schema: 1, id: 'test/resource-conformance', name: 'Resource conformance', plugins: [candidate.id, ...ownerIds], roles: selected ? { [ResourceMechanicRole.id]: candidate.id } : {} };
  try {
    assert.deepEqual(host.setCatalog([candidate.entry, ...consumers]), []);
    const session = await host.apply(preset);
    assert.deepEqual(session.registries.ids(ResourcePoolProviders), [candidate.id]);
  } catch (error) { host.stop(); throw error; }
  const owner = (index = 0) => host.session!.contexts.get(ownerIds[index]!)!;
  return { host, events, gate, preset, owner, provider: () => resourceMechanic(owner()),
    create: (id = 'wallet', defs = definitions()) => resourceMechanic(owner()).create(owner(), id, defs) };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
function rejectsUnchanged(f: Fixture, pool: ResourcePool, transaction: ResourceTransaction) {
  const before = pool.snapshot(), revision = pool.revision, receipts = f.events.length;
  assert.equal(pool.preview(transaction).ok, false);
  assert.equal(pool.transact(transaction).ok, false);
  assert.deepEqual(pool.snapshot(), before); assert.equal(pool.revision, revision); assert.equal(f.events.length, receipts);
}

/** The same hand-derived public-contract oracles apply to any selected resource implementation. */
export function registerResourceConformance(candidate: ResourceProviderCase) {
  const check = (name: string, run: (f: Fixture) => void | Promise<void>, options: Parameters<typeof fixture>[1] = {}) => {
    test(`${candidate.id} resource contract: ${name}`, async () => {
      const f = await fixture(candidate, options);
      try { await run(f); } finally { f.host.stop(); }
      assert.equal(f.host.resourceReport().sessionScope, 0);
    });
  };

  check('pre-gain affordability, whole-transaction rejection and finite boundaries', f => {
    const pool = f.create();
    for (const key of ['unknown', 'constructor', 'toString']) assert.equal(pool.get(key), 0);
    for (const transaction of [
      { spend: { fuel: 6 }, gain: { fuel: 6 } }, // Net zero is still unaffordable.
      { spend: { fuel: 1, ore: 1 } }, // An earlier legal debit must not survive.
      { spend: { fuel: 1 }, gain: { ore: 11 } }, // No clamping or partial debit on overflow.
      { spend: { unknown: 0 } }, { gain: { unknown: 0 } },
      ...[NaN, Infinity, -Infinity, -0.25].flatMap(amount => [
        { spend: { fuel: amount } }, { spend: { fuel: 1 }, gain: { ore: amount } },
      ]),
    ] as ResourceTransaction[]) rejectsUnchanged(f, pool, transaction);
    for (const malformed of [null, [], { extra: true }, { spend: null }, { spend: { fuel: 1 }, gain: [] }, { gain: { ore: '1' } }]) {
      rejectsUnchanged(f, pool, malformed as unknown as ResourceTransaction);
    }
    assert.deepEqual(pool.snapshot(), { fuel: 5, ore: 0 });
    // Spending makes room for a credit; maximum applies after the debit, not before it.
    assert.equal(pool.transact({ spend: { fuel: 5 }, gain: { fuel: 10 } }).ok, true);
    assert.deepEqual(pool.snapshot(), { fuel: 10, ore: 0 }); assert.equal(pool.revision, 1);
    assert.equal(pool.transact({ spend: { fuel: 10 }, gain: { ore: 0.5 } }).ok, true);
    assert.deepEqual(pool.snapshot(), { fuel: 0, ore: 0.5 }); assert.equal(pool.revision, 2);
    rejectsUnchanged(f, pool, { spend: { fuel: 0.25 }, gain: { fuel: 0.25 } });
    const huge = f.create('finite', [{ id: 'large', label: 'Large', initial: Number.MAX_VALUE, max: Number.MAX_VALUE }]);
    rejectsUnchanged(f, huge, { gain: { large: Number.MAX_VALUE } }); // Finite operands can overflow arithmetic.
    assert.equal(huge.transact({ spend: { large: Number.MAX_VALUE }, gain: { large: Number.MAX_VALUE } }).ok, true);
    assert.equal(huge.get('large'), Number.MAX_VALUE);
    const zero = f.create('zero-capacity', [{ id: 'zero', label: 'Zero', initial: 0, max: 0 }]);
    rejectsUnchanged(f, zero, { gain: { zero: Number.MIN_VALUE } });
    assert.equal(zero.transact({ spend: { zero: 0 }, gain: { zero: 0 } }).ok, true);
    assert.deepEqual(zero.snapshot(), { zero: 0 });
    const fractional = f.create('fractional-bounds', [{ id: 'charge', label: 'Charge', initial: 0.5, max: 1.5 }]);
    assert.equal(fractional.transact({ spend: { charge: 0.25 }, gain: { charge: 1.25 } }).ok, true);
    assert.equal(fractional.get('charge'), 1.5); rejectsUnchanged(f, fractional, { gain: { charge: 0.25 } });
  });

  check('preview is pure and stale previews never authorize a later transaction', f => {
    const pool = f.create(), transaction = { spend: { fuel: 4 }, gain: { ore: 2 } };
    const before = pool.snapshot();
    for (let i = 0; i < 3; i++) assert.equal(pool.preview(transaction).ok, true);
    assert.deepEqual(transaction, { spend: { fuel: 4 }, gain: { ore: 2 } });
    assert.deepEqual(pool.snapshot(), before); assert.equal(pool.revision, 0); assert.equal(f.events.length, 0);
    assert.equal(pool.transact({ spend: { fuel: 2 } }, 'intervening-debit').ok, true);
    rejectsUnchanged(f, pool, transaction);
    assert.deepEqual(pool.snapshot(), { fuel: 3, ore: 0 }); assert.equal(pool.revision, 1);
    transaction.spend.fuel = 1;
    assert.equal(pool.preview(transaction).ok, true);
    transaction.gain.ore = 11; // Preview does not authorize an earlier version of the input either.
    rejectsUnchanged(f, pool, transaction);
    transaction.gain.ore = 2;
    assert.equal(pool.transact(transaction).ok, true);
    transaction.spend.fuel = 99; transaction.gain.ore = 99;
    assert.deepEqual(pool.snapshot(), { fuel: 2, ore: 2 }); assert.equal(pool.revision, 2); assert.equal(f.events.length, 2);
    assert.deepEqual(before, { fuel: 5, ore: 0 });
  });

  check('empty commits advance revisions and publish immutable receipts with bounded reasons', f => {
    const pool = f.create();
    f.owner().events.on(MechanicResourcesChanged, event => {
      assert.equal(event.revision, pool.revision); assert.deepEqual(event.values, pool.snapshot());
      assert.ok(Object.isFrozen(event)); assert.ok(Object.isFrozen(event.values));
    });
    assert.equal(pool.transact({}).ok, true);
    assert.equal(pool.transact({ spend: {}, gain: {} }, 'r'.repeat(256)).ok, true);
    assert.equal(pool.transact({ spend: { fuel: 0 }, gain: { ore: 0 } }, 'zero').ok, true);
    assert.equal(pool.revision, 3);
    assert.deepEqual(f.events, [
      { owner: ownerIds[0], instance: 'wallet', revision: 1, reason: '', values: { fuel: 5, ore: 0 } },
      { owner: ownerIds[0], instance: 'wallet', revision: 2, reason: 'r'.repeat(256), values: { fuel: 5, ore: 0 } },
      { owner: ownerIds[0], instance: 'wallet', revision: 3, reason: 'zero', values: { fuel: 5, ore: 0 } },
    ]);
    for (const reason of ['r'.repeat(257), 7 as unknown as string]) {
      assert.equal(pool.transact({ spend: { fuel: 1 } }, reason).ok, false);
      assert.deepEqual(pool.snapshot(), { fuel: 5, ore: 0 }); assert.equal(pool.revision, 3); assert.equal(f.events.length, 3);
    }
    assert.equal(pool.transact({ spend: { fuel: 1 } }, 'later').ok, true);
    assert.deepEqual(f.events[0]!.values, { fuel: 5, ore: 0 }); assert.equal(f.events[0]!.revision, 1);
    assert.deepEqual(f.events[3], { owner: ownerIds[0], instance: 'wallet', revision: 4, reason: 'later', values: { fuel: 4, ore: 0 } });
  });

  check('definitions and snapshots are copied, frozen and readable after disposal', f => {
    const input = [{ id: 'fuel', label: 'Fuel', initial: 5, max: 10 }], pool = f.create('copied', input);
    assert.notEqual(pool.definitions, input); assert.notEqual(pool.definitions[0], input[0]);
    assert.ok(Object.isFrozen(pool.definitions)); assert.ok(Object.isFrozen(pool.definitions[0]));
    input[0]!.id = 'renamed'; input[0]!.label = 'Changed'; input[0]!.initial = 9; input[0]!.max = 99;
    input.push({ id: 'extra', label: 'Extra', initial: 1, max: 1 });
    assert.deepEqual(pool.definitions, [{ id: 'fuel', label: 'Fuel', initial: 5, max: 10 }]);
    const saved = pool.snapshot();
    assert.notEqual(saved, pool.snapshot()); assert.ok(Object.isFrozen(saved));
    assert.throws(() => { (saved as Record<string, number>).fuel = 999; });
    rejectsUnchanged(f, pool, { gain: { fuel: 6 } }); // Caller mutation did not raise the maximum.
    assert.equal(pool.transact({ spend: { fuel: 0.25 } }).ok, true);
    assert.deepEqual(saved, { fuel: 5 }); assert.deepEqual(pool.snapshot(), { fuel: 4.75 });
    pool.dispose();
    assert.deepEqual(pool.snapshot(), { fuel: 4.75 }); assert.equal(pool.get('fuel'), 4.75);
    assert.deepEqual(pool.definitions, [{ id: 'fuel', label: 'Fuel', initial: 5, max: 10 }]);
    rejectsUnchanged(f, pool, {});
  });

  check('runtime definition bounds reject without retaining IDs or ownership', f => {
    const good = { id: 'fuel', label: 'Fuel', initial: 5, max: 10 };
    const invalid: ResourceDefinition[][] = [
      [], Array.from({ length: 65 }, (_, i) => ({ ...good, id: `r${i}` })), [good, good],
      ...['', 'UPPER', 'a'.repeat(65)].map(id => [{ ...good, id }]),
      ...['', '   ', 'x'.repeat(121)].map(label => [{ ...good, label }]),
      ...[NaN, Infinity, -Infinity, -1, 11].map(initial => [{ ...good, initial }]),
      ...[NaN, Infinity, -Infinity, -1, 4].map(max => [{ ...good, max }]),
    ];
    const baseline = f.host.session!.scope.size();
    for (const input of invalid) {
      assert.throws(() => f.create('retry', input));
      assert.equal(f.host.session!.scope.size(), baseline); assert.equal(f.events.length, 0);
    }
    for (const id of ['', 'i'.repeat(129)]) assert.throws(() => f.create(id));
    const retry = f.create('retry'); assert.equal(retry.get('fuel'), 5); retry.dispose();
    const maximum = f.create('i'.repeat(128), Array.from({ length: 64 }, (_, i) => ({
      id: i === 0 ? 'a'.repeat(64) : `r${i}`, label: 'x'.repeat(120), initial: 0, max: 0,
    })));
    assert.equal(maximum.definitions.length, 64); assert.equal(Object.keys(maximum.snapshot()).length, 64);
    maximum.dispose(); f.create('i').dispose();
    assert.equal(f.host.session!.scope.size(), baseline);
  });

  check('live IDs are owner-local and early disposal permits reuse without stale writes', f => {
    const provider = f.provider(), a = f.owner(), b = f.owner(1), baseline = f.host.session!.scope.size();
    const pool = provider.create(a, 'same', definitions()), other = provider.create(b, 'same', definitions());
    const sibling = provider.create(a, 'sibling', definitions());
    assert.throws(() => provider.create(a, 'same', definitions()), /Duplicate/);
    assert.equal(pool.transact({ spend: { fuel: 2 } }).ok, true);
    assert.deepEqual(other.snapshot(), { fuel: 5, ore: 0 }); assert.deepEqual(sibling.snapshot(), { fuel: 5, ore: 0 });
    pool.dispose(); pool.dispose();
    const fresh = provider.create(a, 'same', definitions());
    pool.dispose(); rejectsUnchanged(f, pool, { gain: { fuel: 1 } });
    assert.equal(pool.get('fuel'), 3); assert.equal(pool.revision, 1);
    assert.equal(fresh.active, true); assert.equal(fresh.get('fuel'), 5); assert.equal(fresh.revision, 0);
    assert.throws(() => provider.create(a, 'same', definitions()), /Duplicate/);
    for (const handle of [fresh, sibling, other]) handle.dispose();
    assert.equal(f.host.session!.scope.size(), baseline);
    for (let i = 0; i < 20; i++) {
      const transient = f.create('same'); transient.dispose(); transient.dispose();
      assert.equal(f.host.session!.scope.size(), baseline, 'early release returns to this provider\'s own baseline');
    }
  });

  check('paused creation is allowed but previews and writes reject until resume', f => {
    const pool = f.create();
    assert.equal(pool.active, true); assert.deepEqual(pool.snapshot(), { fuel: 5, ore: 0 });
    rejectsUnchanged(f, pool, {}); rejectsUnchanged(f, pool, { spend: { fuel: 1 } });
    f.gate.playing = true;
    assert.equal(pool.preview({ spend: { fuel: 1 } }).ok, true);
    f.gate.playing = false; rejectsUnchanged(f, pool, { spend: { fuel: 1 } });
    f.gate.playing = true;
    assert.equal(pool.transact({ spend: { fuel: 1 } }).ok, true);
    assert.deepEqual(pool.snapshot(), { fuel: 4, ore: 0 }); assert.equal(pool.revision, 1); assert.equal(f.events.length, 1);
    f.gate.playing = false; pool.dispose();
    const fresh = f.create(); assert.equal(fresh.active, true); assert.equal(fresh.revision, 0);
    rejectsUnchanged(f, fresh, {});
  }, { control: true, playing: false });

  check('consumer and provider lifetimes invalidate handles and restart creates fresh factories', async f => {
    assert.equal(f.owner().services.tryGet(SessionControl), undefined, 'headless mutation needs no optional pause service');
    const a = f.owner(), b = f.owner(1), provider = f.provider();
    const pool = provider.create(a, 'same', definitions()), sibling = provider.create(a, 'sibling', definitions());
    const other = provider.create(b, 'same', definitions());
    assert.equal(pool.transact({ spend: { fuel: 2 } }).ok, true);
    a.scope.dispose();
    assert.equal(pool.active, false); assert.equal(sibling.active, false); assert.equal(other.active, true);
    rejectsUnchanged(f, pool, {}); rejectsUnchanged(f, sibling, {});
    assert.throws(() => provider.create(a, 'new', definitions()));
    assert.equal(other.transact({ gain: { ore: 1 } }).ok, true);
    f.host.session!.contexts.get(candidate.id)!.scope.dispose();
    assert.equal(other.active, false); rejectsUnchanged(f, other, {});
    assert.throws(() => provider.create(b, 'new', definitions()));
    assert.deepEqual(other.snapshot(), { fuel: 5, ore: 1 });
    await f.host.restart();
    const fresh = f.create('same');
    assert.notEqual(f.provider(), provider); assert.notEqual(f.owner(), a);
    assert.throws(() => provider.create(f.owner(), 'new', definitions()), 'retained factory cannot attach to a new session');
    rejectsUnchanged(f, pool, {}); rejectsUnchanged(f, other, {});
    pool.dispose(); other.dispose();
    assert.equal(fresh.active, true); assert.deepEqual(fresh.snapshot(), { fuel: 5, ore: 0 }); assert.equal(fresh.revision, 0);
    assert.equal(fresh.transact({ spend: { fuel: 1 } }).ok, true);
    assert.deepEqual(f.events.map(event => [event.owner, event.revision]), [[ownerIds[0], 1], [ownerIds[1], 1], [ownerIds[0], 1]]);
  });

  check('fixed-system receipts retain each commit while queries see the settled state', f => {
    const pool = f.create(), observations: ResourceAmounts[] = [];
    f.owner().events.on(MechanicResourcesChanged, () => observations.push(pool.snapshot()));
    f.owner().systems.add({ id: 'test/resource-commits', phase: 'rules', update() {
      assert.equal(pool.transact({ spend: { fuel: 1 } }, 'first').ok, true);
      assert.equal(pool.transact({ gain: { ore: 2 } }, 'second').ok, true);
      assert.equal(f.events.length, 0, 'fixed-system notifications wait for the system to return');
    } });
    f.host.session!.scheduler.runTick();
    assert.equal(f.host.session!.state, 'running');
    assert.deepEqual(f.events.map(event => [event.revision, event.reason, event.values]), [
      [1, 'first', { fuel: 4, ore: 0 }], [2, 'second', { fuel: 4, ore: 2 }],
    ]);
    assert.deepEqual(observations, [{ fuel: 4, ore: 2 }, { fuel: 4, ore: 2 }]);
  });

  check('missing role or enabled provider never silently falls back', async f => {
    const pool = f.create(), session = f.host.session;
    for (const preset of [
      { ...f.preset, roles: {} },
      { ...f.preset, plugins: [...ownerIds] },
    ]) {
      await assert.rejects(() => f.host.apply(preset), (error: unknown) => error instanceof HostError && error.stage === 'validate');
      assert.equal(f.host.session, session); assert.equal(pool.active, true);
      assert.deepEqual(pool.snapshot(), { fuel: 5, ore: 0 }); assert.equal(f.events.length, 0);
    }
    const unselected = await fixture(candidate, { selected: false });
    try { assert.throws(() => resourceMechanic(unselected.owner()), /Select sdk\/mechanic-resources/); }
    finally { unselected.host.stop(); }
  });

  check('interleaved hosts isolate identities, pause, receipts, restart and teardown', async left => {
    const right = await fixture(candidate, { control: true });
    try {
      const a = left.create('same'), b = right.create('same');
      assert.equal(a.transact({ spend: { fuel: 2 } }, 'left').ok, true);
      assert.equal(b.transact({ gain: { ore: 1 } }, 'right').ok, true);
      left.gate.playing = false; rejectsUnchanged(left, a, {});
      assert.equal(b.transact({ spend: { fuel: 1 } }, 'right-again').ok, true);
      assert.deepEqual(a.snapshot(), { fuel: 3, ore: 0 }); assert.deepEqual(b.snapshot(), { fuel: 4, ore: 1 });
      assert.deepEqual(left.events.map(e => e.reason), ['left']); assert.deepEqual(right.events.map(e => e.reason), ['right', 'right-again']);
      left.gate.playing = true; await left.host.restart();
      assert.equal(a.active, false); assert.equal(b.active, true);
      const fresh = left.create('same'); assert.equal(fresh.get('fuel'), 5); assert.equal(fresh.revision, 0);
      rejectsUnchanged(left, a, { gain: { fuel: 1 } });
      assert.equal(fresh.transact({ gain: { ore: 3 } }, 'new-left').ok, true);
      right.host.stop();
      assert.equal(b.active, false); rejectsUnchanged(right, b, {});
      assert.equal(fresh.active, true); assert.deepEqual(fresh.snapshot(), { fuel: 5, ore: 3 });
      assert.deepEqual(left.events.map(e => [e.reason, e.revision]), [['left', 1], ['new-left', 1]]);
      assert.deepEqual(right.events.map(e => e.revision), [1, 2]);
    } finally { right.host.stop(); }
    assert.equal(right.host.resourceReport().sessionScope, 0);
  }, { control: true });
}
