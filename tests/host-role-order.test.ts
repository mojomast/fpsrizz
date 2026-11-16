import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionContext } from '../src/kernel/host.ts';
import { parseManifest } from '../src/kernel/manifest.ts';
import { Reporter } from '../src/kernel/validate.ts';
import type { Issue } from '../src/kernel/validate.ts';
import { defineRegistry, defineRole } from '../src/sdk/core.ts';
import { codePlugin, hostFailure, newHost, presetOf, rawManifest, totals, zeroReport } from './helpers/host.ts';

const ROLE = defineRole<{ activate?(ctx: SessionContext): void }>('test/factory-role');
const OTHER = defineRole<object>('test/other-role');
const FACTORIES = defineRegistry<{ start(ctx: SessionContext): { owner: string } }>('test/role-factories');

test('role dependency orders a later-sorting factory owner before its consumer without reordering registration', async () => {
  const log: string[] = [];
  const instances: { owner: string }[] = [];
  const host = newHost([
    codePlugin('test/a-consumer', {
      register(ctx) { log.push(`register:${ctx.pluginId}`); },
      activate(ctx) {
        log.push(`activate:${ctx.pluginId}`);
        const id = ctx.role(ROLE)!.id;
        const get = () => ctx.instantiate(FACTORIES, id, (factory, owner) => factory.start(owner));
        const instance = get();
        assert.equal(get(), instance, 'factory remains session-cached');
        instances.push(instance);
        ctx.scope.add(() => { log.push('dispose:consumer'); });
      },
    }, { requiresRoles: [ROLE.id], roleDependencies: [ROLE.id] }),
    codePlugin('test/z-provider', {
      register(ctx) {
        log.push(`register:${ctx.pluginId}`);
        ctx.scope.add(() => { log.push('dispose:registration'); });
        ctx.provideRole(ROLE, 'test/selected', { activate(owner) { log.push(`role:${owner.pluginId}`); } });
        ctx.register(FACTORIES, 'test/selected', { start(owner) {
          log.push(`factory:${owner.pluginId}`);
          owner.scope.add(() => { log.push('dispose:factory'); });
          return { owner: owner.pluginId };
        } });
      },
      activate(ctx) { log.push(`activate:${ctx.pluginId}`); },
    }),
  ]);
  const preset = presetOf('test/order', ['test/z-provider', 'test/a-consumer'], { roles: { [ROLE.id]: 'test/selected' } });
  const staged = await host.stage(preset);
  assert.deepEqual(staged.order, ['test/a-consumer', 'test/z-provider']);
  assert.deepEqual(staged.activationOrder, ['test/z-provider', 'test/a-consumer']);
  assert.equal(host.session, undefined);
  assert.deepEqual(log, ['register:test/a-consumer', 'register:test/z-provider']);
  host.discard(staged);
  assert.equal(staged.scope.disposed, true);
  log.length = 0;
  const first = await host.apply(preset);
  assert.deepEqual(first.order, staged.activationOrder);
  assert.deepEqual(log, ['register:test/a-consumer', 'register:test/z-provider', 'activate:test/z-provider', 'activate:test/a-consumer', 'factory:test/z-provider', 'role:test/z-provider']);
  assert.equal(instances[0]!.owner, 'test/z-provider');
  log.length = 0;
  const second = await host.restart();
  assert.equal(first.disposed, true);
  assert.notEqual(first, second);
  assert.notEqual(instances[0], instances[1]);
  assert.deepEqual(log, ['dispose:consumer', 'dispose:factory', 'activate:test/z-provider', 'activate:test/a-consumer', 'factory:test/z-provider', 'role:test/z-provider']);
  log.length = 0;
  host.stop();
  assert.deepEqual(log, ['dispose:consumer', 'dispose:factory', 'dispose:registration']);
  assert.deepEqual(totals(host), zeroReport());
});

