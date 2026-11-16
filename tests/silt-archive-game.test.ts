import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../src/kernel/host.ts';
import { PHASES, SDK_VERSION, SessionControl, Silt } from '../src/sdk/index.ts';
import game from '../src/plugins/silt-game/manifest.json' with { type: 'json' };
import roomMap from '../src/plugins/mechanics-room-map/manifest.json' with { type: 'json' };
import inventory from '../src/plugins/mechanics-inventory/manifest.json' with { type: 'json' };
import crafting from '../src/plugins/mechanics-crafting/manifest.json' with { type: 'json' };
import progression from '../src/plugins/mechanics-progression/manifest.json' with { type: 'json' };
import clock from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import conditions from '../src/plugins/mechanics-conditions/manifest.json' with { type: 'json' };

const chamber = { name: 'Open chamber', rows: ['####D####', '#.......#', '#.......#', '#.......#', 'D.......D', '#.......#', '#.......#', '#.......#', '####D####'] };
const pack = { schema: 1, id: 'test/silt-content', name: 'Test archive', version: '1.0.0', kind: 'content', sdk: '^2.0.0', description: 'Test archive', dependencies: { 'silt/game': '^1.0.0' }, capabilities: [] };
const content = [{ kind: 'silt-archive', id: 'test/archive', data: { name: 'Archive', districts: ['Intake', 'Warrens', 'Bell'].map(name => ({ name, chambers: [chamber] })) } }];

async function setup(gate = { playing: true }) {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, phases: PHASES, installHostServices(session, scope) { session.services.provide(SessionControl, gate, 'host', scope); } });
  assert.deepEqual(host.setCatalog([{ manifest: game, load: () => import('../src/plugins/silt-game/index.ts') }, { manifest: roomMap, load: () => import('../src/plugins/mechanics-room-map/index.ts') }, { manifest: inventory, load: () => import('../src/plugins/mechanics-inventory/index.ts') }, { manifest: crafting, load: () => import('../src/plugins/mechanics-crafting/index.ts') }, { manifest: progression, load: () => import('../src/plugins/mechanics-progression/index.ts') }, { manifest: clock, load: () => import('../src/plugins/mechanics-clock/index.ts') }, { manifest: conditions, load: () => import('../src/plugins/mechanics-conditions/index.ts') }, { manifest: pack, content }]), []);
  await host.apply({ schema: 1, id: 'test/silt', name: 'Test', plugins: ['silt/game', 'mechanics/room-map', 'mechanics/inventory', 'mechanics/crafting', 'mechanics/progression', 'mechanics/clock', 'mechanics/conditions', 'test/silt-content'], roles: { 'sdk/experience': 'silt/archive', 'sdk/room-map': 'mechanics/room-map', 'sdk/mechanic-inventory': 'mechanics/inventory', 'sdk/mechanic-crafting': 'mechanics/crafting', 'sdk/mechanic-progression': 'mechanics/progression', 'sdk/mechanic-clock': 'mechanics/clock', 'sdk/mechanic-conditions': 'mechanics/conditions' }, options: { archive: 'test/archive' }, seed: 7 });
  return host;
}

test('invalid actions cost no turns, pause rejects ingress, extraction and restart', async () => {
  const gate = { playing: true }, host = await setup(gate);
  try {
    const session = host.session!, game = session.services.get(Silt), tick = () => session.scheduler.runTick();
    const before = game.state();
    assert.equal(game.enqueue({ type: 'move', dx: 0.5, dy: 0.5 }), false);
    game.enqueue({ type: 'attack', enemy: 'missing' }); tick(); assert.deepEqual(game.state(), before);
    gate.playing = false; assert.equal(game.enqueue({ type: 'wait' }), false); tick(); assert.deepEqual(game.state(), before); gate.playing = true;
    game.enqueue({ type: 'wait' }); tick(); assert.equal(game.state().turn, 1);
    game.enqueue({ type: 'extract' }); tick(); assert.equal(game.state().status, 'extracted');
    game.enqueue({ type: 'restart' }); tick(); assert.equal(game.state().status, 'playing'); assert.equal(game.state().turn, 0);
    const snapshot = game.state(); (snapshot.rows as string[])[0] = 'tampered'; assert.equal(game.state().rows[0], '####D####');
  } finally { host.stop(); }
});

