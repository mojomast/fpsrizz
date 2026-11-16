import {
  AmmoTypes, Cinder, Combat, DamageModifiers, Died, Enemies, Enemy, ExperienceRole, Flow, Health, Input, InputActions,
  Inventory, Maps, MechanicKits, ModeRole, Pickups, Prefabs, Profile, ProgressionMechanicRole, ProgressionProviders,
  SessionControl, Transform, Weapons, World, createCommandQueue, createMechanicKit, defineComponent, definePlugin,
  isObject, progressionMechanic, spawnPrefab,
} from '../../sdk/index.ts';
import type {
  CinderCommand, CinderOffer, CinderRelicId, CinderState, CinderWeaponOffer, EntityId, SessionContext,
} from '../../sdk/index.ts';
import { cinderArsenal, weaponView } from './arsenal.ts';
import { relics } from './relics.ts';

const Buffs = defineComponent<{ power: number; shell: number }>('cinder/buffs');
const PROFILE = 'cinder/vault.v1';
const DEPTHS = Object.freeze(['The Ash Gate', 'The Hollow Court', 'The Cinder Sanctum']);
const PICKUPS: Readonly<Record<string, string>> = Object.freeze({
  'cinder/mothspindle': 'cinder/cache-mothspindle',
  'cinder/briarward': 'cinder/cache-briarward',
  'cinder/faroracle': 'cinder/cache-faroracle',
  'cinder/ashbell': 'cinder/cache-ashbell',
});

