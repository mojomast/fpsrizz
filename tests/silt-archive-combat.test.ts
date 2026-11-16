import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../src/kernel/host.ts';
import { PHASES, SDK_VERSION, Silt } from '../src/sdk/index.ts';
import game from '../src/plugins/silt-game/manifest.json' with { type: 'json' };
import roomMap from '../src/plugins/mechanics-room-map/manifest.json' with { type: 'json' };
import inventory from '../src/plugins/mechanics-inventory/manifest.json' with { type: 'json' };
import crafting from '../src/plugins/mechanics-crafting/manifest.json' with { type: 'json' };
import progression from '../src/plugins/mechanics-progression/manifest.json' with { type: 'json' };
import clock from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import conditions from '../src/plugins/mechanics-conditions/manifest.json' with { type: 'json' };

const chamber = { name: 'Open', rows: ['####D####', '#.......#', '#.......#', '#.......#', 'D.......D', '#.......#', '#.......#', '#.......#', '####D####'] };
const pack = { schema: 1, id: 'test/combat-content', name: 'Combat', version: '1.0.0', kind: 'content', sdk: '^2.0.0', description: 'Combat', dependencies: { 'silt/game': '^1.0.0' }, capabilities: [] };
const content = [{ kind: 'silt-archive', id: 'test/combat', data: { name: 'Archive', districts: ['One', 'Two', 'Three'].map(name => ({ name, chambers: [chamber] })) } }];

async function setup() {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, phases: PHASES });
  assert.deepEqual(host.setCatalog([{ manifest: game, load: () => import('../src/plugins/silt-game/index.ts') }, { manifest: roomMap, load: () => import('../src/plugins/mechanics-room-map/index.ts') }, { manifest: inventory, load: () => import('../src/plugins/mechanics-inventory/index.ts') }, { manifest: crafting, load: () => import('../src/plugins/mechanics-crafting/index.ts') }, { manifest: progression, load: () => import('../src/plugins/mechanics-progression/index.ts') }, { manifest: clock, load: () => import('../src/plugins/mechanics-clock/index.ts') }, { manifest: conditions, load: () => import('../src/plugins/mechanics-conditions/index.ts') }, { manifest: pack, content }]), []);
  await host.apply({ schema: 1, id: 'test/combat', name: 'Combat', plugins: ['silt/game', 'mechanics/room-map', 'mechanics/inventory', 'mechanics/crafting', 'mechanics/progression', 'mechanics/clock', 'mechanics/conditions', 'test/combat-content'], roles: { 'sdk/experience': 'silt/archive', 'sdk/room-map': 'mechanics/room-map', 'sdk/mechanic-inventory': 'mechanics/inventory', 'sdk/mechanic-crafting': 'mechanics/crafting', 'sdk/mechanic-progression': 'mechanics/progression', 'sdk/mechanic-clock': 'mechanics/clock', 'sdk/mechanic-conditions': 'mechanics/conditions' }, options: { archive: 'test/combat' }, seed: 7 });
  const session = host.session!, service = session.services.get(Silt);
  const act = (command: Parameters<typeof service.enqueue>[0]) => { assert.equal(service.enqueue(command), true); session.scheduler.runTick(); };
  const start = service.state(), entry = start.rooms.find(r => r.id === 'room-0')!, next = start.rooms.find(r => r.id === 'room-1')!;
  const dx = next.x - entry.x, dy = next.y - entry.y;
  for (let i = 0; i < 4; i++) act({ type: 'move', dx, dy });
  assert.equal(service.state().room, 'room-1');
  return { host, service, act };
}

test('ranged attacks announce their exact cell, invalid actions do not advance them, and recovery is safe', async () => {
  const { host, service, act } = await setup();
  try {
    assert.equal(service.state().enemies[0]!.kind, 'spitter');
    for (let i = 0; i < 10 && service.state().enemies[0]!.phase !== 'windup'; i++) act({ type: 'wait' });
    const armed = service.state(), enemy = armed.enemies[0]!;
    assert.equal(enemy.phase, 'windup');
    assert.ok(enemy.threat.some(p => p.x === armed.x && p.y === armed.y));
    act({ type: 'attack', enemy: 'missing' });
    assert.deepEqual(service.state(), armed);
    act({ type: 'wait' });
    assert.equal(service.state().health, armed.health - 2);
    assert.equal(service.state().enemies[0]!.phase, 'recovery');
    const health = service.state().health;
    act({ type: 'wait' });
    assert.equal(service.state().health, health);
    assert.equal(service.state().enemies[0]!.phase, 'approach');
  } finally { host.stop(); }
});

