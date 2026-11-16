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
import { CinderClasses } from '../src/plugins/cinder-game/classes.ts';
import type { CinderClassId } from '../src/plugins/cinder-game/classes.ts';
import { weaponTextures as cinderWeapons } from '../src/plugins/theme-assetrizz/cinder-weapons.ts';
import { AiBehaviors, Cinder, Combat, Enemies, Enemy, Flow, Health, Inventory, MechanicProgressionChanged,
  MechanicResourcesChanged, Pickup, Player, PlayerAvatar, Profile, SessionControl, Transform, ViewModeChanged, ViewModes, Visual, WeaponRuntime, Weapons, World, definePlugin, yawOf } from '../src/sdk/index.ts';
import type { CinderCommand, ProfileService } from '../src/sdk/index.ts';
import { coreCatalog, createHeadlessGame } from './helpers/game.ts';
import { createProfileStore } from '../src/platform/profile-store.ts';
import { ALTERNATE, alternateEntry } from './helpers/alternate-resources.ts';
import { progressionProviders } from './helpers/alternate-progression.ts';

async function setup(seed = 27841, options: { profile?: ProfileService; resources?: boolean; progression?: boolean; classId?: CinderClassId | null; threatId?: string } = {}) {
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
  if (options.threatId) { assert.equal(state().phase, 'class-select'); assert.equal(run().enqueue({ type: 'choose-threat', threatId: options.threatId }), true); game.ticks(1); assert.equal(state().threatId, options.threatId); }
  if (options.classId !== null) {
    assert.equal(state().phase, 'class-select');
    assert.equal(run().enqueue({ type: 'choose-class', classId: options.classId ?? 'warden' }), true);
    game.ticks(1);
    assert.equal(state().phase, 'player');
  }
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
    assert.equal(s.phase, 'player');
    assert.equal(s.depth, 1); assert.equal(s.depths, 3);
    assert.equal(s.depthTitle, 'The Ash Gate');
    assert.equal(s.classId, 'warden'); assert.equal(s.className, 'Ash Warden');
    assert.equal(s.round, 1); assert.equal(s.ap, 3); assert.equal(s.maxAp, 3);
    assert.equal(s.masteryRank, 0);
    assert.equal(s.inventory.find(i => i.id === 'cinder/draught')?.count, 2);
    assert.equal(s.inventoryCapacity, 12);
    assert.equal(s.classes.length, 3);
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

test('Cinder opens on class selection and each class has a distinct turn/loadout identity', async () => {
  const g = await setup(27841, { classId: null });
  try {
    let s = g.state();
    assert.equal(s.phase, 'class-select'); assert.equal(s.classId, null); assert.equal(s.remaining, 0);
    assert.deepEqual(s.classes.map(c => c.id), ['warden', 'emberwright', 'vaultrunner']);
    assert.equal(s.classes[0]?.ap, 3); assert.equal(s.classes[1]?.extraWeapon, 'cinder/ashbell'); assert.equal(s.classes[2]?.ap, 4);
    g.input.press('cinder/class-2'); g.ticks(1); g.input.release('cinder/class-2');
    s = g.state();
    assert.equal(s.classId, 'emberwright'); assert.equal(s.phase, 'player'); assert.equal(s.maxAp, 3);
    assert.ok(s.arsenal.some(w => w.id === 'cinder/ashbell'));
    assert.ok(s.inventory.some(i => i.id === 'cinder/ember-flask'));
    assert.equal(g.session().entities.get(g.player(), PlayerAvatar)?.visual, 'player-mage');
    const v = await setup(27841, { classId: 'vaultrunner' });
    try {
      const vs = v.state();
      assert.equal(vs.classId, 'vaultrunner'); assert.equal(vs.maxAp, 4); assert.equal(vs.health, 85);
      assert.equal(v.session().entities.get(v.player(), PlayerAvatar)?.visual, 'player-rogue');
      assert.ok(vs.arsenal.some(w => w.id === 'cinder/mothspindle'));
    } finally { v.host.stop(); }
  } finally { g.host.stop(); }
});

test('Cinder selects threat tiers, scales enemies and enrages bosses below half health', async () => {
  const g = await setup(27841, { classId: null });
  try {
    let s = g.state();
    assert.deepEqual(s.threats.map(t => t.id), ['pilgrim', 'delver', 'ashbound']);
    assert.equal(s.threatId, 'delver');
    g.input.press('cinder/boon-3'); g.ticks(1); g.input.release('cinder/boon-3');
    s = g.state(); assert.equal(s.threatId, 'ashbound'); assert.match(s.threatName, /Ashbound/);
    g.input.press('cinder/class-1'); g.ticks(1); g.input.release('cinder/class-1');
    s = g.state();
    assert.equal(s.phase, 'player'); assert.equal(s.threatName, 'Ashbound');
    assert.equal(s.boss?.max, 242, 'Ashbound scales enemy health by 10%');
    assert.ok(s.intents.elites >= 1, 'Ashbound guarantees at least one elite in a wing');
    const boss = g.boss(); assert.ok(boss);
    const bossMax = s.boss?.max; assert.ok(bossMax !== undefined);
    g.session().services.get(Combat).damage({ target: boss.id, source: g.player(), amount: Math.ceil(bossMax * 0.51), kind: 'test', x: 0, z: 0 });
    g.ticks(1);
    s = g.state();
    assert.equal(s.boss?.enraged, true);
    const enragedBoss = s.boss; assert.ok(enragedBoss);
    assert.ok(enragedBoss.health <= enragedBoss.max * 0.5);
  } finally { g.host.stop(); }
});

test('Cinder registers the new elite-adjacent enemy roster and manual-turn metadata', async () => {
  const g = await setup();
  try {
    for (const id of ['cinder/hound', 'cinder/acolyte', 'cinder/brute']) assert.equal(g.session().registries.has(Enemies, id), true, id);
    assert.equal(g.session().registries.has(AiBehaviors, 'cinder/manual'), true);
  } finally { g.host.stop(); }
});

test('Cinder field guide pauses movement and closes with H', async () => {
  const g = await setup();
  try {
    const t = g.session().entities.get(g.player(), Transform)!;
    const before = { x: t.x, z: t.z };
    g.input.press('cinder/help'); g.ticks(1); g.input.release('cinder/help');
    let s = g.state();
    assert.equal(s.helpOpen, true); assert.equal(s.overlay, 'help');
    g.input.press('core/move-forward'); g.ticks(1); g.input.release('core/move-forward');
    assert.deepEqual({ x: t.x, z: t.z }, before, 'movement is blocked while the field guide is open');
    g.input.press('cinder/help'); g.ticks(1); g.input.release('cinder/help');
    s = g.state(); assert.equal(s.helpOpen, false); assert.equal(s.overlay, 'none');
  } finally { g.host.stop(); }
});

test('Cinder oracle offers a blood pact for a random boon on discovered wings', async () => {
  const g = await setup();
  try {
    const boss = g.boss(); assert.ok(boss); g.kill(boss.id);
    g.descend();
    assert.equal(g.state().depth, 2);
    let oracle: { x: number; z: number } | undefined;
    g.session().entities.each(Visual, (id, visual) => {
      if (visual.tint !== '#d8b4ff') return;
      const t = g.session().entities.get(id, Transform); if (t) oracle = { x: t.x, z: t.z };
    });
    assert.ok(oracle, 'depth two should hold the Ash Oracle');
    const spot = oracle as { x: number; z: number };
    g.teleport(spot.x + 1.1, spot.z);
    g.input.press('core/use'); g.ticks(2); g.input.release('core/use');
    let s = g.state();
    assert.ok(s.dialogue); assert.match(s.dialogue.name, /Ash Oracle/);
    assert.ok(s.dialogue.options.some(option => option.id === 'pact'));
    const health = s.health;
    g.input.press('cinder/dialogue-1'); g.ticks(2); g.input.release('cinder/dialogue-1');
    s = g.state();
    assert.equal(s.boons.length, 1);
    assert.ok(s.health <= health, 'the pact costs at least 20 health; vitality may heal part of it back');
    assert.equal(s.dialogue?.options.find(option => option.id === 'pact')?.disabled, true);
  } finally { g.host.stop(); }
});

test('Cinder uses one-tile action-point turns, telegraphed enemy actions and an explicit end turn', async () => {
  const g = await setup();
  try {
    const player = g.player();
    const transform = g.session().entities.get(player, Transform)!;
    const world = g.session().services.get(World);
    const cs = world.desc.cellSize;
    let yaw = 0, target: { x: number; z: number } | undefined;
    for (const [angle, dx, dz] of [[0, 0, -cs], [-Math.PI / 2, cs, 0], [Math.PI, 0, cs], [Math.PI / 2, -cs, 0]] as const) {
      if (world.isFree(transform.x + dx, transform.z + dz, 0.35)) { yaw = angle; target = { x: transform.x + dx, z: transform.z + dz }; break; }
    }
    assert.ok(target);
    transform.yaw = yaw;
    const enemySnapshot = g.enemies().map(e => ({ id: e.id, x: g.session().entities.get(e.id, Transform)!.x, z: g.session().entities.get(e.id, Transform)!.z }));
    g.ticks(90);
    assert.deepEqual(g.enemies().map(e => ({ id: e.id, x: g.session().entities.get(e.id, Transform)!.x, z: g.session().entities.get(e.id, Transform)!.z })), enemySnapshot, 'autonomous AI is suspended during player turns');
    g.input.press('core/move-forward'); g.ticks(1); g.input.release('core/move-forward');
    assert.equal(g.state().ap, 2);
    assert.equal(transform.x, target.x); assert.equal(transform.z, target.z);
    const loaded = g.session().entities.get(player, WeaponRuntime)!.loaded['cinder/cinderkey']!;
    g.input.press('core/fire'); g.ticks(1); g.input.release('core/fire');
    assert.equal(g.session().entities.get(player, WeaponRuntime)!.loaded['cinder/cinderkey'], loaded - 1);
    assert.equal(g.state().ap, 1);
    g.send({ type: 'end-turn' });
    g.ticks(90);
    const after = g.state();
    assert.equal(after.phase, 'player'); assert.equal(after.round, 2); assert.equal(after.ap, 3);
    assert.ok(after.intents.attacks >= 0);
  } finally { g.host.stop(); }
});

test('Cinder turn attacks use real weapon input, spend actions and award kill XP', async () => {
  const g = await setup();
  try {
    const target = g.enemies().find(e => e.def === 'cinder/thrall'); assert.ok(target);
    const player = g.session().entities.get(g.player(), Transform)!;
    const world = g.session().services.get(World);
    let placed = false;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      if (!world.isFree(player.x + dx, player.z + dz, 0.45)) continue;
      const t = g.session().entities.get(target.id, Transform)!;
      t.x = t.prevX = player.x + dx; t.z = t.prevZ = player.z + dz;
      player.yaw = yawOf(t.x - player.x, t.z - player.z);
      placed = true; break;
    }
    assert.equal(placed, true);
    const beforeKills = g.state().kills;
    for (let shot = 0; shot < 2; shot++) {
      g.input.press('core/fire'); g.ticks(2); g.input.release('core/fire');
    }
    const after = g.state();
    assert.equal(after.kills, beforeKills + 1);
    assert.equal(g.session().entities.get(target.id, Health)?.dead, true);
    assert.equal(after.ap, 1);
    assert.ok(after.embers > 0);
  } finally { g.host.stop(); }
});

