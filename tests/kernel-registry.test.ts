import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegistrySet, RegistryError } from '@bulkhead/kernel/registry.ts';
import type { RegistryToken } from '@bulkhead/kernel/registry.ts';

const weapon: RegistryToken<{ kind: string }> = { kind: 'weapon' };
const armor: RegistryToken<{ kind: string }> = { kind: 'armor' };

test('register then get / has / ownerOf / require', () => {
  const r = new RegistrySet();
  const pistol = { kind: 'pistol' };
  r.register(weapon, 'core/pistol', pistol, 'core');
  assert.equal(r.get(weapon, 'core/pistol'), pistol);
  assert.equal(r.has(weapon, 'core/pistol'), true);
  assert.equal(r.has(weapon, 'core/rifle'), false);
  assert.equal(r.ownerOf(weapon, 'core/pistol'), 'core');
  assert.equal(r.ownerOf(weapon, 'core/rifle'), undefined);
  assert.equal(r.require(weapon, 'core/pistol'), pistol);
  assert.equal(r.get(weapon, 'core/rifle'), undefined);
});

test('kinds are separate namespaces', () => {
  const r = new RegistrySet();
  r.register(weapon, 'core/item', { kind: 'w' }, 'core');
  assert.equal(r.has(armor, 'core/item'), false);
  r.register(armor, 'core/item', { kind: 'a' }, 'core');
  assert.equal(r.get(armor, 'core/item')?.kind, 'a');
  assert.equal(r.get(weapon, 'core/item')?.kind, 'w');
});

test('duplicate id throws RegistryError naming both owners and does not overwrite', () => {
  const r = new RegistrySet();
  r.register(weapon, 'core/pistol', { kind: 'original' }, 'core');
  assert.throws(() => r.register(weapon, 'core/pistol', { kind: 'replacement' }, 'mod-b'), (err: unknown) => {
    assert.ok(err instanceof RegistryError);
    assert.match(err.message, /core/);
    assert.match(err.message, /mod-b/);
    return true;
  });
  assert.equal(r.get(weapon, 'core/pistol')?.kind, 'original');
  assert.equal(r.ownerOf(weapon, 'core/pistol'), 'core');
});

test('non-namespaced ids are rejected', () => {
  const r = new RegistrySet();
  assert.throws(() => r.register(weapon, 'pistol', { kind: 'x' }, 'core'), RegistryError);
  assert.throws(() => r.register(weapon, 'Core/Pistol', { kind: 'x' }, 'core'), RegistryError);
  assert.throws(() => r.register(weapon, 'core/', { kind: 'x' }, 'core'), RegistryError);
  assert.equal(r.total(), 0);
});

test('require of an unknown id throws RegistryError', () => {
  const r = new RegistrySet();
  r.register(weapon, 'core/pistol', { kind: 'p' }, 'core');
  assert.throws(() => r.require(weapon, 'core/rifle'), (err: unknown) => {
    assert.ok(err instanceof RegistryError);
    assert.match(err.message, /core\/rifle/);
    assert.match(err.message, /core\/pistol/);
    return true;
  });
});

test('entries() and ids() list everything registered for a kind', () => {
  const r = new RegistrySet();
  r.register(weapon, 'core/pistol', { kind: 'p' }, 'core');
  r.register(weapon, 'mod/rifle', { kind: 'r' }, 'mod');
  r.register(armor, 'core/vest', { kind: 'v' }, 'core');
  assert.deepEqual(r.ids(weapon).sort(), ['core/pistol', 'mod/rifle']);
  assert.deepEqual(r.ids(armor), ['core/vest']);
  const entries = r.entries(weapon).map((e) => `${e.id}@${e.owner}`).sort();
  assert.deepEqual(entries, ['core/pistol@core', 'mod/rifle@mod']);
  assert.deepEqual(r.ids({ kind: 'missing' }), []);
});

test('removeOwner removes only that owner entries', () => {
  const r = new RegistrySet();
  r.register(weapon, 'core/pistol', { kind: 'p' }, 'core');
  r.register(weapon, 'mod/rifle', { kind: 'r' }, 'mod');
  r.register(armor, 'mod/vest', { kind: 'v' }, 'mod');
  r.removeOwner('mod');
  assert.deepEqual(r.ids(weapon), ['core/pistol']);
  assert.deepEqual(r.ids(armor), []);
  assert.equal(r.total(), 1);
  // The id is free again once its owner is removed.
  r.register(weapon, 'mod/rifle', { kind: 'r2' }, 'mod-2');
  assert.equal(r.ownerOf(weapon, 'mod/rifle'), 'mod-2');
});

test('two RegistrySet instances are isolated', () => {
  const a = new RegistrySet();
  const b = new RegistrySet();
  a.register(weapon, 'core/pistol', { kind: 'a' }, 'core');
  assert.equal(b.has(weapon, 'core/pistol'), false);
  b.register(weapon, 'core/pistol', { kind: 'b' }, 'core');
  assert.equal(a.get(weapon, 'core/pistol')?.kind, 'a');
  assert.equal(b.get(weapon, 'core/pistol')?.kind, 'b');
});

test('summary() counts per kind and owner, total() counts everything', () => {
  const r = new RegistrySet();
  r.register(weapon, 'core/pistol', { kind: 'p' }, 'core');
  r.register(weapon, 'core/rifle', { kind: 'r' }, 'core');
  r.register(weapon, 'mod/smg', { kind: 's' }, 'mod');
  r.register(armor, 'mod/vest', { kind: 'v' }, 'mod');
  assert.deepEqual(r.summary(), {
    weapon: { core: 2, mod: 1 },
    armor: { mod: 1 },
  });
  assert.equal(r.total(), 4);
  assert.equal(new RegistrySet().total(), 0);
});
