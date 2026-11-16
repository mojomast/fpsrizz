import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { definePlugin, createMechanicKit, resourceMechanic, clockMechanic, actionMechanic, objectiveMechanic, SessionControl, MechanicResourcesChanged, MechanicActionCommitted, MechanicObjectiveChanged, ResourcePoolProviders, ResourceMechanicRole } from '../src/sdk/index.ts';
import type { SessionContext, MechanicKit, MechanicKitDefinition, ResourcePool, ResourceTransaction } from '../src/sdk/index.ts';
import type { CatalogEntry } from '../src/kernel/host.ts';
import { resourceProviders, registerResourceConformance } from './helpers/resource-conformance.ts';
import type { ResourceProviderCase } from './helpers/resource-conformance.ts';
import clockManifest from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import actionsManifest from '../src/plugins/mechanics-actions/manifest.json' with { type: 'json' };
import objectivesManifest from '../src/plugins/mechanics-objectives/manifest.json' with { type: 'json' };
import kitsManifest from '../src/plugins/mechanics-kits/manifest.json' with { type: 'json' };

const roles = { 'sdk/mechanic-resources': 'mechanics/resources', 'sdk/mechanic-clock': 'mechanics/clock', 'sdk/mechanic-actions': 'mechanics/actions', 'sdk/mechanic-objectives': 'mechanics/objectives' };
function definition(domain: 'seconds' | 'turns' = 'seconds'): MechanicKitDefinition {
  return { name: 'Fixture', domain, resources: [{ id: 'fuel', label: 'Fuel', initial: 5, max: 10 }, { id: 'ore', label: 'Ore', initial: 0, max: 10 }],
    actions: [{ id: 'work', label: 'Work', cooldown: 2, spend: { fuel: 2 }, gain: { ore: 1 } }, { id: 'free', label: 'Free', cooldown: 0 }],
    objectives: [{ id: 'first', label: 'First', target: 2 }, { id: 'last', label: 'Last', target: 1, requires: ['first'] }] };
}
function catalog(resources: ResourceProviderCase = resourceProviders[0]): CatalogEntry[] {
  return [
    resources.entry,
    { manifest: clockManifest, load: () => import('../src/plugins/mechanics-clock/index.ts') },
    { manifest: actionsManifest, load: () => import('../src/plugins/mechanics-actions/index.ts') },
    { manifest: objectivesManifest, load: () => import('../src/plugins/mechanics-objectives/index.ts') },
    { manifest: kitsManifest, load: () => import('../src/plugins/mechanics-kits/index.ts') },
  ];
}
async function fixture(data: unknown = definition(), resources: ResourceProviderCase = resourceProviders[0]) {
  const owners: SessionContext[] = [], kits: MechanicKit[] = [];
  let playing = true;
  let providerOwner: SessionContext | undefined;
  const entries = catalog(resources), selectedRoles = { ...roles, 'sdk/mechanic-resources': resources.id };
  for (const id of ['aaa/consumer', 'bbb/consumer']) entries.push({ manifest: { schema: 1, id, name: id, version: '1.0.0', sdk: '^2.0.0', kind: 'code', requiresRoles: Object.keys(selectedRoles), roleDependencies: Object.keys(selectedRoles) }, load: async () => ({ default: definePlugin({ activate(ctx) {
    if (id === 'aaa/consumer') ctx.services.provide(SessionControl, { get playing() { return playing; } });
    ctx.instantiate(ResourcePoolProviders, resources.id, (factory, owner) => { providerOwner = owner; return factory.start(owner); });
    owners.push(ctx); kits.push(createMechanicKit(ctx, 'test/kit', 'same-local-id'));
  } }) }) });
  entries.push({ manifest: { schema: 1, id: 'test/content', name: 'Kit', version: '1.0.0', sdk: '^2.0.0', kind: 'content', dependencies: { 'mechanics/kits': '^1.0.0' } }, content: [{ kind: 'mechanic-kit', id: 'test/kit', data }] });
  const game = createHeadlessGame(entries);
  const preset = headlessPreset({ plugins: [...Object.values(selectedRoles), 'mechanics/kits', 'aaa/consumer', 'bbb/consumer', 'test/content'], roles: selectedRoles, options: {} });
  try { await game.host.apply(preset); } catch (error) { game.host.stop(); throw error; }
  return { game, owners, kits, preset, provider: () => providerOwner!, pause(value: boolean) { playing = !value; } };
}

