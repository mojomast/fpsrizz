import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../src/kernel/host.ts';
import { Hearth, PHASES, SDK_VERSION } from '../src/sdk/index.ts';
import type { HearthCommand } from '../src/sdk/index.ts';
import game from '../src/plugins/common-ground-game/manifest.json' with { type: 'json' };
import pack from '../src/plugins/common-ground-content/manifest.json' with { type: 'json' };
import content from '../src/plugins/common-ground-content/content.json' with { type: 'json' };
import resources from '../src/plugins/mechanics-resources/manifest.json' with { type: 'json' };
import clock from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import actions from '../src/plugins/mechanics-actions/manifest.json' with { type: 'json' };
import objectives from '../src/plugins/mechanics-objectives/manifest.json' with { type: 'json' };
import relationships from '../src/plugins/mechanics-relationships/manifest.json' with { type: 'json' };

async function setup() {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, phases: PHASES });
  assert.deepEqual(host.setCatalog([
    { manifest: game, load: () => import('../src/plugins/common-ground-game/index.ts') }, { manifest: pack, content },
    { manifest: resources, load: () => import('../src/plugins/mechanics-resources/index.ts') },
    { manifest: clock, load: () => import('../src/plugins/mechanics-clock/index.ts') },
    { manifest: actions, load: () => import('../src/plugins/mechanics-actions/index.ts') },
    { manifest: objectives, load: () => import('../src/plugins/mechanics-objectives/index.ts') },
    { manifest: relationships, load: () => import('../src/plugins/mechanics-relationships/index.ts') },
  ]), []);
  const session = await host.apply({ schema: 1, id: 'test/common', name: 'Common', seed: 7,
    plugins: ['common/game', 'common/content', 'mechanics/resources', 'mechanics/clock', 'mechanics/actions', 'mechanics/objectives', 'mechanics/relationships'],
    roles: { 'sdk/mechanic-resources': 'mechanics/resources', 'sdk/mechanic-clock': 'mechanics/clock', 'sdk/mechanic-actions': 'mechanics/actions', 'sdk/mechanic-objectives': 'mechanics/objectives', 'sdk/mechanic-relationships': 'mechanics/relationships' }, options: { household: 'common/household' } });
  const sim = session.services.get(Hearth);
  const send = (command: HearthCommand) => { assert.equal(sim.enqueue(command), true); session.scheduler.runTick(); return sim.state(); };
  return { host, session, sim, send };
}

test('household decisions, rejections, care, economy, pause and restart', async () => {
  const { host, sim, send, session } = await setup();
  const initial = sim.state();
  for (let i = 0; i < 20; i++) session.scheduler.runTick();
  assert.deepEqual(sim.state(), initial);
  const invalid = send({ type: 'act', action: 'chat', target: 'nobody' });
  assert.equal(invalid.turn, 0); assert.match(invalid.message, /another resident/);
  const meal = send({ type: 'act', action: 'eat' });
  assert.equal(meal.turn, 1); assert.equal(meal.money, 175); assert.ok(meal.residents[0]!.needs.nourishment > initial.residents[0]!.needs.nourishment);
  assert.equal(initial.money, 180); assert.equal(initial.residents[0]!.needs.nourishment, 70);
  send({ type: 'pause', paused: true }); const blocked = send({ type: 'act', action: 'sleep' }); assert.equal(blocked.turn, 1);
  send({ type: 'pause', paused: false });
  const bought = send({ type: 'buy', object: 'table' }); assert.ok(bought.furniture.includes('table'));
  const failed = send({ type: 'buy', object: 'table' }); assert.equal(failed.turn, bought.turn); assert.equal(failed.money, bought.money);
  const sold = send({ type: 'sell', object: 'table' }); assert.equal(sold.money, bought.money + 27);
  send({ type: 'restart' }); assert.equal(sim.state().turn, 0); assert.equal(sim.state().money, 180);
  host.stop();
});

