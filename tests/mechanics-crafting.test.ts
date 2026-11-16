import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CraftingMechanicRole, CraftingProviders, craftingMechanic, inventoryMechanic, InventoryMechanicRole, InventoryProviders, SessionControl } from '../src/sdk/index.ts';
import type { CraftingProvider, InventoryHandle, SessionContext } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin, contentPack } from './helpers/host.ts';

async function start() {
  let playing = true;
  let bag: InventoryHandle; let craft: CraftingProvider;
  const consumer = codePlugin('test/crafting-consumer', { activate(ctx) {
    ctx.services.provide(SessionControl, { get playing() { return playing; } });
    bag = inventoryMechanic(ctx).create(ctx, 'bag', { capacity: 2, equipmentSlots: [] });
    craft = craftingMechanic(ctx);
  } }, { roleDependencies: ['sdk/mechanic-inventory', 'sdk/mechanic-crafting'] });
  const items = contentPack('test/items', [
    { kind: 'item', id: 'test/a', data: { name: 'A', description: 'A.', icon: 'assetrizz/cinder-pulse.png', stackMax: 5 } },
    { kind: 'item', id: 'test/b', data: { name: 'B', description: 'B.', icon: 'assetrizz/cinder-pulse.png', stackMax: 1 } },
    { kind: 'item', id: 'test/c', data: { name: 'C', description: 'C.', icon: 'assetrizz/cinder-pulse.png', stackMax: 1 } },
  ], { dependencies: { 'mechanics/inventory': '^1.0.0' } });
  const recipes = contentPack('test/recipes', [
    { kind: 'crafting-recipe', id: 'test/ab', data: { name: 'Make C', description: 'A into C.', inputs: [{ item: 'test/a', count: 1 }], output: { item: 'test/c', count: 1 } } },
    { kind: 'crafting-recipe', id: 'test/space', data: { name: 'Make C from part A', description: 'Leaves A stack.', inputs: [{ item: 'test/a', count: 1 }], output: { item: 'test/c', count: 1 } } },
  ], { dependencies: { 'mechanics/crafting': '^1.0.0' } });
  const game = createHeadlessGame([consumer, items, recipes, { manifest: { schema: 1, id: 'mechanics/inventory', name: 'Stack inventory', version: '1.0.0', kind: 'code', sdk: '^2.0.0', description: 'Production' }, load: () => import('../src/plugins/mechanics-inventory/index.ts') }, { manifest: { schema: 1, id: 'mechanics/crafting', name: 'Known item recipes', version: '1.0.0', kind: 'code', sdk: '^2.0.0', description: 'Production' }, load: () => import('../src/plugins/mechanics-crafting/index.ts') }]);
  await game.host.apply(headlessPreset({ plugins: ['mechanics/inventory', 'mechanics/crafting', 'test/items', 'test/recipes', 'test/crafting-consumer'], roles: { 'sdk/mechanic-inventory': 'mechanics/inventory', 'sdk/mechanic-crafting': 'mechanics/crafting' }, options: {} }));
  return { game, bag: () => bag, craft: () => craft, pause: (value: boolean) => { playing = !value; } };
}

test('crafting recipes consume all inputs atomically and add the output', async () => {
  const f = await start();
  try {
    f.bag().add('test/a', 3);
    assert.deepEqual(f.craft().preview(f.bag(), 'test/ab'), { ok: true, reason: '', missing: [] });
    assert.equal(f.craft().craft(f.bag(), 'test/ab').ok, true);
    assert.deepEqual(f.bag().slots(), [{ item: 'test/a', count: 2 }, { item: 'test/c', count: 1 }]);
    assert.equal(f.craft().craft(f.bag(), 'test/missing').ok, false);
    f.pause(true);
    assert.equal(f.craft().craft(f.bag(), 'test/ab').ok, false);
    assert.deepEqual(f.bag().slots(), [{ item: 'test/a', count: 2 }, { item: 'test/c', count: 1 }]);
  } finally { f.game.host.stop(); }
});

test('crafting rejects missing ingredients and restores inputs when output capacity fails', async () => {
  const f = await start();
  try {
    f.bag().add('test/a', 3);
    const missing = f.craft().preview(f.bag(), 'test/ab');
    assert.equal(missing.ok, true);
    f.bag().remove('test/a', 3);
    assert.equal(f.craft().craft(f.bag(), 'test/ab').ok, false);
    f.bag().add('test/a', 2); f.bag().add('test/b', 1);
    f.bag().add('test/c', 0);
    // A partial stack remains after consuming one A, so the full bag cannot accept C.
    assert.equal(f.craft().craft(f.bag(), 'test/space').ok, false);
    // No input was lost. (test/b occupies the other stack.)
    assert.deepEqual(f.bag().slots(), [{ item: 'test/a', count: 2 }, { item: 'test/b', count: 1 }]);
  } finally { f.game.host.stop(); }
});