for (const resources of resourceProviders) registerResourceConformance(resources);

for (const resources of resourceProviders) test(`mechanics isolate owner identity, freeze definitions, dispose early, and restart fresh factories (${resources.id})`, async () => {
  const f = await fixture(definition(), resources);
  try {
    const a = f.kits[0]!, b = f.kits[1]!, owner = f.owners[0]!;
    assert.equal(a.resources.transact({ spend: { fuel: 1 } }).ok, true);
    assert.equal(b.resources.get('fuel'), 5);
    assert.notEqual(a.resources.snapshot(), a.resources.snapshot());
    assert.ok(Object.isFrozen(a.definition.actions[0]!.spend));
    const defs = [{ id: 'x', label: 'X', initial: 1, max: 2 }];
    const isolated = resourceMechanic(owner).create(owner, 'copied', defs);
    defs[0]!.max = 99;
    assert.equal(isolated.definitions[0]!.max, 2);
    assert.throws(() => resourceMechanic(owner).create(owner, 'copied', defs), /Duplicate/);
    isolated.dispose(); isolated.dispose();
    assert.equal(isolated.transact({ gain: { x: 1 } }).ok, false);
    resourceMechanic(owner).create(owner, 'copied', defs).dispose();
    owner.scope.dispose();
    assert.equal(a.resources.active, false); assert.equal(a.clock.active, false); assert.equal(a.actions.active, false); assert.equal(a.objectives.active, false);
    assert.equal(b.resources.active, true);
    f.provider().scope.dispose();
    assert.equal(b.resources.active, false);
    assert.equal(b.actions.execute('work').ok, false);
    await f.game.host.restart();
    assert.equal(f.kits[2]!.resources.get('fuel'), 5);
    assert.equal(f.kits[2]!.actions.execute('work').ok, true);
  } finally { f.game.host.stop(); }
});

for (const resources of resourceProviders) test(`resource transactions reject all invalid inputs atomically and gains cannot finance spending (${resources.id})`, async () => {
  const f = await fixture(definition(), resources);
  try {
    const pool = f.kits[0]!.resources;
    const invalid: ResourceTransaction[] = [
      { spend: { fuel: 6 }, gain: { fuel: 6 } }, { spend: { fuel: 1, ore: 1 } },
      { spend: { fuel: 1 }, gain: { ore: 11 } }, { gain: { fuel: NaN } }, { gain: { fuel: Infinity } },
      { spend: { fuel: -1 } }, { gain: { missing: 0 } },
    ];
    for (const transaction of invalid) {
      assert.equal(pool.preview(transaction).ok, false); assert.equal(pool.transact(transaction).ok, false);
      assert.deepEqual(pool.snapshot(), { fuel: 5, ore: 0 }); assert.equal(pool.revision, 0);
    }
    assert.equal(pool.transact({ spend: { fuel: 0.25 }, gain: { ore: 0.5 } }).ok, true);
    assert.equal(pool.get('fuel'), 4.75);
    const saved = pool.snapshot();
    pool.transact({ gain: { fuel: 0.25 } }); assert.equal(saved.fuel, 4.75);
    assert.throws(() => resourceMechanic(f.owners[0]!).create(f.owners[0]!, 'bad', [{ id: 'x', label: 'X', initial: NaN, max: 1 }]));
  } finally { f.game.host.stop(); }
});