test('starting supplies initialize exactly once after the launcher permits play', async () => {
  const gate = { playing: false }, host = await setup(gate);
  try {
    const session = host.session!, game = session.services.get(Silt);
    session.scheduler.runTick();
    assert.equal(game.state().bandages, 0);
    gate.playing = true;
    session.scheduler.runTick();
    assert.equal(game.state().bandages, 3);
    assert.equal(game.state().airSupplies, 2);
    session.scheduler.runTick();
    assert.equal(game.state().bandages, 3);
    game.enqueue({ type: 'restart' }); session.scheduler.runTick();
    assert.equal(game.state().bandages, 3);
    assert.equal(game.state().airSupplies, 2);
  } finally { host.stop(); }
});

test('three districts can be explored, cleared and extracted with the Register', async () => {
  const host = await setup();
  try {
    const session = host.session!, game = session.services.get(Silt);
    const act = (command: Parameters<typeof game.enqueue>[0]) => { assert.equal(game.enqueue(command), true); session.scheduler.runTick(); };
    let choices = 0;
    for (let step = 0; step < 4000 && game.state().status === 'playing'; step++) {
      const s = game.state();
      if (s.pendingUpgrades) {
        const upgrade = choices === 0 ? 'health' : choices === 1 ? 'air' : 'damage';
        act({ type: 'upgrade', upgrade });
        const after = game.state();
        assert.equal(after.pendingUpgrades, s.pendingUpgrades - 1);
        if (upgrade === 'health') assert.equal(after.maxHealth, s.maxHealth + 4);
        if (upgrade === 'air') assert.equal(after.maxAir, s.maxAir + 3);
        if (upgrade === 'damage') assert.equal(after.damage, s.damage + 1);
        choices++; continue;
      }
      if (s.health <= 15 && s.bandages && s.health < s.maxHealth) { act({ type: 'use', item: 'bandage' }); continue; }
      const enemy = s.enemies.find(e => Math.abs(e.x - s.x) + Math.abs(e.y - s.y) === 1);
      if (enemy) { act({ type: 'attack', enemy: enemy.id }); continue; }
      if (s.purpose === 'fragment' && s.fragments === 0) { act({ type: 'interact' }); continue; }
      if (s.purpose === 'optional') act({ type: 'interact' });
      const state = game.state();
      if (state.purpose === 'lift' && state.fragments === 2) { act({ type: state.district === 2 ? 'extract' : 'descend' }); continue; }
      const all = state.rooms, here = all.find(r => r.id === state.room)!;
      const goal = all.find(r => !r.visited) ?? all.find(r => r.purpose === (state.fragments < 2 ? (state.fragments === 0 ? 'fragment' : 'boss') : 'lift') && r.id !== state.room);
      assert.ok(goal, JSON.stringify(state));
      const paths: string[][] = [[here.id]], seen = new Set<string>(); let path: string[] | undefined;
      for (let i = 0; i < paths.length; i++) { const p = paths[i]!, last = p[p.length - 1]!; if (last === goal.id) { path = p; break; } if (seen.has(last)) continue; seen.add(last); const node = all.find(r => r.id === last); if (node) for (const n of node.neighbors) if (!seen.has(n)) paths.push([...p, n]); }
      assert.ok(path && path.length > 1);
      const next = all.find(r => r.id === path[1])!;
      const dx = next.x - here.x, dy = next.y - here.y;
      const tx = dx === 1 ? 8 : dx === -1 ? 0 : 4, ty = dy === 1 ? 8 : dy === -1 ? 0 : 4;
      const mx = dy && state.x !== 4 ? Math.sign(4 - state.x) : dx && state.y !== 4 ? 0 : Math.sign(tx - state.x);
      const my = mx ? 0 : Math.sign(ty - state.y);
      act({ type: 'move', dx: mx, dy: my });
    }
    assert.equal(game.state().status, 'victory', JSON.stringify(game.state()));
    assert.ok(choices >= 3);
  } finally { host.stop(); }
});