test('house construction, zoning, furnishing and demolition are transactional and survive pause', async () => {
  const { host, sim, send } = await setup();
  try {
    const initial = sim.state();
    assert.equal(initial.house.tiles.length, 24);
    assert.equal(initial.house.placements.length, 3);
    let s = send({ type: 'build-floor', x: 7, y: 5, room: 'bedroom' });
    assert.equal(s.money, 180); assert.equal(s.house.tiles.length, 24); assert.equal(s.turn, 0);
    send({ type: 'pause', paused: true });
    s = send({ type: 'build-floor', x: 6, y: 0, room: 'bedroom' });
    assert.equal(s.money, 165); assert.equal(s.turn, 0); assert.equal(s.house.tiles.length, 25);
    s = send({ type: 'zone-floor', x: 6, y: 0, room: 'kitchen' });
    assert.equal(s.house.tiles.find(t => t.x === 6 && t.y === 0)?.room, 'kitchen');
    s = send({ type: 'finish-floor', x: 6, y: 0, finish: 'sage' });
    assert.equal(s.money, 162); assert.equal(s.house.tiles.find(t => t.x === 6 && t.y === 0)?.finish, 'sage');
    s = send({ type: 'place-furniture', object: 'cot', x: 6, y: 0, rotation: 1 });
    assert.deepEqual(s.house.placements.find(p => p.object === 'cot'), { object: 'cot', x: 6, y: 0, rotation: 1 });
    s = send({ type: 'place-furniture', object: 'stove', x: 6, y: 0, rotation: 0 });
    assert.match(s.message, /occupied/); assert.equal(s.money, 162);
    s = send({ type: 'remove-floor', x: 6, y: 0 }); assert.match(s.message, /Move the furnishing/);
    send({ type: 'place-furniture', object: 'cot', x: 0, y: 0, rotation: 0 });
    s = send({ type: 'remove-floor', x: 6, y: 0 }); assert.equal(s.money, 169); assert.equal(s.house.tiles.length, 24);
    s = send({ type: 'remove-floor', x: 0, y: 1 }); assert.match(s.message, /Only added floor/); assert.equal(s.money, 169);
    s = send({ type: 'place-furniture', object: 'sofa', x: 0, y: 0, rotation: 0 }); assert.match(s.message, /Buy this furnishing/);
    assert.equal(sim.enqueue({ type: 'build-floor', x: -1, y: 0, room: 'bedroom' }), false);
    assert.equal(initial.house.tiles.length, 24); assert.equal(initial.house.placements[0]!.x, 0);
    send({ type: 'restart' }); assert.deepEqual(sim.state().house, initial.house); assert.equal(sim.state().money, 180);
  } finally { host.stop(); }
});

test('construction cannot charge or change the house when funds are insufficient', async () => {
  const { host, send } = await setup();
  try {
    for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
    send({ type: 'buy', object: 'range' });
    const before = send({ type: 'buy', object: 'bed' });
    assert.equal(before.money, 0);
    const after = send({ type: 'build-floor', x: 6, y: 0, room: 'kitchen' });
    assert.equal(after.money, 0); assert.equal(after.turn, before.turn); assert.deepEqual(after.house, before.house);
  } finally { host.stop(); }
});

test('deterministic autonomous careers, relationships, projects and gathering', async () => {
  const run = async () => {
    const { host, sim, send } = await setup();
    send({ type: 'buy', object: 'table' });
    send({ type: 'act', action: 'eat' }); send({ type: 'act', action: 'eat' });
    send({ type: 'act', action: 'chat', target: 'sol' });
    send({ type: 'act', action: 'chat', target: 'ren' });
    send({ type: 'act', action: 'chat', target: 'sol' });
    let state = sim.state();
    assert.equal(state.projects.filter(p => p.complete).length, 2);
    while (state.day < 7) state = send({ type: 'act', action: 'wait' });
    assert.ok(state.residents.every(p => p.shifts > 0));
    assert.ok(state.residents.some(p => p.rank > 1));
    state = send({ type: 'act', action: 'host' }); assert.equal(state.gathering, 'hosted');
    send({ type: 'act', action: 'greet', target: 'Ari' }); state = send({ type: 'act', action: 'greet', target: 'Bea' });
    assert.equal(state.tier, 3); assert.deepEqual(state.visitors, ['Ari', 'Bea']);
    const final = sim.state(); host.stop(); return final;
  };
  assert.deepEqual(await run(), await run());
});

