import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScopeDisposedError } from '@bulkhead/kernel/scope.ts';
import type { CatalogEntry, HostStage, PluginModule, SessionContext } from '@bulkhead/kernel/host.ts';
import type { SystemFault } from '@bulkhead/kernel/scheduler.ts';
import { defineCommand, defineEvent, defineRegistry, defineRole, defineService } from '@bulkhead/sdk/core.ts';
import { codePlugin, contentPack, deferred, flush, hostFailure, newHost, presetOf, rejection, totals, zeroReport } from './helpers/host.ts';

const REG = defineRegistry<{ label: string }>('test/thing');
const EV = defineEvent<number>('test/ev');
const CMD = defineCommand<number, number>('test/cmd');
const SVC = defineService<{ n: number }>('test/svc');
interface Provider {
  name: string;
  activate?(ctx: SessionContext): void;
}
const ROLE = defineRole<Provider>('test/role');

interface Counter {
  n: number;
}
const counter = (): Counter => ({ n: 0 });
const sys = (id: string, c: Counter, phase = 'world') => ({ id, phase, update: () => void c.n++ });

/** A plugin that adds one counting system so tests can prove a session is still ticking. */
function tickingPlugin(id: string, c: Counter, over: Record<string, unknown> = {}, extra: PluginModule = {}): CatalogEntry {
  return codePlugin(
    id,
    {
      ...extra,
      activate(ctx) {
        ctx.systems.add(sys(`${id}-tick`, c));
        return extra.activate?.(ctx);
      },
    },
    over,
  );
}

function assertTicks(host: ReturnType<typeof newHost>, c: Counter): void {
  const before = c.n;
  host.session!.scheduler.runTick();
  assert.equal(c.n, before + 1, 'the system must still tick');
}

// =====================================================================================================================
// B. Exclusive roles
// =====================================================================================================================

function roleCatalog(log: string[]): CatalogEntry[] {
  return [
    codePlugin(
      'test/p1',
      {
        register: (ctx) => ctx.provideRole(ROLE, 'test/x', { name: 'X', activate: (c) => void log.push(`role-x(${c.pluginId})`) }),
        activate: (ctx) => void log.push(`activate:${ctx.pluginId}`),
      },
    ),
    codePlugin(
      'test/p2',
      {
        register: (ctx) => ctx.provideRole(ROLE, 'test/y', { name: 'Y', activate: (c) => void log.push(`role-y(${c.pluginId})`) }),
        activate: (ctx) => void log.push(`activate:${ctx.pluginId}`),
      },
    ),
    codePlugin('test/user', { activate: (ctx) => void log.push(`activate:${ctx.pluginId}`) }, { requiresRoles: ['test/role'] }),
    codePlugin('test/plain', { activate: (ctx) => void log.push(`activate:${ctx.pluginId}`) }),
  ];
}

test('roles: a required role without a selection fails validate naming the role and the available providers', async () => {
  const host = newHost(roleCatalog([]));
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/p1', 'test/p2', 'test/user'])));
  assert.equal(e.stage, 'validate');
  assert.match(e.message, /"test\/user" requires a provider for exclusive role "test\/role"/);
  assert.match(e.message, /"test\/x" \(from test\/p1\)/);
  assert.match(e.message, /"test\/y" \(from test\/p2\)/);
  assert.equal(host.session, undefined);
  assert.equal(host.active, undefined);
});

test('roles: a required role with no provider enabled says that nothing offers it', async () => {
  const host = newHost(roleCatalog([]));
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/user'])));
  assert.equal(e.stage, 'validate');
  assert.match(e.message, /"test\/role"/);
  assert.match(e.message, /No enabled plugin offers one/);
});

test('roles: selecting an unknown provider fails validate and lists the real ones', async () => {
  const host = newHost(roleCatalog([]));
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/p1', 'test/user'], { roles: { 'test/role': 'test/nope' } })));
  assert.equal(e.stage, 'validate');
  assert.match(e.message, /"test\/nope"/);
  assert.match(e.message, /not offered/);
  assert.match(e.message, /"test\/x"/);
});

test('roles: selecting a provider that belongs to a plugin that is not enabled fails validate', async () => {
  const host = newHost(roleCatalog([]));
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/p1', 'test/user'], { roles: { 'test/role': 'test/y' } })));
  assert.equal(e.stage, 'validate');
  assert.match(e.message, /"test\/y"/);
});

test('roles: two providers enabled, role not required, no selection -> ambiguous', async () => {
  const host = newHost(roleCatalog([]));
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/p1', 'test/p2', 'test/plain'])));
  assert.equal(e.stage, 'validate');
  assert.match(e.message, /ambiguous exclusive role "test\/role"/);
  assert.match(e.message, /test\/p1/);
  assert.match(e.message, /test\/p2/);
});

test('roles: one provider enabled and not required needs no selection', async () => {
  const log: string[] = [];
  const host = newHost(roleCatalog(log));
  await host.apply(presetOf('test/p', ['test/p1', 'test/plain']));
  assert.equal(host.session?.state, 'running');
});

test('roles: with two providers and one selected only the selected provider activates, after all plugins, with the owner context', async () => {
  const log: string[] = [];
  const host = newHost(roleCatalog(log));
  let seen: { id: string; name: string } | undefined;
  const entries = roleCatalog(log);
  entries.push(
    codePlugin('test/zz-last', {
      activate: (ctx) => {
        log.push(`activate:${ctx.pluginId}`);
        const r = ctx.role(ROLE);
        if (r) seen = { id: r.id, name: r.provider.name };
      },
    }),
  );
  host.setCatalog(entries);
  await host.apply(presetOf('test/p', ['test/p1', 'test/p2', 'test/user', 'test/zz-last'], { roles: { 'test/role': 'test/y' } }));
  assert.deepEqual(log, ['activate:test/p1', 'activate:test/p2', 'activate:test/user', 'activate:test/zz-last', 'role-y(test/p2)']);
  assert.deepEqual(seen, { id: 'test/y', name: 'Y' });
  assert.ok(!log.some((l) => l.startsWith('role-x')), 'the unselected provider must never activate');
});

test('roles: selecting the other provider flips which one activates (owner = p1)', async () => {
  const log: string[] = [];
  const host = newHost(roleCatalog(log));
  await host.apply(presetOf('test/p', ['test/p1', 'test/p2', 'test/user'], { roles: { 'test/role': 'test/x' } }));
  assert.deepEqual(log.filter((l) => l.startsWith('role-')), ['role-x(test/p1)']);
  assert.equal(log[log.length - 1], 'role-x(test/p1)');
});

// =====================================================================================================================
// C. Staging isolation
// =====================================================================================================================

interface BadCase {
  name: string;
  stage: HostStage;
  plugins: string[];
  entries: CatalogEntry[];
  pluginId?: string;
  messageIncludes: (string | RegExp)[];
}

