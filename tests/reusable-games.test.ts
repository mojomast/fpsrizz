import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost, HostError } from '@bulkhead/kernel/host.ts';
import type { CatalogEntry, Session } from '@bulkhead/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION, SessionControl, ResourceMechanicRole, ResourcePoolProviders, MechanicResourcesChanged, MechanicActionCommitted, MechanicObjectiveChanged, resourceMechanic } from '@bulkhead/sdk';
import { Ember } from '../games/ember/contracts/ember.ts';
import { Verdant } from '../games/verdant/contracts/verdant.ts';
import { Sky } from '../games/sky/contracts/sky.ts';
import type { ResourceTransaction, ResourcePool, ResourceAmounts, SessionContext } from '@bulkhead/sdk';
import type { VerdantCommand } from '../games/verdant/contracts/verdant.ts';
import { ALTERNATE, alternateEntry } from './helpers/alternate-resources.ts';
import resources from '@bulkhead/std/mechanics-resources/manifest.json' with { type: 'json' };
import clock from '@bulkhead/std/mechanics-clock/manifest.json' with { type: 'json' };
import actions from '@bulkhead/std/mechanics-actions/manifest.json' with { type: 'json' };
import objectives from '@bulkhead/std/mechanics-objectives/manifest.json' with { type: 'json' };
import kits from '@bulkhead/std/mechanics-kits/manifest.json' with { type: 'json' };
import skyGame from '../games/sky/plugins/sky-game/manifest.json' with { type: 'json' };
import skyPack from '../games/sky/plugins/sky-content/manifest.json' with { type: 'json' };
import skyContent from '../games/sky/plugins/sky-content/content.json' with { type: 'json' };
import skyPreset from '../games/sky/presets/sky-salvage.json' with { type: 'json' };
import emberGame from '../games/ember/plugins/ember-game/manifest.json' with { type: 'json' };
import emberPack from '../games/ember/plugins/ember-content/manifest.json' with { type: 'json' };
import emberContent from '../games/ember/plugins/ember-content/content.json' with { type: 'json' };
import emberPreset from '../games/ember/presets/ember-bastion.json' with { type: 'json' };
import verdantGame from '../games/verdant/plugins/verdant-game/manifest.json' with { type: 'json' };
import verdantPack from '../games/verdant/plugins/verdant-content/manifest.json' with { type: 'json' };
import verdantContent from '../games/verdant/plugins/verdant-content/content.json' with { type: 'json' };
import verdantPreset from '../games/verdant/presets/verdant-relay.json' with { type: 'json' };

function sharedCatalog(replacement: boolean): CatalogEntry[] {
  return [
    replacement ? alternateEntry : { manifest: resources, load: () => import('@bulkhead/std/mechanics-resources/index.ts') },
    { manifest: clock, load: () => import('@bulkhead/std/mechanics-clock/index.ts') },
    { manifest: actions, load: () => import('@bulkhead/std/mechanics-actions/index.ts') },
    { manifest: objectives, load: () => import('@bulkhead/std/mechanics-objectives/index.ts') },
    { manifest: kits, load: () => import('@bulkhead/std/mechanics-kits/index.ts') },
  ];
}

function completeSky(session: Session) {
  const sky = session.services.get(Sky), tick = () => session.scheduler.runTick();
  const move = (x: number, z: number) => {
    for (let i = 0; i < 500; i++) {
      const state = sky.state(), dx = x - state.x, dz = z - state.z, distance = Math.hypot(dx, dz);
      assert.equal(state.status, 'playing');
      if (distance < 0.7) return;
      assert.equal(sky.enqueue({ type: 'move', x: dx / distance, z: dz / distance }), true); tick();
    }
    assert.fail('Sky movement exceeded 500-tick destination governor');
  };
  assert.equal(sky.enqueue({ type: 'collect' }), true); tick();
  assert.equal(sky.state().cargo, null, 'collection without a nearby crate is rejected');
  for (let i = 0; i < 3; i++) {
    move((i - 1) * 6, i === 1 ? -5 : -4);
    assert.equal(sky.enqueue({ type: 'collect' }), true); tick(); assert.equal(sky.state().cargo, i);
    move((i - 1) * 6, 5);
    assert.equal(sky.enqueue({ type: 'deliver' }), true); tick(); assert.equal(sky.state().delivered[i], true);
  }
  const final = sky.state();
  assert.equal(final.status, 'won'); assert.deepEqual(final.delivered, [true, true, true]); assert.equal(final.cargo, null);
  return final;
}

