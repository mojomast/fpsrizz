import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssetStore } from '../src/kernel/assets.ts';
import { Scope } from '../src/kernel/scope.ts';

test('two scopes acquiring the same key share one value and create runs once', () => {
  const store = new AssetStore();
  const root = new Scope('core', 'root');
  const s1 = root.child('one', 'plugin-a');
  const s2 = root.child('two', 'plugin-b');
  let created = 0;
  const make = () => {
    created++;
    return { tex: 'wood' };
  };
  const dispose = () => {};
  const v1 = store.acquire(s1, 'textures/wood', make, dispose);
  const v2 = store.acquire(s2, 'textures/wood', make, dispose);
  assert.equal(v1, v2);
  assert.equal(created, 1);
  assert.equal(store.refs('textures/wood'), 2);
  assert.equal(store.size, 1);
});

test('disposing the first scope keeps the asset alive for the second', () => {
  const store = new AssetStore();
  const root = new Scope('core', 'root');
  const s1 = root.child('one', 'plugin-a');
  const s2 = root.child('two', 'plugin-b');
  let disposed = 0;
  store.acquire(s1, 'sounds/shot', () => ({ buf: 1 }), () => disposed++);
  store.acquire(s2, 'sounds/shot', () => ({ buf: 1 }), () => disposed++);
  s1.dispose();
  assert.equal(disposed, 0);
  assert.equal(store.has('sounds/shot'), true);
  assert.equal(store.refs('sounds/shot'), 1);
});

test('disposing the last scope calls dispose exactly once and empties the store', () => {
  const store = new AssetStore();
  const root = new Scope('core', 'root');
  const s1 = root.child('one', 'plugin-a');
  const s2 = root.child('two', 'plugin-b');
  const disposedValues: unknown[] = [];
  const value = { buf: 1 };
  store.acquire(s1, 'sounds/shot', () => value, (v) => disposedValues.push(v));
  store.acquire(s2, 'sounds/shot', () => value, (v) => disposedValues.push(v));
  s1.dispose();
  s2.dispose();
  s2.dispose();
  assert.equal(disposedValues.length, 1);
  assert.equal(disposedValues[0], value);
  assert.equal(store.size, 0);
  assert.equal(store.has('sounds/shot'), false);
  assert.equal(store.refs('sounds/shot'), 0);
});

test('acquiring again after the asset was fully released creates a fresh value', () => {
  const store = new AssetStore();
  const root = new Scope('core', 'root');
  const s1 = root.child('one', 'plugin-a');
  let created = 0;
  store.acquire(s1, 'geo/crate', () => ({ id: ++created }), () => {});
  s1.dispose();
  const s2 = root.child('two', 'plugin-a');
  const fresh = store.acquire(s2, 'geo/crate', () => ({ id: ++created }), () => {});
  assert.equal(created, 2);
  assert.equal(fresh.id, 2);
  assert.equal(store.size, 1);
});

test('report() lists each key with its refs and owners', () => {
  const store = new AssetStore();
  const root = new Scope('core', 'root');
  const a = root.child('a', 'plugin-a');
  const b = root.child('b', 'plugin-b');
  store.acquire(a, 'tex/wood', () => 1, () => {});
  store.acquire(b, 'tex/wood', () => 1, () => {});
  store.acquire(b, 'tex/stone', () => 2, () => {});
  const report = store.report();
  const wood = report.find((r) => r.key === 'tex/wood');
  const stone = report.find((r) => r.key === 'tex/stone');
  assert.equal(report.length, 2);
  assert.equal(wood?.refs, 2);
  assert.deepEqual([...(wood?.owners ?? [])].sort(), ['plugin-a', 'plugin-b']);
  assert.equal(stone?.refs, 1);
  assert.deepEqual(stone?.owners, ['plugin-b']);
});