const badCases: BadCase[] = [
  {
    name: 'graph failure (missing dependency)',
    stage: 'graph',
    plugins: ['test/bad-graph'],
    entries: [codePlugin('test/bad-graph', {}, { dependencies: { 'test/ghost': '^1.0.0' } })],
    messageIncludes: ['test/bad-graph', 'test/ghost'],
  },
  {
    name: 'register() throws',
    stage: 'register',
    plugins: ['test/bad-register'],
    pluginId: 'test/bad-register',
    entries: [
      codePlugin('test/bad-register', {
        register: () => {
          throw new Error('kaboom-in-register');
        },
      }),
    ],
    messageIncludes: ['test/bad-register', 'kaboom-in-register'],
  },
  {
    name: 'duplicate registry id across two plugins',
    stage: 'register',
    plugins: ['test/dup-a', 'test/dup-b'],
    pluginId: 'test/dup-b',
    entries: [
      codePlugin('test/dup-a', { register: (ctx) => ctx.register(REG, 'test/same', { label: 'a' }) }),
      codePlugin('test/dup-b', { register: (ctx) => ctx.register(REG, 'test/same', { label: 'b' }) }),
    ],
    messageIncludes: ['test/same', '"test/dup-a"', '"test/dup-b"'],
  },
  {
    name: 'content entry of an unknown kind',
    stage: 'register',
    plugins: ['test/bad-content'],
    pluginId: 'test/bad-content',
    entries: [codePlugin('test/bad-content', {}, {}, [{ kind: 'no-such-kind', id: 'test/c', data: {} }])],
    messageIncludes: ['no-such-kind', 'test/bad-content'],
  },
  {
    name: 'content loader reports an error',
    stage: 'register',
    plugins: ['test/loader'],
    pluginId: 'test/loader',
    entries: [
      codePlugin(
        'test/loader',
        {
          register: (ctx) =>
            ctx.contentKind('widget', {
              description: 'widget',
              load: (_data, c) => void c.r.error('widget data is rotten'),
            }),
        },
        {},
        [{ kind: 'widget', id: 'test/w', data: { a: 1 } }],
      ),
    ],
    messageIncludes: ['widget data is rotten', 'test/loader'],
  },
  {
    name: 'validator reports an issue',
    stage: 'validate',
    plugins: ['test/validator'],
    entries: [
      codePlugin('test/validator', {
        register: (ctx) => ctx.addValidator((v) => v.reporter('test/validator', 'cross-check').error('cross reference is broken')),
      }),
    ],
    messageIncludes: ['cross reference is broken', 'test/validator'],
  },
  {
    name: 'validator throws',
    stage: 'validate',
    plugins: ['test/validator-throws'],
    entries: [
      codePlugin('test/validator-throws', {
        register: (ctx) =>
          ctx.addValidator(() => {
            throw new Error('validator exploded');
          }),
      }),
    ],
    messageIncludes: ['validator exploded', 'test/validator-throws'],
  },
];

async function runningBase(extra: CatalogEntry[]): Promise<{ host: ReturnType<typeof newHost>; c: Counter }> {
  const c = counter();
  const base = tickingPlugin('test/base', c, {}, {
    register: (ctx) => ctx.register(REG, 'test/base-item', { label: 'base' }),
    activate: (ctx) => {
      ctx.world.create();
      ctx.events.on(EV, () => {});
    },
  });
  const host = newHost([base, ...extra]);
  await host.apply(presetOf('test/p1', ['test/base']));
  return { host, c };
}

for (const bad of badCases) {
  test(`staging isolation: apply() with a ${bad.name} rejects at "${bad.stage}" and leaves the running session untouched`, async () => {
    const { host, c } = await runningBase(bad.entries);
    const session = host.session!;
    const active = host.active!;
    const totalBefore = active.registries.total();
    const reportBefore = host.resourceReport();
    assert.equal(session.state, 'running');

    const e = await hostFailure(host.apply(presetOf('test/p2', ['test/base', ...bad.plugins])));
    assert.equal(e.stage, bad.stage);
    assert.equal(e.pluginId, bad.pluginId);
    for (const part of bad.messageIncludes) {
      if (typeof part === 'string') assert.ok(e.message.includes(part), `message should include ${part}:\n${e.message}`);
      else assert.match(e.message, part);
    }
    assert.ok(e.issues.length > 0);

    assert.equal(host.session, session, 'same session object');
    assert.equal(host.active, active, 'same active graph');
    assert.equal(session.state, 'running');
    assert.equal(host.active!.registries.total(), totalBefore);
    assert.deepEqual(host.resourceReport(), reportBefore);
    assert.equal(host.active!.registries.get(REG, 'test/base-item')?.label, 'base');
    assertTicks(host, c);
    assertTicks(host, c);
  });
}

test('staging isolation: host.stage() alone never changes host.session, active graph or the catalog', async () => {
  const { host, c } = await runningBase([codePlugin('test/other', { register: (ctx) => ctx.register(REG, 'test/other-item', { label: 'o' }) })]);
  const session = host.session!;
  const active = host.active!;
  const reportBefore = host.resourceReport();
  const installedBefore = [...host.installed().keys()];

  const staged = await host.stage(presetOf('test/p2', ['test/base', 'test/other']));
  assert.equal(host.session, session);
  assert.equal(host.active, active);
  assert.notEqual(staged, active);
  assert.deepEqual(host.resourceReport(), reportBefore, 'a staged graph is not part of the active resources');
  assert.equal(session.registries.has(REG, 'test/other-item'), false, 'running registries are not polluted by staging');
  assert.equal(staged.registries.has(REG, 'test/other-item'), true);
  assert.deepEqual([...host.installed().keys()], installedBefore);
  assertTicks(host, c);

  host.discard(staged);
  assert.equal(staged.registries.total(), 0, 'a discarded staged graph is emptied');
  assert.equal(host.session, session);
  assert.equal(session.state, 'running');
  assertTicks(host, c);
});

test('staging isolation: a failing host.stage() alone does not touch the running session either', async () => {
  const { host, c } = await runningBase([codePlugin('test/bad-register', { register: () => { throw new Error('nope'); } })]);
  const session = host.session!;
  const e = await hostFailure(host.stage(presetOf('test/p2', ['test/base', 'test/bad-register'])));
  assert.equal(e.stage, 'register');
  assert.equal(host.session, session);
  assertTicks(host, c);
});

test('staging isolation: a bad preset shape fails at "preset" and a failing module load at "load", both without side effects', async () => {
  const entries: CatalogEntry[] = [
    { manifest: { schema: 1, id: 'test/unloadable', name: 'u', version: '1.0.0', kind: 'code', sdk: '^2.0.0' }, load: async () => { throw new Error('chunk 404'); } },
  ];
  const { host, c } = await runningBase(entries);
  const session = host.session!;
  const bad = await hostFailure(host.apply({ schema: 1, id: 'test/p2', name: 'x', plugins: 'not-an-array' }));
  assert.equal(bad.stage, 'preset');
  const load = await hostFailure(host.apply(presetOf('test/p3', ['test/base', 'test/unloadable'])));
  assert.equal(load.stage, 'load');
  assert.equal(load.pluginId, 'test/unloadable');
  assert.match(load.message, /chunk 404/);
  assert.equal(host.session, session);
  assertTicks(host, c);
});

// =====================================================================================================================
// D. Failed activation cleanup
// =====================================================================================================================

type Mode = 'sync' | 'async';

