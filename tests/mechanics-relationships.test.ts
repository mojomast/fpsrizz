import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RelationshipProviders, SessionControl, relationshipMechanic } from '../src/sdk/index.ts';
import type { MechanicRelationships, RelationshipDefinition, SessionContext } from '../src/sdk/index.ts';
import manifest from '../src/plugins/mechanics-relationships/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin } from './helpers/host.ts';

async function fixture() {
  const owners: SessionContext[] = [], handles: MechanicRelationships[] = [];
  let providerOwner: SessionContext | undefined, playing = true;
  const consumers = ['aaa/social', 'bbb/social'].map(id => codePlugin(id, { activate(ctx) {
    if (id.startsWith('aaa')) ctx.services.provide(SessionControl, { get playing() { return playing; } });
    ctx.instantiate(RelationshipProviders, 'mechanics/relationships', (factory, owner) => { providerOwner = owner; return factory.start(owner); });
    owners.push(ctx);
    handles.push(relationshipMechanic(ctx).create(ctx, 'same', { min: -100, max: 100, pairs: [{ a: 'z', b: 'a', score: 5 }, { a: 'a|z', b: 'x', score: 10 }] }));
  } }, { roleDependencies: ['sdk/mechanic-relationships'] }));
  const game = createHeadlessGame([{ manifest, load: () => import('../src/plugins/mechanics-relationships/index.ts') }, ...consumers]);
  await game.host.apply(headlessPreset({ plugins: ['mechanics/relationships', 'aaa/social', 'bbb/social'], roles: { 'sdk/mechanic-relationships': 'mechanics/relationships' }, options: {} }));
  return { game, owners, handles, provider: () => providerOwner!, pause: (value: boolean) => { playing = !value; } };
}

test('symmetric pairs clamp, reject invalid changes and provide detached snapshots', async () => {
  const f = await fixture();
  try {
    const h = f.handles[0]!, initial = h.snapshot();
    assert.deepEqual(initial, [{ a: 'a', b: 'z', score: 5 }, { a: 'a|z', b: 'x', score: 10 }]);
    assert.equal(h.get('z', 'a'), 5);
    assert.equal(h.get('z', 'z'), undefined);
    for (const args of [['a', 'missing', 1], ['a', 'a', 1], ['a', 'z', NaN], ['a', 'z', Infinity]] as const) assert.equal(h.change(args[0], args[1], args[2]).ok, false);
    assert.equal(h.revision, 0);
    assert.equal(h.change('z', 'a', 1000).ok, true);
    assert.equal(h.get('a', 'z'), 100);
    assert.equal(h.change('a', 'z', -1000).ok, true);
    assert.equal(h.get('z', 'a'), -100);
    assert.equal(h.revision, 2); assert.equal(initial[0]!.score, 5);
    assert.ok(Object.isFrozen(initial) && Object.isFrozen(initial[0]));
    assert.equal(f.handles[1]!.get('a', 'z'), 5);
    f.pause(true); assert.equal(h.change('a', 'z', 1).ok, false); assert.equal(h.revision, 2);
  } finally { f.game.host.stop(); }
});

test('definitions validate before acquiring ownership and instances have independent lifetimes', async () => {
  const f = await fixture();
  try {
    const owner = f.owners[0]!, factory = relationshipMechanic(owner), baseline = f.game.host.resourceReport();
    for (const definition of [null, {}, { min: NaN, max: 1, pairs: [] }, { min: 2, max: 1, pairs: [] },
      { min: 0, max: 1, pairs: [{ a: 'a', b: 'a', score: 0 }] },
      { min: 0, max: 1, pairs: [{ a: 'a', b: 'b', score: 2 }] },
      { min: 0, max: 1, pairs: [{ a: 'a', b: 'b', score: 0 }, { a: 'b', b: 'a', score: 1 }] },
      { min: 0, max: 1, pairs: Array(1) }]) {
      assert.throws(() => factory.create(owner, 'invalid', definition as RelationshipDefinition));
      assert.deepEqual(f.game.host.resourceReport(), baseline);
    }
    const old = f.handles[0]!;
    assert.throws(() => factory.create(owner, 'same', old.definition), /Duplicate/);
    old.dispose(); old.dispose();
    const replacement = factory.create(owner, 'same', old.definition);
    assert.equal(old.change('a', 'z', 1).ok, false);
    assert.equal(replacement.get('a', 'z'), 5);
    owner.scope.dispose(); assert.equal(replacement.active, false); assert.equal(f.handles[1]!.active, true);
    f.provider().scope.dispose(); assert.equal(f.handles[1]!.active, false);
    assert.throws(() => factory.create(f.owners[1]!, 'late', old.definition), /disposed/);
    await f.game.host.restart();
    assert.equal(f.handles[2]!.get('a', 'z'), 5);
    assert.equal(old.active, false);
  } finally { f.game.host.stop(); }
});