test('alternate role owner changes activation edges; multiple roles from one owner deduplicate', async () => {
  const host = newHost([
    codePlugin('test/a-consumer', {}, { requiresRoles: [ROLE.id, OTHER.id], roleDependencies: [ROLE.id, OTHER.id] }),
    ...['test/m-provider', 'test/z-provider'].map(id => codePlugin(id, {
      register(ctx) {
        ctx.provideRole(ROLE, id, {});
        ctx.provideRole(OTHER, id, {});
      },
    })),
  ]);
  for (const [selected, expected] of [
    ['test/m-provider', ['test/m-provider', 'test/a-consumer', 'test/z-provider']],
    ['test/z-provider', ['test/m-provider', 'test/z-provider', 'test/a-consumer']],
  ] as const) {
    const session = await host.apply(presetOf('test/swap', ['test/z-provider', 'test/a-consumer', 'test/m-provider'], { roles: { [ROLE.id]: selected, [OTHER.id]: selected } }));
    assert.deepEqual(session.order, expected);
    assert.deepEqual(host.active!.order, ['test/a-consumer', 'test/m-provider', 'test/z-provider']);
  }
  host.stop();
});

test('role ordering retains required and enabled optional dependency edges, ignoring absent optional plugins', async () => {
  const host = newHost([
    codePlugin('test/a-consumer', {}, { requiresRoles: [ROLE.id], roleDependencies: [ROLE.id], dependencies: { 'test/y-required': '^1.0.0' }, optionalDependencies: { 'test/z-optional': '^1.0.0', 'test/absent': '^1.0.0' } }),
    codePlugin('test/b-provider', { register(ctx) { ctx.provideRole(ROLE, 'test/provider', {}); } }),
    codePlugin('test/y-required'),
    codePlugin('test/z-optional'),
  ]);
  const session = await host.apply(presetOf('test/deps', ['test/a-consumer', 'test/b-provider', 'test/y-required', 'test/z-optional'], { roles: { [ROLE.id]: 'test/provider' } }));
  assert.deepEqual(session.order, ['test/b-provider', 'test/y-required', 'test/z-optional', 'test/a-consumer']);
  host.stop();
});

test('a plugin can require its own selected role and survey remains registration-only', async () => {
  let activated = 0;
  const host = newHost([codePlugin('test/self', {
    register(ctx) { ctx.provideRole(ROLE, 'test/self-role', {}); },
    activate() { activated++; },
  }, { requiresRoles: [ROLE.id], roleDependencies: [ROLE.id] })]);
  const survey = await host.survey();
  assert.equal(survey.some(entry => entry.id === 'test/self-role'), true);
  assert.equal(activated, 0);
  const session = await host.apply(presetOf('test/self-preset', ['test/self'], { roles: { [ROLE.id]: 'test/self-role' } }));
  assert.deepEqual(session.order, ['test/self']);
  assert.equal(activated, 1);
  host.stop();
});

for (const edge of ['dependencies', 'optionalDependencies', 'roleDependencies'] as const) {
  test(`role cycle through ${edge} fails before commit and preserves running session and registrations`, async () => {
    let ticks = 0;
    let disposed = 0;
    let activated = 0;
    const host = newHost([
      codePlugin('test/live', { activate(ctx) { ctx.systems.add({ id: 'test/live-tick', phase: 'world', update() { ticks++; } }); } }),
      codePlugin('test/a-consumer', {
        register(ctx) { ctx.provideRole(OTHER, 'test/back', {}); ctx.scope.add(() => { disposed++; }); },
        activate() { activated++; },
      }, { requiresRoles: [ROLE.id], roleDependencies: [ROLE.id] }),
      codePlugin('test/z-provider', {
        register(ctx) { ctx.provideRole(ROLE, 'test/selected', {}); ctx.scope.add(() => { disposed++; }); },
        activate() { activated++; },
      }, edge === 'roleDependencies' ? { roleDependencies: [OTHER.id] } : { [edge]: { 'test/a-consumer': '^1.0.0' } }),
    ]);
    const session = await host.apply(presetOf('test/live-preset', ['test/live']));
    const graph = host.active;
    const before = totals(host);
    const error = await hostFailure(host.apply(presetOf('test/cycle', ['test/z-provider', 'test/a-consumer'], { roles: { [ROLE.id]: 'test/selected', [OTHER.id]: 'test/back' } })));
    assert.equal(error.stage, 'validate');
    assert.match(error.message, /Session activation cycle/);
    assert.match(error.message, /test\/a-consumer/);
    assert.match(error.message, /test\/z-provider/);
    assert.match(error.message, /test\/factory-role selects test\/selected/);
    assert.match(error.message, /Select a different role provider/);
    assert.equal(error.issues[0]!.path, 'roleDependencies');
    assert.equal(activated, 0);
    assert.equal(disposed, 2, 'failed staging releases both registration scopes');
    assert.equal(host.session, session);
    assert.equal(host.active, graph);
    assert.equal(session.disposed, false);
    assert.deepEqual(totals(host), before);
    session.scheduler.runTick();
    assert.equal(ticks, 1);
    await host.restart();
    host.stop();
    assert.deepEqual(totals(host), zeroReport());
  });
}

