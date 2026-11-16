import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceMap } from '../src/kernel/bus.ts';
import { Scope, SessionControl, createCommandQueue, isObject } from '../src/sdk/index.ts';
import type { CommandQueue, SessionContext } from '../src/sdk/index.ts';

function owner() {
  const scope = new Scope('test', 'command-queue');
  const map = new ServiceMap();
  const services: SessionContext['services'] = {
    provide: (token, value) => map.provide(token, value, 'test', scope),
    get: token => map.get(token),
    tryGet: token => map.tryGet(token),
  };
  return { scope, services };
}
const number = (input: unknown) => typeof input === 'number' && Number.isFinite(input) ? input : undefined;

test('command queue: capacity must be a positive safe integer before ownership is acquired', () => {
  const ctx = owner();
  for (const capacity of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createCommandQueue(ctx, { capacity, normalize: number }), RangeError);
    assert.equal(ctx.scope.size(), 0);
  }
  const queue = createCommandQueue(ctx, { capacity: Number.MAX_SAFE_INTEGER, normalize: number });
  assert.equal(queue.enqueue(1), true, 'capacity does not eagerly allocate a buffer');
  ctx.scope.dispose();
});

test('command queue: caller normalization detaches payloads; invalid/full ingress preserves bounded FIFO', () => {
  const ctx = owner();
  let normalizations = 0;
  const queue = createCommandQueue(ctx, { capacity: 2, normalize(input) {
    normalizations++;
    if (!isObject(input) || !Array.isArray(input.values) || !input.values.every(x => typeof x === 'number')) return undefined;
    return { values: [...input.values] as number[] };
  } });
  const input = { values: [1, 2] };
  assert.equal(queue.enqueue(input), true);
  input.values[0] = 99;
  assert.equal(queue.enqueue(null), false);
  assert.equal(queue.enqueue({ values: [3] }), true);
  assert.equal(queue.size, 2);
  const calls = normalizations;
  assert.equal(queue.enqueue({ values: [4] }), false);
  assert.equal(normalizations, calls, 'full rejection never invokes caller normalization');
  assert.deepEqual(queue.drainOne(), { values: [1, 2] });
  assert.equal(queue.enqueue({ values: [5] }), true);
  assert.deepEqual(queue.drainBatch(), [{ values: [3] }, { values: [5] }]);
  assert.equal(queue.size, 0);
  assert.equal(queue.drainOne(), undefined);
  assert.deepEqual(queue.drainBatch(), []);
  ctx.scope.dispose();
});

test('command queue: snapshot batches transfer ownership and do not absorb recursively produced work', () => {
  const ctx = owner();
  const queue = createCommandQueue(ctx, { capacity: 2, normalize: number });
  queue.enqueue(1); queue.enqueue(2);
  const batch = queue.drainBatch();
  const seen: number[] = [];
  for (const command of batch) { seen.push(command); assert.equal(queue.enqueue(command + 2), true); }
  assert.deepEqual(seen, [1, 2]);
  assert.equal(queue.size, 2);
  queue.clear();
  assert.deepEqual(batch, [1, 2], 'clear affects only pending work');
  queue.enqueue(5);
  const final = queue.drainBatch();
  queue.dispose();
  assert.deepEqual(final, [5], 'disposal cannot revoke already transferred work');
  assert.deepEqual(queue.drainBatch(), []);
});

test('command queue: observing pause at ingress or either drain drops pending work without spending it', () => {
  const ctx = owner(), control = { playing: true };
  ctx.services.provide(SessionControl, control);
  const queue = createCommandQueue(ctx, { capacity: 2, normalize: number });
  queue.enqueue(1);
  control.playing = false;
  assert.equal(queue.enqueue(2), false);
  control.playing = true;
  assert.equal(queue.drainOne(), undefined, 'observed paused ingress clears even without a paused tick');
  queue.enqueue(3); control.playing = false;
  assert.equal(queue.drainOne(), undefined);
  control.playing = true;
  assert.equal(queue.size, 0);
  queue.enqueue(4); control.playing = false;
  assert.deepEqual(queue.drainBatch(), []);
  control.playing = true;
  queue.enqueue(5);
  control.playing = false; control.playing = true;
  assert.equal(queue.drainOne(), 5, 'a boolean cannot report an entirely unobserved pause/resume');
  ctx.scope.dispose();
});

