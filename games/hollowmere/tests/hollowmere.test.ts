import test from 'node:test';
import assert from 'node:assert/strict';
import preset from '../presets/hollowmere-ascent.json' with { type: 'json' };
import { catalog } from '../../../src/app/catalog.ts';
import { Player, Profile, SessionControl, definePlugin } from '@bulkhead/sdk';
import { Metroidvania, MetroidvaniaWorlds } from '../contracts/metroidvania.ts';
import type { ProfileService } from '@bulkhead/sdk';
import { createHeadlessGame } from '../../../tests/helpers/game.ts';
import { createProfileStore } from '@bulkhead/platform-web/profile-store.ts';

async function setup(profile?: ProfileService) {
  const game = createHeadlessGame(catalog);
  const services = {
    manifest: { schema: 1, id: 'aaa/hollowmere-services', name: 'Hollowmere test services', version: '1.0.0', sdk: '^2.0.0', kind: 'code' },
    load: async () => ({ default: definePlugin({ activate(ctx) {
      ctx.services.provide(SessionControl, { playing: true });
      if (profile) ctx.services.provide(Profile, profile);
    } }) }),
  };
  await game.host.apply({ ...preset, plugins: [...preset.plugins, services.manifest.id] }, [services]);
  game.ticks(1);
  const run = () => game.session().services.get(Metroidvania);
  return { ...game, run, state: () => run().state() };
}

test('Hollowmere stages its world and exposes a playable starting room', async () => {
  const g = await setup();
  try {
    const world = g.session().registries.get(MetroidvaniaWorlds, 'hollowmere/world');
    assert.ok(world);
    assert.equal(world.rooms.length, 12);
    let s = g.state();
    assert.equal(s.status, 'playing');
    assert.equal(s.roomId, 'moss-gate');
    assert.equal(s.roomName, 'Mossgate Threshold');
    assert.equal(s.player.health, 100);
    assert.equal(s.player.maxHealth, 100);
    assert.equal(s.abilities.filter(a => a.unlocked).map(a => a.id).join(','), 'saber');
    assert.ok(s.inventory.some(item => item.id === 'hollowmere/moss-tonic'));
    assert.equal(s.map.rooms.length, 12);
    assert.equal(s.map.rooms.filter(room => room.visited).length, 1);
    assert.equal(s.npcs[0]?.name, 'Brann Emberhand');
    const player = g.session().entities.first(Player);
    assert.equal(player, undefined, 'Hollowmere models its own actor rather than spawning the shooter player');
    const tick = g.session().scheduler;
    const before = s.player.x;
    g.input.press('hollowmere/right'); tick.runTick(); g.input.release('hollowmere/right');
    s = g.state();
    assert.ok(s.player.x > before, 'right input advances the platformer body');
    g.run().enqueue({ type: 'set-paused', paused: true }); tick.runTick();
    assert.equal(g.state().status, 'paused');
    g.run().enqueue({ type: 'set-paused', paused: false }); tick.runTick();
    assert.equal(g.state().status, 'playing');
  } finally { g.host.stop(); }
});

test('Hollowmere binds a checkpoint, keeps the map current and rejects unknown commands', async () => {
  const g = await setup();
  try {
    const s = g.state();
    const beacon = s.checkpoints[0];
    assert.ok(beacon);
    // The player starts at x=3; approach the beacon at x=5 by input rather than mutating simulation state.
    g.input.press('hollowmere/right');
    for (let i = 0; i < 30 && g.state().player.x < 4.7; i++) g.session().scheduler.runTick();
    g.input.release('hollowmere/right');
    g.input.press('hollowmere/interact');
    g.session().scheduler.runTick();
    g.input.release('hollowmere/interact');
    const after = g.state();
    assert.ok(after.message.toLowerCase().includes('remember'));
    assert.equal(g.run().enqueue({ type: 'set-paused', paused: 'no' } as never), false);
    assert.equal(after.map.state.current, 'moss-gate');
    assert.ok(after.map.rooms.some(room => room.id === 'moss-hall' && room.revealed));
  } finally { g.host.stop(); }
});

test('Hollowmere opens a dialogue and the pause journal can use a consumable without advancing simulation', async () => {
  const g = await setup();
  try {
    // Move toward Brann at x=9, stopping before the next room transition, then interact.
    g.input.press('hollowmere/right');
    for (let i = 0; i < 120 && g.state().player.x < 8.2; i++) g.session().scheduler.runTick();
    g.input.release('hollowmere/right');
    g.input.press('hollowmere/interact'); g.session().scheduler.runTick(); g.input.release('hollowmere/interact');
    let s = g.state();
    assert.ok(s.dialogue, JSON.stringify({ room: s.roomId, player: s.player, npcs: s.npcs }));
    assert.match(s.dialogue!.name, /Brann/);
    g.run().enqueue({ type: 'dialogue-close' }); g.session().scheduler.runTick();
    // Take one hit from the first goblin so the tonic has something to heal.
    g.input.press('hollowmere/right');
    for (let i = 0; i < 140 && g.state().player.health >= g.state().player.maxHealth; i++) g.session().scheduler.runTick();
    g.input.release('hollowmere/right');
    assert.ok(g.state().player.health < g.state().player.maxHealth, 'the room goblin should land a telegraphed hit while approaching');
    g.run().enqueue({ type: 'set-paused', paused: true }); g.session().scheduler.runTick();
    const paused = g.state();
    assert.equal(paused.status, 'paused');
    const index = paused.inventory.findIndex(item => item.id === 'hollowmere/moss-tonic');
    assert.ok(index >= 0);
    g.run().enqueue({ type: 'use-item', index }); g.session().scheduler.runTick();
    const used = g.state();
    assert.equal(used.status, 'paused');
    assert.equal(used.inventory.find(item => item.id === 'hollowmere/moss-tonic')?.count ?? 0, paused.inventory.find(item => item.id === 'hollowmere/moss-tonic')!.count - 1);
  } finally { g.host.stop(); }
});