function run(ctx: SessionContext): void {
  const flow = ctx.services.get(Flow), world = ctx.services.get(World), combat = ctx.services.get(Combat);
  const kit = createMechanicKit(ctx, 'cinder/kit', 'cinder/run');
  const progression = progressionMechanic(ctx).create(ctx, 'cinder/levels', {
    startLevel: 1, baseXp: 30, growth: 20, maxLevel: 30,
  });
  const profile = ctx.services.tryGet(Profile);
  const saved = profile?.load();
  const integer = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : 0;
  let legacy = integer(saved?.ok ? saved.value?.values[`${PROFILE}.embers`] : undefined, 1000000);
  let runs = integer(saved?.ok ? saved.value?.values[`${PROFILE}.runs`] : undefined, 1000000);
  const rank = Math.min(5, Math.floor(legacy / 8));
  let profileStatus = saved?.ok ? 'Legacy saved locally' : 'Session only — storage unavailable';
  const save = () => {
    const current = profile?.load();
    if (!current?.ok) { profileStatus = 'Session only — storage unavailable'; return; }
    const result = profile!.save({ values: { ...current.value?.values, [`${PROFILE}.embers`]: legacy, [`${PROFILE}.runs`]: runs } });
    profileStatus = result.ok ? 'Legacy saved locally' : 'Session only — save failed';
  };
  const attempt = Math.min(1000000, runs + 1);
  const encounterRng = ctx.rng.fork(`encounters/${attempt}`), rewardRng = ctx.rng.fork(`boons/${attempt}`);
  const player = spawnPrefab(ctx, 'core/player', world.desc.playerStart);
  const hp = ctx.world.get(player, Health)!;
  hp.max += rank * 5; hp.hp = hp.max;
  const buffs = ctx.world.add(player, Buffs, { power: 0, shell: 0 });
  const inventory = ctx.world.get(player, Inventory)!;
  inventory.current = 'cinder/cinderkey'; inventory.switchedAt = -10;
  const owned = new Set(inventory.weapons);
  const syncOwned = () => { for (const id of inventory.weapons) owned.add(id); };
  const levels: Record<CinderRelicId, number> = { power: 0, vitality: 0, shell: 0, siphon: 0, pulse: 0, bounty: 0 };
  let phase: CinderState['phase'] = 'playing';
  let kills = 0, offer = 0, revision = 0, depth = 1, portal = false;
  let boss: EntityId | undefined;
  let live = new Set<EntityId>(), pickups = new Set<EntityId>();
  let offers: readonly CinderOffer[] = Object.freeze([]);
  let message = 'Three depths. One keeper. Choose a boon whenever the vault marks you.';
  const input = ctx.services.get(Input);
  const queue = createCommandQueue<CinderCommand>(ctx, { capacity: 16, normalize(value) {
    if (!isObject(value)) return undefined;
    if (value['type'] === 'choose') {
      const index = value['index'], epoch = value['offer'];
      return Number.isInteger(index) && typeof index === 'number' && index >= 0 && index < 3 && Number.isSafeInteger(epoch) && typeof epoch === 'number' && epoch >= 0
        ? { type: 'choose', index, offer: epoch } : undefined;
    }
    return value['type'] === 'pulse' ? { type: 'pulse' } : undefined;
  } });
  const weaponCard = (id: string): CinderWeaponOffer => {
    const def = ctx.registries.get(Weapons, id);
    const meta = cinderArsenal.find(w => w.id === id);
    if (!def || !meta) throw new Error(`Cinder armory is missing weapon "${id}"`);
    const damage = typeof def.attack.params['damage'] === 'number' ? def.attack.params['damage'] : 0;
    const mode = def.attack.behavior === 'core/melee' ? 'MELEE' : def.attack.behavior === 'core/projectile' ? 'EXPLOSIVE' : def.auto ? 'AUTO' : 'SEMI';
    const rounds = def.magazineSize === undefined ? 'UNLIMITED' : `${def.magazineSize} ROUNDS`;
    return Object.freeze({ kind: 'weapon' as const, ...weaponView(id, def.slot, def.name, meta.description, `${mode} · ${rounds} · ${damage} DAMAGE`) });
  };
  const markers = (depthIndex: number, role: string) => world.desc.spawns.filter(s =>
    s.tags.includes(`dungeon-depth-${depthIndex}`) && s.tags.includes(`dungeon-role-${role}`));
  const exitTrigger = (depthIndex = depth) => world.desc.triggers.find(t => t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depthIndex}`));
  const startMarker = (depthIndex = depth) => markers(depthIndex, 'start')[0];
  const wardenMarker = (depthIndex = depth) => markers(depthIndex, 'warden')[0];
  const pointAround = (at: { x: number; z: number }, radius: number, rng: typeof encounterRng): { x: number; z: number } => {
    for (let i = 0; i < 8; i++) {
      const angle = rng.range(0, Math.PI * 2), distance = rng.range(0, radius);
      const x = at.x + Math.cos(angle) * distance, z = at.z + Math.sin(angle) * distance;
      if (world.isFree(x, z, 0.45)) return { x, z };
    }
    return { x: at.x, z: at.z };
  };
  const clearFloor = () => {
    for (const id of live) ctx.world.destroy(id);
    for (const id of pickups) ctx.world.destroy(id);
    ctx.world.each(Enemy, id => ctx.world.destroy(id));
    live = new Set(); pickups = new Set(); boss = undefined; portal = false;
  };
  const spawnEnemy = (id: string, at: { x: number; z: number }, yaw: number): EntityId => {
    const e = spawnPrefab(ctx, id, { x: at.x, z: at.z, yaw });
    live.add(e);
    return e;
  };
  const spawnPickup = (id: string, at: { x: number; z: number }): EntityId => {
    const e = spawnPrefab(ctx, id, { x: at.x, z: at.z, yaw: 0 });
    pickups.add(e);
    return e;
  };
  const draw = () => {
    syncOwned();
    if (progression.pending <= 0) { offers = Object.freeze([]); return; }
    const chosen: CinderOffer[] = [];
    const weapons = cinderArsenal.filter(w => !owned.has(w.id));
    if (weapons.length > 0) chosen.push(weaponCard(weapons.splice(rewardRng.int(0, weapons.length), 1)[0]!.id));
    const pool = relics.filter(r => levels[r.id] < 3);
    while (chosen.length < 3 && pool.length) chosen.push(Object.freeze({ kind: 'relic' as const, ...pool.splice(rewardRng.int(0, pool.length), 1)[0]! }));
    while (chosen.length < 3 && weapons.length > 0) chosen.push(weaponCard(weapons.splice(rewardRng.int(0, weapons.length), 1)[0]!.id));
    for (let i = chosen.length - 1; i > 0; i--) {
      const j = rewardRng.int(0, i + 1);
      const swap = chosen[i]!; chosen[i] = chosen[j]!; chosen[j] = swap;
    }
    offers = Object.freeze(chosen); offer++; revision++;
  };
  const grantWeapon = (id: string): boolean => {
    const def = ctx.registries.get(Weapons, id);
    if (!def || owned.has(id)) return false;
    if (def.ammoType) {
      const ammo = ctx.registries.get(AmmoTypes, def.ammoType);
      if (ammo) combat.giveAmmo(player, def.ammoType, Math.max(4, Math.ceil((def.magazineSize ?? 2) * 2)));
    }
    if (!combat.giveWeapon(player, id)) return false;
    owned.add(id);
    return true;
  };
  const leaveFloor = () => {
    clearFloor();
    depth++;
    const start = startMarker(depth);
    if (start) {
      const t = ctx.world.get(player, Transform)!;
      t.x = t.prevX = start.x; t.z = t.prevZ = start.z; t.yaw = t.prevYaw = start.yaw;
    }
    kit.objectives.record('depths', 1, `depth-${depth}`);
    combat.giveAmmo(player, 'cinder/rounds', 48); combat.giveAmmo(player, 'cinder/sparks', 5);
    combat.heal(player, 20);
    populate();
    message = `The ${DEPTHS[depth - 1] ?? 'vault'} spreads before you. Find the warden.`;
    revision++;
  };
  const populate = () => {
    syncOwned();
    const rooms = markers(depth, 'loot').concat(markers(depth, 'exit'), markers(depth, 'warden'));
    const start = startMarker(depth);
    const wardenRoom = wardenMarker(depth);
    for (const room of rooms) {
      if (room.id === start?.id) continue;
      const count = depth === 1 ? encounterRng.int(1, 3) : encounterRng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const at = pointAround(room, 1.25, encounterRng);
        const imp = encounterRng.next() < 0.28 + depth * 0.08;
        spawnEnemy(imp ? 'cinder/imp' : 'cinder/thrall', at, encounterRng.range(0, Math.PI * 2));
      }
    }
    if (wardenRoom) {
      const bossId = depth === DEPTHS.length ? 'cinder/keeper' : 'cinder/warden';
      boss = spawnEnemy(bossId, { x: wardenRoom.x, z: wardenRoom.z }, 0);
      if (depth === DEPTHS.length) {
        for (let i = 0; i < 2; i++) spawnEnemy('cinder/imp', pointAround(wardenRoom, 1.8, encounterRng), encounterRng.range(0, Math.PI * 2));
      }
    }
    const lootRooms = markers(depth, 'loot');
    const used = new Set<string>();
    const chooseRoom = (): typeof lootRooms[number] | undefined => {
      for (const room of lootRooms) if (!used.has(room.id)) { used.add(room.id); return room; }
      return undefined;
    };
    const healthRoom = chooseRoom(); if (healthRoom) spawnPickup('cinder/medkit', pointAround(healthRoom, 0.8, encounterRng));
    const ammoRoom = chooseRoom(); if (ammoRoom) spawnPickup('cinder/rounds-cache', pointAround(ammoRoom, 0.8, encounterRng));
    const weaponRoom = chooseRoom();
    if (weaponRoom) {
      const available = cinderArsenal.filter(w => !owned.has(w.id) && PICKUPS[w.id]);
      if (available.length) {
        const weapon = available[encounterRng.int(0, available.length)]!;
        spawnPickup(PICKUPS[weapon.id]!, pointAround(weaponRoom, 0.8, encounterRng));
      } else {
        spawnPickup('cinder/sparks-cache', pointAround(weaponRoom, 0.8, encounterRng));
      }
    }
  };
  const finish = (victory: boolean) => {
    if (phase !== 'playing') return;
    phase = victory ? 'victory' : 'defeat';
    offers = Object.freeze([]); queue.clear();
    const earned = Math.floor(kit.resources.get('embers') / 20) + (victory ? 10 : 0);
    legacy = Math.min(1000000, legacy + earned); save();
    message = victory ? 'The keeper falls. The vault remembers.' : 'The flame goes out. The embers remain.';
    const elapsed = Math.max(0, ctx.time.now);
    flow.end({ outcome: victory ? 'victory' : 'defeat', title: victory ? 'THE DEPTHS ARE YOURS' : 'ANOTHER FLAME, EXTINGUISHED',
      detail: `${message} +${earned} legacy embers. Depth ${depth} / ${DEPTHS.length}.`,
      stats: [['Depth', `${depth} / ${DEPTHS.length}`], ['Level', String(progression.level)], ['Slain', String(kills)],
        ['Embers', String(kit.resources.get('embers'))], ['Legacy embers', String(legacy)], ['Time', `${Math.floor(elapsed)}s`],
        ['Run', String(attempt)], ['Profile', profileStatus]] });
  };
  const choose = (command: Extract<CinderCommand, { type: 'choose' }>) => {
    if (phase !== 'playing' || command.offer !== offer || !offers[command.index]) return;
    const choice = offers[command.index]!;
    let claimed = false;
    if (choice.kind === 'weapon') {
      if (grantWeapon(choice.id)) {
        claimed = true;
        message = `${choice.name} joins your arsenal. Press ${ctx.registries.get(Weapons, choice.id)?.slot ?? 7} in combat.`;
      }
    } else {
      levels[choice.id]++;
      buffs.power = levels.power; buffs.shell = levels.shell;
      if (choice.id === 'vitality') { hp.max += 25; combat.heal(player, 35); }
      claimed = true; message = `${choice.name} bound to this run.`;
    }
    if (!claimed) return;
    if (!progression.consumeLevel().ok) return;
    offers = Object.freeze([]);
    if (progression.pending > 0) draw();
    revision++;
  };
  const attackPulse = () => {
    if (phase !== 'playing') return;
    const t = ctx.world.get(player, Transform)!;
    const targets = [...live].filter(e => {
      const p = ctx.world.get(e, Transform);
      return p ? Math.hypot(p.x - t.x, p.z - t.z) <= 9 + 2 * levels.pulse && world.lineOfSight(t.x, t.z, p.x, p.z) : false;
    });
    if (!targets.length) { message = 'No enemies within pulse range.'; return; }
    if (!kit.actions.execute('pulse').ok) { message = 'Ember pulse is recharging.'; return; }
    for (const target of targets) combat.damage({ target, source: player, amount: 35 + 20 * levels.pulse, kind: 'cinder-pulse', x: t.x, z: t.z });
    flow.notify('EMBER PULSE'); message = 'Ember pulse released.';
  };

  runs = attempt; save();
  kit.objectives.record('depths', 1, 'depth-1');
  populate();
  ctx.services.provide(Cinder, { enqueue: command => phase === 'playing' && queue.enqueue(command), state() {
    syncOwned();
    const bossHp = boss === undefined ? undefined : ctx.world.get(boss, Health);
    const bossDef = boss === undefined ? undefined : ctx.world.get(boss, Enemy);
    const bossName = bossDef ? ctx.registries.get(Enemies, bossDef.def)?.name ?? 'Warden' : '';
    const bossTransform = boss === undefined ? undefined : ctx.world.get(boss, Transform);
    const end = exitTrigger();
    const target = bossHp && !bossHp.dead && bossTransform
      ? Object.freeze({ kind: (depth === DEPTHS.length ? 'keeper' : 'warden') as 'keeper' | 'warden', name: bossName, x: bossTransform.x, z: bossTransform.z })
      : portal && end
        ? Object.freeze({ kind: 'exit' as const, name: 'The descent', x: end.x, z: end.z })
        : null;
    const arsenal = [...owned].map(weaponCard).sort((a, b) => a.slot - b.slot);
    return Object.freeze({ phase, depth, depths: DEPTHS.length, depthTitle: DEPTHS[depth - 1]!, level: progression.level,
      xp: progression.xp, xpToNext: progression.xpToNext, health: hp.hp, maxHealth: hp.max, embers: kit.resources.get('embers'),
      cooldown: kit.actions.remaining('pulse'), kills, remaining: live.size, offer, offers, arsenal: Object.freeze(arsenal),
      boons: Object.freeze(relics.filter(r => levels[r.id] > 0).map(r => Object.freeze({ ...r, stacks: levels[r.id] }))),
      target, boss: bossHp && !bossHp.dead ? Object.freeze({ name: bossName, health: bossHp.hp, max: bossHp.max,
        role: (depth === DEPTHS.length ? 'keeper' : 'warden') as 'keeper' | 'warden' }) : null,
      portal, legacy, rank, run: attempt, seed: `${ctx.preset.seed}:${attempt}`, profile: profileStatus, message, revision });
  } });
  ctx.events.on(Died, event => {
    if (phase !== 'playing') return;
    if (event.entity === player) { finish(false); return; }
    if (!live.delete(event.entity)) return;
    const enemy = ctx.world.get(event.entity, Enemy);
    const def = enemy ? ctx.registries.get(Enemies, enemy.def) : undefined;
    const score = def?.score ?? 50;
    kills++;
    kit.resources.transact({ gain: { embers: 3 + levels.bounty * 2 } }, 'slain');
    const gain = progression.grant(Math.max(4, Math.round(score / 10)));
    if (gain.ok && gain.levels > 0) {
      hp.max += gain.levels * 5; combat.heal(player, gain.levels * 6);
      if (offers.length === 0) draw();
      message = `LEVEL ${progression.level} — choose a boon with 7, 8 or 9.`;
    }
    if (event.entity === boss) {
      portal = true;
      message = depth === DEPTHS.length ? 'The keeper falls. Step onto the descent to leave the vault.' : 'The warden falls. The descent is open.';
      if (depth === DEPTHS.length) finish(true);
    }
    revision++;
  });
  ctx.systems.add({ id: 'cinder/game.run', phase: 'rules', update(dt) {
    if (flow.ended) return;
    if (ctx.services.tryGet(SessionControl)?.playing === false) { queue.clear(); return; }
    syncOwned();
    kit.clock.advance(dt);
    if (hp.dead) { finish(false); return; }
    if (input.tick.pressed('cinder/boon-1')) queue.enqueue({ type: 'choose', index: 0, offer });
    if (input.tick.pressed('cinder/boon-2')) queue.enqueue({ type: 'choose', index: 1, offer });
    if (input.tick.pressed('cinder/boon-3')) queue.enqueue({ type: 'choose', index: 2, offer });
    if (input.tick.pressed('cinder/pulse')) queue.enqueue({ type: 'pulse' });
    const command = queue.drainOne();
    if (command?.type === 'choose') choose(command);
    else if (command?.type === 'pulse') attackPulse();
    if (phase === 'playing' && portal && depth < DEPTHS.length) {
      const exit = exitTrigger();
      const t = ctx.world.get(player, Transform);
      if (exit && t && Math.hypot(t.x - exit.x, t.z - exit.z) <= exit.radius) leaveFloor();
    }
    const warden = wardenMarker();
    const targetName = warden ? (depth === DEPTHS.length ? 'the Cinder Keeper' : 'the Ash Warden') : 'the warden';
    flow.setObjective(phase !== 'playing' ? message : portal ? 'The descent is open — step onto the glowing pad.' : `Find and defeat ${targetName}.`);
    flow.setStatus('depth', 'Depth', `${depth} / ${DEPTHS.length}`);
    flow.setStatus('level', 'Level', String(progression.level));
    flow.setStatus('xp', 'Experience', `${progression.xp} / ${progression.xpToNext}`);
    flow.setStatus('remaining', 'Souls', String(live.size));
    flow.setStatus('embers', 'Embers', String(kit.resources.get('embers')));
  } });
}

export default definePlugin({ register(ctx) {
  ctx.provideRole(ExperienceRole, 'cinder/experience', {
    name: 'Cinder Vault', description: 'A three-depth dungeon roguelite with in-level XP and non-blocking boon choices.', pointer: 'locked',
    controls: [
      ['WASD / mouse', 'Move / aim'], ['Left click / Space', 'Fire'], ['1–6', 'Select bound weapon'],
      ['Q / wheel', 'Cycle weapons'], ['R', 'Reload'], ['Shift / Ctrl', 'Sprint / dash'], ['V', 'Ember pulse'],
      ['7 / 8 / 9', 'Choose a level-up boon'],
    ],
  });
  ctx.register(DamageModifiers, 'cinder/relics', { description: 'Cinder weapon power and iron protection.', order: -20,
    start: owner => (req, amount) => {
      const source = owner.world.get(req.source, Buffs), target = owner.world.get(req.target, Buffs);
      if (target && req.source !== 0 && !owner.world.isAlive(req.source)) return 0;
      return amount * (source ? 1 + source.power * .25 : 1) * (target ? 1 - target.shell * .12 : 1);
    } });
  for (const [id, key, label] of [['pulse', 'KeyV', 'Ember pulse'], ['boon-1', 'Digit7', 'Choose boon 1'], ['boon-2', 'Digit8', 'Choose boon 2'], ['boon-3', 'Digit9', 'Choose boon 3']] as const)
    ctx.register(InputActions, `cinder/${id}`, { label, keys: [key] });
  ctx.provideRole(ModeRole, 'cinder/vault', { name: 'Cinder Vault', description: 'A three-depth dungeon roguelite. Explore, level up and unmake the keeper.', activate: run });
  ctx.addValidator(v => {
    if (v.selectedRole(ModeRole) !== 'cinder/vault') return;
    const map = v.registries.get(Maps, String(v.preset.options['map']));
    const mapReporter = v.reporter('preset', 'options.map');
    if (!map) { mapReporter.error('select the cinder/vault dungeon map.'); return; }
    for (let depth = 1; depth <= DEPTHS.length; depth++) {
      const tagged = map.world.spawns.filter(s => s.tags.includes(`dungeon-depth-${depth}`));
      for (const role of ['start', 'warden', 'exit']) {
        if (!tagged.some(s => s.tags.includes(`dungeon-role-${role}`))) mapReporter.error(`depth ${depth} needs a dungeon-role-${role} marker.`);
      }
      if (tagged.filter(s => s.tags.includes('dungeon-role-loot')).length < 2) mapReporter.error(`depth ${depth} needs at least two loot rooms.`);
      if (!map.world.triggers.some(t => t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depth}`))) mapReporter.error(`depth ${depth} needs a dungeon-exit zone.`);
    }
    for (const id of ['cinder/thrall', 'cinder/imp', 'cinder/warden', 'cinder/keeper']) if (!v.registries.has(Enemies, id)) mapReporter.error(`missing enemy ${id}.`);
    for (const id of ['cinder/medkit', 'cinder/rounds-cache', 'cinder/sparks-cache']) if (!v.registries.has(Pickups, id)) mapReporter.error(`missing pickup ${id}.`);
    for (const weapon of cinderArsenal) if (!v.registries.has(Weapons, weapon.id)) mapReporter.error(`missing weapon ${weapon.id}.`);
    if (!v.registries.has(MechanicKits, 'cinder/kit')) mapReporter.error('missing cinder/kit.');
    const progression = v.selectedRole(ProgressionMechanicRole);
    if (!progression || !v.registries.has(ProgressionProviders, progression)) mapReporter.error('select a progression role with a matching factory.');
    if (!v.registries.has(Prefabs, 'core/player')) mapReporter.error('enable core/player.');
  });
} });