test('Cinder weapon actions distinguish bursts and heavy attacks', async () => {
  const runner = await setup(11, { classId: 'vaultrunner' });
  try {
    runner.input.press('core/weapon-3'); runner.ticks(1); runner.input.release('core/weapon-3');
    const runtime = runner.session().entities.get(runner.player(), WeaponRuntime)!;
    const before = runtime.loaded['cinder/mothspindle']!;
    runner.input.press('core/fire'); runner.ticks(1); runner.input.release('core/fire');
    assert.equal(runner.state().ap, 3);
    assert.equal(runtime.loaded['cinder/mothspindle'], before - 3, 'Mothspindle spends one action on a three-round burst');
  } finally { runner.host.stop(); }
  const caster = await setup(11, { classId: 'emberwright' });
  try {
    caster.input.press('core/weapon-6'); caster.ticks(1); caster.input.release('core/weapon-6');
    const runtime = caster.session().entities.get(caster.player(), WeaponRuntime)!;
    caster.input.press('core/fire'); caster.ticks(1); caster.input.release('core/fire');
    assert.equal(caster.state().ap, 1);
    assert.equal(runtime.loaded['cinder/ashbell'], 1, 'Ashbell costs two actions and fires one round');
  } finally { caster.host.stop(); }
});

test('Cinder telegraphs an adjacent enemy attack and resolves it on the enemy turn', async () => {
  const g = await setup();
  try {
    const target = g.enemies().find(e => e.def === 'cinder/thrall'); assert.ok(target);
    const player = g.session().entities.get(g.player(), Transform)!;
    const world = g.session().services.get(World), cs = world.desc.cellSize;
    let placed = false;
    for (const [dx, dz] of [[cs, 0], [0, cs], [-cs, 0], [0, -cs]] as const) {
      if (world.isFree(player.x + dx, player.z + dz, 0.45)) {
        const t = g.session().entities.get(target.id, Transform)!;
        t.x = t.prevX = player.x + dx; t.z = t.prevZ = player.z + dz; placed = true; break;
      }
    }
    assert.equal(placed, true);
    g.send({ type: 'end-turn' });
    assert.equal(g.state().phase, 'enemy'); assert.ok(g.state().intents.attacks >= 1);
    const before = g.state().health;
    g.ticks(120);
    const after = g.state();
    assert.ok(after.health < before, JSON.stringify({ before, after }));
    assert.equal(after.phase, 'player'); assert.equal(after.round, 2);
  } finally { g.host.stop(); }
});