test('Hollowmere walks through an authored room transition and advances the world map', async () => {
  const g = await setup();
  try {
    assert.equal(g.state().roomId, 'moss-gate');
    g.input.press('hollowmere/right');
    for (let i = 0; i < 420 && g.state().roomId === 'moss-gate'; i++) g.session().scheduler.runTick();
    g.input.release('hollowmere/right');
    const s = g.state();
    assert.equal(s.roomId, 'moss-hall', JSON.stringify({ x: s.player.x, health: s.player.health, message: s.message }));
    assert.ok(s.map.state.visited.includes('moss-hall'));
    assert.ok(s.map.rooms.some(room => room.id === 'moss-well' && room.revealed));
  } finally { g.host.stop(); }
});

test('Hollowmere external room graph has links and all rooms are reachable from the start', async () => {
  const g = await setup();
  try {
    const world = g.session().registries.get(MetroidvaniaWorlds, 'hollowmere/world')!;
    const start = world.startRoom;
    const seen = new Set([start]), queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      const room = world.rooms.find(entry => entry.id === current)!;
      for (const door of room.doors) if (!seen.has(door.to)) { seen.add(door.to); queue.push(door.to); }
    }
    assert.equal(seen.size, world.rooms.length);
    const player = g.state().player;
    assert.ok(player.x >= 0 && player.y >= 0);
  } finally { g.host.stop(); }
});


test('Hollowmere loads a checkpoint save, restores abilities/items and enforces ability-gated doors', async () => {
  const data = new Map<string, string>();
  const store = createProfileStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } });
  const save = (abilities: readonly string[]) => JSON.stringify({
    schema: 1, world: 'hollowmere/world', room: 'moss-well',
    checkpoint: { id: 'test-well', room: 'moss-well', x: 35, y: 4.1 },
    abilities, items: [{ id: 'hollowmere/moss-tonic', count: 1 }], collected: [], flags: [],
    embers: 2, maxHealth: 100, maxFocus: 50, swordLevel: 0, kills: 0, deaths: 0, playTime: 12,
    map: { visited: ['moss-well'], revealed: ['moss-well', 'root-crossing'] },
  });
  store.save({ values: { 'hollowmere/save.v1': save(['saber']) } });
  const g = await setup(store);
  try {
    let s = g.state();
    assert.equal(s.roomId, 'moss-well');
    assert.equal(s.player.x, 35);
    assert.ok(s.inventory.some(item => item.id === 'hollowmere/moss-tonic'));
    assert.equal(s.map.state.visited.includes('moss-well'), true);
    g.ticks(48);
    s = g.state();
    assert.match(s.message, /Windroot|double|required|arch/i);
    g.host.stop();
    store.save({ values: { 'hollowmere/save.v1': save(['saber', 'double-jump']) } });
    const g2 = await setup(store);
    try {
      g2.ticks(48);
      const after = g2.state();
      assert.equal(after.roomId, 'root-crossing');
      assert.equal(after.abilities.find(ability => ability.id === 'double-jump')?.unlocked, true);
    } finally { g2.host.stop(); }
  } catch (error) { g.host.stop(); throw error; }
});

test('Hollowmere can defeat the Hollow King and end the run in victory', async () => {
  const data = new Map<string, string>();
  const store = createProfileStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } });
  const saved = JSON.stringify({
    schema: 1, world: 'hollowmere/world', room: 'hollow-throne',
    checkpoint: { id: 'test-throne', room: 'hollow-throne', x: 24.8, y: 15.8 },
    abilities: ['saber', 'double-jump', 'dash', 'wall-cling', 'ember-bolt'],
    items: [{ id: 'hollowmere/moss-tonic', count: 2 }, { id: 'hollowmere/sun-sigil-moss', count: 1 }, { id: 'hollowmere/sun-sigil-tide', count: 1 }, { id: 'hollowmere/sun-sigil-ember', count: 1 }], collected: [], flags: [], embers: 8,
    maxHealth: 200, maxFocus: 80, swordLevel: 5, kills: 0, deaths: 0, playTime: 30,
    map: { visited: ['moss-gate', 'moss-hall', 'moss-well', 'thorn-gallery', 'root-crossing', 'root-shrine', 'root-depths', 'burrow', 'archive-stair', 'archive-vault', 'keep-bridge', 'hollow-throne'], revealed: ['moss-gate', 'moss-hall', 'moss-well', 'thorn-gallery', 'root-crossing', 'root-shrine', 'root-depths', 'burrow', 'archive-stair', 'archive-vault', 'keep-bridge', 'hollow-throne'] },
  });
  store.save({ values: { 'hollowmere/save.v1': saved } });
  const g = await setup(store);
  try {
    let s = g.state();
    assert.equal(s.roomId, 'hollow-throne');
    assert.ok(s.boss, 'the Keeper should be present in the throne room');
    for (let i = 0; i < 520 && g.state().status !== 'victory'; i++) {
      g.input.press('hollowmere/attack'); g.ticks(1); g.input.release('hollowmere/attack');
    }
    s = g.state();
    assert.equal(s.status, 'victory', JSON.stringify({ boss: s.boss, health: s.player.health, message: s.message }));
    assert.equal(s.boss, null);
    assert.equal(s.stats.completion, 100);
  } finally { g.host.stop(); }
});