for (const resources of resourceProviders) test(`paused and stale handles reject every mutation; stale action previews never authorize spending (${resources.id})`, async () => {
  const f = await fixture(definition(), resources);
  try {
    const k = f.kits[0]!;
    f.pause(true);
    assert.equal(k.resources.transact({ gain: { fuel: 1 } }).ok, false);
    assert.equal(k.clock.advance(1).ok, false); assert.equal(k.actions.execute('work').ok, false); assert.equal(k.objectives.record('first').ok, false);
    f.pause(false);
    assert.equal(k.actions.preview('work').ok, true);
    k.resources.transact({ spend: { fuel: 5 } });
    assert.equal(k.actions.execute('work').ok, false); assert.equal(k.actions.revision, 0); assert.equal(k.actions.remaining('work'), 0);
    k.dispose(); k.dispose();
    assert.equal(k.clock.advance(1).ok, false); assert.equal(k.objectives.record('first').ok, false);
  } finally { f.game.host.stop(); }
});

for (const domain of ['seconds', 'turns'] as const) test(`${domain} cooldowns have exact explicit boundaries and no automatic tick advancement`, async () => {
  const f = await fixture(definition(domain));
  try {
    const k = f.kits[0]!;
    assert.equal(k.actions.execute('work').ok, true);
    f.game.ticks(120); assert.equal(k.clock.now, 0);
    assert.equal(k.clock.advance(domain === 'seconds' ? 1.75 : 1).ok, true);
    assert.equal(k.actions.execute('work').ok, false);
    assert.equal(k.clock.advance(domain === 'seconds' ? 0.25 : 1).ok, true);
    assert.equal(k.actions.remaining('work'), 0); assert.equal(k.actions.execute('work').ok, true);
    for (const amount of [0, -1, NaN, Infinity, ...(domain === 'turns' ? [0.5] : [])]) assert.equal(k.clock.advance(amount).ok, false);
    assert.equal(k.clock.now, 2);
  } finally { f.game.host.stop(); }
});

for (const resources of resourceProviders) test(`immediate resource observers see complete action state and cannot reenter zero-cooldown execution (${resources.id})`, async () => {
  const f = await fixture(definition(), resources);
  try {
    const k = f.kits[0]!, owner = f.owners[0]!;
    let changes = 0, commits = 0;
    owner.events.on(MechanicResourcesChanged, event => {
      changes++;
      assert.equal(k.resources.get('fuel'), 3); assert.equal(k.resources.get('ore'), 1);
      assert.equal(k.actions.remaining('work'), 2); assert.equal(k.actions.revision, 1);
      assert.equal(k.actions.execute('free').ok, false);
      assert.ok(Object.isFrozen(event)); assert.ok(Object.isFrozen(event.values));
      assert.equal(event.owner, owner.pluginId);
    });
    owner.events.on(MechanicActionCommitted, event => { commits++; assert.ok(Object.isFrozen(event)); });
    assert.equal(k.actions.execute('work').ok, true); assert.equal(changes, 1); assert.equal(commits, 1);
  } finally { f.game.host.stop(); }
});

test('substituted pool ordinary rejection rolls cooldown reservation back without identity coupling', async () => {
  const f = await fixture();
  try {
    const owner = f.owners[0]!, k = f.kits[0]!;
    const replacement: ResourcePool = { id: 'alternate', active: true, revision: 0, definitions: k.resources.definitions, get: k.resources.get, snapshot: k.resources.snapshot,
      preview: () => ({ ok: true, reason: '' }), transact: () => ({ ok: false, reason: 'alternate rejection' }), dispose() {} };
    const actions = actionMechanic(owner).create(owner, 'alternate', replacement, k.clock, k.definition.actions);
    assert.equal(actions.execute('work').ok, false); assert.equal(actions.revision, 0); assert.equal(actions.remaining('work'), 0);
    assert.equal(actions.preview('work').ok, true);
    k.clock.dispose(); assert.equal(actions.execute('work').ok, false);
  } finally { f.game.host.stop(); }
});