function completeEmber(session: Session) {
  const ember = session.services.get(Ember);
  const send = (command: Parameters<typeof ember.enqueue>[0]) => { assert.equal(ember.enqueue(command), true); session.scheduler.runTick(); };
  send({ type: 'build', pad: 2 });
  const paid = ember.state().scrap;
  send({ type: 'build', pad: 2 }); assert.equal(ember.state().scrap, paid, 'occupied pad cannot spend again');
  send({ type: 'build', pad: 3 });
  for (let wave = 0; wave < 3; wave++) {
    send({ type: 'launch' });
    for (let tick = 0; tick < 2400 && ember.state().status === 'wave'; tick++) session.scheduler.runTick();
    assert.equal(ember.state().status, wave === 2 ? 'won' : 'build', 'wave must finish within its tick governor');
    if (wave === 0) send({ type: 'build', pad: 0 });
  }
  const final = ember.state();
  assert.equal(final.wave, 3); assert.deepEqual(final.towers, [2, 3, 0]); assert.equal(final.enemies.length, 0); assert.ok(final.integrity > 0);
  // Compare public action state; incidental implementation-specific diagnostic prose is not a mechanic invariant.
  return { ...final, actions: final.actions.map(action => ({ definition: action.definition, remaining: action.remaining, available: action.available })) };
}

function completeVerdant(session: Session) {
  const verdant = session.services.get(Verdant), initial = verdant.state();
  for (let i = 0; i < 120; i++) session.scheduler.runTick();
  assert.deepEqual(verdant.state(), initial, 'wall-clock simulation ticks do not advance a turn game');
  const route: VerdantCommand[] = [
    { type: 'act', action: 'restore', station: 'reed' }, { type: 'act', action: 'biomass' }, { type: 'act', action: 'convert' },
    { type: 'act', action: 'restore', station: 'canopy' }, { type: 'act', action: 'water' }, { type: 'act', action: 'biomass' },
    { type: 'act', action: 'convert' }, { type: 'act', action: 'restore', station: 'tide' },
  ];
  route.forEach((command, i) => {
    assert.equal(verdant.enqueue(command), true); session.scheduler.runTick(); assert.equal(verdant.state().turn, i + 1);
  });
  const final = verdant.state();
  assert.equal(final.status, 'won'); assert.deepEqual(final.restored, ['reed', 'canopy', 'tide']);
  return final;
}

const games = [
  { name: 'Sky', owner: 'sky/game', preset: skyPreset, manifest: skyGame, domain: 'seconds', route: completeSky,
    catalog: [{ manifest: skyGame, load: () => import('../games/sky/plugins/sky-game/index.ts') }, { manifest: skyPack, content: skyContent }],
    actions: ['collect', 'deliver', 'collect', 'deliver', 'collect', 'deliver'] },
  { name: 'Ember', owner: 'ember/game', preset: emberPreset, manifest: emberGame, domain: 'seconds', route: completeEmber,
    catalog: [{ manifest: emberGame, load: () => import('../games/ember/plugins/ember-game/index.ts') }, { manifest: emberPack, content: emberContent }],
    actions: ['build', 'build', 'build'] },
  { name: 'Verdant', owner: 'verdant/game', preset: verdantPreset, manifest: verdantGame, domain: 'turns', route: completeVerdant,
    catalog: [{ manifest: verdantGame, load: () => import('../games/verdant/plugins/verdant-game/index.ts') }, { manifest: verdantPack, content: verdantContent }],
    actions: ['restore', 'biomass', 'convert', 'restore', 'water', 'biomass', 'convert', 'restore'] },
] as const;

interface Receipts {
  resources: { owner: string; instance: string; reason: string; revision: number; values: ResourceAmounts }[];
  actions: { owner: string; instance: string; action: string; at: number; domain: 'seconds' | 'turns' }[];
  objectives: { owner: string; instance: string; objective: string; value: number; complete: boolean }[];
}