test('Cinder toggles a reusable first-person/isometric camera mode without replacing simulation', async () => {
  const g = await setup();
  try {
    const modes = g.session().services.get(ViewModes);
    const seen: string[] = [];
    g.session().events.on(ViewModeChanged, e => seen.push(e.mode), 'test', g.session().scope);
    assert.equal(modes.mode, 'first-person');
    assert.deepEqual(modes.modes, ['first-person', 'isometric']);
    assert.equal(g.session().entities.get(g.player(), Visual), undefined, 'first person keeps the player bodyless');
    g.input.press('presentation/camera-modes.toggle'); g.ticks(1); g.input.release('presentation/camera-modes.toggle');
    assert.equal(modes.mode, 'isometric');
    assert.deepEqual(seen, ['isometric']);
    assert.equal(g.session().entities.get(g.player(), Visual)?.key, 'player-knight', 'overhead mode attaches the class avatar');
    const yaw = modes.yaw; modes.rotate(Math.PI / 2); assert.notEqual(modes.yaw, yaw, 'isometric camera rotation is exposed');
    assert.equal(modes.pickGround(320, 200), null, 'headless camera picking is safely unavailable');
    // The gameplay state, player and turn controller continue to run under the presentation-only mode switch.
    const before = g.state();
    assert.equal(before.phase, 'player');
    assert.ok(g.enemies().length > 0);
    g.input.press('presentation/camera-modes.toggle'); g.ticks(1); g.input.release('presentation/camera-modes.toggle');
    assert.equal(modes.mode, 'first-person');
    assert.equal(g.session().entities.get(g.player(), Visual), undefined, 'returning to first person removes the avatar');
    assert.equal(modes.set('not-a-mode' as never), false);
    assert.equal(modes.set('isometric'), true);
    assert.equal(modes.toggle(), 'first-person');
  } finally { g.host.stop(); }
});

