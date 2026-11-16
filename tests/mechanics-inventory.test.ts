import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InventoryProviders, SessionControl, inventoryMechanic } from '../src/sdk/index.ts';
import type { InventoryHandle, SessionContext } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { codePlugin, contentPack } from './helpers/host.ts';

function fixture() {
  let playing = true;
  const owners: SessionContext[] = [], handles: InventoryHandle[] = [];
  const items = contentPack('test/items', [
    { kind: 'item', id: 'test/potion', data: { name: 'Potion', description: 'Heals.', icon: 'assetrizz/cinder-vitality.png', stackMax: 3 } },
    { kind: 'item', id: 'test/armor-a', data: { name: 'Armor A', description: 'Armor.', icon: 'assetrizz/cinder-shell.png', slot: 'armor', stackMax: 1 } },
    { kind: 'item', id: 'test/armor-b', data: { name: 'Armor B', description: 'Armor.', icon: 'assetrizz/cinder-shell.png', slot: 'armor', stackMax: 1 } },
    { kind: 'item', id: 'test/charm', data: { name: 'Charm', description: 'Charm.', icon: 'assetrizz/cinder-power.png', slot: 'charm', stackMax: 1 } },
  ], { dependencies: { 'mechanics/inventory': '^1.0.0' } });
  const consumer = codePlugin('test/inventory-consumer', { activate(ctx) {
    ctx.services.provide(SessionControl, { get playing() { return playing; } });
    owners.push(ctx);
    handles.push(inventoryMechanic(ctx).create(ctx, 'bag', { capacity: 2, equipmentSlots: ['armor', 'charm'] }));
  } }, { roleDependencies: ['sdk/mechanic-inventory'] });
  const game = createHeadlessGame([consumer, items, { manifest: { schema: 1, id: 'mechanics/inventory', name: 'Stack inventory', version: '1.0.0', kind: 'code', sdk: '^2.0.0', description: 'Production' }, load: () => import('../src/plugins/mechanics-inventory/index.ts') }]);
  return { game, owners, handles, pause: (value: boolean) => { playing = !value; } };
}

async function start() {
  const f = fixture();
  await f.game.host.apply(headlessPreset({
    plugins: ['mechanics/inventory', 'test/items', 'test/inventory-consumer'],
    roles: { 'sdk/mechanic-inventory': 'mechanics/inventory' }, options: {},
  }));
  return f;
}

test('inventory stacks atomically, enforces capacity and rejects invalid mutations without change', async () => {
  const f = await start();
  try {
    const bag = f.handles[0]!;
    assert.deepEqual(bag.slots(), []);
    assert.equal(bag.add('test/potion', 3).ok, true);
    assert.deepEqual(bag.slots(), [{ item: 'test/potion', count: 3 }]);
    assert.equal(bag.add('test/potion', 2).ok, true);
    assert.deepEqual(bag.slots(), [{ item: 'test/potion', count: 3 }, { item: 'test/potion', count: 2 }]);
    assert.equal(bag.add('test/potion', 1).ok, true);
    assert.deepEqual(bag.slots(), [{ item: 'test/potion', count: 3 }, { item: 'test/potion', count: 3 }]);
    const full = bag.slots();
    assert.equal(bag.add('test/potion', 1).ok, false);
    assert.deepEqual(bag.slots(), full);
    assert.equal(bag.add('test/missing', 1).ok, false);
    assert.equal(bag.add('test/potion', 0).ok, false);
    assert.equal(bag.remove('test/potion', 4).ok, true);
    assert.deepEqual(bag.slots(), [{ item: 'test/potion', count: 2 }]);
    assert.equal(bag.remove('test/potion', 3).ok, false);
    f.pause(true);
    const paused = bag.slots();
    assert.equal(bag.add('test/potion', 1).ok, false);
    assert.deepEqual(bag.slots(), paused);
    f.pause(false);
    assert.equal(bag.remove('test/potion', 2).ok, true);
    assert.deepEqual(bag.slots(), []);
  } finally { f.game.host.stop(); }
});

test('inventory equipment slots swap and unequip atomically', async () => {
  const f = await start();
  try {
    const bag = f.handles[0]!;
    bag.add('test/armor-a', 1); bag.add('test/armor-b', 1);
    assert.equal(bag.equip('test/armor-a').ok, true);
    assert.deepEqual(bag.equipment(), { armor: 'test/armor-a', charm: '' });
    assert.deepEqual(bag.slots(), [{ item: 'test/armor-b', count: 1 }]);
    assert.equal(bag.equip('test/armor-b').ok, true);
    assert.deepEqual(bag.equipment(), { armor: 'test/armor-b', charm: '' });
    assert.deepEqual(bag.slots(), [{ item: 'test/armor-a', count: 1 }]);
    bag.add('test/charm', 1);
    assert.equal(bag.slots().length, 2);
    assert.equal(bag.equip('test/charm').ok, true);
    assert.deepEqual(bag.equipment(), { armor: 'test/armor-b', charm: 'test/charm' });
    assert.equal(bag.slots().length, 1);
    assert.equal(bag.unequip('charm').ok, true);
    assert.deepEqual(bag.equipment(), { armor: 'test/armor-b', charm: '' });
    assert.equal(bag.slots().length, 2);
    assert.equal(bag.unequip('armor').ok, false, 'full bag cannot receive swapped equipment');
  } finally { f.game.host.stop(); }
});

test('inventory ownership, scope disposal and restart create isolated handles', async () => {
  const f = await start();
  try {
    const bag = f.handles[0]!;
    bag.add('test/potion', 1);
    assert.equal(bag.active, true);
    bag.dispose(); bag.dispose();
    assert.equal(bag.active, false);
    assert.equal(bag.add('test/potion', 1).ok, false);
    await f.game.host.restart();
    const fresh = f.handles[1]!;
    assert.deepEqual(fresh.slots(), []);
    assert.equal(fresh.add('test/potion', 2).ok, true);
    f.owners[1]!.scope.dispose();
    assert.equal(fresh.active, false);
  } finally { f.game.host.stop(); }
});