test('runtime code definitions validate independently of kit loading and copied action costs cannot be altered', async () => {
  const f = await fixture(definition('turns'));
  try {
    const owner = f.owners[0]!, k = f.kits[0]!;
    const actions = actionMechanic(owner), objectives = objectiveMechanic(owner);
    for (const cooldown of [NaN, Infinity, -1, 0.5]) assert.throws(() => actions.create(owner, 'invalid', k.resources, k.clock, [{ id: 'a', label: 'A', cooldown }]));
    assert.throws(() => actions.create(owner, 'invalid', k.resources, k.clock, [{ id: 'a', label: 'A', cooldown: 0, spend: { missing: 1 } }]));
    assert.throws(() => objectives.create(owner, 'invalid', [{ id: 'a', label: 'A', target: 1.5 }]));
    assert.throws(() => objectives.create(owner, 'invalid', [{ id: 'a', label: 'A', target: 1, requires: ['missing'] }]));
    const mutable = [{ id: 'a', label: 'A', cooldown: 1, spend: { fuel: 1 } }];
    const copied = actions.create(owner, 'copied', k.resources, k.clock, mutable);
    mutable[0]!.spend.fuel = 99;
    assert.equal(copied.execute('a').ok, true); assert.equal(k.resources.get('fuel'), 4);
    assert.ok(Object.isFrozen(copied.definitions[0]!.spend));
    for (const amount of [0, -1, 0.5, NaN, Infinity]) assert.equal(k.objectives.record('first', amount, 'valid-later').ok, false);
    assert.equal(k.objectives.record('first', 1, 'valid-later').ok, true);
    k.resources.dispose();
    assert.throws(() => actions.create(owner, 'dead-pool', k.resources, k.clock, mutable), /live compatible/);
  } finally { f.game.host.stop(); }
});

test('all mechanic handles release provider scope registrations on early kit disposal', async () => {
  const f = await fixture();
  try {
    const owner = f.owners[0]!;
    const before = f.game.session().scope.size();
    for (let i = 0; i < 20; i++) {
      const kit = createMechanicKit(owner, 'test/kit', 'transient');
      assert.equal(f.game.session().scope.size(), before + 8);
      kit.dispose(); kit.dispose();
      assert.equal(f.game.session().scope.size(), before);
    }
    const old = f.kits[0]!;
    await f.game.host.restart();
    assert.equal(old.resources.active, false); assert.equal(old.clock.active, false); assert.equal(old.actions.active, false); assert.equal(old.objectives.active, false);
  } finally { f.game.host.stop(); }
});

for (const resources of resourceProviders) test(`partial kit construction releases earlier handles and permits retry (${resources.id})`, async () => {
  const f = await fixture(definition(), resources);
  try {
    const owner = f.owners[0]!, existing = f.kits[0]!;
    const events: unknown[] = [];
    owner.events.on(MechanicResourcesChanged, event => events.push(event));
    const baseline = f.game.session().scope.size();
    // Fail at the final construction step, after resources, clock and actions have acquired ownership.
    const blocker = objectiveMechanic(owner).create(owner, 'partial', definition().objectives);
    const withBlocker = f.game.session().scope.size(), progress = blocker.snapshot();
    for (let i = 0; i < 3; i++) {
      assert.throws(() => createMechanicKit(owner, 'test/kit', 'partial'), /Duplicate/);
      assert.equal(f.game.session().scope.size(), withBlocker);
      assert.equal(blocker.active, true); assert.deepEqual(blocker.snapshot(), progress);
      assert.equal(existing.resources.active, true); assert.equal(existing.clock.active, true);
      assert.deepEqual(existing.resources.snapshot(), { fuel: 5, ore: 0 }); assert.equal(events.length, 0);
    }
    blocker.dispose();
    assert.equal(blocker.active, false); assert.equal(f.game.session().scope.size(), baseline);
    const retry = createMechanicKit(owner, 'test/kit', 'partial');
    assert.equal(retry.resources.revision, 0); assert.equal(retry.clock.now, 0); assert.equal(retry.actions.revision, 0);
    assert.equal(retry.actions.execute('work').ok, true); assert.deepEqual(retry.resources.snapshot(), { fuel: 3, ore: 1 });
    assert.equal(events.length, 1); assert.deepEqual(existing.resources.snapshot(), { fuel: 5, ore: 0 });
    retry.dispose(); retry.dispose();
    assert.equal(f.game.session().scope.size(), baseline);
  } finally { f.game.host.stop(); }
});

