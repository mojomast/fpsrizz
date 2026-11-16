import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import assetConfig from '../scripts/assetrizz.json' with { type: 'json' };
import previewConfig from '../scripts/weapon-previews.json' with { type: 'json' };
import previews from '../public/weapons/provenance.json' with { type: 'json' };
import content from '../src/plugins/cinder-content/content.json' with { type: 'json' };
import contentManifest from '../src/plugins/cinder-content/manifest.json' with { type: 'json' };
import { catalog } from '../src/app/catalog.ts';
import preset from '../src/content/presets/cinder-vault.json' with { type: 'json' };
import { cinderArsenal } from '../src/plugins/cinder-game/arsenal.ts';
import { weaponTextures as cinderWeapons } from '../src/plugins/theme-assetrizz/cinder-weapons.ts';
import { Cinder, Combat, Enemy, Flow, Health, Inventory, MechanicProgressionChanged,
  MechanicResourcesChanged, Pickup, Player, Profile, SessionControl, Transform, WeaponRuntime, Weapons, World, definePlugin } from '../src/sdk/index.ts';
import type { CinderCommand, ProfileService } from '../src/sdk/index.ts';
import { coreCatalog, createHeadlessGame } from './helpers/game.ts';
import { createProfileStore } from '../src/platform/profile-store.ts';
import { ALTERNATE, alternateEntry } from './helpers/alternate-resources.ts';
import { progressionProviders } from './helpers/alternate-progression.ts';

