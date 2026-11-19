import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/kernel/scheduler.ts';
import type { SchedulerHooks, SystemFault } from '../src/kernel/scheduler.ts';

const PHASES = ['input', 'sim', 'late'];

function quietHooks(faults: SystemFault[] = []): SchedulerHooks {
  return { onFault: (f) => faults.push(f) };
}

/** One sim system that logs the tick it ran at and integrates x += 3 * dt. */
function motionScheduler(maxTicksPerFrame?: number) {
  const log: { tick: number; x: number }[] = [];
  const sched = new Scheduler(PHASES, quietHooks(), 1 / 60, maxTicksPerFrame);
  let x = 0;
  sched.addSystem(
    {
      id: 'test/motion',
      phase: 'sim',
      update(dt) {
        x += 3 * dt;
        log.push({ tick: sched.tick, x });
      },
    },
    'test',
  );
  return { sched, log, getX: () => x };
}

test('systems run in phase order, then order, then id', () => {
  const sched = new Scheduler(PHASES, quietHooks());
  const seq: string[] = [];
  const add = (id: string, phase: string, order?: number) =>
    sched.addSystem({ id, phase, order, update: () => void seq.push(id) }, 'test');
  add('test/late', 'late');
  add('test/b', 'sim', 0);
  add('test/a', 'sim', 0);
  add('test/first', 'input');
  add('test/sim-second', 'sim', 5);
  add('test/sim-early', 'sim', -1);
  sched.runTick();
  assert.deepEqual(seq, ['test/first', 'test/sim-early', 'test/a', 'test/b', 'test/sim-second', 'test/late']);
});

test('duplicate system id throws', () => {
  const sched = new Scheduler(PHASES, quietHooks());
  sched.addSystem({ id: 'test/dup', phase: 'sim', update() {} }, 'mod-a');
  assert.throws(() => sched.addSystem({ id: 'test/dup', phase: 'sim', update() {} }, 'mod-b'), /test\/dup/);
});

test('unknown phase throws', () => {
  const sched = new Scheduler(PHASES, quietHooks());
  assert.throws(() => sched.addSystem({ id: 'test/x', phase: 'nope', update() {} }, 'test'), /unknown phase "nope"/);
});

test('the remover returned by addSystem removes the system', () => {
  const sched = new Scheduler(PHASES, quietHooks());
  let runs = 0;
  const remove = sched.addSystem({ id: 'test/counter', phase: 'sim', update: () => void runs++ }, 'test');
  sched.runTick();
  assert.equal(runs, 1);
  remove();
  sched.runTick();
  assert.equal(runs, 1);
  assert.equal(sched.systemCount(), 0);
});

test('fixed-step: 60 frames of 1/60, 30 frames of 1/30 and irregular frames all give 60 ticks', () => {
  const a = motionScheduler();
  for (let i = 0; i < 60; i++) a.sched.advance(1 / 60);

  const b = motionScheduler();
  for (let i = 0; i < 30; i++) b.sched.advance(1 / 30);

  const c = motionScheduler();
  const irregular = [0.004, 1 / 30 - 0.004];
  for (let i = 0; i < 30; i++) for (const dt of irregular) c.sched.advance(dt);

  assert.equal(a.sched.tick, 60);
  assert.equal(b.sched.tick, 60);
  assert.equal(c.sched.tick, 60);
  assert.equal(a.sched.time, 60 * (1 / 60));
});

test('fixed-step: the position after the same tick count is bit-identical across frame patterns', () => {
  const a = motionScheduler();
  for (let i = 0; i < 60; i++) a.sched.advance(1 / 60);

  const b = motionScheduler();
  for (let i = 0; i < 30; i++) b.sched.advance(1 / 30);

  const c = motionScheduler();
  const irregular = [0.004, 1 / 30 - 0.004];
  for (let i = 0; i < 30; i++) for (const dt of irregular) c.sched.advance(dt);

  const n = 60;
  assert.equal(a.log.length, n);
  assert.equal(b.log.length, n);
  assert.equal(c.log.length, n);
  for (let t = 0; t < n; t++) {
    assert.equal(a.log[t]!.x, b.log[t]!.x);
    assert.equal(a.log[t]!.x, c.log[t]!.x);
  }
  assert.equal(a.getX(), b.getX());
  assert.equal(a.getX(), c.getX());
});

test('advance(1.0) runs at most maxTicksPerFrame ticks and drops the whole-step backlog', () => {
  const { sched } = motionScheduler(5);
  const ran = sched.advance(1.0);
  assert.equal(ran, 5);
  assert.equal(sched.tick, 5);
  assert.ok(sched.droppedTime > 0, `droppedTime should be positive, got ${sched.droppedTime}`);
  assert.equal(sched.lastFrameTicks, 5);
});

test('after a dropped backlog, the next normal frame runs exactly one tick, not a burst', () => {
  const { sched } = motionScheduler(5);
  sched.advance(1.0);
  const before = sched.tick;
  const ran = sched.advance(1 / 60);
  assert.equal(ran, 1);
  assert.equal(sched.tick, before + 1);
});

test('paused runs no ticks but still runs frame systems', () => {
  const sched = new Scheduler(PHASES, quietHooks());
  let sim = 0;
  const frames: number[] = [];
  sched.addSystem({ id: 'test/sim', phase: 'sim', update: () => void sim++ }, 'test');
  sched.addFrameSystem({ id: 'test/frame', update: (alpha) => void frames.push(alpha) }, 'test');
  sched.paused = true;
  assert.equal(sched.advance(1), 0);
  assert.equal(sched.advance(1 / 60), 0);
  assert.equal(sim, 0);
  assert.equal(sched.tick, 0);
  assert.equal(frames.length, 2);
});