test('moving out of a telegraphed shot prevents damage and snapshots are detached', async () => {
  const { host, service, act } = await setup();
  try {
    for (let i = 0; i < 10 && service.state().enemies[0]!.phase !== 'windup'; i++) act({ type: 'wait' });
    const state = service.state(), enemy = state.enemies[0]!;
    assert.equal(enemy.phase, 'windup');
    (enemy.threat as { x: number; y: number }[])[0]!.x = -100;
    assert.equal(service.state().enemies[0]!.threat[0]!.x, state.x);
    const step = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => {
      const nx = state.x + dx!, ny = state.y + dy!, cell = state.rows[ny]?.[nx];
      return cell === '.' && !(enemy.x === nx && enemy.y === ny);
    })!;
    act({ type: 'move', dx: step[0]!, dy: step[1]! });
    assert.equal(service.state().health, state.health);
    assert.equal(service.state().enemies[0]!.phase, 'recovery');
  } finally { host.stop(); }
});

test('spitter exposure survives invalid commands, increases the next hit and is cleared by restart', async () => {
  const { host, service, act } = await setup();
  const effects = () => (service.state() as ReturnType<typeof service.state> & { conditions: readonly { target: string; condition: string; remaining: number }[] }).conditions;
  try {
    for (let i = 0; i < 10 && service.state().enemies[0]!.phase !== 'windup'; i++) act({ type: 'wait' });
    assert.match(service.state().enemies[0]!.intent, /exposes on hit/);
    act({ type: 'wait' });
    assert.deepEqual(effects(), [{ target: 'player', condition: 'exposed', remaining: 5 }]);
    act({ type: 'attack', enemy: 'missing' });
    assert.equal(effects()[0]!.remaining, 5);
    act({ type: 'wait' });
    act({ type: 'wait' });
    assert.equal(service.state().enemies[0]!.phase, 'windup');
    const health = service.state().health;
    act({ type: 'wait' });
    assert.equal(service.state().health, health - 3);
    assert.equal(effects()[0]!.remaining, 5, 'another spitter hit refreshes exposure');
    act({ type: 'restart' });
    assert.deepEqual(effects(), []);
  } finally { host.stop(); }
});

test('brace spends earned charge to clear exposure and blocks reapplication on the braced hit', async () => {
  const { host, service, act } = await setup();
  const effects = () => (service.state() as ReturnType<typeof service.state> & { conditions: readonly { condition: string }[] }).conditions;
  try {
    for (let i = 0; i < 10; i++) {
      const s = service.state(), e = s.enemies[0]!;
      if (Math.abs(s.x - e.x) + Math.abs(s.y - e.y) === 1) break;
      const dx = Math.sign(e.x - s.x), dy = dx ? 0 : Math.sign(e.y - s.y);
      act({ type: 'move', dx, dy });
    }
    const enemy = service.state().enemies[0]!;
    act({ type: 'attack', enemy: enemy.id });
    assert.equal(service.state().charge, 1);
    for (let i = 0; i < 4 && !effects().length; i++) act({ type: 'wait' });
    assert.equal(effects()[0]!.condition, 'exposed');
    act({ type: 'brace' });
    assert.equal(service.state().charge, 0);
    assert.deepEqual(effects(), []);
    for (let i = 0; i < 3 && service.state().enemies[0]!.phase !== 'windup'; i++) act({ type: 'wait' });
    const health = service.state().health;
    act({ type: 'wait' });
    assert.equal(service.state().health, health - 1);
    assert.deepEqual(effects(), []);
  } finally { host.stop(); }
});

test('cleared pumps craft equipment atomically, upgrades and restart reset provider state', async () => {
  const { host, service, act } = await setup();
  try {
    act({ type: 'craft', recipe: 'silt/make-diving-suit' });
    assert.equal(service.state().workbench, false);
    for (let i = 0; i < 30 && service.state().enemies.length; i++) {
      const s = service.state(), e = s.enemies[0]!;
      if (Math.abs(e.x - s.x) + Math.abs(e.y - s.y) === 1) act({ type: 'attack', enemy: e.id });
      else if (s.x !== e.x) act({ type: 'move', dx: Math.sign(e.x - s.x), dy: 0 });
      else act({ type: 'move', dx: 0, dy: Math.sign(e.y - s.y) });
    }
    assert.equal(service.state().enemies.length, 0);
    act({ type: 'interact' });
    assert.equal(service.state().workbench, true);
    const before = service.state();
    act({ type: 'craft', recipe: 'silt/make-plate-suit' });
    assert.deepEqual(service.state().inventory, before.inventory);
    act({ type: 'craft', recipe: 'silt/make-diving-suit' });
    assert.ok(service.state().inventory.slots.some(s => s.item === 'silt/diving-suit'));
    act({ type: 'equip', item: 'silt/diving-suit' });
    assert.equal(service.state().inventory.equipment['suit'], 'silt/diving-suit');
    act({ type: 'unequip', slot: 'suit' });
    assert.equal(service.state().inventory.equipment['suit'], '');
    act({ type: 'restart' });
    assert.equal(service.state().progression.totalXp, 0);
    assert.equal(service.state().inventory.slots.some(s => s.item === 'silt/diving-suit'), false);
    assert.equal(service.state().bandages, 3);
  } finally { host.stop(); }
});