for (const game of games) test(`${game.name}: complete the same route with default and independent late-selected resource providers`, async () => {
  const results: { state: unknown; receipts: Receipts }[] = [];
  for (const replacement of [false, true]) {
    const receipts: Receipts = { resources: [], actions: [], objectives: [] };
    const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) {
      session.events.on(MechanicResourcesChanged, event => receipts.resources.push(event), 'test', scope);
      session.events.on(MechanicActionCommitted, event => receipts.actions.push(event), 'test', scope);
      session.events.on(MechanicObjectiveChanged, event => receipts.objectives.push(event), 'test', scope);
    } });
    try {
      // No shooter modules, presentation, browser services or default resource implementation in replacement catalogs.
      assert.deepEqual(host.setCatalog([...sharedCatalog(replacement), ...game.catalog]), []);
      const { 'sdk/theme': _theme, ...roles } = game.preset.roles;
      const plugins = game.preset.plugins.filter(id => !id.endsWith('/presentation') && !id.startsWith('theme/')).map(id => replacement && id === resources.id ? ALTERNATE : id);
      const preset = { ...game.preset, plugins, roles: { ...roles, [ResourceMechanicRole.id]: replacement ? ALTERNATE : resources.id } };
      assert.equal(plugins.some(id => id.startsWith('core/')), false);
      assert.equal(Object.keys(game.manifest.dependencies ?? {}).some(id => id.startsWith('core/')), false);
      const session = await host.apply(preset);
      if (replacement) {
        assert.equal(host.catalogEntry(resources.id), undefined);
        assert.equal(session.order.includes(resources.id), false);
        assert.equal(session.registries.has(ResourcePoolProviders, resources.id), false);
        assert.equal(session.preset.roles[ResourceMechanicRole.id], ALTERNATE);
        assert.ok(session.order.indexOf(ALTERNATE) < session.order.indexOf(game.owner));
        assert.ok(host.active!.order.indexOf(ALTERNATE) > host.active!.order.indexOf(game.owner), 'late provider is reordered only for activation');
      }
      const state = game.route(session);
      if (game.name === 'Ember') {
        const config = session.services.get(Ember).config;
        const shots = receipts.actions.filter(event => event.action === 'fire');
        assert.equal(shots.length, config.waves.reduce((count, wave) => count + wave.count * Math.ceil(wave.health / config.damage), 0), 'every defeated enemy requires actual shared fire commits');
        assert.deepEqual(receipts.actions.filter(event => event.action !== 'fire').map(event => event.action), game.actions);
        const lastShot = new Map<string, number>();
        for (const shot of shots) {
          const previous = lastShot.get(shot.instance);
          if (previous !== undefined) assert.ok(shot.at - previous >= config.fireInterval - 1e-8, 'each tower obeys shared seconds cooldown');
          lastShot.set(shot.instance, shot.at);
        }
        assert.equal(lastShot.size, 3, 'all three independently owned tower action sets fire');
      } else assert.deepEqual(receipts.actions.map(event => event.action), game.actions);
      assert.equal(receipts.objectives.length, 3);
      assert.equal(receipts.objectives.at(-1)!.complete, true);
      assert.ok(receipts.resources.length >= receipts.actions.length);
      for (const event of [...receipts.resources, ...receipts.actions, ...receipts.objectives]) {
        assert.equal(event.owner, game.owner); assert.ok(event.instance.length > 0);
      }
      assert.ok(receipts.actions.every(event => event.domain === game.domain));
      if (game.domain === 'turns') assert.deepEqual(receipts.actions.map(event => event.at), [0, 1, 2, 3, 4, 5, 6, 7]);
      else {
        assert.ok(receipts.actions.some(event => !Number.isInteger(event.at)), 'seconds are not disguised turn counts');
        assert.ok(receipts.actions.at(-1)!.at > receipts.actions[0]!.at);
      }
      for (let i = 0; i < receipts.resources.length; i++) assert.equal(receipts.resources[i]!.revision, i + 1);
      for (const action of receipts.actions) assert.ok(receipts.resources.some(event => event.reason === action.action || event.reason === `action:${action.action}`), `resource receipt for ${action.action}`);
      results.push({ state, receipts });
      console.info(`${game.name} ${replacement ? 'independent' : 'default'}: resources=${receipts.resources.length}, actions=${receipts.actions.length}, objectives=${receipts.objectives.length}, domain=${game.domain}, ticks=${session.scheduler.tick}`);
      // A missing selected provider must fail staging without replacing the just-completed session.
      const bad = { ...preset, plugins: plugins.filter(id => id !== (replacement ? ALTERNATE : resources.id)) };
      await assert.rejects(host.apply(bad), (error: unknown) => error instanceof HostError && error.stage === 'validate' && error.message.includes('provider'));
      assert.equal(host.session, session); assert.equal(session.state, 'running');
    } finally { host.stop(); }
    assert.equal(host.session, undefined);
    assert.equal(host.resourceReport().sessionScope, 0);
  }
  assert.deepEqual(results[1], results[0], 'same inputs produce identical authoritative state and all mechanic receipts after provider substitution');
});