test('isometric WASD follows the camera azimuth', async () => {
  const g = await setup();
  try {
    const modes = g.session().services.get(ViewModes);
    modes.set('isometric');
    const player = g.player(), t = g.session().entities.get(player, Transform)!;
    const world = g.session().services.get(World), cs = world.desc.cellSize;
    const occupied = new Set<string>();
    g.session().entities.each(Enemy, id => { const e = g.session().entities.get(id, Transform); if (e) occupied.add(`${Math.floor(e.x / cs)},${Math.floor(e.z / cs)}`); });
    const directions = [
      { name: 'north', dx: 0, dz: -1, yaw: 0 },
      { name: 'east', dx: 1, dz: 0, yaw: -Math.PI / 2 },
      { name: 'south', dx: 0, dz: 1, yaw: Math.PI },
      { name: 'west', dx: -1, dz: 0, yaw: Math.PI / 2 },
    ] as const;
    const chosen = directions.find(dir => {
      const x = t.x + dir.dx * cs, z = t.z + dir.dz * cs;
      return world.isFree(x, z, 0.35) && !occupied.has(`${Math.floor(x / cs)},${Math.floor(z / cs)}`);
    });
    assert.ok(chosen);
    const targetCell = { x: Math.floor(t.x / cs) + chosen.dx, z: Math.floor(t.z / cs) + chosen.dz };
    modes.rotate(chosen.yaw - modes.yaw);
    g.input.press('core/move-forward'); g.ticks(1); g.input.release('core/move-forward');
    assert.equal(Math.floor(t.x / cs), targetCell.x);
    assert.equal(Math.floor(t.z / cs), targetCell.z);
    assert.equal(g.state().ap, 2);
  } finally { g.host.stop(); }
});

