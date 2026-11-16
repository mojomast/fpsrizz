import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DoorChanged, Intent, Interactions, ModeRole, Transform, TriggerFired, UseFailed, World, definePlugin, makeTransform } from '../src/sdk/index.ts';
import type { CatalogEntry, DoorState, InteractionCandidate, SessionContext, TriggerState } from '../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const map: CatalogEntry = {
  manifest: { schema: 1, id: 'test/maps', name: 'Maps', version: '1.0.0', kind: 'content', sdk: '^1.0.0', dependencies: { 'core/world': '^1.0.0' } },
  content: [{ kind: 'map', id: 'test/room', data: {
    schema: 1, format: 'core/grid', name: 'Room', cellSize: 2, wallHeight: 3,
    legend: { '#': { solid: true, wall: 'wall' }, '.': { floor: 'floor', ceiling: 'ceiling' } },
    grid: ['#######', '#.....#', '#..#..#', '#.....#', '#..#..#', '#.....#', '#######'],
    playerStart: { cell: [1, 1] }, doors: [{ id: 'door', cell: [3, 3], locked: true }],
    triggers: [{ id: 'switch', kind: 'switch', cell: [1, 1], face: 'n', once: true, opens: 'door' }],
  } }],
};

async function setup() {
  let ctx!: SessionContext;
  const probe = {
    manifest: { schema: 1, id: 'test/probe', name: 'Probe', version: '1.0.0', kind: 'code', sdk: '^1.0.0', dependencies: { 'core/world': '^1.0.0' } },
    load: async () => ({ default: definePlugin({ register(c) { c.provideRole(ModeRole, 'test/mode', { name: 'Test', description: 'Test', activate() {} }); }, activate(c) { ctx = c; } }) }),
  } as unknown as CatalogEntry;
  const game = createHeadlessGame([map, probe]);
  await game.host.apply(headlessPreset({ plugins: ['core/world', 'test/maps', 'test/probe'], roles: { 'sdk/mode': 'test/mode' }, options: { map: 'test/room' } }) as never);
  const actor = () => {
    const e = ctx.world.create();
    ctx.world.add(e, Transform, makeTransform(6.5, 7, -Math.PI / 2));
    ctx.world.add(e, Intent, { moveX: 0, moveZ: 0, fire: false, firePressed: false, use: true, weaponSlot: 0, weaponCycle: 0 });
    return e;
  };
  return { game, get ctx() { return ctx; }, actor };
}

test('built-in Use chooses switches before doors and retains locked, toggle and nothing events', async () => {
  const t = await setup();
  try {
    const ctx = t.ctx, world = ctx.services.get(World), e = t.actor();
    const events: string[] = [];
    ctx.events.on(DoorChanged, (v) => events.push(`door:${v.open}`));
    ctx.events.on(TriggerFired, (v) => events.push(`switch:${v.id}:${v.by}`));
    ctx.events.on(UseFailed, (v) => events.push(`failed:${v.reason}`));
    const tr = world.triggers()[0]!.desc;
    tr.x = 7.6; tr.z = 7; tr.radius = 2;
    t.game.ticks(1);
    assert.deepEqual(events, ['door:true', `switch:switch:${e}`]);
    t.game.ticks(1);
    assert.deepEqual(events, ['door:true', `switch:switch:${e}`, 'door:false']);
    world.door('door')!.locked = true;
    t.game.ticks(1);
    assert.equal(events.at(-1), 'failed:locked');
    ctx.world.get(e, Transform)!.x = 3;
    t.game.ticks(1);
    assert.equal(events.at(-1), 'failed:nothing');
  } finally { t.game.host.stop(); }
});

test('equidistant built-in switches and doors retain map array order instead of id order', async () => {
  const t = await setup();
  try {
    const ctx = t.ctx, world = ctx.services.get(World);
    t.actor();
    const switches = world.triggers() as TriggerState[];
    const firstSwitch = switches[0]!;
    firstSwitch.desc.id = 'z-switch';
    firstSwitch.desc.x = 7.6;
    firstSwitch.desc.z = 7;
    firstSwitch.desc.radius = 2;
    firstSwitch.desc.opens = '';
    switches.push({ desc: { ...firstSwitch.desc, id: 'a-switch' }, fired: false });
    const fired: string[] = [];
    ctx.events.on(TriggerFired, (event) => fired.push(event.id));
    t.game.ticks(1);
    assert.deepEqual(fired, ['z-switch']);

    switches[1]!.fired = true;
    const doors = world.doors() as DoorState[];
    doors[0]!.locked = false;
    doors.push({ ...doors[0]!, desc: { ...doors[0]!.desc, id: 'a-door' } });
    const changed: string[] = [];
    ctx.events.on(DoorChanged, (event) => changed.push(event.id));
    t.game.ticks(1);
    assert.deepEqual(changed, ['door']);
    assert.equal(doors[0]!.open, true);
  } finally { t.game.host.stop(); }
});