for (const replacement of [false, true]) test(`${replacement ? 'independent' : 'default'} resource provider: atomicity, receipts, owner isolation and teardown`, async () => {
  const consumers: SessionContext[] = [];
  const ownerEntries: CatalogEntry[] = ['a-test/owner', 'b-test/owner'].map(id => ({
    manifest: { schema: 1, id, name: id, kind: 'code', version: '1.0.0', sdk: '^2.0.0', roleDependencies: [ResourceMechanicRole.id] },
    load: async () => ({ default: { activate(ctx) { consumers.push(ctx); } } }),
  }));
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  assert.deepEqual(host.setCatalog([...sharedCatalog(replacement).slice(0, 1), ...ownerEntries]), []);
  const selected = replacement ? ALTERNATE : resources.id;
  try {
    const session = await host.apply({ schema: 1, id: 'test/resource-proof', name: 'Resources', plugins: [selected, 'a-test/owner', 'b-test/owner'], roles: { [ResourceMechanicRole.id]: selected } });
    const [a, b] = consumers as [SessionContext, SessionContext];
    const provider = resourceMechanic(a);
    const defs = [{ id: 'fuel', label: 'Fuel', initial: 5, max: 10 }, { id: 'ore', label: 'Ore', initial: 0, max: 10 }];
    const pools: ResourcePool[] = [provider.create(a, 'same', defs), provider.create(b, 'same', defs), provider.create(a, 'other', defs)];
    const pool = pools[0]!;
    assert.throws(() => provider.create(a, 'same', defs), /Duplicate/);
    const events: unknown[] = [];
    session.events.on(MechanicResourcesChanged, event => { events.push(event); assert.deepEqual(event.values, pool.snapshot()); assert.equal(event.owner, a.pluginId); }, 'test', session.scope);
    const invalid: ResourceTransaction[] = [
      { spend: { fuel: 6 }, gain: { fuel: 6 } }, { spend: { fuel: 1, ore: 1 } }, { spend: { fuel: 1 }, gain: { ore: 11 } },
      { gain: { fuel: NaN } }, { gain: { fuel: Infinity } }, { spend: { fuel: -1 } }, { gain: { unknown: 0 } },
    ];
    for (const transaction of invalid) {
      assert.equal(pool.preview(transaction).ok, false); assert.equal(pool.transact(transaction).ok, false);
      assert.deepEqual(pool.snapshot(), { fuel: 5, ore: 0 }); assert.equal(pool.revision, 0); assert.equal(events.length, 0);
    }
    const before = pool.snapshot();
    assert.equal(pool.transact({ spend: { fuel: 0.25 }, gain: { ore: 0.5 } }, 'fractional-transfer').ok, true);
    assert.deepEqual(before, { fuel: 5, ore: 0 }); assert.deepEqual(pool.snapshot(), { fuel: 4.75, ore: 0.5 });
    assert.equal(events.length, 1);
    for (const untouched of pools.slice(1)) assert.deepEqual(untouched.snapshot(), { fuel: 5, ore: 0 });
    const gate = { playing: false }; session.services.provide(SessionControl, gate, 'test', session.scope);
    assert.equal(pool.transact({ gain: { fuel: 1 } }).ok, false); gate.playing = true;
    a.scope.dispose(); assert.equal(pool.active, false); assert.equal(pools[2]!.active, false); assert.equal(pools[1]!.active, true);
    assert.equal(pool.transact({}).ok, false);
    session.contexts.get(selected)!.scope.dispose(); assert.equal(pools[1]!.active, false); assert.equal(pools[1]!.transact({}).ok, false);
    pool.dispose(); pool.dispose();
    assert.equal(events.length, 1);
  } finally { host.stop(); }
});