test('Cinder isometric clicks spend AP on reachable movement and attacks', async () => {
  const g = await setup();
  try {
    g.session().services.get(ViewModes).set('isometric');
    const player = g.player(), t = g.session().entities.get(player, Transform)!;
    const world = g.session().services.get(World), cs = world.desc.cellSize;
    let target: { x: number; z: number } | undefined;
    const occupied = new Set<string>();
    g.session().entities.each(Enemy, id => { const e = g.session().entities.get(id, Transform); if (e) occupied.add(`${Math.floor(e.x / cs)},${Math.floor(e.z / cs)}`); });
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const x = t.x + dx * cs, z = t.z + dz * cs;
      if (world.isFree(x, z, 0.35) && !occupied.has(`${Math.floor(x / cs)},${Math.floor(z / cs)}`)) { target = { x, z }; break; }
    }
    assert.ok(target);
    g.send({ type: 'iso-click', x: target.x, z: target.z });
    assert.equal(g.state().ap, 2);
    assert.equal(Math.floor(t.x / cs), Math.floor(target.x / cs)); assert.equal(Math.floor(t.z / cs), Math.floor(target.z / cs));
    const enemy = g.enemies()[0]!;
    const enemyT = g.session().entities.get(enemy.id, Transform)!;
    const enemyCell = { x: t.x + cs, z: t.z };
    enemyT.x = enemyT.prevX = enemyCell.x; enemyT.z = enemyT.prevZ = enemyCell.z;
    const enemyHp = g.session().entities.get(enemy.id, Health)!.hp;
    g.send({ type: 'iso-click', x: enemyT.x, z: enemyT.z });
    g.ticks(1);
    assert.ok(g.session().entities.get(enemy.id, Health)!.hp < enemyHp);
    assert.equal(g.state().ap, 1);
  } finally { g.host.stop(); }
});