test('command queue: independent owners, early disposal, recreation and late creation release ownership', () => {
  const a = owner(), b = owner();
  const first = createCommandQueue(a, { capacity: 1, normalize: number });
  const other = createCommandQueue(b, { capacity: 1, normalize: number });
  first.enqueue(1); other.enqueue(2);
  for (let i = 0; i < 50; i++) {
    const temporary = createCommandQueue(a, { capacity: 1, normalize: number });
    assert.equal(a.scope.size(), 2);
    temporary.enqueue(3); temporary.dispose(); temporary.dispose();
    assert.equal(temporary.enqueue(4), false);
    assert.equal(temporary.size, 0);
    assert.equal(a.scope.size(), 1);
  }
  a.scope.signal.addEventListener('abort', () => {
    assert.equal(first.enqueue(5), false, 'owner abort precedes individual resource cleanup');
    assert.equal(first.drainOne(), undefined);
  });
  a.scope.dispose();
  first.dispose(); first.clear();
  assert.equal(first.size, 0);
  assert.deepEqual(first.drainBatch(), []);
  assert.equal(other.drainOne(), 2);
  const late = createCommandQueue(a, { capacity: 1, normalize: number });
  assert.equal(late.enqueue(6), false);
  assert.equal(a.scope.size(), 0);
  b.scope.dispose();
});

test('command queue: normalizer reentry cannot drain or enqueue around capacity; options are captured', () => {
  const ctx = owner();
  let queue: CommandQueue<number>;
  const options = { capacity: 1, normalize(input: unknown): number | undefined {
    options.capacity = 10;
    options.normalize = () => 99;
    assert.equal(queue.enqueue(2), false);
    assert.equal(queue.drainOne(), undefined);
    assert.deepEqual(queue.drainBatch(), []);
    return number(input);
  } };
  queue = createCommandQueue(ctx, options);
  assert.equal(queue.enqueue(1), true);
  assert.equal(queue.enqueue(2), false);
  assert.equal(queue.drainOne(), 1);
  assert.equal(queue.enqueue(3), true);
  assert.equal(queue.drainOne(), 3, 'reassigning options does not replace the captured normalizer');
  ctx.scope.dispose();
});

test('command queue: pause, clear and disposal during normalization cannot commit stale commands', () => {
  for (const effect of ['pause', 'clear', 'dispose', 'owner-dispose'] as const) {
    const ctx = owner(), control = { playing: true };
    ctx.services.provide(SessionControl, control);
    let queue: CommandQueue<number>;
    queue = createCommandQueue(ctx, { capacity: 2, normalize(input) {
      if (input === 2) {
        if (effect === 'pause') control.playing = false;
        else if (effect === 'clear') queue.clear();
        else if (effect === 'dispose') queue.dispose();
        else ctx.scope.dispose();
      }
      return number(input);
    } });
    assert.equal(queue.enqueue(1), true);
    assert.equal(queue.enqueue(2), false, effect);
    assert.equal(queue.size, 0, effect);
    control.playing = true;
    assert.equal(queue.enqueue(3), effect === 'pause' || effect === 'clear', effect);
    ctx.scope.dispose();
  }
});

test('command queue: pause-service getter reentry and disposal cannot bypass the guard', () => {
  for (const effect of ['reenter', 'clear', 'dispose', 'owner-dispose'] as const) {
    const ctx = owner();
    let queue: CommandQueue<number>;
    let reads = 0;
    ctx.services.provide(SessionControl, { get playing() {
      reads++;
      if (effect === 'reenter') {
        assert.equal(queue.enqueue(2), false);
        assert.equal(queue.drainOne(), undefined);
        assert.deepEqual(queue.drainBatch(), []);
      } else if (effect === 'clear') queue.clear();
      else if (effect === 'dispose') queue.dispose();
      else ctx.scope.dispose();
      return true;
    } });
    queue = createCommandQueue(ctx, { capacity: 1, normalize: number });
    assert.equal(queue.enqueue(1), effect === 'reenter', effect);
    assert.equal(queue.size, effect === 'reenter' ? 1 : 0, effect);
    assert.ok(reads <= 2, 'reentry does not recursively sample the gate');
    ctx.scope.dispose();
  }
});

test('command queue: throwing normalization or pause getters leave pending work intact and release guards', () => {
  const ctx = owner();
  let failGate = false;
  ctx.services.provide(SessionControl, { get playing() {
    if (failGate) throw new Error('gate failed');
    return true;
  } });
  const queue = createCommandQueue(ctx, { capacity: 2, normalize(input) {
    if (input === 'throw') throw new Error('normalize failed');
    return number(input);
  } });
  queue.enqueue(1);
  assert.throws(() => queue.enqueue('throw'), /normalize failed/);
  assert.equal(queue.size, 1);
  failGate = true;
  assert.throws(() => queue.drainBatch(), /gate failed/);
  assert.equal(queue.size, 1);
  failGate = false;
  assert.equal(queue.enqueue(2), true);
  assert.deepEqual(queue.drainBatch(), [1, 2]);
  ctx.scope.dispose();
});
