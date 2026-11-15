import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scope, ScopeDisposedError } from '../src/kernel/scope.ts';
import type { ScopeErrorSink } from '../src/kernel/scope.ts';

test('disposers run in reverse registration order', () => {
  const s = new Scope('plugin-a', 'root');
  const log: string[] = [];
  s.add(() => log.push('first'));
  s.add(() => log.push('second'));
  s.add(() => log.push('third'));
  s.dispose();
  assert.deepEqual(log, ['third', 'second', 'first']);
});

test('dispose is idempotent: disposers run once', () => {
  const s = new Scope('plugin-a', 'root');
  let n = 0;
  s.add(() => n++);
  s.dispose();
  s.dispose();
  s.dispose();
  assert.equal(n, 1);
  assert.equal(s.disposed, true);
});

test('a throwing disposer does not stop the others and reaches the sink with owner and kind', () => {
  const seen: { message: string; owner: string; kind: string }[] = [];
  const sink: ScopeErrorSink = (error, owner, kind) => {
    seen.push({ message: (error as Error).message, owner, kind });
  };
  const s = new Scope('plugin-x', 'root', undefined, sink);
  const log: string[] = [];
  s.add(() => log.push('before'), 'timer');
  s.add(() => {
    throw new Error('boom');
  }, 'texture');
  s.add(() => log.push('after'), 'listener');
  assert.doesNotThrow(() => s.dispose());
  assert.deepEqual(log, ['after', 'before']);
  assert.deepEqual(seen, [{ message: 'boom', owner: 'plugin-x', kind: 'texture' }]);
});

test('children are disposed together with the parent, children first', () => {
  const root = new Scope('core', 'root');
  const log: string[] = [];
  const child = root.child('session');
  root.add(() => log.push('root-item'));
  child.add(() => log.push('child-item'));
  root.dispose();
  assert.equal(child.disposed, true);
  assert.deepEqual(log, ['child-item', 'root-item']);
});

test('a child inherits the parent sink when it has none of its own', () => {
  const seen: string[] = [];
  const root = new Scope('core', 'root', undefined, (_e, owner, kind) => seen.push(`${owner}:${kind}`));
  const child = root.child('plugin', 'plugin-y');
  child.add(() => {
    throw new Error('x');
  }, 'sound');
  child.dispose();
  assert.deepEqual(seen, ['plugin-y:sound']);
});

test('add() after dispose runs the disposer immediately', () => {
  const s = new Scope('plugin-a', 'root');
  s.dispose();
  let ran = 0;
  s.add(() => ran++);
  assert.equal(ran, 1);
});

test('the function returned by add() releases that one resource early, only once', () => {
  const s = new Scope('plugin-a', 'root');
  const log: string[] = [];
  s.add(() => log.push('keep-1'));
  const release = s.add(() => log.push('early'));
  s.add(() => log.push('keep-2'));
  release();
  release();
  assert.deepEqual(log, ['early']);
  s.dispose();
  assert.deepEqual(log, ['early', 'keep-2', 'keep-1']);
});

test('signal is aborted when the scope is disposed', () => {
  const s = new Scope('plugin-a', 'root');
  assert.equal(s.signal.aborted, false);
  s.dispose();
  assert.equal(s.signal.aborted, true);
});

test('guard() resolves normally when the scope is still alive', async () => {
  const s = new Scope('plugin-a', 'root');
  const v = await s.guard(Promise.resolve(42));
  assert.equal(v, 42);
});

test('guard() rejects with ScopeDisposedError when disposed before the promise resolves', async () => {
  const s = new Scope('plugin-a', 'root', undefined, () => {});
  let resolve!: (v: number) => void;
  const p = new Promise<number>((r) => (resolve = r));
  const guarded = s.guard(p);
  s.dispose();
  resolve(7);
  await assert.rejects(guarded, ScopeDisposedError);
  await assert.rejects(guarded, /Scope "root" was disposed/);
});

test('stats() groups live resource counts by owner and kind', () => {
  const root = new Scope('core', 'root');
  const plugin = root.child('plugin', 'weapons');
  root.add(() => {}, 'timer');
  root.add(() => {}, 'timer');
  plugin.add(() => {}, 'asset');
  plugin.add(() => {}, 'asset');
  plugin.add(() => {}, 'listener');
  const stats = root.stats();
  assert.equal(stats.core?.timer, 2);
  assert.equal(stats.weapons?.asset, 2);
  assert.equal(stats.weapons?.listener, 1);
  assert.equal(stats.weapons?.timer, undefined);
});

test('size() counts live resources across the whole tree', () => {
  const root = new Scope('core', 'root');
  const a = root.child('a');
  const b = a.child('b');
  root.add(() => {});
  a.add(() => {});
  b.add(() => {});
  b.add(() => {});
  assert.equal(root.size(), 4);
  b.dispose();
  assert.equal(root.size(), 2);
  root.dispose();
  assert.equal(root.size(), 0);
});