async function setup(seed = 27841, options: { profile?: ProfileService; resources?: boolean; progression?: boolean } = {}) {
  const control = { playing: true };
  const altResources = options.resources === true, altProgression = options.progression === true;
  const progression = progressionProviders[altProgression ? 1 : 0]!;
  const core = new Set(coreCatalog().map(e => (e.manifest as { id: string }).id));
  const game = createHeadlessGame([
    ...catalog.filter(e => !core.has((e.manifest as { id: string }).id)
      && (!altResources || (e.manifest as { id: string }).id !== 'mechanics/resources')
      && (!altProgression || (e.manifest as { id: string }).id !== 'mechanics/progression')),
    ...(altResources ? [alternateEntry] : []),
    ...(altProgression ? [progression.entry] : []),
  ]);
  const services = { manifest: { schema: 1, id: 'test/cinder-services', name: 'Test services', version: '1.0.0', sdk: '^2.0.0', kind: 'code' },
    load: async () => ({ default: definePlugin({ activate(ctx) {
      ctx.services.provide(SessionControl, control);
      if (options.profile) ctx.services.provide(Profile, options.profile);
    } }) }) };
  await game.host.apply({ ...preset, seed,
    plugins: [...preset.plugins.map(id => altResources && id === 'mechanics/resources' ? ALTERNATE
      : altProgression && id === 'mechanics/progression' ? progression.id : id), services.manifest.id],
    roles: { ...preset.roles, 'sdk/mechanic-resources': altResources ? ALTERNATE : 'mechanics/resources',
      'sdk/mechanic-progression': progression.id },
  }, [services]);
  if (altResources) {
    assert.equal(game.host.catalogStatus().some(e => e.id === 'mechanics/resources'), false);
    assert.equal(game.session().order.includes('mechanics/resources'), false);
  }
  if (altProgression) {
    assert.equal(game.host.catalogStatus().some(e => e.id === 'mechanics/progression'), false);
    assert.equal(game.session().order.includes('mechanics/progression'), false);
  }
  const run = () => game.session().services.get(Cinder);
  const state = () => run().state();
  const send = (command: CinderCommand) => { assert.equal(run().enqueue(command), true); game.ticks(1); return state(); };
  const player = () => game.session().entities.first(Player)!;
  const enemies = () => {
    const out: { id: number; def: string }[] = [];
    game.session().entities.each(Enemy, (id, enemy) => { if (!game.session().entities.get(id, Health)?.dead) out.push({ id, def: enemy.def }); });
    return out;
  };
  const boss = () => enemies().find(e => e.def === 'cinder/warden' || e.def === 'cinder/keeper');
  const kill = (id: number) => {
    game.session().services.get(Combat).damage({ target: id, source: player(), amount: 100000, kind: 'test', x: 0, z: 0 });
    game.ticks(1);
  };
  const killRegular = (count: number) => {
    for (const enemy of enemies().filter(e => e.def !== 'cinder/warden' && e.def !== 'cinder/keeper').slice(0, count)) kill(enemy.id);
    return state();
  };
  const exit = (depth = state().depth) => game.session().services.get(World).desc.triggers.find(t =>
    t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depth}`));
  const teleport = (x: number, z: number) => {
    const t = game.session().entities.get(player(), Transform)!;
    t.x = t.prevX = x; t.z = t.prevZ = z;
    game.ticks(1);
  };
  const descend = () => {
    const point = exit(); assert.ok(point);
    teleport(point.x, point.z);
    return state();
  };
  return { ...game, control, run, state, send, player, enemies, boss, kill, killRegular, exit, teleport, descend };
}

test('Cinder starts a large three-depth dungeon in the playing phase with wardens, boons and no forced intermission', async () => {
  const g = await setup();
  try {
    const s = g.state();
    assert.equal(s.phase, 'playing');
    assert.equal(s.depth, 1); assert.equal(s.depths, 3);
    assert.equal(s.depthTitle, 'The Ash Gate');
    assert.equal(s.level, 1); assert.equal(s.xp, 0); assert.equal(s.xpToNext, 30);
    assert.deepEqual(s.arsenal.map(w => w.id), ['cinder/thornwake', 'cinder/cinderkey']);
    assert.deepEqual(s.boons, []);
    assert.equal(s.offers.length, 0);
    assert.equal(s.boss?.role, 'warden'); assert.equal(s.boss?.max, 220);
    assert.equal(s.target?.kind, 'warden');
    assert.ok(s.remaining >= 8);
    const world = g.session().services.get(World);
    assert.equal(world.desc.width, 94); assert.equal(world.desc.height, 30);
    assert.equal(world.desc.spawns.filter(sp => sp.tags.includes('dungeon-room')).length, 24);
    assert.ok(world.desc.spawns.some(sp => sp.tags.includes('dungeon-role-warden') && sp.tags.includes('dungeon-depth-3')));
    assert.equal(g.session().entities.get(g.player(), Inventory)?.current, 'cinder/cinderkey');
  } finally { g.host.stop(); }
});

test('Cinder levels up during a live floor, makes combat continue and consumes queued boons without a draft phase', async () => {
  const g = await setup();
  try {
    const resourceReasons: string[] = [], progressionEvents: string[] = [];
    g.session().events.on(MechanicResourcesChanged, e => resourceReasons.push(e.reason), 'test', g.session().scope);
    g.session().events.on(MechanicProgressionChanged, e => progressionEvents.push(e.reason), 'test', g.session().scope);
    let s = g.killRegular(3);
    assert.equal(s.phase, 'playing');
    assert.ok(s.level >= 2, JSON.stringify({ level: s.level, xp: s.xp }));
    assert.ok(s.offers.length === 3);
    assert.equal(s.offers.filter(o => o.kind === 'weapon').length, 1);
    assert.equal(s.offers.filter(o => o.kind === 'relic').length, 2);
    assert.ok(s.remaining > 0, 'other enemies remain while the level-up tray is open');
    const loadedBefore = g.session().entities.get(g.player(), WeaponRuntime)!.loaded['cinder/cinderkey']!;
    g.input.press('core/fire'); g.ticks(2); g.input.release('core/fire');
    assert.ok(g.session().entities.get(g.player(), WeaponRuntime)!.loaded['cinder/cinderkey']! < loadedBefore, 'firing works while a boon is pending');
    const beforeChoice = s;
    const relicIndex = beforeChoice.offers.findIndex(o => o.kind === 'relic');
    assert.ok(relicIndex >= 0);
    const chosen = beforeChoice.offers[relicIndex]!;
    g.input.press(`cinder/boon-${relicIndex + 1}`); g.ticks(1); g.input.release(`cinder/boon-${relicIndex + 1}`); g.ticks(1);
    s = g.state();
    assert.equal(s.phase, 'playing');
    if (chosen.kind === 'weapon') assert.ok(s.arsenal.some(w => w.id === chosen.id));
    else assert.ok(s.boons.some(b => b.id === chosen.id));
    assert.ok(s.offers.length === 0 || s.offer !== beforeChoice.offer);
    const stale = g.run().enqueue({ type: 'choose', index: 0, offer: beforeChoice.offer });
    assert.equal(stale, true);
    const afterStale = g.state(); g.ticks(1);
    assert.deepEqual(g.state().arsenal, afterStale.arsenal);
    assert.ok(progressionEvents.filter(e => e === 'grant').length >= 1);
    assert.ok(resourceReasons.filter(e => e === 'slain').length >= 3);
    // An unclaimed weapon cache in a loot room joins the same run.
    const pickups: { id: number; def: string }[] = [];
    g.session().entities.each(Pickup, (id, pickup) => pickups.push({ id, def: pickup.def }));
    const weaponCache = pickups.find(p => p.def.startsWith('cinder/cache-'));
    assert.ok(weaponCache);
    const pt = g.session().entities.get(weaponCache.id, Transform)!;
    g.teleport(pt.x, pt.z); g.ticks(1);
    assert.ok(g.state().arsenal.length >= 3, JSON.stringify({ cache: weaponCache.def, arsenal: g.state().arsenal.map(w => w.id),
      weapons: g.session().entities.get(g.player(), Inventory)?.weapons, pickupGone: g.session().entities.get(weaponCache.id, Pickup) === undefined,
      player: g.session().entities.get(g.player(), Transform), point: pt }));
  } finally { g.host.stop(); }
});

for (const replacement of [false, true]) test(`Cinder completes all three depths and the keeper with ${replacement ? 'independent' : 'default'} progression`, async () => {
  const g = await setup(27841, { progression: replacement });
  try {
    for (let depth = 1; depth <= 3; depth++) {
      let s = g.state();
      assert.equal(s.depth, depth);
      assert.equal(s.phase, 'playing');
      assert.equal(s.boss?.role, depth === 3 ? 'keeper' : 'warden');
      const boss = g.boss(); assert.ok(boss);
      const oldRegular = g.enemies().find(e => e.def !== 'cinder/warden' && e.def !== 'cinder/keeper');
      g.kill(boss.id);
      s = g.state();
      if (depth === 3) {
        assert.equal(s.phase, 'victory');
        assert.equal(g.session().services.get(Flow).result?.outcome, 'victory');
        assert.ok(s.level >= 2);
        break;
      }
      assert.equal(s.portal, true); assert.equal(s.boss, null);
      const before = g.state().depth;
      const after = g.descend();
      assert.equal(after.depth, before + 1);
      assert.equal(after.portal, false);
      if (oldRegular) assert.equal(g.session().entities.get(oldRegular.id, Health), undefined, 'old-depth enemies are cleared');
      assert.ok(after.remaining >= 8, 'a new depth is populated');
      assert.equal(after.target?.kind, after.depth === 3 ? 'keeper' : 'warden');
    }
    assert.equal(g.state().depth, 3);
    assert.equal(g.session().services.get(Flow).ended, true);
  } finally { g.host.stop(); }
});

test('Cinder validates the generated depth markers and progression selection before replacing a live session', async () => {
  const g = await setup();
  try {
    const previous = g.session();
    const modified = content.map(entry => entry.kind === 'map'
      ? { ...entry, data: { ...entry.data, floors: [(entry.data as { floors: unknown[] }).floors[0]] } } : entry);
    await assert.rejects(g.host.apply(preset, [{ manifest: contentManifest, content: modified }]), /depth 2/);
    assert.equal(g.session(), previous);
    assert.equal(g.state().phase, 'playing');
  } finally { g.host.stop(); }
  const core = new Set(coreCatalog().map(e => (e.manifest as { id: string }).id));
  const h = createHeadlessGame(catalog.filter(e => !core.has((e.manifest as { id: string }).id)));
  try {
    const { 'sdk/mechanic-progression': _progression, ...roles } = preset.roles as Record<string, string>;
    await assert.rejects(h.host.apply({ ...preset, roles }), /progression/i);
  } finally { h.host.stop(); }
});

test('Cinder pause, death, profile persistence and restart preserve the new run boundaries', async () => {
  const data = new Map<string, string>();
  const store = createProfileStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } });
  store.save({ values: { unrelated: true, 'cinder/vault.v1.embers': 8 } });
  const g = await setup(123, { profile: store });
  try {
    assert.equal(g.state().health, 105); assert.equal(g.state().rank, 1);
    g.killRegular(1);
    g.run().enqueue({ type: 'pulse' }); g.control.playing = false; g.ticks(1);
    assert.equal(g.run().enqueue({ type: 'pulse' }), false);
    g.control.playing = true; g.ticks(1);
    g.session().services.get(Combat).damage({ target: g.player(), source: 0, amount: 100000, kind: 'test', x: 0, z: 0 }); g.ticks(1);
    assert.equal(g.state().phase, 'defeat');
    const saved = store.load(); assert.ok(saved.ok); assert.equal(saved.value?.values['unrelated'], true); assert.equal(saved.value?.values['cinder/vault.v1.runs'], 1);
    const old = g.run(); await g.host.restart(); assert.equal(old.enqueue({ type: 'pulse' }), false);
    const fresh = g.state();
    assert.equal(fresh.run, 2); assert.equal(fresh.depth, 1); assert.equal(fresh.level, 1); assert.equal(fresh.boons.length, 0);
    assert.deepEqual(fresh.arsenal.map(w => w.id), ['cinder/thornwake', 'cinder/cinderkey']);
    assert.equal(fresh.health, 105);
  } finally { g.host.stop(); }
});

test('Cinder pulse spends its shared cooldown only on legal visible targets', async () => {
  const g = await setup();
  try {
    const player = g.session().entities.get(g.player(), Transform)!;
    const targets = g.enemies().filter(e => e.def === 'cinder/thrall').slice(0, 2);
    assert.ok(targets.length >= 1);
    const world = g.session().services.get(World);
    assert.equal(world.lineOfSight(player.x, player.z, player.x + 1, player.z), true);
    for (const target of targets) {
      const t = g.session().entities.get(target.id, Transform)!;
      t.x = t.prevX = player.x + 1; t.z = t.prevZ = player.z;
    }
    const before = targets.map(t => g.session().entities.get(t.id, Health)!.hp);
    g.send({ type: 'pulse' }); g.ticks(1);
    assert.ok(g.state().cooldown > 7.9);
    assert.ok(targets.every((t, i) => g.session().entities.get(t.id, Health)!.hp < before[i]!));
    const after = targets.map(t => g.session().entities.get(t.id, Health)!.hp);
    g.send({ type: 'pulse' });
    assert.deepEqual(targets.map(t => g.session().entities.get(t.id, Health)!.hp), after);
  } finally { g.host.stop(); }
});

test('Cinder UI and weapon artwork still match their pinned source hashes byte for byte', async () => {
  const bytes = (path: string) => Uint8Array.from(atob(readFileSync(path, 'base64')), c => c.charCodeAt(0));
  const sha = async (data: Uint8Array) => {
    const copy = new Uint8Array(data.length); copy.set(data);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
    return [...digest].map(n => n.toString(16).padStart(2, '0')).join('');
  };
  assert.equal(assetConfig.revision, '05339c228f55ac95ad21b5c947db0c6e36207cd4');
  for (const asset of assetConfig.ui) assert.equal(await sha(bytes(`public/assetrizz/${asset.key}.png`)), asset.sha256, asset.key);
  assert.equal(previews.configSha256, await sha(bytes('scripts/weapon-previews.json')));
  assert.deepEqual(previews.assets.map(asset => asset.id), cinderArsenal.map(weapon => weapon.id));
  for (const asset of previews.assets) {
    assert.equal(await sha(bytes(asset.source)), asset.sourceSha256, asset.source);
    assert.equal(await sha(bytes(`public/${asset.output}`)), asset.outputSha256, asset.output);
  }
  assert.equal(Object.keys(cinderWeapons).length, 6);
});
