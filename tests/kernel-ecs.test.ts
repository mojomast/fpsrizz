import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityStore } from '../src/kernel/ecs.ts';
import type { ComponentToken } from '../src/kernel/ecs.ts';

const position: ComponentToken<{ x: number; y: number }> = { id: 'test/position' };
const health: ComponentToken<{ hp: number }> = { id: 'test/health' };

test('ids are unique and never reused, even after destroy and flush', () => {
  const store = new EntityStore();
  const a = store.create('core');
  const b = store.create('core');
  assert.notEqual(a, b);
  store.destroy(a);
  store.flush();
  const c = store.create('core');
  assert.notEqual(c, a);
  assert.notEqual(c, b);
});

test('add / get / has / remove round trip', () => {
  const store = new EntityStore();
  const e = store.create('core');
  const data = { x: 1, y: 2 };
  assert.equal(store.add(e, position, data), data);
  assert.equal(store.has(e, position), true);
  assert.equal(store.get(e, position), data);
  assert.equal(store.has(e, health), false);
  assert.equal(store.get(e, health), undefined);
  store.remove(e, position);
  assert.equal(store.has(e, position), false);
  assert.equal(store.get(e, position), undefined);
  assert.equal(store.isAlive(e), true);
});

test('add to a missing entity throws', () => {
  const store = new EntityStore();
  assert.throws(() => store.add(999, position, { x: 0, y: 0 }), /missing entity 999/);
});

test('destroy makes the entity dead and hides its data at once; flush purges it', () => {
  const store = new EntityStore();
  const e = store.create('core');
  store.add(e, position, { x: 5, y: 5 });
  store.destroy(e);
  assert.equal(store.isAlive(e), false);
  assert.equal(store.get(e, position), undefined);
  assert.equal(store.has(e, position), false);
  assert.equal(store.count(), 0);
  store.flush();
  assert.equal(store.isAlive(e), false);
  assert.equal(store.count(position), 0);
  assert.equal(store.ownerOf(e), undefined);
});

test('each() visits live entities that have the component, with their data', () => {
  const store = new EntityStore();
  const a = store.create('core');
  const b = store.create('core');
  const c = store.create('core');
  store.add(a, position, { x: 1, y: 0 });
  store.add(b, health, { hp: 3 });
  store.add(c, position, { x: 3, y: 0 });
  const seen: [number, number][] = [];
  store.each(position, (id, data) => seen.push([id, data.x]));
  assert.deepEqual(seen, [
    [a, 1],
    [c, 3],
  ]);
});

test('each() does not visit entities created during the iteration', () => {
  const store = new EntityStore();
  const a = store.create('core');
  store.add(a, position, { x: 0, y: 0 });
  const visited: number[] = [];
  store.each(position, (id) => {
    visited.push(id);
    const fresh = store.create('core');
    store.add(fresh, position, { x: 9, y: 9 });
  });
  assert.deepEqual(visited, [a]);
  assert.equal(store.count(position), 2);
});

test('each() skips an entity destroyed earlier in the same pass', () => {
  const store = new EntityStore();
  const a = store.create('core');
  const b = store.create('core');
  store.add(a, position, { x: 0, y: 0 });
  store.add(b, position, { x: 0, y: 0 });
  const visited: number[] = [];
  store.each(position, (id) => {
    visited.push(id);
    if (id === a) store.destroy(b);
  });
  assert.deepEqual(visited, [a]);
  assert.equal(store.isAlive(b), false);
});

test('nested each() calls work and each visits all pairs', () => {
  const store = new EntityStore();
  const ids = [store.create('core'), store.create('core'), store.create('core')];
  for (const id of ids) store.add(id, position, { x: id, y: 0 });
  const pairs: string[] = [];
  store.each(position, (outer) => {
    store.each(position, (inner) => {
      pairs.push(`${outer}-${inner}`);
    });
  });
  assert.equal(pairs.length, 9);
  for (const o of ids) for (const i of ids) assert.ok(pairs.includes(`${o}-${i}`));
});

test('nested each() that destroys an outer-visited entity keeps the outer loop correct', () => {
  const store = new EntityStore();
  const a = store.create('core');
  const b = store.create('core');
  store.add(a, position, { x: 0, y: 0 });
  store.add(b, position, { x: 0, y: 0 });
  const outerVisits: number[] = [];
  store.each(position, (outer) => {
    outerVisits.push(outer);
    store.each(position, (inner) => {
      if (inner === b) store.destroy(b);
    });
  });
  assert.deepEqual(outerVisits, [a]);
});

test('first() returns a live entity with the component, or undefined', () => {
  const store = new EntityStore();
  assert.equal(store.first(position), undefined);
  const a = store.create('core');
  store.add(a, position, { x: 0, y: 0 });
  assert.equal(store.first(position), a);
  store.destroy(a);
  assert.equal(store.first(position), undefined);
});

test('count() counts live entities overall and per component', () => {
  const store = new EntityStore();
  const a = store.create('core');
  const b = store.create('mod');
  store.create('mod');
  store.add(a, position, { x: 0, y: 0 });
  store.add(b, position, { x: 0, y: 0 });
  store.add(b, health, { hp: 1 });
  assert.equal(store.count(), 3);
  assert.equal(store.count(position), 2);
  assert.equal(store.count(health), 1);
  store.destroy(b);
  assert.equal(store.count(), 2);
});

test('countsByOwner() groups live entities by owner', () => {
  const store = new EntityStore();
  store.create('core');
  store.create('mod');
  const dead = store.create('mod');
  store.destroy(dead);
  assert.deepEqual(store.countsByOwner(), { core: 1, mod: 1 });
});

test('snapshot() returns plain JSON-serialisable data', () => {
  const store = new EntityStore();
  const a = store.create('core');
  const b = store.create('mod');
  store.add(a, position, { x: 1.5, y: -2 });
  store.add(a, health, { hp: 10 });
  store.add(b, health, { hp: 4 });
  const dead = store.create('mod');
  store.add(dead, position, { x: 0, y: 0 });
  store.destroy(dead);
  const snap = store.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
  assert.equal(snap.length, 2);
  const byId = new Map(snap.map((e) => [e.id, e]));
  assert.equal(byId.get(a)?.owner, 'core');
  assert.deepEqual(byId.get(a)?.components, { 'test/position': { x: 1.5, y: -2 }, 'test/health': { hp: 10 } });
  assert.deepEqual(byId.get(b)?.components, { 'test/health': { hp: 4 } });
  assert.equal(byId.has(dead), false);
});