test('objectives enforce prerequisites, consume only successful receipts, and complete exactly once', async () => {
  const f = await fixture();
  try {
    const k = f.kits[0]!, owner = f.owners[0]!;
    const completed: string[] = [];
    owner.events.on(MechanicObjectiveChanged, event => { assert.ok(Object.isFrozen(event)); if (event.complete) completed.push(event.objective); });
    assert.equal(k.objectives.record('last', 1, 'reuse').ok, false);
    assert.equal(k.objectives.record('first', 1, 'one').ok, true);
    assert.equal(k.objectives.record('first', 1, 'one').ok, false);
    assert.equal(k.objectives.record('first', 100, 'two').ok, true);
    assert.equal(k.objectives.record('first').ok, false);
    assert.equal(k.objectives.record('last', 1, 'reuse').ok, true);
    assert.equal(k.objectives.complete, true); assert.equal(k.objectives.revision, 3); assert.deepEqual(completed, ['first', 'last']);
    const track = objectiveMechanic(owner).create(owner, 'bounded', [{ id: 'many', label: 'Many', target: 5000 }]);
    for (let i = 0; i < 4096; i++) assert.equal(track.record('many', 1, `receipt-${i}`).ok, true);
    assert.equal(track.record('many', 1, 'new').ok, false); assert.equal(track.record('many', 1, 'receipt-0').ok, false);
    assert.equal(track.snapshot()[0]!.value, 4096);
    assert.throws(() => objectiveMechanic(owner).create(owner, 'cycle', [{ id: 'a', label: 'A', target: 1, requires: ['b'] }, { id: 'b', label: 'B', target: 1, requires: ['a'] }]), /cycle/);
    assert.throws(() => clockMechanic(owner).create(owner, 'bad', 'invalid' as 'turns'));
  } finally { f.game.host.stop(); }
});

test('mechanic-kit rejects unknown fields, invalid references, cycles, fractional turn cooldowns and unbounded content during staging', async () => {
  const cases = [
    { ...definition(), extra: true },
    { ...definition(), resources: [{ id: 'fuel', label: 'Fuel', initial: 11, max: 10 }] },
    { ...definition(), actions: [{ id: 'bad', label: 'Bad', cooldown: 0, spend: { missing: 1 } }] },
    { ...definition('turns'), actions: [{ id: 'bad', label: 'Bad', cooldown: 0.5 }] },
    { ...definition(), objectives: [{ id: 'cycle', label: 'Cycle', target: 1, requires: ['cycle'] }] },
    { ...definition(), actions: Array.from({ length: 129 }, (_, i) => ({ id: `a${i}`, label: 'A', cooldown: 0 })) },
    { ...definition(), resources: [{ id: 'x', label: 'X', initial: NaN, max: 10 }] },
  ];
  for (const data of cases) await assert.rejects(() => fixture(data));
});

test('kit validator rejects selected metadata-only providers without matching factories', async () => {
  const game = createHeadlessGame([...catalog(), { manifest: { schema: 1, id: 'fake/resources', name: 'Fake', version: '1.0.0', sdk: '^2.0.0', kind: 'code' },
    load: async () => ({ default: definePlugin({ register(ctx) { ctx.provideRole(ResourceMechanicRole, 'fake/resources', { name: 'Fake', description: 'No factory' }); } }) }) }]);
  try {
    await assert.rejects(() => game.host.apply(headlessPreset({ plugins: ['mechanics/kits', 'fake/resources'], roles: { 'sdk/mechanic-resources': 'fake/resources' }, options: {} })), /matching factory/);
  } finally { game.host.stop(); }
});