test('Cinder exposes a fogged automap, AP reachability and a tactical grid view', async () => {
  const g = await setup();
  try {
    let s = g.state();
    const map = s.map;
    assert.ok(map, 'automap should exist after class selection');
    assert.equal(map.walkable.length, map.width * map.height);
    assert.equal(map.explored.length, map.width * map.height);
    assert.equal(map.reachable.length, map.width * map.height);
    assert.ok(map.explored.includes('1'));
    assert.ok(map.reachable.includes('1'));
    assert.equal(s.gridOpen, false);
    g.send({ type: 'toggle-grid' });
    s = g.state(); assert.equal(s.gridOpen, true); assert.equal(s.overlay, 'grid');
    g.send({ type: 'toggle-grid' });
    s = g.state(); assert.equal(s.gridOpen, false); assert.equal(s.overlay, 'none');
    const before = map.explored.split('1').length - 1;
    const transform = g.session().entities.get(g.player(), Transform)!;
    const world = g.session().services.get(World), cs = world.desc.cellSize;
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      if (world.isFree(transform.x + dx * cs, transform.z + dz * cs, 0.35)) { transform.yaw = Math.atan2(-dx, -dz); break; }
    }
    g.input.press('core/move-forward'); g.ticks(1); g.input.release('core/move-forward');
    const after = g.state().map!.explored.split('1').length - 1;
    assert.ok(after >= before, JSON.stringify({ before, after }));
  } finally { g.host.stop(); }
});

test('Cinder pack filters, drops items and opens a role-aware NPC forge', async () => {
  const g = await setup();
  try {
    let s = g.state();
    const draughts = s.inventory.filter(item => item.id === 'cinder/draught').reduce((n, item) => n + item.count, 0);
    assert.ok(draughts >= 1);
    g.send({ type: 'toggle-inventory' });
    s = g.state(); assert.equal(s.overlay, 'inventory'); assert.equal(s.inventoryFilter, 'all');
    g.send({ type: 'inventory-filter' });
    s = g.state(); assert.equal(s.inventoryFilter, 'gear');
    assert.ok(s.inventory.every(item => item.slot !== undefined || item.source === 'equipment'));
    g.send({ type: 'inventory-filter' });
    s = g.state(); assert.equal(s.inventoryFilter, 'items');
    assert.ok(s.inventory.every(item => item.source === 'bag' && item.slot === undefined));
    g.send({ type: 'inventory-filter' });
    const beforeDrop = g.state().inventory.filter(item => item.id === 'cinder/draught').reduce((n, item) => n + item.count, 0);
    g.send({ type: 'inventory-drop' });
    const afterDrop = g.state().inventory.filter(item => item.id === 'cinder/draught').reduce((n, item) => n + item.count, 0);
    assert.equal(afterDrop, beforeDrop - 1);
    g.send({ type: 'toggle-inventory' });
    let npcId = 0;
    g.session().entities.each(Visual, (id, visual) => { if (visual.key === 'npc-smith') npcId = id; });
    assert.ok(npcId, 'the depth should spawn an Assetrizz smith NPC');
    const npc = g.session().entities.get(npcId, Transform)!, player = g.session().entities.get(g.player(), Transform)!;
    player.x = player.prevX = npc.x + 1.1; player.z = player.prevZ = npc.z; player.yaw = yawOf(npc.x - player.x, npc.z - player.z);
    g.input.press('core/use'); g.ticks(2); g.input.release('core/use');
    s = g.state(); assert.ok(s.dialogue, JSON.stringify(s)); assert.equal(s.overlay, 'dialogue'); assert.match(s.dialogue.name, /Orla/);
    assert.ok(s.dialogue.options.some(option => option.id === 'craft'));
    g.input.press('cinder/dialogue-1'); g.ticks(2); g.input.release('cinder/dialogue-1');
    s = g.state(); assert.equal(s.overlay, 'crafting'); assert.equal(s.craftingOpen, true);
    assert.equal(s.recipes.length, 9);
    assert.ok(s.recipes.every(recipe => recipe.inputs.length > 0 && recipe.output.count > 0));
    g.send({ type: 'toggle-crafting' }); assert.equal(g.state().overlay, 'none');
  } finally { g.host.stop(); }
});