test('a throwing system reports owner and system id to onFault, faults the scheduler and stops the tick', () => {
  const faults: SystemFault[] = [];
  const sched = new Scheduler(PHASES, quietHooks(faults));
  const ran: string[] = [];
  sched.addSystem({ id: 'test/before', phase: 'sim', update: () => void ran.push('before') }, 'core');
  sched.addSystem(
    {
      id: 'test/bad',
      phase: 'sim',
      order: 1,
      update() {
        throw new Error('kaboom');
      },
    },
    'mod-broken',
  );
  sched.addSystem({ id: 'test/after', phase: 'sim', order: 2, update: () => void ran.push('after') }, 'core');

  sched.runTick();

  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.owner, 'mod-broken');
  assert.equal(faults[0]!.systemId, 'test/bad');
  assert.match((faults[0]!.error as Error).message, /kaboom/);
  assert.equal(sched.faulted, true);
  assert.deepEqual(ran, ['before']);
  assert.equal(sched.tick, 0);
});

test('after a fault further advance() calls run nothing', () => {
  const faults: SystemFault[] = [];
  const sched = new Scheduler(PHASES, quietHooks(faults));
  let frames = 0;
  let sims = 0;
  sched.addSystem({ id: 'test/sim', phase: 'sim', update: () => void sims++ }, 'core');
  sched.addSystem(
    {
      id: 'test/boom',
      phase: 'sim',
      order: 1,
      update() {
        throw new Error('x');
      },
    },
    'mod-x',
  );
  sched.addFrameSystem({ id: 'test/frame', update: () => void frames++ }, 'core');
  sched.advance(1);
  const simsAfterFault = sims;
  const framesAfterFault = frames;
  assert.equal(faults.length, 1);
  assert.equal(sched.advance(1), 0);
  assert.equal(sched.advance(1 / 60), 0);
  assert.equal(sims, simsAfterFault);
  assert.equal(frames, framesAfterFault);
  assert.equal(faults.length, 1);
});

test('time equals tick * step', () => {
  const sched = new Scheduler(PHASES, quietHooks(), 0.5);
  sched.addSystem({ id: 'test/noop', phase: 'sim', update() {} }, 'test');
  sched.runTick();
  sched.runTick();
  sched.runTick();
  assert.equal(sched.tick, 3);
  assert.equal(sched.time, 1.5);
});

test('frame systems receive an alpha within [0, 1]', () => {
  const sched = new Scheduler(PHASES, quietHooks());
  sched.addSystem({ id: 'test/sim', phase: 'sim', update() {} }, 'test');
  const alphas: number[] = [];
  sched.addFrameSystem({ id: 'test/frame', update: (alpha) => void alphas.push(alpha) }, 'test');
  for (const dt of [0, 0.004, 1 / 60, 0.03, 0.5, 2]) sched.advance(dt);
  assert.equal(alphas.length, 6);
  for (const a of alphas) {
    assert.ok(a >= 0 && a <= 1, `alpha ${a} out of range`);
  }
});

// Removal contract (docs/reference/architecture.md §"Tick"): additions made during a tick start on the next tick; removals take
// effect immediately, so a removed system never runs again, not even later in the tick in which it was removed.
// This keeps a disposed plugin's systems from touching resources its scope has already released.
test('a system removed mid-tick by an earlier system does not run later in that tick', () => {
  const s = new Scheduler(PHASES, quietHooks());
  const log: string[] = [];
  let removeB: () => void = () => {};
  s.addSystem({ id: 'a', phase: 'input', update: () => { log.push(`a${s.tick}`); if (s.tick === 1) removeB(); } }, 'p');
  removeB = s.addSystem({ id: 'b', phase: 'sim', update: () => log.push(`b${s.tick}`) }, 'p');
  s.runTick();
  s.runTick();
  s.runTick();
  assert.deepEqual(log, ['a0', 'b0', 'a1', 'a2']);
});

test('a system may remove itself; it finishes its current update and never runs again', () => {
  const s = new Scheduler(PHASES, quietHooks());
  const log: string[] = [];
  let removeSelf: () => void = () => {};
  removeSelf = s.addSystem({ id: 'a', phase: 'sim', update: () => { log.push(`a${s.tick}`); removeSelf(); log.push('after'); } }, 'p');
  s.addSystem({ id: 'b', phase: 'late', update: () => log.push(`b${s.tick}`) }, 'p');
  s.runTick();
  s.runTick();
  assert.deepEqual(log, ['a0', 'after', 'b0', 'b1']);
});

test('a system added mid-tick starts on the next tick, even when its phase has not run yet', () => {
  const s = new Scheduler(PHASES, quietHooks());
  const log: string[] = [];
  let added = false;
  s.addSystem({ id: 'a', phase: 'input', update: () => {
    log.push(`a${s.tick}`);
    if (!added) { added = true; s.addSystem({ id: 'late-add', phase: 'late', update: () => log.push(`late${s.tick}`) }, 'p'); }
  } }, 'p');
  s.runTick();
  s.runTick();
  assert.deepEqual(log, ['a0', 'a1', 'late1']);
});