test('providers arbitrate by priority, distance, provider and candidate id; denial consumes Use', async () => {
  const t = await setup();
  try {
    const ctx = t.ctx, world = ctx.services.get(World), interactions = ctx.services.get(Interactions);
    t.actor();
    const hits: string[] = [];
    const candidate = (id: string, priority: number, distance: number): InteractionCandidate => ({ id, priority, distance, use: () => { hits.push(id); } });
    let candidates = [candidate('z', 1, 0.4), candidate('a', 1, 0.4)];
    interactions.register(ctx, 'test/z', () => [candidate('other', 1, 0.4)]);
    const remove = interactions.register(ctx, 'test/a', () => candidates);
    t.game.ticks(1);
    assert.deepEqual(hits, ['a']);
    assert.equal(world.door('door')!.open, false);
    candidates = [candidate('near', 1, 0.1), candidate('priority', 0, 10)];
    t.game.ticks(1);
    assert.equal(hits.at(-1), 'priority');
    candidates = [candidate('far', 0, 0.8), candidate('near', 0, 0.1)];
    t.game.ticks(1);
    assert.equal(hits.at(-1), 'near');
    remove(); remove();
    t.game.ticks(1);
    assert.equal(hits.at(-1), 'other');
  } finally { t.game.host.stop(); }
});

test('registration is scoped, validated and fresh on restart', async () => {
  const t = await setup();
  try {
    let calls = 0;
    const first = t.ctx.services.get(Interactions);
    first.register(t.ctx, 'test/provider', () => [{ id: 'target', priority: -1, distance: 0, use() { calls++; } }]);
    assert.throws(() => first.register(t.ctx, 'test/provider', () => []), /duplicate/);
    assert.throws(() => first.register(t.ctx, '', () => []), /id/);
    t.actor(); t.game.ticks(1);
    assert.equal(calls, 1);
    await t.game.host.restart();
    t.actor(); t.game.ticks(1);
    assert.equal(calls, 1);
    const next = t.ctx.services.get(Interactions);
    next.register(t.ctx, 'test/provider', () => [{ id: 'target', priority: -1, distance: 0, use() { calls++; } }]);
    t.game.ticks(1);
    assert.equal(calls, 2);
  } finally { t.game.host.stop(); }
});

test('disposing a provider scope removes it immediately, including registrations on a dead scope', async () => {
  const t = await setup();
  try {
    const service = t.ctx.services.get(Interactions);
    const scope = t.ctx.scope.child('temporary');
    const owner = { ...t.ctx, scope };
    let calls = 0;
    const provider = () => [{ id: 'target', priority: -1, distance: 0, use() { calls++; } }];
    service.register(owner, 'test/scoped', provider);
    t.actor(); t.game.ticks(1);
    assert.equal(calls, 1);
    scope.dispose();
    t.game.ticks(1);
    assert.equal(calls, 1);
    service.register(owner, 'test/scoped', provider);
    t.game.ticks(1);
    assert.equal(calls, 1);
    service.register(t.ctx, 'test/scoped', provider);
    t.game.ticks(1);
    assert.equal(calls, 2);
  } finally { t.game.host.stop(); }
});

test('invalid provider candidates fault the session rather than being silently selected', async () => {
  const t = await setup();
  try {
    t.ctx.services.get(Interactions).register(t.ctx, 'test/invalid', () => [{ id: 'bad', priority: 0, distance: NaN, use() {} }]);
    t.actor(); t.game.ticks(1);
    assert.equal(t.game.session().state, 'faulted');
    assert.match(String(t.game.session().fault?.error), /invalid interaction candidate.*test\/invalid/);
  } finally { t.game.host.stop(); }
});
