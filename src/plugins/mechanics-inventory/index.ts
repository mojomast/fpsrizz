import {
  InventoryMechanicRole, InventoryProviders, Items, MechanicInventoryChanged, SessionControl, createOwnedInstances, definePlugin,
  isObject, vNumber, vObject, vOneOf, vString,
} from '../../sdk/index.ts';
import type { ItemDefinition, ItemRarity, InventoryDefinition, InventoryHandle, InventorySlot } from '../../sdk/index.ts';

const RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;

function inventoryDefinition(input: InventoryDefinition): InventoryDefinition {
  if (!input || !Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 64) throw new Error('Inventory capacity must be a safe integer from 1 to 64');
  if (!Array.isArray(input.equipmentSlots) || input.equipmentSlots.length > 8) throw new Error('Inventory equipmentSlots must be an array of at most 8 slots');
  const slots = new Set<string>();
  for (const slot of input.equipmentSlots) {
    if (typeof slot !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(slot) || slots.has(slot)) throw new Error('Invalid or duplicate equipment slot');
    slots.add(slot);
  }
  return Object.freeze({ capacity: input.capacity, equipmentSlots: Object.freeze([...slots]) });
}

function validCount(count: number): boolean {
  return Number.isSafeInteger(count) && count > 0;
}

function addTo(slots: InventorySlot[], item: ItemDefinition, id: string, count: number, capacity: number): InventorySlot[] {
  let remaining = count;
  const next = slots.map(slot => ({ ...slot }));
  for (const slot of next) {
    if (slot.item !== id || slot.count >= item.stackMax) continue;
    const amount = Math.min(remaining, item.stackMax - slot.count);
    slot.count += amount; remaining -= amount;
    if (remaining === 0) return next;
  }
  while (remaining > 0) {
    if (next.length >= capacity) return [];
    const amount = Math.min(remaining, item.stackMax);
    next.push({ item: id, count: amount });
    remaining -= amount;
  }
  return next;
}

function removeFrom(slots: InventorySlot[], id: string, count: number): InventorySlot[] | undefined {
  const total = slots.reduce((n, slot) => n + (slot.item === id ? slot.count : 0), 0);
  if (total < count) return undefined;
  let remaining = count;
  const next: InventorySlot[] = [];
  for (const slot of slots) {
    if (slot.item !== id || remaining === 0) { next.push({ ...slot }); continue; }
    const amount = Math.min(remaining, slot.count);
    remaining -= amount;
    if (slot.count > amount) next.push({ item: id, count: slot.count - amount });
  }
  return next;
}

function snapshot(slots: readonly InventorySlot[]): readonly InventorySlot[] {
  return Object.freeze(slots.map(slot => Object.freeze({ ...slot })));
}