test('unpaid bills accrue a single daily fee and furnishings fund recovery', async () => {
  const { host, send } = await setup();
  for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
  send({ type: 'buy', object: 'range' }); send({ type: 'buy', object: 'bed' });
  let state = send({ type: 'act', action: 'wait' });
  while (state.day < 7) state = send({ type: 'act', action: 'wait' });
  assert.equal(state.money, 0); assert.equal(state.debt, 100);
  state = send({ type: 'act', action: 'pay-debt' }); assert.equal(state.debt, 100);
  while (state.day < 8) state = send({ type: 'act', action: 'wait' });
  assert.equal(state.debt, 110);
  for (const object of ['range', 'bed', 'cot', 'stove']) state = send({ type: 'sell', object });
  assert.equal(state.money, 137);
  state = send({ type: 'act', action: 'pay-debt' }); assert.equal(state.debt, 0); assert.equal(state.money, 27);
  host.stop();
});

test('better furnishings improve care and work without stacking duplicate category bonuses', async () => {
  const { host, send, sim } = await setup();
  try {
    for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
    send({ type: 'buy', object: 'bed' });
    for (let i = 0; i < 18; i++) send({ type: 'act', action: 'wait' });
    const energy = sim.state().residents.find(person => person.id === 'mira')!.needs.energy;
    const after = send({ type: 'act', action: 'sleep' });
    assert.equal(after.residents.find(person => person.id === 'mira')!.needs.energy, Math.min(100, energy + 38) - 2);
    send({ type: 'buy', object: 'workbench' });
    send({ type: 'act', action: 'eat' });
    const before = sim.state().money;
    const worked = send({ type: 'act', action: 'work' });
    assert.equal(worked.money, before + 80);
    send({ type: 'buy', object: 'daybed' });
    for (let i = 0; i < 15; i++) send({ type: 'act', action: 'wait' });
    const secondEnergy = sim.state().residents.find(person => person.id === 'mira')!.needs.energy;
    const rested = send({ type: 'act', action: 'sleep' });
    assert.equal(rested.residents.find(person => person.id === 'mira')!.needs.energy, Math.min(100, secondEnergy + 38) - 2);
  } finally { host.stop(); }
});

test('strained conversations damage bonds, block chat and can be repaired after care', async () => {
  const { host, send, sim } = await setup();
  try {
    for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
    for (let i = 0; i < 31; i++) send({ type: 'act', action: 'wait' });
    const score = () => sim.state().relationships.find(r => r.a === 'mira' && r.b === 'sol')!.score;
    const before = score();
    let state = send({ type: 'act', action: 'chat', target: 'sol' });
    assert.equal(score(), before - 12); assert.match(state.message, /argued/);
    send({ type: 'act', action: 'chat', target: 'sol' });
    send({ type: 'act', action: 'chat', target: 'sol' });
    assert.ok(score() < -20);
    const turn = sim.state().turn, money = sim.state().money, damaged = score();
    state = send({ type: 'act', action: 'chat', target: 'sol' });
    assert.match(state.message, /reconciliation/); assert.equal(state.turn, turn); assert.equal(state.money, money);
    state = send({ type: 'act', action: 'reconcile', target: 'sol' });
    assert.match(state.message, /20 energy and comfort/); assert.equal(state.turn, turn); assert.equal(score(), damaged);
    send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'wash' });
    send({ type: 'select', resident: 'sol' }); send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'wash' });
    state = send({ type: 'act', action: 'reconcile', target: 'mira' });
    assert.equal(score(), damaged + 10); assert.match(state.message, /reconcile/);
    assert.equal(state.projects.find(p => p.id === 'shared-story')!.complete, false);
  } finally { host.stop(); }
});