function failingCatalog(mode: Mode, order: string[], good: Counter): CatalogEntry[] {
  const dispose = (name: string) => () => void order.push(name);
  const earlySys = counter();
  return [
    tickingPlugin('test/early', earlySys, {}, {
      activate: (ctx) => {
        ctx.scope.add(dispose('early'));
        ctx.world.create();
      },
    }),
    codePlugin(
      'test/late',
      {
        async activate(ctx) {
          ctx.systems.add(sys('test/late-sys', counter()));
          ctx.events.on(EV, () => {});
          ctx.commands.handle(CMD, (n) => n + 1);
          ctx.services.provide(SVC, { n: 1 });
          ctx.world.create();
          ctx.world.create();
          ctx.scope.add(dispose('late:a'));
          if (mode === 'async') await Promise.resolve();
          ctx.scope.add(dispose('late:b'));
          if (mode === 'async') await flush();
          ctx.scope.add(dispose('late:c'));
          if (mode === 'sync') throw new Error('late plugin exploded');
          await Promise.reject(new Error('late plugin exploded'));
        },
      },
      { dependencies: { 'test/early': '^1.0.0' } },
    ),
    tickingPlugin('test/good', good),
  ];
}

for (const mode of ['sync', 'async'] as const) {
  test(`failed activation (${mode}): everything the plugin acquired is released, nothing leaks, and a good preset then runs`, async () => {
    const order: string[] = [];
    const good = counter();
    const host = newHost(failingCatalog(mode, order, good));
    const e = await hostFailure(host.apply(presetOf('test/bad', ['test/early', 'test/late'])));
    assert.equal(e.stage, 'activate');
    assert.equal(e.pluginId, 'test/late');
    assert.match(e.message, /"test\/late"/);
    assert.match(e.message, /late plugin exploded/);

    assert.equal(host.session, undefined);
    assert.equal(host.active, undefined);
    // every disposer exactly once; later plugin first (reverse activation order), LIFO inside a plugin
    assert.deepEqual(order, ['late:c', 'late:b', 'late:a', 'early']);
    assert.deepEqual(totals(host), zeroReport());
    const log = host.log.find((l) => l.level === 'error' && l.source === 'test/late');
    assert.ok(log, 'the failure is logged against the failing plugin');
    assert.match(log.message, /late plugin exploded/);

    const s = await host.apply(presetOf('test/good', ['test/good']));
    assert.equal(host.session, s);
    assert.equal(s.state, 'running');
    assertTicks(host, good);
    assert.deepEqual(order, ['late:c', 'late:b', 'late:a', 'early'], 'the good apply must not re-run old disposers');
  });
}

test('failed activation: a running session that is replaced by a failing activation is gone too (no half-state)', async () => {
  const order: string[] = [];
  const good = counter();
  const host = newHost(failingCatalog('sync', order, good));
  const first = await host.apply(presetOf('test/good', ['test/good']));
  await hostFailure(host.apply(presetOf('test/bad', ['test/early', 'test/late'])));
  assert.equal(first.state, 'disposed', 'activation of a replacement stops the old session first');
  assert.equal(host.session, undefined);
  assert.deepEqual(totals(host), zeroReport());
});