export default definePlugin({ register(ctx) {
  ctx.contentKind('item', {
    description: 'A stackable inventory item; optional equipment slot and presentation metadata.',
    load(data, c) {
      if (!isObject(data)) return void c.r.error('expected an item object');
      const name = vString(data.name, c.r.at('name'), { max: 80, nonEmpty: true });
      const description = vString(data.description, c.r.at('description'), { max: 240, nonEmpty: true });
      const icon = vString(data.icon, c.r.at('icon'), { max: 120, nonEmpty: true });
      const stackMax = data.stackMax === undefined ? 1 : vNumber(data.stackMax, c.r.at('stackMax'), { int: true, min: 1, max: 999 });
      const slot = data.slot === undefined ? undefined : vString(data.slot, c.r.at('slot'), { max: 32 });
      const rarity = data.rarity === undefined ? 'common' as const : vOneOf(data.rarity, c.r.at('rarity'), RARITIES);
      if (slot !== undefined && !/^[a-z][a-z0-9-]{0,31}$/.test(slot)) c.r.at('slot').error('use lowercase letters, digits and "-"');
      if ([name, description, icon, stackMax, rarity].includes(undefined) || c.r.failed) return;
      const def: ItemDefinition = { name: name!, description: description!, icon: icon!, stackMax: stackMax!, rarity: rarity as ItemRarity };
      if (slot !== undefined) (def as { slot?: string }).slot = slot;
      c.register(Items, c.id, def);
    },
  });
  ctx.provideRole(InventoryMechanicRole, 'mechanics/inventory', { name: 'Stack inventory', description: 'Bounded stacks and equipment slots' });
  ctx.register(InventoryProviders, 'mechanics/inventory', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-inventory');
    return { create(owner, id, input): InventoryHandle {
      const definition = inventoryDefinition(input);
      const instance = instances.acquire(owner, id);
      let slots: InventorySlot[] = [];
      let equipment: Record<string, string> = Object.fromEntries(definition.equipmentSlots.map(slot => [slot, '']));
      let revision = 0;
      const item = (itemId: string) => owner.registries.get(Items, itemId);
      const changed = (reason: string) => provider.events.emit(MechanicInventoryChanged, Object.freeze({
        owner: owner.pluginId, instance: id, reason, revision, slots: snapshot(slots),
        equipment: Object.freeze({ ...equipment }),
      }));
      const commit = (next: { slots?: InventorySlot[]; equipment?: Record<string, string> }, reason: string) => {
        if (next.slots) slots = next.slots;
        if (next.equipment) equipment = next.equipment;
        revision++;
        changed(reason);
        return { ok: true, reason: '' };
      };
      return Object.freeze({
        id, definition, dispose: instance.dispose,
        get active() { return instance.active; },
        get revision() { return revision; },
        slots() { return snapshot(slots); },
        equipment() { return Object.freeze({ ...equipment }); },
        count(itemId: string) { return slots.reduce((n, slot) => n + (slot.item === itemId ? slot.count : 0), 0); },
        add(itemId: string, count: number) {
          if (!instance.active) return { ok: false, reason: 'Disposed inventory' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          const def = item(itemId);
          if (!def) return { ok: false, reason: 'Unknown item' };
          if (!validCount(count)) return { ok: false, reason: 'Count must be a positive safe integer' };
          const next = addTo(slots, def, itemId, count, definition.capacity);
          return next.length === 0 ? { ok: false, reason: 'Inventory is full' } : commit({ slots: next }, 'add');
        },
        remove(itemId: string, count: number) {
          if (!instance.active) return { ok: false, reason: 'Disposed inventory' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          if (!item(itemId)) return { ok: false, reason: 'Unknown item' };
          if (!validCount(count)) return { ok: false, reason: 'Count must be a positive safe integer' };
          const next = removeFrom(slots, itemId, count);
          return next ? commit({ slots: next }, 'remove') : { ok: false, reason: 'Not enough items' };
        },
        equip(itemId: string) {
          if (!instance.active) return { ok: false, reason: 'Disposed inventory' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          const def = item(itemId);
          if (!def || !def.slot) return { ok: false, reason: 'Item is not equipment' };
          if (!definition.equipmentSlots.includes(def.slot)) return { ok: false, reason: 'No matching equipment slot' };
          const removed = removeFrom(slots, itemId, 1);
          if (!removed) return { ok: false, reason: 'Item is not carried' };
          const old = equipment[def.slot];
          const nextSlots = old ? addTo(removed, item(old)!, old, 1, definition.capacity) : removed;
          if (old && nextSlots.length === 0) return { ok: false, reason: 'No room to swap equipment' };
          const nextEquipment = { ...equipment, [def.slot]: itemId };
          return commit({ slots: nextSlots, equipment: nextEquipment }, 'equip');
        },
        unequip(slot: string) {
          if (!instance.active) return { ok: false, reason: 'Disposed inventory' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          if (!definition.equipmentSlots.includes(slot)) return { ok: false, reason: 'Unknown equipment slot' };
          const itemId = equipment[slot];
          if (!itemId) return { ok: false, reason: 'Equipment slot is empty' };
          const next = addTo(slots, item(itemId)!, itemId, 1, definition.capacity);
          if (next.length === 0) return { ok: false, reason: 'Inventory is full' };
          return commit({ slots: next, equipment: { ...equipment, [slot]: '' } }, 'unequip');
        },
      });
    } };
  } });
} });
