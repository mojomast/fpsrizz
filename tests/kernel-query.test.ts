import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityStore } from '@bulkhead/kernel/ecs.ts';
import type { ComponentToken } from '@bulkhead/kernel/ecs.ts';

const pos: ComponentToken<{ x: number }> = { id: 't/pos' };
const vel: ComponentToken<{ dx: number }> = { id: 't/vel' };
const frozen: ComponentToken<true> = { id: 't/frozen' };

test('query matches every with component and no without component, in match order', () => {
  const w = new EntityStore();
  const a = w.create('o'), b = w.create('o'), c = w.create('o');
  w.add(a, pos, { x: 1 }); w.add(a, vel, { dx: 1 });
  w.add(b, pos, { x: 2 });
  w.add(c, vel, { dx: 3 }); w.add(c, pos, { x: 3 });
  const q = w.query({ with: [pos, vel], without: [frozen] });
  assert.deepEqual(q.ids(), [a, c]);
  w.add(b, vel, { dx: 2 });
  assert.deepEqual(q.ids(), [a, c, b]);
  w.add(a, frozen, true);
  assert.deepEqual(q.ids(), [c, b]);
  w.remove(a, frozen);
  assert.deepEqual(q.ids(), [c, b, a]);
  w.remove(c, vel);
  assert.equal(q.size, 2);
  assert.equal(q.has(c), false);
});

test('a query created late sees existing entities but reports no backlog of changes', () => {
  const w = new EntityStore();
  const a = w.create('o'); w.add(a, pos, { x: 0 });
  const q = w.query({ with: [pos] });
  assert.deepEqual(q.ids(), [a]);
  assert.deepEqual(q.drain(), { added: [], removed: [], changed: [] });
});

test('added, removed and changed are tracked per handle and cleared by drain', () => {
  const w = new EntityStore();
  const q1 = w.query({ with: [pos] }), q2 = w.query({ with: [pos] });
  assert.equal(w.queryCount(), 1, 'handles with the same spec share membership');
  const a = w.create('o'), b = w.create('o');
  w.add(a, pos, { x: 0 }); w.add(b, pos, { x: 0 });
  assert.deepEqual(q1.drain(), { added: [a, b], removed: [], changed: [] });
  w.add(a, pos, { x: 1 });                 // replacement counts as a change
  w.markChanged(b, pos);                   // in-place mutation flagged explicitly
  w.markChanged(b, vel);                   // component it lacks: ignored
  w.destroy(a);
  assert.deepEqual(q1.drain(), { added: [], removed: [a], changed: [b] });
  // q2 never drained: a entered and left (nothing to report), b entered (its change is folded into added).
  assert.deepEqual(q2.drain(), { added: [b], removed: [], changed: [] });
});

test('enter-and-leave before a drain reports nothing; leave-and-reenter reports a change', () => {
  const w = new EntityStore();
  const q = w.query({ with: [pos] });
  const a = w.create('o'), b = w.create('o');
  w.add(a, pos, { x: 0 }); w.remove(a, pos);
  w.add(b, pos, { x: 0 }); q.drain();
  w.remove(b, pos); w.add(b, pos, { x: 1 });
  assert.deepEqual(q.drain(), { added: [], removed: [], changed: [b] });
  assert.deepEqual(q.drain(), { added: [], removed: [], changed: [] });
});

test('changes to a without component do not count as a change', () => {
  const w = new EntityStore();
  const q = w.query({ with: [pos], without: [frozen] });
  const a = w.create('o'); w.add(a, pos, { x: 0 }); q.drain();
  w.markChanged(a, frozen);
  assert.deepEqual(q.peek().changed, []);
});

test('each iterates a snapshot: destroy and create inside the callback are safe', () => {
  const w = new EntityStore();
  const q = w.query({ with: [pos] });
  const ids = [1, 2, 3].map(() => { const e = w.create('o'); w.add(e, pos, { x: 0 }); return e; });
  const seen: number[] = [];
  q.each((id) => {
    seen.push(id);
    if (id === ids[0]) w.destroy(ids[1]!);
    const n = w.create('o'); w.add(n, pos, { x: 9 });
  });
  assert.deepEqual(seen, [ids[0], ids[2]]);
  assert.equal(q.size, 2 + 2);
});

test('disposing the last handle drops the cached query; a disposed handle throws', () => {
  const w = new EntityStore();
  const q = w.query({ with: [pos, vel] });
  q.dispose(); q.dispose();
  assert.equal(w.queryCount(), 0);
  assert.throws(() => q.ids(), /disposed/);
  assert.throws(() => w.query({ with: [] }), /at least one/);
});

test('clear empties membership; flush keeps queries consistent', () => {
  const w = new EntityStore();
  const q = w.query({ with: [pos] });
  const a = w.create('o'); w.add(a, pos, { x: 0 });
  w.destroy(a); w.flush();
  assert.equal(q.size, 0);
  const b = w.create('o'); w.add(b, pos, { x: 0 });
  w.clear();
  assert.equal(q.size, 0);
});

test('ctx.world.query handles are released with the plugin scope when the session stops', async () => {
  const { codePlugin, newHost, presetOf } = await import('./helpers/host.ts');
  let seen: number[] = [];
  const host = newHost([codePlugin('test/q', {
    activate(ctx) {
      const q = ctx.world.query({ with: [pos, vel] });
      const e = ctx.world.create(); ctx.world.add(e, pos, { x: 0 }); ctx.world.add(e, vel, { dx: 1 });
      ctx.systems.add({ id: 'test/q-sys', phase: 'world', update: () => { seen = q.drain().added.slice(); } });
    },
  })]);
  const session = await host.apply(presetOf('test/p', ['test/q']));
  assert.equal(session.entities.queryCount(), 1);
  session.scheduler.advance(1 / 60);
  assert.equal(seen.length, 1);
  host.stop();
  assert.equal(session.entities.queryCount(), 0);
});