test('failed activation: a role provider whose activate() throws fails at "activate" naming the owner', async () => {
  const host = newHost([
    codePlugin('test/p1', {
      register: (ctx) =>
        ctx.provideRole(ROLE, 'test/x', {
          name: 'X',
          activate: () => {
            throw new Error('provider exploded');
          },
        }),
    }),
  ]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/p1'], { roles: { 'test/role': 'test/x' } })));
  assert.equal(e.stage, 'activate');
  assert.equal(e.pluginId, 'test/p1');
  assert.match(e.message, /provider exploded/);
  assert.deepEqual(totals(host), zeroReport());
});

// =====================================================================================================================
// E. Late async completion
// =====================================================================================================================

interface LateProbe {
  ctx: SessionContext | undefined;
  lateDisposed: number;
  release: () => void;
  guardPromise: Promise<unknown> | undefined;
  lateSystemError: unknown;
  started: Promise<void>;
}

function latePlugin(): { entry: CatalogEntry; probe: LateProbe } {
  const gate = deferred<void>();
  const gate2 = deferred<void>();
  const started = deferred<void>();
  const probe: LateProbe = { ctx: undefined, lateDisposed: 0, release: () => { gate.resolve(); gate2.resolve(); }, guardPromise: undefined, lateSystemError: undefined, started: started.promise };
  const entry = codePlugin('test/late-async', {
    activate(ctx) {
      probe.ctx = ctx;
      probe.guardPromise = ctx.guard(gate2.promise);
      probe.guardPromise.catch(() => {});
      void gate.promise.then(() => {
        ctx.scope.add(() => void probe.lateDisposed++);
        try {
          ctx.systems.add(sys('test/late-system', counter()));
          ctx.events.on(EV, () => {});
          ctx.services.provide(SVC, { n: 99 });
        } catch (e) {
          probe.lateSystemError = e;
        }
        ctx.world.create();
      });
      started.resolve();
    },
  });
  return { entry, probe };
}

test('late completion after host.stop(): late disposer runs immediately, signal aborted, guard rejects, nothing resurrected', async () => {
  const { entry, probe } = latePlugin();
  const host = newHost([entry, tickingPlugin('test/other', counter())]);
  const session = await host.apply(presetOf('test/p', ['test/late-async']));
  const ctx = probe.ctx!;
  assert.equal(ctx.signal.aborted, false);
  host.stop();
  assert.equal(ctx.signal.aborted, true);
  assert.equal(probe.lateDisposed, 0);

  probe.release();
  await flush();
  assert.equal(probe.lateDisposed, 1, 'a disposer added after disposal runs immediately, exactly once');
  const err = await rejection(probe.guardPromise!);
  assert.ok(err instanceof ScopeDisposedError, `guard should reject with ScopeDisposedError, got ${String(err)}`);
  assert.equal(host.session, undefined);
  assert.equal(session.scheduler.systemCount(), 0, 'a late system must not survive in the dead session');
  assert.equal(session.events.handlerCount(), 0);
  assert.equal(session.services.list().length, 0);
  assert.deepEqual(totals(host), zeroReport());
});

test('late completion after apply(other): new session report is unaffected', async () => {
  const { entry, probe } = latePlugin();
  const c = counter();
  const host = newHost([entry, tickingPlugin('test/other', c, {}, { activate: (ctx) => void ctx.world.create() })]);
  const old = await host.apply(presetOf('test/p', ['test/late-async']));
  const next = await host.apply(presetOf('test/p2', ['test/other']));
  const before = host.resourceReport();
  assert.equal(before.systems, 1);
  assert.equal(before.entities, 1);
  assert.equal(probe.ctx!.signal.aborted, true);

  probe.release();
  await flush();
  assert.equal(probe.lateDisposed, 1);
  assert.ok((await rejection(probe.guardPromise!)) instanceof ScopeDisposedError);
  assert.deepEqual(host.resourceReport(), before);
  assert.equal(host.session, next);
  assert.equal(next.state, 'running');
  assert.equal(old.scheduler.systemCount(), 0);
  assertTicks(host, c);
});

test('late completion after restart(): the old session scope is dead immediately and the new session reports the same resources', async () => {
  const { entry, probe } = latePlugin();
  const host = newHost([entry, tickingPlugin('test/other', counter())]);
  const first = await host.apply(presetOf('test/p', ['test/late-async', 'test/other']));
  const firstCtx = probe.ctx!;
  const before = host.resourceReport();
  const second = await host.restart();
  assert.notEqual(first, second);
  assert.equal(firstCtx.signal.aborted, true);
  assert.equal(probe.ctx!.signal.aborted, false, 'the new session context is alive');
  assert.deepEqual(host.resourceReport(), before);
  assert.equal(first.scheduler.systemCount(), 0);
});

test('superseded: apply(A) blocked in activate, apply(B) overtakes it; A rejects "superseded" and nothing of A survives', async () => {
  const gate = deferred<void>();
  const started = deferred<void>();
  const aDisposed: string[] = [];
  const cB = counter();
  let aCtx: SessionContext | undefined;
  const host = newHost([
    codePlugin('test/slow', {
      register: (ctx) => ctx.register(REG, 'test/slow-item', { label: 'slow' }),
      async activate(ctx) {
        aCtx = ctx;
        ctx.scope.add(() => void aDisposed.push('slow'));
        ctx.systems.add(sys('test/slow-sys', counter()));
        ctx.world.create();
        started.resolve();
        await gate.promise;
        ctx.systems.add(sys('test/slow-sys-after-release', counter()));
      },
    }),
    tickingPlugin('test/fast', cB, {}, { activate: (ctx) => void ctx.world.create() }),
  ]);

  const pA = host.apply(presetOf('test/a', ['test/slow']));
  const settledA = pA.then(
    () => 'resolved',
    (e: unknown) => e,
  );
  await started.promise;
  const sessionB = await host.apply(presetOf('test/b', ['test/fast']));
  const reportB = host.resourceReport();
  assert.equal(host.session, sessionB);
  assert.deepEqual(aDisposed, ['slow'], 'A is torn down as soon as B takes over');

  gate.resolve();
  const outcome = await settledA;
  assert.notEqual(outcome, 'resolved');
  const err = await hostFailure(Promise.reject(outcome));
  assert.equal(err.stage, 'superseded');

  assert.equal(aCtx!.signal.aborted, true);
  assert.deepEqual(aDisposed, ['slow'], 'A disposers run exactly once');
  assert.equal(host.session, sessionB, 'B must still be the session after A gave up');
  assert.equal(sessionB.state, 'running', 'A giving up must not stop B');
  assert.equal(host.active?.preset.id, 'test/b');
  assert.deepEqual(host.resourceReport(), reportB);
  assert.equal(reportB.systems, 1);
  assert.equal(reportB.entities, 1);
  assert.equal(host.active!.registries.has(REG, 'test/slow-item'), false);
  assertTicks(host, cB);
});

test('superseded: a stop() while apply(A) is activating also rejects A with "superseded"', async () => {
  const gate = deferred<void>();
  const started = deferred<void>();
  const host = newHost([
    codePlugin('test/slow', {
      async activate(ctx) {
        ctx.systems.add(sys('test/slow-sys', counter()));
        started.resolve();
        await gate.promise;
      },
    }),
  ]);
  const pA = host.apply(presetOf('test/a', ['test/slow']));
  const settled = pA.then(() => 'resolved', (e: unknown) => e);
  await started.promise;
  host.stop();
  gate.resolve();
  const outcome = await settled;
  assert.notEqual(outcome, 'resolved');
  assert.equal((await hostFailure(Promise.reject(outcome))).stage, 'superseded');
  assert.equal(host.session, undefined);
  assert.deepEqual(totals(host), zeroReport());
});

// =====================================================================================================================
// F. Session mechanics
// =====================================================================================================================

test('session: disposal order is reverse dependency order', async () => {
  const order: string[] = [];
  const mk = (id: string, deps: Record<string, string> = {}) =>
    codePlugin(id, { activate: (ctx) => void ctx.scope.add(() => void order.push(id)) }, { dependencies: deps });
  const host = newHost([mk('test/x'), mk('test/y', { 'test/x': '^1.0.0' }), mk('test/z', { 'test/y': '^1.0.0' }), mk('test/a')]);
  const session = await host.apply(presetOf('test/p', ['test/z', 'test/y', 'test/x', 'test/a']));
  assert.deepEqual(session.order, ['test/a', 'test/x', 'test/y', 'test/z']);
  host.stop();
  assert.deepEqual(order, ['test/z', 'test/y', 'test/x', 'test/a']);
});

test('session: dispose() and stop() are idempotent', async () => {
  const order: string[] = [];
  const host = newHost([codePlugin('test/a', { activate: (ctx) => void ctx.scope.add(() => void order.push('a')) })]);
  const session = await host.apply(presetOf('test/p', ['test/a']));
  session.dispose();
  session.dispose();
  assert.equal(session.state, 'disposed');
  assert.equal(session.disposed, true);
  host.stop();
  host.stop();
  host.stop();
  assert.deepEqual(order, ['a']);
  assert.equal(host.session, undefined);
  assert.equal(host.active, undefined);
  assert.deepEqual(totals(host), zeroReport());
});

test('session: one throwing disposer does not stop the rest and is logged naming its owner', async () => {
  const order: string[] = [];
  const host = newHost([
    codePlugin('test/a', { activate: (ctx) => void ctx.scope.add(() => void order.push('a')) }),
    codePlugin('test/b', {
      activate(ctx) {
        ctx.scope.add(() => void order.push('b-first'));
        ctx.scope.add(() => {
          throw new Error('disposer-went-boom');
        }, 'texture');
        ctx.scope.add(() => void order.push('b-last'));
      },
    }, { dependencies: { 'test/a': '^1.0.0' } }),
  ]);
  await host.apply(presetOf('test/p', ['test/a', 'test/b']));
  assert.doesNotThrow(() => host.stop());
  assert.deepEqual(order, ['b-last', 'b-first', 'a']);
  const entry = host.log.find((l) => l.message.includes('disposer-went-boom'));
  assert.ok(entry, 'the failing cleanup must be logged');
  assert.equal(entry.source, 'test/b');
  assert.equal(entry.level, 'error');
  assert.match(entry.message, /texture/);
});

test('session: owner tracking for entities and resource kinds', async () => {
  let ea: number | undefined;
  let eb: number | undefined;
  const host = newHost([
    codePlugin('test/a', {
      activate(ctx) {
        ea = ctx.world.create();
        ctx.systems.add(sys('test/a-sys', counter()));
        ctx.events.on(EV, () => {});
        ctx.commands.handle(CMD, (n) => n);
        ctx.services.provide(SVC, { n: 1 });
      },
    }),
    codePlugin('test/b', {
      activate(ctx) {
        eb = ctx.world.create();
        ctx.systems.add(sys('test/b-sys', counter()));
        ctx.systems.add(sys('test/b-sys2', counter()));
      },
    }),
  ]);
  const session = await host.apply(presetOf('test/p', ['test/a', 'test/b']));
  assert.equal(session.contexts.get('test/a')!.world.ownerOf(ea!), 'test/a');
  assert.equal(session.contexts.get('test/b')!.world.ownerOf(eb!), 'test/b');
  assert.equal(session.entities.ownerOf(ea!), 'test/a');
  const by = host.resourceReport().byOwner;
  assert.deepEqual(by['test/a'], { system: 1, 'event-subscription': 1, 'command-handler': 1, service: 1 });
  assert.deepEqual(by['test/b'], { system: 2 });
  const r = host.resourceReport();
  assert.equal(r.systems, 3);
  assert.equal(r.eventHandlers, 1);
  assert.equal(r.commandHandlers, 1);
  assert.equal(r.services, 1);
  assert.equal(r.entities, 2);
});

test('session: duplicate system id across plugins fails activation naming both owners', async () => {
  const host = newHost([
    codePlugin('test/a', { activate: (ctx) => ctx.systems.add(sys('test/shared', counter())) }),
    codePlugin('test/b', { activate: (ctx) => ctx.systems.add(sys('test/shared', counter())) }),
  ]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/a', 'test/b'])));
  assert.equal(e.stage, 'activate');
  assert.equal(e.pluginId, 'test/b');
  assert.match(e.message, /"test\/shared"/);
  assert.match(e.message, /"test\/a"/);
  assert.match(e.message, /"test\/b"/);
  assert.equal(host.session, undefined);
  assert.deepEqual(totals(host), zeroReport());
});

test('session: a system with an unknown phase fails activation with the phase list', async () => {
  const host = newHost([codePlugin('test/a', { activate: (ctx) => ctx.systems.add({ id: 'test/s', phase: 'nope', update() {} }) })]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/a'])));
  assert.equal(e.stage, 'activate');
  assert.match(e.message, /unknown phase "nope"/);
  assert.match(e.message, /"test\/a"/);
});

test('session: a second commands.handle for the same command fails activation naming both owners', async () => {
  const host = newHost([
    codePlugin('test/a', { activate: (ctx) => ctx.commands.handle(CMD, (n) => n) }),
    codePlugin('test/b', { activate: (ctx) => ctx.commands.handle(CMD, (n) => n * 2) }),
  ]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/a', 'test/b'])));
  assert.equal(e.stage, 'activate');
  assert.equal(e.pluginId, 'test/b');
  assert.match(e.message, /"test\/cmd"/);
  assert.match(e.message, /"test\/a"/);
  assert.match(e.message, /"test\/b"/);
});

test('session: a second provider of the same service fails activation naming both owners', async () => {
  const host = newHost([
    codePlugin('test/a', { activate: (ctx) => ctx.services.provide(SVC, { n: 1 }) }),
    codePlugin('test/b', { activate: (ctx) => ctx.services.provide(SVC, { n: 2 }) }),
  ]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/a', 'test/b'])));
  assert.equal(e.stage, 'activate');
  assert.match(e.message, /"test\/svc"/);
  assert.match(e.message, /"test\/a"/);
  assert.match(e.message, /"test\/b"/);
});

test('session: commands dispatch to the handler; dispatching an unhandled command is actionable', async () => {
  let ctxB: SessionContext | undefined;
  const host = newHost([
    codePlugin('test/a', { activate: (ctx) => ctx.commands.handle(CMD, (n) => n + 1) }),
    codePlugin('test/b', { activate: (ctx) => void (ctxB = ctx) }),
  ]);
  await host.apply(presetOf('test/p', ['test/a', 'test/b']));
  assert.equal(ctxB!.commands.dispatch(CMD, 41), 42);
  assert.throws(() => ctxB!.commands.dispatch(defineCommand<number, number>('test/other'), 1), /No active plugin handles command "test\/other"/);
});

test('session: services.get of a missing service throws an actionable message; tryGet returns undefined', async () => {
  let ctx: SessionContext | undefined;
  const host = newHost([codePlugin('test/a', { activate: (c) => void (ctx = c) })]);
  await host.apply(presetOf('test/p', ['test/a']));
  assert.throws(() => ctx!.services.get(SVC), (e: unknown) => e instanceof Error && /"test\/svc"/.test(e.message) && /not available/.test(e.message) && /plugin/.test(e.message));
  assert.equal(ctx!.services.tryGet(SVC), undefined);
});

test('session: a system that throws puts the session in "faulted" with the responsible owner; no further ticks run', async () => {
  const okCount = counter();
  const badCount = counter();
  const host = newHost([
    codePlugin('test/ok', { activate: (ctx) => ctx.systems.add(sys('test/ok-sys', okCount, 'input')) }),
    codePlugin('test/bad', {
      activate: (ctx) =>
        ctx.systems.add({
          id: 'test/bad-sys',
          phase: 'world',
          update() {
            badCount.n++;
            if (badCount.n === 2) throw new Error('system blew up');
          },
        }),
    }),
  ]);
  const session = await host.apply(presetOf('test/p', ['test/ok', 'test/bad']));
  const faults: SystemFault[] = [];
  session.onFault = (f) => void faults.push(f);

  session.scheduler.runTick();
  assert.equal(session.state, 'running');
  assert.equal(session.scheduler.tick, 1);
  session.scheduler.runTick(); // bad throws here
  assert.equal(session.state, 'faulted');
  assert.equal(session.fault?.owner, 'test/bad');
  assert.equal(session.fault?.systemId, 'test/bad-sys');
  assert.match((session.fault!.error as Error).message, /system blew up/);
  assert.equal(faults.length, 1);
  assert.equal(faults[0], session.fault);
  assert.equal(session.scheduler.tick, 1, 'a faulted tick does not complete');

  const ok = okCount.n;
  const bad = badCount.n;
  session.scheduler.runTick();
  session.scheduler.runTick();
  assert.equal(session.scheduler.advance(1), 0);
  assert.equal(okCount.n, ok);
  assert.equal(badCount.n, bad);
  assert.equal(faults.length, 1, 'onFault fires once');
});

test('session: an event handler that throws faults the session naming the HANDLER plugin, not the emitter', async () => {
  const host = newHost([
    codePlugin('test/emitter', { activate: (ctx) => ctx.systems.add({ id: 'test/emit-sys', phase: 'world', update: () => ctx.events.emit(EV, 7) }) }),
    codePlugin('test/listener', {
      activate: (ctx) =>
        ctx.events.on(EV, () => {
          throw new Error('handler blew up');
        }),
    }),
  ]);
  const session = await host.apply(presetOf('test/p', ['test/emitter', 'test/listener']));
  let called = 0;
  session.onFault = () => void called++;
  session.scheduler.runTick();
  assert.equal(session.state, 'faulted');
  assert.equal(session.fault?.owner, 'test/listener');
  assert.ok(session.fault!.systemId.startsWith('event:'), session.fault!.systemId);
  assert.match(session.fault!.systemId, /test\/ev/);
  assert.match((session.fault!.error as Error).message, /handler blew up/);
  assert.equal(called, 1);
  const t = session.scheduler.tick;
  session.scheduler.runTick();
  assert.equal(session.scheduler.tick, t);
});

test('session: events emitted inside a system are delivered after that system and before the next one', async () => {
  const rec: string[] = [];
  const host = newHost([
    codePlugin('test/emitter', {
      activate: (ctx) => {
        ctx.systems.add({
          id: 'test/s1',
          phase: 'world',
          update() {
            rec.push('s1:start');
            ctx.events.emit(EV, 1);
            rec.push('s1:end');
          },
        });
        ctx.systems.add({ id: 'test/s3', phase: 'world', update: () => void rec.push('s3') });
      },
    }),
    codePlugin('test/listener', {
      activate: (ctx) => {
        ctx.systems.add({ id: 'test/s2', phase: 'world', update: () => void rec.push('s2') });
        ctx.events.on(EV, (n) => void rec.push(`handler:${n}`));
      },
    }),
  ]);
  const session = await host.apply(presetOf('test/p', ['test/emitter', 'test/listener']));
  rec.length = 0;
  session.scheduler.runTick();
  assert.deepEqual(rec, ['s1:start', 's1:end', 'handler:1', 's2', 's3']);
});

test('session: events emitted outside a tick are delivered immediately', async () => {
  const rec: number[] = [];
  let ctx: SessionContext | undefined;
  const host = newHost([codePlugin('test/a', { activate: (c) => { ctx = c; c.events.on(EV, (n) => void rec.push(n)); } })]);
  await host.apply(presetOf('test/p', ['test/a']));
  ctx!.events.emit(EV, 5);
  assert.deepEqual(rec, [5]);
});

test('session: instantiate() runs start once per session with the REGISTERING plugin context, and again after restart()', async () => {
  const calls: string[] = [];
  const instances: object[] = [];
  const host = newHost([
    codePlugin('test/owner', { register: (ctx) => ctx.register(REG, 'test/fac', { label: 'factory' }) }),
    codePlugin(
      'test/user',
      {
        activate(ctx) {
          const mk = () =>
            ctx.instantiate(REG, 'test/fac', (def, owner) => {
              calls.push(`${def.label}@${owner.pluginId}`);
              return { owner: owner.pluginId };
            });
          const a = mk();
          const b = mk();
          assert.equal(a, b, 'same instance within a session');
          instances.push(a);
        },
      },
      { dependencies: { 'test/owner': '^1.0.0' } },
    ),
  ]);
  await host.apply(presetOf('test/p', ['test/owner', 'test/user']));
  assert.deepEqual(calls, ['factory@test/owner']);
  await host.restart();
  assert.deepEqual(calls, ['factory@test/owner', 'factory@test/owner']);
  assert.notEqual(instances[0], instances[1], 'a new session gets a new instance');
});

test('session: instantiate() of a factory whose owner has not activated yet explains what to do', async () => {
  const host = newHost([
    codePlugin('test/early', { activate: (ctx) => void ctx.instantiate(REG, 'test/fac', () => ({})) }),
    codePlugin('test/owner', { register: (ctx) => ctx.register(REG, 'test/fac', { label: 'f' }) }),
  ]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/early', 'test/owner'])));
  assert.equal(e.stage, 'activate');
  assert.equal(e.pluginId, 'test/early');
  assert.match(e.message, /"test\/owner"/);
  assert.match(e.message, /dependency/);
});

// =====================================================================================================================
// G. Restart / switch accumulation
// =====================================================================================================================

test('restart/switch: 12 cycles of apply(P1), restart(), apply(P2) never grow resources; register once per apply, activate once per session', async () => {
  const registerCalls: Record<string, number> = {};
  const activateCalls: Record<string, number> = {};
  const bump = (m: Record<string, number>, k: string) => void (m[k] = (m[k] ?? 0) + 1);
  const mk = (id: string, deps: Record<string, string> = {}) =>
    codePlugin(
      id,
      {
        register(ctx) {
          bump(registerCalls, id);
          ctx.register(REG, `${id}-item`, { label: id });
          ctx.provideRole(ROLE, `${id}-role`, { name: id });
          ctx.addValidator(() => {});
        },
        activate(ctx) {
          bump(activateCalls, id);
          ctx.systems.add(sys(`${id}-sys`, counter()));
          ctx.events.on(EV, () => {});
          ctx.commands.handle(defineCommand<number, number>(`${id}-cmd`), (n) => n);
          ctx.services.provide(defineService<number>(`${id}-svc`), 1);
          ctx.world.create();
          ctx.world.create();
          ctx.scope.add(() => {}, 'custom');
          ctx.instantiate(REG, `${id}-item`, () => ({}));
        },
      },
      { dependencies: deps },
    );
  const host = newHost([mk('test/core'), mk('test/one', { 'test/core': '^1.0.0' }), mk('test/two', { 'test/core': '^1.0.0' })]);
  const P1 = presetOf('test/p1', ['test/core', 'test/one'], { roles: { 'test/role': 'test/core-role' } });
  const P2 = presetOf('test/p2', ['test/core', 'test/two'], { roles: { 'test/role': 'test/two-role' } });

  let base1: ReturnType<typeof host.resourceReport> | undefined;
  let base2: ReturnType<typeof host.resourceReport> | undefined;
  const expectReg: Record<string, number> = {};
  const expectAct: Record<string, number> = {};
  const inc = (m: Record<string, number>, ids: string[]) => ids.forEach((i) => bump(m, i));
  const check = (label: string) => {
    assert.deepEqual(registerCalls, expectReg, `register calls ${label}`);
    assert.deepEqual(activateCalls, expectAct, `activate calls ${label}`);
  };

  for (let i = 0; i < 12; i++) {
    await host.apply(P1);
    inc(expectReg, ['test/core', 'test/one']);
    inc(expectAct, ['test/core', 'test/one']);
    base1 ??= host.resourceReport();
    assert.deepEqual(host.resourceReport(), base1, `P1 apply #${i}`);
    check(`after P1 apply #${i}`);

    await host.restart();
    inc(expectAct, ['test/core', 'test/one']);
    assert.deepEqual(host.resourceReport(), base1, `P1 restart #${i}`);
    check(`after P1 restart #${i}`);

    await host.apply(P2);
    inc(expectReg, ['test/core', 'test/two']);
    inc(expectAct, ['test/core', 'test/two']);
    base2 ??= host.resourceReport();
    assert.deepEqual(host.resourceReport(), base2, `P2 apply #${i}`);
    check(`after P2 apply #${i}`);
  }
  assert.ok(base1);
  assert.equal(base1.entities, 4);
  assert.equal(base1.systems, 2);
  assert.ok(base1.registrations > 0);
  host.stop();
  assert.deepEqual(totals(host), zeroReport());
});

test('restart: keeps the same registrations and fresh runtime state; restart() without an active preset throws', async () => {
  const host = newHost([tickingPlugin('test/a', counter(), {}, { activate: (ctx) => void ctx.world.create() })]);
  await assert.rejects(host.restart(), /Nothing to restart/);
  const s1 = await host.apply(presetOf('test/p', ['test/a']));
  const active = host.active;
  const s2 = await host.restart();
  assert.notEqual(s1, s2);
  assert.equal(s1.state, 'disposed');
  assert.equal(host.active, active, 'registrations are kept');
  assert.equal(s2.scheduler.tick, 0);
  assert.equal(s2.generation, s1.generation + 1);
});

// =====================================================================================================================
// H. Config
// =====================================================================================================================

const cfgFields = {
  speed: { type: 'number', label: 'Speed', default: 5, min: 1, max: 10 },
  mode: { type: 'select', label: 'Mode', default: 'a', options: ['a', 'b'] },
  flag: { type: 'boolean', label: 'Flag', default: false },
};

function cfgHost(): { host: ReturnType<typeof newHost>; seen: { register: unknown; activate: unknown } } {
  const seen = { register: undefined as unknown, activate: undefined as unknown };
  const host = newHost([
    codePlugin(
      'test/cfg',
      {
        register: (ctx) => void (seen.register = { ...ctx.config }),
        activate: (ctx) => void (seen.activate = { ...ctx.config }),
      },
      { config: cfgFields },
    ),
    codePlugin('test/other'),
  ]);
  return { host, seen };
}

test('config: manifest defaults flow to ctx.config in register and activate', async () => {
  const { host, seen } = cfgHost();
  await host.apply(presetOf('test/p', ['test/cfg']));
  assert.deepEqual(seen.register, { speed: 5, mode: 'a', flag: false });
  assert.deepEqual(seen.activate, { speed: 5, mode: 'a', flag: false });
});

test('config: preset overrides win over defaults and untouched keys keep their default', async () => {
  const { host, seen } = cfgHost();
  await host.apply(presetOf('test/p', ['test/cfg'], { config: { 'test/cfg': { speed: 7, flag: true } } }));
  assert.deepEqual(seen.activate, { speed: 7, mode: 'a', flag: true });
  assert.deepEqual(host.active!.configs.get('test/cfg'), { speed: 7, mode: 'a', flag: true });
});

test('config: out-of-range value fails at "preset" with the field path and the plugin id', async () => {
  const { host } = cfgHost();
  for (const [value, text] of [[99, /<= 10/], [0, />= 1/], ['fast', /finite number/]] as const) {
    const e = await hostFailure(host.apply(presetOf('test/p', ['test/cfg'], { config: { 'test/cfg': { speed: value } } })));
    assert.equal(e.stage, 'preset');
    assert.equal(e.issues.length, 1);
    assert.equal(e.issues[0]!.path, 'config.test/cfg.speed');
    assert.match(e.message, text);
    assert.match(e.message, /"test\/cfg"/);
    assert.match(e.message, /Speed/);
  }
  assert.equal(host.session, undefined);
});

test('config: invalid select option and wrong boolean type are rejected', async () => {
  const { host } = cfgHost();
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/cfg'], { config: { 'test/cfg': { mode: 'zzz', flag: 'yes' } } })));
  assert.equal(e.stage, 'preset');
  assert.deepEqual(e.issues.map((i) => i.path).sort(), ['config.test/cfg.flag', 'config.test/cfg.mode']);
  assert.match(e.message, /expected one of: a, b/);
});

test('config: an unknown key fails at "preset" with the field path', async () => {
  const { host } = cfgHost();
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/cfg'], { config: { 'test/cfg': { bogus: 1 } } })));
  assert.equal(e.stage, 'preset');
  assert.equal(e.issues[0]!.path, 'config.test/cfg.bogus');
  assert.match(e.message, /"test\/cfg"/);
  assert.match(e.message, /"bogus"/);
});

test('config: configuration for a plugin that is not enabled fails at "preset"', async () => {
  const { host } = cfgHost();
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/cfg'], { config: { 'test/other': { x: 1 } } })));
  assert.equal(e.stage, 'preset');
  assert.equal(e.issues[0]!.path, 'config.test/other');
  assert.match(e.message, /"test\/other"/);
  assert.match(e.message, /not an enabled plugin/);
});

test('config: a manifest whose own default violates its range is rejected by the catalog', () => {
  const host = newHost([]);
  const issues = host.setCatalog([codePlugin('test/badcfg', {}, { config: { n: { type: 'number', label: 'N', default: 50, max: 10 } } })]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.path, /config\.n\.default/);
  assert.equal(host.installed().has('test/badcfg'), false);
});

// =====================================================================================================================
// I. Content packs
// =====================================================================================================================

function kindsPlugin(owners: string[] = []): CatalogEntry {
  return codePlugin('test/kinds', {
    register: (ctx) =>
      ctx.contentKind('thing', {
        description: 'a thing',
        load(data, c) {
          const o = data as { label?: unknown };
          if (typeof o.label !== 'string') return void c.r.at('label').error('label must be a string');
          owners.push(c.owner);
          c.register(REG, c.id, { label: o.label });
        },
      }),
  });
}
const dep = { dependencies: { 'test/kinds': '^1.0.0' } };

test('content: a data pack is loaded by the content kind of a code plugin it depends on; the pack owns the registration', async () => {
  const owners: string[] = [];
  const host = newHost([kindsPlugin(owners), contentPack('test/pack', [{ kind: 'thing', id: 'pack/x', data: { label: 'hello' } }, { kind: 'thing', id: 'pack/y', data: { label: 'world' } }], dep)]);
  await host.apply(presetOf('test/p', ['test/kinds', 'test/pack']));
  const reg = host.active!.registries;
  assert.equal(reg.get(REG, 'pack/x')?.label, 'hello');
  assert.equal(reg.get(REG, 'pack/y')?.label, 'world');
  assert.equal(reg.ownerOf(REG, 'pack/x'), 'test/pack');
  assert.deepEqual(owners, ['test/pack', 'test/pack']);
  assert.equal(host.resourceReport().registrations, 2);
});

test('content: removing the pack from the preset and applying removes its registrations (pack stays installed)', async () => {
  const host = newHost([kindsPlugin(), contentPack('test/pack', [{ kind: 'thing', id: 'pack/x', data: { label: 'hello' } }], dep)]);
  await host.apply(presetOf('test/p', ['test/kinds', 'test/pack']));
  const withPack = host.active!;
  assert.equal(withPack.registries.has(REG, 'pack/x'), true);
  await host.apply(presetOf('test/p2', ['test/kinds']));
  assert.equal(host.active!.registries.has(REG, 'pack/x'), false);
  assert.equal(host.active!.registries.total(), 0);
  assert.equal(withPack.registries.total(), 0, 'the old registry set is emptied');
  assert.equal(host.installed().has('test/pack'), true);
  assert.equal(host.catalogStatus().find((s) => s.id === 'test/pack')?.active, false);
});

test('content: a pack without the kind-defining plugin enabled is rejected with a hint', async () => {
  const host = newHost([kindsPlugin(), contentPack('test/pack', [{ kind: 'thing', id: 'pack/x', data: { label: 'hello' } }])]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/pack'])));
  assert.equal(e.stage, 'register');
  assert.equal(e.pluginId, 'test/pack');
  assert.match(e.message, /no enabled plugin understands content kind "thing"/);
});

test('content: loader-reported problems carry the pack id and the entry path', async () => {
  const host = newHost([kindsPlugin(), contentPack('test/pack', [{ kind: 'thing', id: 'pack/x', data: { label: 5 } }], dep)]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/kinds', 'test/pack'])));
  assert.equal(e.stage, 'register');
  assert.equal(e.pluginId, 'test/pack');
  assert.equal(e.issues[0]!.source, 'test/pack');
  assert.match(e.issues[0]!.path, /content\[0\]/);
  assert.match(e.issues[0]!.path, /label/);
  assert.match(e.message, /label must be a string/);
});

test('content: code plugins can add content through defineContent with the same loader path; the plugin owns it', async () => {
  const host = newHost([
    codePlugin('test/kinds', {
      register(ctx) {
        ctx.contentKind('thing', { description: 't', load: (d, c) => c.register(REG, c.id, { label: String((d as { label: string }).label) }) });
        ctx.defineContent('thing', 'code/y', { label: 'from-code' });
      },
    }),
  ]);
  await host.apply(presetOf('test/p', ['test/kinds']));
  assert.equal(host.active!.registries.get(REG, 'code/y')?.label, 'from-code');
  assert.equal(host.active!.registries.ownerOf(REG, 'code/y'), 'test/kinds');
});

test('content: a manifest with kind "content" AND a load function is rejected by the catalog', () => {
  const host = newHost([]);
  const bad: CatalogEntry = { manifest: { schema: 1, id: 'test/sneaky', name: 'S', version: '1.0.0', kind: 'content', sdk: '^2.0.0' }, load: async () => ({ default: {} }), content: [] };
  const issues = host.setCatalog([bad, kindsPlugin()]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.source, 'test/sneaky');
  assert.match(issues[0]!.message, /cannot carry executable code/);
  assert.equal(host.installed().has('test/sneaky'), false);
  assert.equal(host.catalogEntry('test/sneaky'), undefined);
  const st = host.catalogStatus().find((s) => s.id === 'test/sneaky');
  assert.ok(st && st.issues.length === 1 && !st.active);
});

test('content: a "code" manifest without load is rejected by the catalog', () => {
  const host = newHost([]);
  const bad: CatalogEntry = { manifest: { schema: 1, id: 'test/noload', name: 'N', version: '1.0.0', kind: 'code', sdk: '^2.0.0' } };
  const issues = host.setCatalog([bad]);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /Code plugins must be compiled into the application/);
  assert.equal(host.installed().size, 0);
});

test('content: non-JSON data (a function value) is rejected before any loader runs', async () => {
  const owners: string[] = [];
  const host = newHost([kindsPlugin(owners), contentPack('test/pack', [{ kind: 'thing', id: 'pack/x', data: { label: 'ok', evil: () => 1 } }], dep)]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/kinds', 'test/pack'])));
  assert.equal(e.stage, 'register');
  assert.equal(e.pluginId, 'test/pack');
  assert.match(e.message, /function/);
  assert.match(e.issues[0]!.path, /evil/);
  assert.deepEqual(owners, [], 'the loader never saw the data');
  assert.equal(host.session, undefined);
});

test('content: duplicate ids inside one pack and a non-array content field are rejected', async () => {
  const host = newHost([
    kindsPlugin(),
    contentPack('test/dup', [{ kind: 'thing', id: 'pack/x', data: { label: 'a' } }, { kind: 'thing', id: 'pack/x', data: { label: 'b' } }], dep),
    contentPack('test/shape', { not: 'an array' }, dep),
  ]);
  const e1 = await hostFailure(host.apply(presetOf('test/p', ['test/kinds', 'test/dup'])));
  assert.equal(e1.stage, 'register');
  assert.match(e1.message, /duplicate thing id "pack\/x"/);
  const e2 = await hostFailure(host.apply(presetOf('test/p', ['test/kinds', 'test/shape'])));
  assert.equal(e2.stage, 'register');
  assert.match(e2.message, /expected an array/);
});

test('content: two packs registering the same id fail naming both packs', async () => {
  const entry = [{ kind: 'thing', id: 'pack/x', data: { label: 'a' } }];
  const host = newHost([kindsPlugin(), contentPack('test/pack-a', entry, dep), contentPack('test/pack-b', entry, dep)]);
  const e = await hostFailure(host.apply(presetOf('test/p', ['test/kinds', 'test/pack-a', 'test/pack-b'])));
  assert.equal(e.stage, 'register');
  assert.match(e.message, /"test\/pack-a"/);
  assert.match(e.message, /"test\/pack-b"/);
});

test('content: apply(preset, [extra]) commits the extra entry only when staging succeeds', async () => {
  const c = counter();
  const host = newHost([kindsPlugin(), tickingPlugin('test/base', c)]);
  const running = await host.apply(presetOf('test/p1', ['test/base']));
  const before = [...host.installed().keys()].sort();
  assert.deepEqual(before, ['test/base', 'test/kinds']);

  // failing import: the pack's data is bad -> nothing committed, running session untouched
  const badPack = contentPack('test/imported', [{ kind: 'thing', id: 'imp/x', data: { label: 99 } }], dep);
  const e = await hostFailure(host.apply(presetOf('test/p2', ['test/base', 'test/kinds', 'test/imported']), [badPack]));
  assert.equal(e.stage, 'register');
  assert.deepEqual([...host.installed().keys()].sort(), before);
  assert.equal(host.catalogEntry('test/imported'), undefined);
  assert.equal(host.session, running);
  assertTicks(host, c);

  // invalid import at the catalog level
  const invalid: CatalogEntry = { manifest: { schema: 1, id: 'test/imp-code', name: 'x', version: '1.0.0', kind: 'code', sdk: '^2.0.0' } };
  const e2 = await hostFailure(host.apply(presetOf('test/p2', ['test/base', 'test/imp-code']), [invalid]));
  assert.equal(e2.stage, 'catalog');
  assert.deepEqual([...host.installed().keys()].sort(), before);
  assert.equal(host.session, running);

  // succeeding import
  const goodPack: CatalogEntry = { ...contentPack('test/imported', [{ kind: 'thing', id: 'imp/x', data: { label: 'fine' } }], dep), origin: 'imported' };
  const s = await host.apply(presetOf('test/p3', ['test/base', 'test/kinds', 'test/imported']), [goodPack]);
  assert.equal(host.session, s);
  assert.deepEqual([...host.installed().keys()].sort(), ['test/base', 'test/imported', 'test/kinds']);
  assert.equal(host.catalogEntry('test/imported'), goodPack);
  assert.equal(host.active!.registries.ownerOf(REG, 'imp/x'), 'test/imported');
  const status = host.catalogStatus().find((x) => x.id === 'test/imported');
  assert.equal(status?.origin, 'imported');
  assert.equal(status?.active, true);
});

test('content: host.stage(preset, [extra]) never commits the extra entry to the catalog', async () => {
  const host = newHost([kindsPlugin()]);
  const pack = contentPack('test/imported', [{ kind: 'thing', id: 'imp/x', data: { label: 'fine' } }], dep);
  const staged = await host.stage(presetOf('test/p', ['test/kinds', 'test/imported']), [pack]);
  assert.equal(host.installed().has('test/imported'), false);
  assert.equal(staged.registries.has(REG, 'imp/x'), true);
  host.discard(staged);
});

test('content: removeFromCatalog refuses an active plugin and works once it is no longer active', async () => {
  const host = newHost([kindsPlugin(), contentPack('test/pack', [], dep)]);
  await host.apply(presetOf('test/p', ['test/kinds', 'test/pack']));
  assert.throws(() => host.removeFromCatalog('test/pack'), /is active/);
  await host.apply(presetOf('test/p2', ['test/kinds']));
  host.removeFromCatalog('test/pack');
  assert.equal(host.installed().has('test/pack'), false);
});