test('Cinder inventory consumes actions, equips loot and preserves persistent class mastery', async () => {
  const data = new Map<string, string>();
  const store = createProfileStore({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); } });
  store.save({ values: { 'cinder/vault.v1.mastery.warden': 20, 'cinder/vault.v1.embers': 0 } });
  const g = await setup(7, { profile: store });
  try {
    let s = g.state();
    assert.equal(s.classId, 'warden'); assert.equal(s.masteryRank, 1); assert.equal(s.health, 135);
    g.session().services.get(Combat).damage({ target: g.player(), source: 0, amount: 50, kind: 'test', x: 0, z: 0 }); g.ticks(1);
    s = g.state();
    const draughtIndex = s.inventory.findIndex(i => i.id === 'cinder/draught');
    assert.ok(draughtIndex >= 0);
    g.send({ type: 'toggle-inventory' });
    s = g.state(); assert.equal(s.inventoryOpen, true);
    for (let i = 0; i < draughtIndex; i++) g.send({ type: 'inventory-move', delta: 1 });
    g.send({ type: 'inventory-confirm' });
    s = g.state();
    assert.equal(s.inventory.filter(i => i.id === 'cinder/draught').reduce((n, i) => n + i.count, 0), 1);
    assert.equal(s.health, 125); assert.equal(s.ap, 2);
    g.send({ type: 'toggle-inventory' });
    // A warden guarantees gear, which can be equipped from the same pack.
    const boss = g.boss(); assert.ok(boss); g.kill(boss.id);
    s = g.state();
    const gearIndex = s.inventory.findIndex(i => i.source === 'bag' && i.slot !== undefined);
    assert.ok(gearIndex >= 0, JSON.stringify(s.inventory));
    g.send({ type: 'toggle-inventory' });
    s = g.state();
    for (let i = s.inventoryCursor; i < gearIndex; i++) g.send({ type: 'inventory-move', delta: 1 });
    g.send({ type: 'inventory-confirm' });
    s = g.state();
    assert.ok(s.inventory.some(i => i.source === 'equipment' && i.slot !== undefined));
    // Ending the run banks class mastery.
    g.session().services.get(Combat).damage({ target: g.player(), source: 0, amount: 100000, kind: 'test', x: 0, z: 0 }); g.ticks(1);
    const saved = store.load(); assert.ok(saved.ok);
    assert.ok((saved.value?.values['cinder/vault.v1.mastery.warden'] as number) > 20);
  } finally { g.host.stop(); }
});

test('Cinder levels up during a live floor, makes combat continue and consumes queued boons without a draft phase', async () => {
  const g = await setup();
  try {
    const resourceReasons: string[] = [], progressionEvents: string[] = [];
    g.session().events.on(MechanicResourcesChanged, e => resourceReasons.push(e.reason), 'test', g.session().scope);
    g.session().events.on(MechanicProgressionChanged, e => progressionEvents.push(e.reason), 'test', g.session().scope);
    let s = g.killRegular(3);
    assert.equal(s.phase, 'player');
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
    assert.equal(s.phase, 'player');
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
      assert.equal(s.phase, 'player');
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
    assert.equal(g.state().phase, 'player');
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
    assert.equal(g.state().health, 135); assert.equal(g.state().rank, 1);
    g.killRegular(1);
    g.run().enqueue({ type: 'pulse' }); g.control.playing = false; g.ticks(1);
    assert.equal(g.run().enqueue({ type: 'pulse' }), false);
    g.control.playing = true; g.ticks(1);
    g.session().services.get(Combat).damage({ target: g.player(), source: 0, amount: 100000, kind: 'test', x: 0, z: 0 }); g.ticks(1);
    assert.equal(g.state().phase, 'defeat');
    const saved = store.load(); assert.ok(saved.ok); assert.equal(saved.value?.values['unrelated'], true); assert.equal(saved.value?.values['cinder/vault.v1.runs'], 1);
    const old = g.run(); await g.host.restart(); assert.equal(old.enqueue({ type: 'pulse' }), false);
    assert.equal(g.state().phase, 'class-select');
    assert.equal(g.run().enqueue({ type: 'choose-class', classId: 'warden' }), true); g.ticks(1);
    const fresh = g.state();
    assert.equal(fresh.run, 2); assert.equal(fresh.depth, 1); assert.equal(fresh.level, 1); assert.equal(fresh.boons.length, 0);
    assert.deepEqual(fresh.arsenal.map(w => w.id), ['cinder/thornwake', 'cinder/cinderkey']);
    assert.equal(fresh.health, 135);
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
    assert.ok(g.state().cooldown > 2.9);
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