test('exhausted work stalls a personal career; cared-for shifts earn promotions', async () => {
  const { host, send, sim } = await setup();
  try {
    for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
    for (let i = 0; i < 29; i++) send({ type: 'act', action: 'wait' });
    let state = send({ type: 'act', action: 'work' });
    assert.equal(state.money, 236); assert.equal(state.residents[0]!.shifts, 1); assert.equal(state.residents[0]!.careerProgress, 0);
    assert.match(state.message, /stalled career progress/);
    const turn = state.turn, money = state.money;
    state = send({ type: 'act', action: 'work' });
    assert.equal(state.turn, turn); assert.equal(state.money, money);
    for (let day = 2; day <= 4; day++) {
      while (sim.state().day < day) send({ type: 'act', action: 'wait' });
      send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'sleep' });
      send({ type: 'act', action: 'eat' }); send({ type: 'act', action: 'eat' });
      state = send({ type: 'act', action: 'work' });
    }
    assert.equal(state.residents[0]!.shifts, 4); assert.equal(state.residents[0]!.careerProgress, 3);
    assert.equal(state.residents[0]!.rank, 2); assert.match(state.message, /Promoted/);
    assert.equal(state.residents[1]!.rank, 1);
    send({ type: 'pause', paused: true }); const paused = sim.state();
    state = send({ type: 'act', action: 'eat' }); assert.equal(state.turn, paused.turn); assert.equal(state.money, paused.money);
    state = send({ type: 'restart' }); assert.equal(state.residents[0]!.careerProgress, 0); assert.equal(state.residents[0]!.rank, 1);
    assert.equal(state.money, 180); assert.equal(state.turn, 0);
  } finally { host.stop(); }
});

test('wait-driven autoplay lets the selected resident care for themselves too', async () => {
  const { host, send } = await setup();
  try {
    let state = send({ type: 'act', action: 'wait' });
    while (state.day < 5) state = send({ type: 'act', action: 'wait' });
    assert.ok(state.residents.every(p => p.shifts >= 3 && p.careerProgress >= 3));
    assert.ok(state.residents.every(p => p.needs.energy >= 20 && p.needs.nourishment >= 20));
    assert.ok(state.money > 180);
  } finally { host.stop(); }
});

test('neglected isolated residents lose patience overnight', async () => {
  const { host, send, sim } = await setup();
  try {
    for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
    while (sim.state().day < 2) send({ type: 'act', action: 'wait' });
    const before = sim.state().relationships.find(r => r.a === 'mira' && r.b === 'sol')!.score;
    while (sim.state().day < 3) send({ type: 'act', action: 'wait' });
    const after = sim.state();
    assert.equal(after.relationships.find(r => r.a === 'mira' && r.b === 'sol')!.score, before - 8);
    assert.ok(after.events.some(event => /lost patience overnight/.test(event)));
  } finally { host.stop(); }
});


test('friendship milestone improves connection and restart resets bonds', async () => {
  const { host, send, sim } = await setup();
  try {
    for (const resident of ['mira', 'sol', 'ren']) send({ type: 'autonomy', resident, enabled: false });
    for (let i = 0; i < 25; i++) send({ type: 'act', action: 'wait' });
    send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'wash' });
    send({ type: 'select', resident: 'sol' }); send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'wash' });
    send({ type: 'select', resident: 'mira' });
    let state = send({ type: 'act', action: 'chat', target: 'sol' });
    assert.equal(state.relationships.find(r => r.a === 'mira' && r.b === 'sol')!.score, 14);
    for (let i = 0; i < 3; i++) state = send({ type: 'act', action: 'chat', target: 'sol' });
    for (let i = 0; i < 22; i++) send({ type: 'act', action: 'wait' });
    send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'wash' }); send({ type: 'act', action: 'wash' });
    send({ type: 'select', resident: 'sol' }); send({ type: 'act', action: 'sleep' }); send({ type: 'act', action: 'wash' });
    send({ type: 'select', resident: 'mira' });
    const before = sim.state().residents[0]!.needs.connection;
    assert.ok(before <= 80);
    state = send({ type: 'act', action: 'chat', target: 'sol' });
    assert.equal(state.relationships.find(r => r.a === 'mira' && r.b === 'sol')!.score, 30);
    assert.equal(state.residents[0]!.needs.connection, Math.min(100, before + 20) - 1);
    assert.ok(state.events.some(event => /became friends/.test(event)));
    state = send({ type: 'restart' });
    assert.equal(state.relationships.find(r => r.a === 'mira' && r.b === 'sol')!.score, 10);
    assert.ok(!state.events.some(event => /became friends/.test(event)));
  } finally { host.stop(); }
});