test('requiresRoles remains selection-only when its provider depends on the consumer', async () => {
  const log: string[] = [];
  const host = newHost([
    codePlugin('test/z-world', { activate() { log.push('world'); } }, { requiresRoles: [ROLE.id] }),
    codePlugin('test/a-mode', {
      register(ctx) { ctx.provideRole(ROLE, 'test/mode', { activate() { log.push('role'); } }); },
      activate() { log.push('mode'); },
    }, { dependencies: { 'test/z-world': '^1.0.0' } }),
  ]);
  const session = await host.apply(presetOf('test/selection-only', ['test/a-mode', 'test/z-world'], { roles: { [ROLE.id]: 'test/mode' } }));
  assert.deepEqual(session.order, ['test/z-world', 'test/a-mode']);
  assert.deepEqual(host.active!.activationOrder, host.active!.order);
  assert.deepEqual(log, ['world', 'mode', 'role']);
  host.stop();
});

test('roleDependencies alone requires a valid selected provider with actionable staging errors', async () => {
  const host = newHost([
    codePlugin('test/consumer', {}, { roleDependencies: [ROLE.id] }),
    codePlugin('test/provider', { register(ctx) { ctx.provideRole(ROLE, 'test/available', {}); } }),
  ]);
  const plugins = ['test/consumer', 'test/provider'];
  const missing = await hostFailure(host.apply(presetOf('test/missing', plugins)));
  assert.equal(missing.stage, 'validate');
  assert.equal(missing.issues[0]!.path, `roles.${ROLE.id}`);
  assert.match(missing.message, /test\/consumer.*requires a provider/);
  assert.match(missing.message, /preset selects none/);
  assert.match(missing.message, /test\/available/);
  const unknown = await hostFailure(host.apply(presetOf('test/unknown', plugins, { roles: { [ROLE.id]: 'test/unknown' } })));
  assert.equal(unknown.stage, 'validate');
  assert.match(unknown.message, /selected provider "test\/unknown" is not offered/);
  assert.match(unknown.message, /test\/available/);
  const noRole = await hostFailure(host.apply(presetOf('test/no-role', ['test/consumer'])));
  assert.match(noRole.message, /No enabled plugin offers one/);
  const session = await host.apply(presetOf('test/valid', plugins, { roles: { [ROLE.id]: 'test/available' } }));
  assert.deepEqual(session.order, ['test/provider', 'test/consumer']);
  host.stop();
});

test('roleDependencies normalizes to an empty list and validates explicit lists', () => {
  const issues: Issue[] = [];
  const legacy = parseManifest(rawManifest('test/legacy'), new Reporter(issues, 'test/legacy'));
  assert.deepEqual(legacy?.roleDependencies, []);
  assert.deepEqual(issues, []);
  const explicit = parseManifest(rawManifest('test/explicit', { roleDependencies: [ROLE.id] }), new Reporter(issues, 'test/explicit'));
  assert.deepEqual(explicit?.roleDependencies, [ROLE.id]);
  for (const value of ['test/not-a-list', ['invalid'], [ROLE.id, ROLE.id]]) {
    const errors: Issue[] = [];
    assert.equal(parseManifest(rawManifest('test/bad', { roleDependencies: value }), new Reporter(errors, 'test/bad')), undefined);
    assert.ok(errors.some(issue => issue.path.startsWith('roleDependencies')));
  }
});
