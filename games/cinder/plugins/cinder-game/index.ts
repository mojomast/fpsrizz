import { AiBehaviors, AmmoTypes, AttackFired, Collider, Combat, ControllerRole, CraftingMechanicRole, CraftingProviders, CraftingRecipes, DamageModifiers, Died, Enemies, Enemy, ExperienceRole, Flow, Health, Impact, Input, InputActions, Interactions, Intent, Inventory, InventoryMechanicRole, InventoryProviders, Items, Maps, MechanicKits, ModeRole, Pickups, Player, PlayerAvatar, Prefabs, Profile, ProgressionMechanicRole, ProgressionProviders, SessionControl, Settings, Transform, TurnControl, ViewModes, Visual, Weapons, WeaponRuntime, World, craftingMechanic, createCommandQueue, createMechanicKit, defineComponent, definePlugin, inventoryMechanic, isObject, makeTransform, progressionMechanic, spawnPrefab, yawDirX, yawDirZ, yawOf } from '../../../../src/sdk/index.ts';
import { Cinder } from '../../contracts/cinder.ts';
import type { EnemyDef, EntityId, InventoryHandle, SessionContext } from '../../../../src/sdk/index.ts';
import type { CinderCommand, CinderDialogueOption, CinderDialogueView, CinderHover, CinderInventoryFilter, CinderItemView, CinderMapMarker, CinderMapView, CinderOffer, CinderRecipeView, CinderRelicId, CinderState, CinderThreatId, CinderThreatView, CinderWeaponOffer } from '../../contracts/cinder.ts';
import { cinderArsenal, weaponView } from './arsenal.ts';
import { CinderClasses, classById, masteryBonuses, masteryNext, masteryRank } from './classes.ts';
import type { CinderClassDefinition, CinderClassId } from './classes.ts';
import { relics } from './relics.ts';
import { CinderThreats, threatById, threatRank } from './threats.ts';

const Buffs = defineComponent<{
  power: number; shell: number;
  classDamage: number; gearDamage: number;
  classArmor: number; gearArmor: number;
  classPulse: number;
  lifesteal: number; emberBonus: number; execute: number;
}>('cinder/buffs');
type EliteAffix = 'warded' | 'swift' | 'volatile' | 'siphon';
interface EliteState { affix: EliteAffix; color: string; armor: number; actions: number; volatile: number; siphon: number; label: string }
const Elite = defineComponent<EliteState>('cinder/elite');
const ELITES: Readonly<Record<EliteAffix, Readonly<EliteState>>> = Object.freeze({
  warded: Object.freeze({ affix: 'warded', color: '#9ccbe8', armor: 0.25, actions: 1, volatile: 0, siphon: 0, label: 'Warded' }),
  swift: Object.freeze({ affix: 'swift', color: '#9fe0a2', armor: 0, actions: 2, volatile: 0, siphon: 0, label: 'Swift' }),
  volatile: Object.freeze({ affix: 'volatile', color: '#ff8264', armor: 0, actions: 1, volatile: 22, siphon: 0, label: 'Emberbound' }),
  siphon: Object.freeze({ affix: 'siphon', color: '#d5a3ee', armor: 0, actions: 1, volatile: 0, siphon: 8, label: 'Siphoned' }),
});
const PROFILE = 'cinder/vault.v1';
const DEPTHS = Object.freeze(['The Ash Gate', 'The Hollow Court', 'The Cinder Sanctum']);
const PICKUPS: Readonly<Record<string, string>> = Object.freeze({
  'cinder/mothspindle': 'cinder/cache-mothspindle',
  'cinder/briarward': 'cinder/cache-briarward',
  'cinder/faroracle': 'cinder/cache-faroracle',
  'cinder/ashbell': 'cinder/cache-ashbell',
});
const GEAR: Readonly<Record<string, { damage?: number; armor?: number; lifesteal?: number; embers?: number }>> = Object.freeze({
  'cinder/ashplate': { armor: 0.08 },
  'cinder/warden-plate': { armor: 0.12 },
  'cinder/oracle-lens': { damage: 0.15 },
  'cinder/hunters-charm': { damage: 0.08, lifesteal: 1 },
  'cinder/gilded-chain': { embers: 2 },
  'cinder/iron-band': { armor: 0.05 },
  'cinder/obsidian-edge': { damage: 0.12 },
});
const CONSUMABLES = Object.freeze(new Set(['cinder/draught', 'cinder/ember-flask', 'cinder/ember-tonic', 'cinder/shard-bomb']));
const LOOT_TABLE: readonly { id: string; weight: number }[] = Object.freeze([
  { id: 'cinder/draught', weight: 30 },
  { id: 'cinder/ember-flask', weight: 18 },
  { id: 'cinder/ashplate', weight: 14 },
  { id: 'cinder/hunters-charm', weight: 12 },
  { id: 'cinder/oracle-lens', weight: 10 },
  { id: 'cinder/gilded-chain', weight: 8 },
  { id: 'cinder/warden-plate', weight: 4 },
  { id: 'cinder/ember-tonic', weight: 10 },
  { id: 'cinder/shard-bomb', weight: 12 },
  { id: 'cinder/iron-band', weight: 10 },
  { id: 'cinder/obsidian-edge', weight: 8 },
]);
const MASTERY_KEYS: Readonly<Record<CinderClassId, string>> = Object.freeze({
  warden: `${PROFILE}.mastery.warden`,
  emberwright: `${PROFILE}.mastery.emberwright`,
  vaultrunner: `${PROFILE}.mastery.vaultrunner`,
});
const RECIPE_EMBERS: Readonly<Record<string, number>> = Object.freeze({
  'cinder/brew-draught': 2,
  'cinder/brew-flask': 4,
  'cinder/forge-ashplate': 8,
  'cinder/forge-warden-plate': 16,
  'cinder/cut-oracle-lens': 12,
  'cinder/gild-chain': 10,
  'cinder/brew-tonic': 6,
  'cinder/forge-iron-band': 4,
  'cinder/cut-obsidian-edge': 14,
});
type NpcRole = 'smith' | 'cartographer' | 'oracle';
interface NpcState {
  role: NpcRole;
  name: string;
  title: string;
  portrait: string;
  healed: boolean;
  revealed: boolean;
  bloodPact: boolean;
  traded: boolean;
  line: string;
}
const Npc = defineComponent<NpcState>('cinder/npc.state');
const NPC_DEFS: Readonly<Record<NpcRole, Readonly<{ name: string; title: string; portrait: string; visual: string; line: string }>>> = Object.freeze({
  smith: Object.freeze({ name: 'Orla, Ember Smith', title: 'FORGEKEEPER OF THE ASH GATE', portrait: 'assetrizz/cinder-npc-smith.png', visual: 'npc-smith', line: 'The forge still breathes below the vault. Bring me shards and I will make the dark answer.' }),
  cartographer: Object.freeze({ name: 'Vey, Lantern Cartographer', title: 'WALKER OF THE HOLLOW COURT', portrait: 'assetrizz/cinder-npc-cartographer.png', visual: 'npc-cartographer', line: 'Every wall remembers a road. Pay the lantern, and I will show you the shape of this wing.' }),
  oracle: Object.freeze({ name: 'The Ash Oracle', title: 'KEEPER OF THE UNASKED QUESTION', portrait: 'assetrizz/cinder-npc-cartographer.png', visual: 'npc-cartographer', line: 'Every bargain leaves a mark. Some marks are worth carrying. Ask, and the vault will answer.' }),
});

function run(ctx: SessionContext): void {
  const flow = ctx.services.get(Flow), world = ctx.services.get(World), combat = ctx.services.get(Combat);
  const settings = ctx.services.tryGet(Settings);
  const kit = createMechanicKit(ctx, 'cinder/kit', 'cinder/run');
  const progression = progressionMechanic(ctx).create(ctx, 'cinder/levels', {
    startLevel: 1, baseXp: 30, growth: 20, maxLevel: 30,
  });
  const bag = inventoryMechanic(ctx).create(ctx, 'cinder/bag', { capacity: 12, equipmentSlots: ['armor', 'charm'] });
  const crafting = craftingMechanic(ctx);
  const profile = ctx.services.tryGet(Profile);
  const saved = profile?.load();
  const integer = (value: unknown, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : 0;
  let legacy = integer(saved?.ok ? saved.value?.values[`${PROFILE}.embers`] : undefined, 1000000);
  const savedThreat = saved?.ok ? saved.value?.values[`${PROFILE}.threat`] : undefined;
  let highestThreat: CinderThreatId | null = typeof savedThreat === 'number' && Number.isSafeInteger(savedThreat) && savedThreat >= 0 && savedThreat <= 2
    ? CinderThreats[savedThreat]!.id : null;
  let selectedThreat: CinderThreatId = 'delver';
  let runs = integer(saved?.ok ? saved.value?.values[`${PROFILE}.runs`] : undefined, 1000000);
  const mastery: Record<CinderClassId, number> = {
    warden: integer(saved?.ok ? saved.value?.values[MASTERY_KEYS.warden] : undefined, 1000000000),
    emberwright: integer(saved?.ok ? saved.value?.values[MASTERY_KEYS.emberwright] : undefined, 1000000000),
    vaultrunner: integer(saved?.ok ? saved.value?.values[MASTERY_KEYS.vaultrunner] : undefined, 1000000000),
  };
  const legacyRank = Math.min(5, Math.floor(legacy / 8));
  let profileStatus = saved?.ok ? 'Legacy saved locally' : 'Session only — storage unavailable';
  const save = () => {
    const current = profile?.load();
    if (!current?.ok) { profileStatus = 'Session only — storage unavailable'; return; }
    const values = { ...current.value?.values,
      [`${PROFILE}.embers`]: legacy, [`${PROFILE}.runs`]: runs,
      [MASTERY_KEYS.warden]: mastery.warden, [MASTERY_KEYS.emberwright]: mastery.emberwright, [MASTERY_KEYS.vaultrunner]: mastery.vaultrunner,
    } as Record<string, string | boolean | number>;
    if (highestThreat) values[`${PROFILE}.threat`] = threatRank(highestThreat); else delete values[`${PROFILE}.threat`];
    const result = profile!.save({ values });
    profileStatus = result.ok ? 'Legacy saved locally' : 'Session only — save failed';
  };
  const attempt = Math.min(1000000, runs + 1);
  const currentThreat = (): CinderThreatView => threatById(selectedThreat) ?? CinderThreats[1]!;
  const healPlayer = (amount: number): void => { combat.heal(player, Math.max(1, Math.round(amount * currentThreat().healing))); };
  const encounterRng = ctx.rng.fork(`encounters/${attempt}`), rewardRng = ctx.rng.fork(`boons/${attempt}`);
  const lootRng = ctx.rng.fork(`loot/${attempt}`);
  const player = spawnPrefab(ctx, 'core/player', world.desc.playerStart);
  const hp = ctx.world.get(player, Health)!;
  hp.max += legacyRank * 5; hp.hp = hp.max;
  const buffs = ctx.world.add(player, Buffs, {
    power: 0, shell: 0, classDamage: 0, gearDamage: 0, classArmor: 0, gearArmor: 0, classPulse: 0, lifesteal: 0, emberBonus: 0, execute: 0,
  });
  const inventory = ctx.world.get(player, Inventory)!;
  inventory.current = 'cinder/cinderkey'; inventory.switchedAt = -10;
  const owned = new Set(inventory.weapons);
  const syncOwned = () => { for (const id of inventory.weapons) owned.add(id); };
  const levels: Record<CinderRelicId, number> = { power: 0, vitality: 0, shell: 0, siphon: 0, pulse: 0, bounty: 0, execution: 0, emberheart: 0, shardfinder: 0, warpath: 0 };
  const applyRelic = (id: CinderRelicId): string => {
    levels[id]++; buffs.power = levels.power; buffs.shell = levels.shell; buffs.execute = levels.execution * .3;
    if (id === 'vitality') { hp.max += 25; healPlayer(35); }
    return relics.find(relic => relic.id === id)?.name ?? id;
  };
  let phase: CinderState['phase'] = 'class-select';
  let activeClass: CinderClassDefinition | null = null;
  let activeClassId: CinderClassId | null = null;
  let kills = 0, offer = 0, revision = 0, depth = 1, portal = false, round = 1, ap = 0, maxAp = 0;
  let inventoryOpen = false, inventoryCursor = 0, inventoryFilter: CinderInventoryFilter = 'all';
  let craftingOpen = false, craftingCursor = 0;
  let gridOpen = false;
  let dialogue: CinderDialogueView | null = null;
  let activeNpc: EntityId | undefined;
  let boss: EntityId | undefined;
  let live = new Set<EntityId>(), pickups = new Set<EntityId>(), npcs = new Set<EntityId>();
  let explored = new Set<string>();
  let mapBounds: { originX: number; originZ: number; width: number; height: number } | null = null;
  let mapWalkable = '';
  let mapRevealed = false;
  let engaged = new Set<EntityId>();
  let intents = { attacks: 0, advances: 0, engaged: 0, elites: 0 };
  let enemyActAt = 0, enemyActed = false, enemyResumeAt = 0;
  let bossEnraged = false;
  let hover: CinderHover | null = null;
  let helpOpen = false;
  let endRequested = false;
  let offers: readonly CinderOffer[] = Object.freeze([]);
  let message = 'Choose an Ashbound class. Your legacy and class mastery carry forward.';
  const input = ctx.services.get(Input);
  const queue = createCommandQueue<CinderCommand>(ctx, { capacity: 32, normalize(value) {
    if (!isObject(value)) return undefined;
    const type = value['type'];
    if (type === 'choose') {
      const index = value['index'], epoch = value['offer'];
      return Number.isInteger(index) && typeof index === 'number' && index >= 0 && index < 3 && Number.isSafeInteger(epoch) && typeof epoch === 'number' && epoch >= 0
        ? { type: 'choose', index, offer: epoch } : undefined;
    }
    if (type === 'choose-class') return typeof value['classId'] === 'string' && classById(value['classId']) ? { type, classId: value['classId'] as string } : undefined;
    if (type === 'inventory-move' || type === 'crafting-move') return value['delta'] === -1 || value['delta'] === 1 ? { type, delta: value['delta'] } : undefined;
    if (type === 'craft') return typeof value['recipe'] === 'string' && ctx.registries.has(CraftingRecipes, value['recipe']) ? { type, recipe: value['recipe'] } : undefined;
    if (type === 'dialogue-choice') return Number.isInteger(value['index']) && typeof value['index'] === 'number' && value['index'] >= 0 && value['index'] < 4 ? { type, index: value['index'] } : undefined;
    if (type === 'iso-click') { const x = value['x'], z = value['z']; return typeof x === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(z) ? { type, x, z } : undefined; }
    if (type === 'choose-threat') return typeof value['threatId'] === 'string' && threatById(value['threatId']) ? { type, threatId: value['threatId'] } : undefined;
    return type === 'pulse' || type === 'end-turn' || type === 'toggle-inventory' || type === 'inventory-confirm' || type === 'inventory-filter' || type === 'inventory-drop' || type === 'toggle-crafting' || type === 'crafting-confirm' || type === 'toggle-grid' || type === 'dialogue-close' || type === 'toggle-help' ? { type } : undefined;
  } });
  const weaponCard = (id: string): CinderWeaponOffer => {
    const def = ctx.registries.get(Weapons, id);
    const meta = cinderArsenal.find(w => w.id === id);
    if (!def || !meta) throw new Error(`Cinder armory is missing weapon "${id}"`);
    const damage = typeof def.attack.params['damage'] === 'number' ? def.attack.params['damage'] : 0;
    const mode = def.attack.behavior === 'core/melee' ? 'MELEE' : def.attack.behavior === 'core/projectile' ? 'EXPLOSIVE' : def.auto ? 'BURST' : 'SEMI';
    const rounds = def.magazineSize === undefined ? 'UNLIMITED' : `${def.magazineSize} ROUNDS`;
    return Object.freeze({ kind: 'weapon' as const, ...weaponView(id, def.slot, def.name, meta.description, `${mode} · ${rounds} · ${damage} DAMAGE`) });
  };
  const markerRooms = (depthIndex: number, role: string) => world.desc.spawns.filter(s =>
    s.tags.includes(`dungeon-depth-${depthIndex}`) && s.tags.includes(`dungeon-role-${role}`));
  const exitTrigger = (depthIndex = depth) => world.desc.triggers.find(t => t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depthIndex}`));
  const startMarker = (depthIndex = depth) => markerRooms(depthIndex, 'start')[0];
  const wardenMarker = (depthIndex = depth) => markerRooms(depthIndex, 'warden')[0];
  const cellOf = (x: number, z: number) => {
    const cs = world.desc.cellSize;
    return { cx: Math.floor(x / cs), cz: Math.floor(z / cs), x: (Math.floor(x / cs) + 0.5) * cs, z: (Math.floor(z / cs) + 0.5) * cs };
  };
  const pointAround = (at: { x: number; z: number }, radius: number, rng: typeof encounterRng): { x: number; z: number } => {
    for (let i = 0; i < 8; i++) {
      const angle = rng.range(0, Math.PI * 2), distance = rng.range(0, radius);
      const x = at.x + Math.cos(angle) * distance, z = at.z + Math.sin(angle) * distance;
      if (world.isFree(x, z, 0.45)) return { x, z };
    }
    return { x: at.x, z: at.z };
  };
  const cellKey = (cx: number, cz: number): string => `${cx},${cz}`;
  const localCell = (x: number, z: number): { x: number; z: number } => {
    if (!mapBounds) return { x: 0, z: 0 };
    const cs = world.desc.cellSize;
    return { x: Math.max(0, Math.min(mapBounds.width - 1, Math.floor(x / cs) - mapBounds.originX)), z: Math.max(0, Math.min(mapBounds.height - 1, Math.floor(z / cs) - mapBounds.originZ)) };
  };
  const buildMap = () => {
    const cs = world.desc.cellSize;
    const points = world.desc.spawns.filter(s => s.tags.includes(`dungeon-depth-${depth}`));
    if (!points.length) { mapBounds = null; mapWalkable = ''; explored = new Set(); return; }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const point of points) {
      const cx = Math.floor(point.x / cs), cz = Math.floor(point.z / cs);
      minX = Math.min(minX, cx); minZ = Math.min(minZ, cz); maxX = Math.max(maxX, cx); maxZ = Math.max(maxZ, cz);
    }
    const exit = exitTrigger();
    if (exit) { minX = Math.min(minX, Math.floor(exit.x / cs)); minZ = Math.min(minZ, Math.floor(exit.z / cs)); maxX = Math.max(maxX, Math.floor(exit.x / cs)); maxZ = Math.max(maxZ, Math.floor(exit.z / cs)); }
    const margin = 6;
    const originX = Math.max(0, minX - margin), originZ = Math.max(0, minZ - margin);
    const right = Math.min(world.desc.width - 1, maxX + margin), bottom = Math.min(world.desc.height - 1, maxZ + margin);
    mapBounds = { originX, originZ, width: Math.max(1, right - originX + 1), height: Math.max(1, bottom - originZ + 1) };
    const rows: string[] = [];
    for (let z = 0; z < mapBounds.height; z++) {
      let row = '';
      for (let x = 0; x < mapBounds.width; x++) row += world.isFree((originX + x + 0.5) * cs, (originZ + z + 0.5) * cs, 0.28) ? '1' : '0';
      rows.push(row);
    }
    mapWalkable = rows.join('');
    explored = new Set(); mapRevealed = false;
    revealAround();
  };
  const revealAround = () => {
    if (!mapBounds) return;
    const t = ctx.world.get(player, Transform); if (!t) return;
    const cs = world.desc.cellSize;
    for (let z = 0; z < mapBounds.height; z++) for (let x = 0; x < mapBounds.width; x++) {
      if (mapWalkable[z * mapBounds.width + x] !== '1') continue;
      const wx = (mapBounds.originX + x + 0.5) * cs, wz = (mapBounds.originZ + z + 0.5) * cs;
      const d = Math.hypot(wx - t.x, wz - t.z);
      if (d <= 2.4 || (d <= 8.5 && world.lineOfSight(t.x, t.z, wx, wz))) explored.add(cellKey(mapBounds.originX + x, mapBounds.originZ + z));
    }
  };
  const revealWholeMap = () => {
    if (!mapBounds) return;
    const cs = world.desc.cellSize;
    for (let z = 0; z < mapBounds.height; z++) for (let x = 0; x < mapBounds.width; x++) {
      if (mapWalkable[z * mapBounds.width + x] === '1') explored.add(cellKey(mapBounds.originX + x, mapBounds.originZ + z));
    }
    mapRevealed = true;
  };
  const reachableCells = (): Set<string> => {
    const reachable = new Set<string>();
    if (!mapBounds) return reachable;
    const t = ctx.world.get(player, Transform); if (!t) return reachable;
    const cs = world.desc.cellSize;
    const occupied = occupiedCells();
    const startX = Math.floor(t.x / cs) - mapBounds.originX, startZ = Math.floor(t.z / cs) - mapBounds.originZ;
    if (startX < 0 || startZ < 0 || startX >= mapBounds.width || startZ >= mapBounds.height) return reachable;
    const queue: { x: number; z: number; cost: number }[] = [{ x: startX, z: startZ, cost: 0 }];
    const best = new Map<string, number>([[cellKey(startX, startZ), 0]]);
    while (queue.length) {
      const current = queue.shift()!;
      const key = cellKey(current.x, current.z); reachable.add(key);
      if (current.cost >= ap) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = current.x + dx, z = current.z + dz;
        if (x < 0 || z < 0 || x >= mapBounds.width || z >= mapBounds.height) continue;
        if (mapWalkable[z * mapBounds.width + x] !== '1') continue;
        const absoluteKey = cellKey(mapBounds.originX + x, mapBounds.originZ + z);
        if (occupied.has(absoluteKey) && !(x === startX && z === startZ)) continue;
        const next = current.cost + 1;
        if ((best.get(absoluteKey) ?? Infinity) <= next) continue;
        best.set(absoluteKey, next); queue.push({ x, z, cost: next });
      }
    }
    return reachable;
  };
  const mapView = (): CinderMapView | null => {
    if (!mapBounds || phase === 'class-select') return null;
    const cs = world.desc.cellSize;
    const t = ctx.world.get(player, Transform); if (!t) return null;
    const reachable = reachableCells();
    const exploredString = (() => {
      let out = '';
      for (let z = 0; z < mapBounds.height; z++) for (let x = 0; x < mapBounds.width; x++) out += explored.has(cellKey(mapBounds.originX + x, mapBounds.originZ + z)) ? '1' : '0';
      return out;
    })();
    const reachableString = (() => {
      let out = '';
      for (let z = 0; z < mapBounds.height; z++) for (let x = 0; x < mapBounds.width; x++) out += reachable.has(cellKey(x, z)) ? '1' : '0';
      return out;
    })();
    const markers: CinderMapMarker[] = [];
    ctx.world.each(Enemy, (id, enemy) => {
      if (enemy.state === 'dead' || ctx.world.get(id, Health)?.dead) return;
      const def = ctx.registries.get(Enemies, enemy.def), p = ctx.world.get(id, Transform);
      if (!def || !p) return;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d > 26 || !world.lineOfSight(t.x, t.z, p.x, p.z)) return;
      const attack = engaged.has(id) && d <= def.attack.range;
      markers.push(Object.freeze({ kind: id === boss ? 'boss' : 'enemy', ...localCell(p.x, p.z), ...(engaged.has(id) ? { intent: attack ? 'attack' as const : 'advance' as const } : {}) }));
    });
    for (const id of npcs) {
      const npc = ctx.world.get(id, Npc), p = ctx.world.get(id, Transform);
      if (!npc || !p) continue;
      const cell = localCell(p.x, p.z), absolute = cellKey(mapBounds.originX + Math.floor(p.x / cs), mapBounds.originZ + Math.floor(p.z / cs));
      if (explored.has(absolute) || world.lineOfSight(t.x, t.z, p.x, p.z)) markers.push(Object.freeze({ kind: 'npc', ...cell }));
    }
    const exit = exitTrigger();
    if (exit && (portal || explored.has(cellKey(Math.floor(exit.x / cs), Math.floor(exit.z / cs))))) markers.push(Object.freeze({ kind: 'exit', ...localCell(exit.x, exit.z) }));
    for (const id of pickups) {
      const p = ctx.world.get(id, Transform);
      if (!p) continue;
      const absolute = cellKey(Math.floor(p.x / cs), Math.floor(p.z / cs));
      if (explored.has(absolute)) markers.push(Object.freeze({ kind: 'loot', ...localCell(p.x, p.z) }));
    }
    return Object.freeze({ width: mapBounds.width, height: mapBounds.height, originX: mapBounds.originX, originZ: mapBounds.originZ, cell: cs,
      walkable: mapWalkable, explored: exploredString, reachable: reachableString, player: localCell(t.x, t.z), markers: Object.freeze(markers) });
  };
  const spawnNpcAt = (role: NpcRole, at: { x: number; z: number }, yaw: number): EntityId => {
    const id = spawnPrefab(ctx, 'cinder/npc', { x: at.x, z: at.z, yaw }, { role });
    npcs.add(id); return id;
  };
  const spawnNpc = () => {
    const start = startMarker(); if (!start) return;
    const role: NpcRole = depth === 2 ? 'cartographer' : 'smith';
    const cs = world.desc.cellSize;
    let at: { x: number; z: number } | null = null;
    for (const [dx, dz] of [[cs * 1.5, 0], [0, cs * 1.5], [-cs * 1.5, 0], [0, -cs * 1.5], [cs * 1.5, cs * 1.5], [-cs * 1.5, cs * 1.5]] as const) {
      const x = start.x + dx, z = start.z + dz;
      if (world.isFree(x, z, 0.5)) { at = { x, z }; break; }
    }
    if (at) spawnNpcAt(role, at, Math.atan2(start.x - at.x, start.z - at.z));
    if (depth >= 2) {
      const rooms = markerRooms(depth, 'loot');
      const room = rooms.length ? rooms[encounterRng.int(0, rooms.length)]! : undefined;
      if (room) {
        const spot = pointAround(room, 1.0, encounterRng);
        spawnNpcAt('oracle', spot, Math.atan2(room.x - spot.x, room.z - spot.z));
      }
    }
  };
  const nearestNpc = (): { id: string; name: string } | null => {
    const p = ctx.world.get(player, Transform); if (!p || phase !== 'player' || dialogue || inventoryOpen || craftingOpen || gridOpen) return null;
    let best: { id: string; name: string } | null = null, bestD = Infinity;
    for (const id of npcs) {
      const npc = ctx.world.get(id, Npc), t = ctx.world.get(id, Transform);
      if (!npc || !t) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d <= 3 && d < bestD && world.lineOfSight(p.x, p.z, t.x, t.z)) { bestD = d; best = { id: String(id), name: npc.name }; }
    }
    return best;
  };
  const npcOptions = (npc: NpcState): CinderDialogueOption[] => {
    if (npc.role === 'smith') {
      const canMend = !npc.healed && kit.resources.get('embers') >= 12;
      return [
        { id: 'craft', label: 'Open the ember forge', hint: 'CRAFT ITEMS FROM SHARDS' },
        { id: 'mend', label: npc.healed ? 'Wounds already mended' : 'Mend wounds', hint: npc.healed ? 'USED' : '12 EMBERS · HEAL 30', disabled: !canMend },
        { id: 'lore', label: 'Ask about the vault', hint: 'LORE' },
        { id: 'leave', label: 'Leave', hint: 'E CLOSE' },
      ];
    }
    const canChart = !npc.revealed && kit.resources.get('embers') >= 10;
    if (npc.role === 'oracle') {
      const canPact = !npc.bloodPact && hp.hp > 20;
      const canTrade = !npc.traded && kit.resources.get('embers') >= 25;
      return [
        { id: 'pact', label: npc.bloodPact ? 'The blood price is paid' : 'Offer blood for a boon', hint: npc.bloodPact ? 'USED' : 'LOSE 20 HEALTH · RANDOM BOON', disabled: !canPact },
        { id: 'trade', label: npc.traded ? 'The reliquary is empty' : 'Buy a sealed relic', hint: npc.traded ? 'USED' : '25 EMBERS · RANDOM FIND', disabled: !canTrade },
        { id: 'lore', label: 'Ask what the vault wants', hint: 'LORE' },
        { id: 'leave', label: 'Leave', hint: 'E CLOSE' },
      ];
    }
    return [
      { id: 'chart', label: npc.revealed ? 'This wing is already charted' : 'Chart this wing', hint: npc.revealed ? 'REVEALED' : '10 EMBERS · REVEAL MAP', disabled: !canChart },
      { id: 'lore', label: 'Ask about the warden', hint: 'LORE' },
      { id: 'leave', label: 'Leave', hint: 'E CLOSE' },
    ];
  };
  const dialogueView = (npcId: EntityId, npc: NpcState): CinderDialogueView => Object.freeze({
    npcId: String(npcId), name: npc.name, title: npc.title, portrait: npc.portrait, text: npc.line, options: Object.freeze(npcOptions(npc)),
  });
  const openDialogue = (npcId: EntityId) => {
    const npc = ctx.world.get(npcId, Npc); if (!npc) return;
    activeNpc = npcId; inventoryOpen = false; craftingOpen = false; gridOpen = false;
    dialogue = dialogueView(npcId, npc); message = `Speaking with ${npc.name}.`; revision++;
  };
  const closeDialogue = () => { dialogue = null; activeNpc = undefined; revision++; };
  const refreshDialogue = () => { if (activeNpc === undefined) return; const npc = ctx.world.get(activeNpc, Npc); if (npc) dialogue = dialogueView(activeNpc, npc); };
  const chooseDialogue = (index: number) => {
    if (!dialogue || activeNpc === undefined) return;
    const npc = ctx.world.get(activeNpc, Npc); if (!npc) { closeDialogue(); return; }
    const option = dialogue.options[index]; if (!option || option.disabled) { message = 'That path is closed.'; return; }
    if (option.id === 'leave') { closeDialogue(); message = 'You step away.'; return; }
    if (option.id === 'craft') { closeDialogue(); inventoryOpen = false; craftingOpen = true; craftingCursor = 0; message = 'The ember forge opens.'; revision++; return; }
    if (option.id === 'mend') {
      const paid = kit.resources.transact({ spend: { embers: 12 } }, 'npc:mend');
      if (!paid.ok) { message = 'Not enough embers.'; return; }
      npc.healed = true; healPlayer(30); npc.line = 'The heat closes your wounds. Do not waste the second chance.';
      refreshDialogue(); message = 'Orla mends 30 health.'; revision++; return;
    }
    if (option.id === 'chart') {
      const paid = kit.resources.transact({ spend: { embers: 10 } }, 'npc:chart');
      if (!paid.ok) { message = 'Not enough embers.'; return; }
      npc.revealed = true; revealWholeMap(); npc.line = 'The lantern remembers the whole wing. Follow the bright line.'; refreshDialogue(); message = 'Vey charts the current wing.'; revision++; return;
    }
    if (option.id === 'pact') {
      const pool = relics.filter(relic => levels[relic.id] < 3);
      if (!pool.length) { message = 'No further boon can take root.'; return; }
      const pick = pool[rewardRng.int(0, pool.length)]!;
      hp.hp = Math.max(1, hp.hp - 20);
      const name = applyRelic(pick.id);
      npc.bloodPact = true;
      const p = ctx.world.get(player, Transform);
      if (p) ctx.events.emit(Impact, { x: p.x, z: p.z, y: 1.1, nx: 0, nz: 0, target: player, effect: 'fx-blood', sound: 'impact-flesh' });
      npc.line = 'The vault drinks, and answers. Carry the mark well.';
      refreshDialogue(); message = `Blood pact: ${name}.`; revision++; return;
    }
    if (option.id === 'trade') {
      const paid = kit.resources.transact({ spend: { embers: 25 } }, 'npc:oracle');
      if (!paid.ok) { message = 'Not enough embers.'; return; }
      const item = rollLoot();
      if (!addLoot(item, 'Sealed relic')) { kit.resources.transact({ gain: { embers: 25 } }, 'npc:oracle-refund'); return; }
      npc.traded = true; npc.line = 'A fair exchange. The rest is yours to carry.';
      refreshDialogue(); message = 'The Oracle releases a sealed relic.'; revision++; return;
    }
    if (option.id === 'lore') {
      npc.line = npc.role === 'smith'
        ? 'Shards are the vault’s blood. Brew them, forge them, and spend the warmth before the keeper takes it back.'
        : npc.role === 'oracle'
          ? 'The vault does not want your obedience. It wants a choice sharp enough to cut. Pay in blood or coin, never in doubt.'
          : 'The warden guards the descent, but the keeper watches the last door. Save one ember flask for the sanctum.';
      refreshDialogue(); revision++;
    }
  };
  const recipeViews = (): readonly CinderRecipeView[] => ctx.registries.entries(CraftingRecipes).map(entry => {
    const cost = RECIPE_EMBERS[entry.id] ?? 0;
    const check = crafting.preview(bag, entry.id);
    const embers = kit.resources.get('embers');
    const inputs = entry.value.inputs.map(input => { const def = ctx.registries.get(Items, input.item); return Object.freeze({ id: input.item, name: def?.name ?? input.item, icon: def?.icon ?? 'assetrizz/cinder-pulse.png', count: input.count, have: bag.count(input.item) }); });
    const outputDef = ctx.registries.get(Items, entry.value.output.item);
    const canCraft = check.ok && embers >= cost;
    return Object.freeze({ id: entry.id, name: entry.value.name, description: entry.value.description,
      inputs: Object.freeze(inputs), output: Object.freeze({ id: entry.value.output.item, name: outputDef?.name ?? entry.value.output.item, icon: outputDef?.icon ?? 'assetrizz/cinder-pulse.png', count: entry.value.output.count }),
      emberCost: cost, canCraft, reason: !check.ok ? check.reason : embers < cost ? `Needs ${cost} run embers` : '' });
  });
  const craftRecipe = (id: string) => {
    if (!craftingOpen) return;
    const recipe = ctx.registries.get(CraftingRecipes, id); if (!recipe) { message = 'Unknown recipe.'; return; }
    const cost = RECIPE_EMBERS[id] ?? 0;
    const check = crafting.preview(bag, id);
    if (!check.ok) { message = check.reason; return; }
    if (kit.resources.get('embers') < cost) { message = `Needs ${cost} run embers.`; return; }
    if (cost > 0 && !kit.resources.transact({ spend: { embers: cost } }, 'crafting').ok) { message = 'Not enough run embers.'; return; }
    const result = crafting.craft(bag, id);
    if (!result.ok) { if (cost > 0) kit.resources.transact({ gain: { embers: cost } }, 'crafting-refund'); message = result.reason; return; }
    message = `Crafted ${recipe.name}.`; revision++;
  };
  const cycleInventoryFilter = () => { inventoryFilter = inventoryFilter === 'all' ? 'gear' : inventoryFilter === 'gear' ? 'items' : 'all'; inventoryCursor = 0; message = `Pack filter: ${inventoryFilter}.`; revision++; };
  const dropInventoryItem = () => {
    if (!inventoryOpen) return;
    const entries = inventoryEntries(); const entry = entries[inventoryCursor];
    if (!entry || entry.source !== 'bag') { message = 'Only carried items can be dropped.'; return; }
    const result = bag.remove(entry.id, 1);
    if (!result.ok) { message = result.reason; return; }
    inventoryCursor = Math.max(0, Math.min(inventoryCursor, Math.max(0, inventoryEntries().length - 1)));
    message = `Dropped 1 ${entry.name}.`; revision++;
  };
  const itemView = (id: string, count: number, source: 'bag' | 'equipment', equipmentSlot?: string): CinderItemView | null => {
    const def = ctx.registries.get(Items, id);
    if (!def) return null;
    const view: CinderItemView = { id, name: def.name, description: def.description, icon: def.icon, rarity: def.rarity, count, source };
    return Object.freeze(equipmentSlot ? { ...view, slot: def.slot, equipmentSlot } : { ...view, ...(def.slot ? { slot: def.slot } : {}) });
  };
  const inventoryEntries = (): readonly CinderItemView[] => {
    const entries: CinderItemView[] = [];
    for (const slot of bag.slots()) { const view = itemView(slot.item, slot.count, 'bag'); if (view) entries.push(view); }
    for (const [slot, item] of Object.entries(bag.equipment())) { if (!item) continue; const view = itemView(item, 1, 'equipment', slot); if (view) entries.push(view); }
    const filtered = inventoryFilter === 'all' ? entries : inventoryFilter === 'gear'
      ? entries.filter(entry => entry.source === 'equipment' || entry.slot !== undefined)
      : entries.filter(entry => entry.source === 'bag' && entry.slot === undefined);
    return Object.freeze(filtered);
  };
  const gearStats = () => {
    let damage = 0, armor = 0, lifesteal = 0, embers = 0;
    for (const item of Object.values(bag.equipment())) {
      const mods = GEAR[item];
      if (!mods) continue;
      damage += mods.damage ?? 0; armor += mods.armor ?? 0; lifesteal += mods.lifesteal ?? 0; embers += mods.embers ?? 0;
    }
    buffs.gearDamage = damage; buffs.gearArmor = armor; buffs.lifesteal = lifesteal; buffs.emberBonus = embers;
  };
  const addLoot = (id: string, label: string): boolean => {
    const result = bag.add(id, 1);
    if (!result.ok) { message = `Inventory full — ${label} was left behind.`; return false; }
    message = `${label} acquired. I opens your pack.`; revision++;
    return true;
  };
  const rollLoot = (): string => {
    const total = LOOT_TABLE.reduce((n, entry) => n + entry.weight, 0);
    let roll = lootRng.int(0, total);
    for (const entry of LOOT_TABLE) { roll -= entry.weight; if (roll < 0) return entry.id; }
    return LOOT_TABLE[0]!.id;
  };
  const dropLoot = (score: number) => {
    if (levels.shardfinder > 0 && score >= 500) addLoot('cinder/ember-shard', 'Shardfinder cache');
    const gear = ['cinder/ashplate', 'cinder/iron-band', 'cinder/hunters-charm', 'cinder/oracle-lens', 'cinder/obsidian-edge', 'cinder/gilded-chain', 'cinder/warden-plate'];
    if (score >= 1500) {
      addLoot('cinder/ember-shard', 'Keeper shard'); addLoot('cinder/ember-shard', 'Keeper shard');
      addLoot(rollLoot(), 'Warden relic'); addLoot(gear[lootRng.int(0, gear.length)]!, 'Warden equipment'); addLoot('cinder/draught', 'Ember draught');
    } else if (score >= 500) {
      addLoot('cinder/ember-shard', 'Warden shard'); addLoot(rollLoot(), 'Vault cache'); addLoot(gear[lootRng.int(0, gear.length)]!, 'Warden equipment');
    } else {
      if (lootRng.next() < 0.32) addLoot('cinder/ember-shard', 'Ember shard');
      if (lootRng.next() < 0.18) addLoot(rollLoot(), 'Fallen delver cache');
    }
  };
  const clearFloor = () => {
    for (const id of live) ctx.world.destroy(id);
    for (const id of pickups) ctx.world.destroy(id);
    for (const id of npcs) ctx.world.destroy(id);
    ctx.world.each(Enemy, id => ctx.world.destroy(id));
    live = new Set(); pickups = new Set(); npcs = new Set(); boss = undefined; portal = false; bossEnraged = false; engaged = new Set(); intents = { attacks: 0, advances: 0, engaged: 0, elites: 0 }; helpOpen = false; hover = null;
    dialogue = null; activeNpc = undefined; craftingOpen = false; gridOpen = false; inventoryOpen = false;
    explored = new Set(); mapBounds = null; mapWalkable = ''; mapRevealed = false;
  };
  const makeElite = (e: EntityId): void => {
    const affixes: EliteAffix[] = ['warded', 'swift', 'volatile', 'siphon'];
    const elite = ELITES[affixes[encounterRng.int(0, affixes.length)]!]!;
    ctx.world.add(e, Elite, { ...elite });
    const hp = ctx.world.get(e, Health);
    if (hp) { hp.max = Math.max(1, Math.round(hp.max * 1.3)); hp.hp = hp.max; }
    const v = ctx.world.get(e, Visual);
    if (v) { v.scale *= 1.15; v.tint = elite.color; }
  };
  const spawnEnemy = (id: string, at: { x: number; z: number }, yaw: number, allowElite = true): EntityId => {
    const e = spawnPrefab(ctx, id, { x: at.x, z: at.z, yaw }); live.add(e);
    const threat = currentThreat();
    const hp = ctx.world.get(e, Health);
    if (hp) {
      hp.max = Math.max(1, Math.round(hp.max * threat.enemyHealth));
      hp.hp = hp.max;
    }
    const isBoss = id === 'cinder/warden' || id === 'cinder/keeper';
    const eliteChance = Math.min(0.65, threat.eliteChance + (depth - 1) * 0.05);
    if (allowElite && !isBoss && encounterRng.next() < eliteChance) makeElite(e);
    return e;
  };
  const spawnPickup = (id: string, at: { x: number; z: number }): EntityId => {
    const e = spawnPrefab(ctx, id, { x: at.x, z: at.z, yaw: 0 }); pickups.add(e); return e;
  };
  const encounterEnemy = (): string => {
    const roll = encounterRng.next();
    if (depth === 1) return roll < 0.18 ? 'cinder/hound' : roll < 0.42 ? 'cinder/imp' : 'cinder/thrall';
    if (depth === 2) return roll < 0.2 ? 'cinder/hound' : roll < 0.38 ? 'cinder/acolyte' : roll < 0.58 ? 'cinder/imp' : 'cinder/thrall';
    return roll < 0.26 ? 'cinder/brute' : roll < 0.46 ? 'cinder/acolyte' : roll < 0.66 ? 'cinder/hound' : 'cinder/imp';
  };
  const populate = () => {
    syncOwned();
    const rooms = markerRooms(depth, 'loot').concat(markerRooms(depth, 'exit'), markerRooms(depth, 'warden'));
    const wardenRoom = wardenMarker(depth);
    for (const room of rooms) {
      const count = depth === 1 ? encounterRng.int(1, 3) : encounterRng.int(2, 4);
      for (let i = 0; i < count; i++) {
        spawnEnemy(encounterEnemy(), pointAround(room, 1.25, encounterRng), encounterRng.range(0, Math.PI * 2));
      }
    }
    if (currentThreat().id === 'ashbound' && ![...live].some(id => ctx.world.has(id, Elite))) {
      const candidate = [...live].find(id => !ctx.world.has(id, Elite));
      if (candidate !== undefined) makeElite(candidate);
    }
    if (wardenRoom) {
      const bossId = depth === DEPTHS.length ? 'cinder/keeper' : 'cinder/warden';
      boss = spawnEnemy(bossId, { x: wardenRoom.x, z: wardenRoom.z }, 0);
      if (depth === DEPTHS.length) {
        spawnEnemy('cinder/hound', pointAround(wardenRoom, 1.8, encounterRng), encounterRng.range(0, Math.PI * 2));
        spawnEnemy('cinder/acolyte', pointAround(wardenRoom, 1.8, encounterRng), encounterRng.range(0, Math.PI * 2));
      }
    }
    const lootRooms = markerRooms(depth, 'loot'); const used = new Set<string>();
    const room = (): typeof lootRooms[number] | undefined => { for (const r of lootRooms) if (!used.has(r.id)) { used.add(r.id); return r; } return undefined; };
    const health = room(); if (health) spawnPickup('cinder/medkit', pointAround(health, 0.8, encounterRng));
    const ammo = room(); if (ammo) spawnPickup('cinder/rounds-cache', pointAround(ammo, 0.8, encounterRng));
    const weaponRoom = room();
    if (weaponRoom) {
      const available = cinderArsenal.filter(w => !owned.has(w.id) && PICKUPS[w.id]);
      if (available.length) spawnPickup(PICKUPS[available[encounterRng.int(0, available.length)]!.id]!, pointAround(weaponRoom, 0.8, encounterRng));
      else spawnPickup('cinder/sparks-cache', pointAround(weaponRoom, 0.8, encounterRng));
    }
    spawnNpc();
    addLoot('cinder/ember-shard', 'Depth shard');
    addLoot(rollLoot(), 'Depth cache');
    for (let i = 0; i < currentThreat().lootBonus; i++) { addLoot('cinder/ember-shard', 'Threat cache'); addLoot(rollLoot(), 'Threat cache'); }
    buildMap();
  };
  const computeIntents = () => {
    const p = ctx.world.get(player, Transform); if (!p) return;
    let attacks = 0, advances = 0, engagedCount = 0, eliteCount = 0;
    ctx.world.each(Enemy, (id, enemy) => {
      if (enemy.state === 'dead' || ctx.world.get(id, Health)?.dead) return;
      const def = ctx.registries.get(Enemies, enemy.def); const t = ctx.world.get(id, Transform);
      if (!def || !t) return;
      const v = ctx.world.get(id, Visual), elite = ctx.world.get(id, Elite);
      if (elite) eliteCount++;
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      const los = world.lineOfSight(p.x, p.z, t.x, t.z);
      if (!engaged.has(id) && ((d <= def.sightRange && los) || d <= 8)) engaged.add(id);
      else if (engaged.has(id) && d > 28) engaged.delete(id);
      if (!engaged.has(id)) { if (v) v.tint = elite?.color ?? def.tint; enemy.state = 'idle'; return; }
      enemy.target = player; engagedCount++;
      if (enemy.state === 'pain' && ctx.time.now < enemy.stateUntil) { if (v) v.tint = elite?.color ?? def.tint; return; }
      if (enemy.state !== 'pain') enemy.state = 'chase';
      const attack = los && d <= def.attack.range;
      if (attack) attacks++; else advances++;
      if (v) v.tint = attack ? '#ff7052' : elite?.color ?? def.tint;
    });
    intents = { attacks, advances, engaged: engagedCount, elites: eliteCount };
  };
  const startPlayerTurn = () => {
    if (phase !== 'player' && phase !== 'enemy') return;
    phase = 'player'; round++; ap = maxAp; inventoryOpen = false; endRequested = false;
    kit.clock.advance(1); inventory.nextFireAt = 0; const regen = levels.emberheart * 2; if (regen > 0) healPlayer(regen); computeIntents();
    message = intents.attacks > 0 ? `${intents.attacks} enemy attack${intents.attacks === 1 ? '' : 's'} telegraphed.` : 'Your turn.';
    revision++;
  };
  const beginEnemyTurn = () => {
    if (phase !== 'player') return;
    computeIntents();
    if (intents.engaged === 0) {
      // Exploration should not spend a visible enemy-phase pause when nothing has noticed the player.
      round++; ap = maxAp; kit.clock.advance(1); endRequested = false; const regen = levels.emberheart * 2; if (regen > 0) healPlayer(regen);
      message = 'Your turn.'; revision++; return;
    }
    phase = 'enemy'; ap = 0; inventoryOpen = false; craftingOpen = false; gridOpen = false; dialogue = null; activeNpc = undefined; helpOpen = false; hover = null; endRequested = false;
    enemyActAt = ctx.time.now + 0.35; enemyActed = false; enemyResumeAt = 0;
    message = intents.attacks > 0 ? `${intents.attacks} attack${intents.attacks === 1 ? '' : 's'} incoming.` : 'The vault answers.';
    revision++;
  };
  const occupiedCells = (): Set<string> => {
    const occupied = new Set<string>();
    const p = ctx.world.get(player, Transform); if (p) occupied.add(`${Math.floor(p.x / world.desc.cellSize)},${Math.floor(p.z / world.desc.cellSize)}`);
    for (const id of live) { const t = ctx.world.get(id, Transform); if (t) occupied.add(`${Math.floor(t.x / world.desc.cellSize)},${Math.floor(t.z / world.desc.cellSize)}`); }
    for (const id of npcs) { const t = ctx.world.get(id, Transform); if (t) occupied.add(`${Math.floor(t.x / world.desc.cellSize)},${Math.floor(t.z / world.desc.cellSize)}`); }
    return occupied;
  };
  const moveEnemy = (id: EntityId, target: { x: number; z: number }, enemy: Enemy, occupied: Set<string>): boolean => {
    const t = ctx.world.get(id, Transform); if (!t) return false;
    const path: number[] = [];
    if (!world.findPath(t.x, t.z, target.x, target.z, path)) return false;
    const cs = world.desc.cellSize;
    const home = cellOf(t.x, t.z);
    let next: { x: number; z: number } | undefined;
    if (path.length >= 2) next = { x: path[0]!, z: path[1]! };
    if (!next) return false;
    const cell = cellOf(next.x, next.z);
    if ((cell.cx === home.cx && cell.cz === home.cz) || occupied.has(`${cell.cx},${cell.cz}`) || !world.isFree(cell.x, cell.z, 0.4)) {
      const dx = target.x - t.x, dz = target.z - t.z;
      const options = Math.abs(dx) >= Math.abs(dz)
        ? [{ x: Math.sign(dx) * cs, z: 0 }, { x: 0, z: Math.sign(dz) * cs }]
        : [{ x: 0, z: Math.sign(dz) * cs }, { x: Math.sign(dx) * cs, z: 0 }];
      for (const step of options) {
        const c = cellOf(t.x + step.x, t.z + step.z);
        if (!occupied.has(`${c.cx},${c.cz}`) && world.isFree(c.x, c.z, 0.4)) { next = { x: c.x, z: c.z }; break; }
      }
    }
    if (!next) return false;
    t.prevX = t.x; t.prevZ = t.z; t.x = next.x; t.z = next.z; t.yaw = yawOf(target.x - next.x, target.z - next.z);
    enemy.memory['movedAt'] = ctx.time.now; enemy.state = 'chase';
    return true;
  };
  const enemyAttack = (id: EntityId, enemy: Enemy, def: EnemyDef, target: Transform) => {
    const t = ctx.world.get(id, Transform); if (!t) return;
    const dx = target.x - t.x, dz = target.z - t.z, d = Math.hypot(dx, dz) || 1;
    t.yaw = yawOf(dx, dz);
    const baseDamage = typeof def.attack.params['damage'] === 'number' ? def.attack.params['damage'] : 5;
    const damage = Math.max(1, Math.round(baseDamage * currentThreat().enemyDamage));
    const kind = typeof def.attack.params['kind'] === 'string' ? def.attack.params['kind'] : 'enemy';
    const projectile = def.attack.behavior === 'core/projectile';
    ctx.events.emit(AttackFired, { shooter: id, attackId: enemy.def, behavior: def.attack.behavior, x: t.x, z: t.z, dirX: dx / d, dirZ: dz / d, sound: def.attack.sound });
    combat.damage({ target: player, source: id, amount: damage, kind, x: target.x, z: target.z });
    ctx.events.emit(Impact, { x: target.x, z: target.z, y: 1.1, nx: -dx / d, nz: -dz / d, target: player, effect: projectile ? 'fx-fireball' : 'fx-blood', sound: 'impact-flesh' });
    const elite = ctx.world.get(id, Elite);
    if (elite?.siphon) combat.heal(id, elite.siphon);
    enemy.state = 'windup'; enemy.stateUntil = ctx.time.now + 0.2;
    message = `${def.name} strikes for ${damage}.`;
  };
  const executeEnemyTurn = () => {
    const p = ctx.world.get(player, Transform); if (!p) return;
    const occupied = occupiedCells();
    for (const id of [...live].sort((a, b) => a - b)) {
      if (phase !== 'enemy') return;
      const enemy = ctx.world.get(id, Enemy); const def = enemy ? ctx.registries.get(Enemies, enemy.def) : undefined;
      const t = ctx.world.get(id, Transform);
      if (!enemy || !def || !t || enemy.state === 'dead' || !engaged.has(id)) continue;
      if (enemy.state === 'pain' && ctx.time.now < enemy.stateUntil) continue;
      const elite = ctx.world.get(id, Elite);
      const baseActions = typeof def.aiParams['actions'] === 'number' ? Math.max(1, Math.floor(def.aiParams['actions'])) : 1;
      const actions = id === boss ? (bossEnraged ? (depth === DEPTHS.length ? 3 : 2) : (depth === DEPTHS.length ? 2 : 1)) : Math.max(elite?.actions ?? 1, baseActions);
      for (let n = 0; n < actions && phase === 'enemy'; n++) {
        const support = typeof def.aiParams['supportHeal'] === 'number' ? Math.max(0, def.aiParams['supportHeal']) : 0;
        if (support > 0) {
          let ally: EntityId | undefined, missing = 0;
          for (const other of live) {
            if (other === id) continue;
            const otherHp = ctx.world.get(other, Health), otherT = ctx.world.get(other, Transform);
            if (!otherHp || otherHp.dead || !otherT || otherHp.hp >= otherHp.max) continue;
            if (Math.hypot(otherT.x - t.x, otherT.z - t.z) > 8 || !world.lineOfSight(t.x, t.z, otherT.x, otherT.z)) continue;
            const need = otherHp.max - otherHp.hp;
            if (need > missing) { missing = need; ally = other; }
          }
          if (ally !== undefined) {
            const allyT = ctx.world.get(ally, Transform)!;
            combat.heal(ally, support);
            ctx.events.emit(Impact, { x: allyT.x, z: allyT.z, y: 1.1, nx: 0, nz: 0, target: ally, effect: 'fx-spark', sound: 'pickup-health' });
            message = `${def.name} mends an ally for ${support}.`;
            break;
          }
        }
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        const los = world.lineOfSight(t.x, t.z, p.x, p.z);
        if (los && d <= def.attack.range) { enemyAttack(id, enemy, def, p); break; }
        const oldCell = `${Math.floor(t.x / world.desc.cellSize)},${Math.floor(t.z / world.desc.cellSize)}`;
        const moved = moveEnemy(id, p, enemy, occupied);
        if (moved) {
          const now = ctx.world.get(id, Transform)!;
          occupied.delete(oldCell);
          occupied.add(`${Math.floor(now.x / world.desc.cellSize)},${Math.floor(now.z / world.desc.cellSize)}`);
        }
      }
    }
    enemyActed = true; enemyResumeAt = ctx.time.now + 0.45; revision++;
  };
  const leaveFloor = () => {
    clearFloor(); depth++;
    const start = startMarker(depth);
    if (start) {
      const t = ctx.world.get(player, Transform)!;
      t.x = t.prevX = start.x; t.z = t.prevZ = start.z; t.yaw = t.prevYaw = start.yaw;
    }
    kit.objectives.record('depths', 1, `depth-${depth}`);
    combat.giveAmmo(player, 'cinder/rounds', 48); combat.giveAmmo(player, 'cinder/sparks', 5);
    healPlayer(20);
    populate(); round = 1; ap = maxAp; portal = false; computeIntents();
    message = `The ${DEPTHS[depth - 1] ?? 'vault'} spreads before you. Find the warden.`;
    revision++;
  };
  const finish = (victory: boolean) => {
    if (phase === 'victory' || phase === 'defeat') return;
    phase = victory ? 'victory' : 'defeat'; offers = Object.freeze([]); queue.clear();
    const earned = Math.floor((kit.resources.get('embers') / 20 + (victory ? 10 : 0)) * currentThreat().legacyBonus);
    legacy = Math.min(1000000, legacy + earned);
    if (victory && (highestThreat === null || threatRank(selectedThreat) > threatRank(highestThreat))) highestThreat = selectedThreat;
    const masteryGain = kills * 2 + depth * 8 + (victory ? 20 : 0);
    if (activeClassId) mastery[activeClassId] = Math.min(1000000000, mastery[activeClassId] + masteryGain);
    save();
    message = victory ? 'The keeper falls. The vault remembers.' : 'The flame goes out. The embers remain.';
    flow.end({ outcome: victory ? 'victory' : 'defeat', title: victory ? 'THE DEPTHS ARE YOURS' : 'ANOTHER FLAME, EXTINGUISHED',
      detail: `${message} +${earned} legacy embers. ${activeClass?.name ?? 'Class'} mastery +${masteryGain}. ${currentThreat().name} threat.`,
      stats: [['Class', activeClass?.name ?? '—'], ['Threat', currentThreat().name], ['Depth', `${depth} / ${DEPTHS.length}`], ['Round', String(round)], ['Level', String(progression.level)],
        ['Slain', String(kills)], ['Embers', String(kit.resources.get('embers'))], ['Legacy embers', String(legacy)],
        ['Mastery', String(activeClassId ? mastery[activeClassId] : 0)], ['Run', String(attempt)], ['Profile', profileStatus]] });
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
    for (let i = chosen.length - 1; i > 0; i--) { const j = rewardRng.int(0, i + 1); const swap = chosen[i]!; chosen[i] = chosen[j]!; chosen[j] = swap; }
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
    owned.add(id); return true;
  };
  const useConsumable = (id: string): boolean => {
    if (id === 'cinder/draught') {
      if (hp.hp >= hp.max) { message = 'Health is already full.'; return false; }
      if (!bag.remove(id, 1).ok) return false;
      healPlayer(35); message = 'Ember draught restores 35 health.'; return true;
    }
    if (id === 'cinder/ember-flask' || id === 'cinder/shard-bomb') {
      const p = ctx.world.get(player, Transform)!;
      const radius = id === 'cinder/ember-flask' ? 6 : 4;
      const amount = id === 'cinder/ember-flask' ? 45 : 35;
      const targets = [...live].filter(e => { const t = ctx.world.get(e, Transform); return t && Math.hypot(t.x - p.x, t.z - p.z) <= radius && world.lineOfSight(p.x, p.z, t.x, t.z); });
      if (!targets.length) { message = id === 'cinder/ember-flask' ? 'No foes in flask range.' : 'No foes in bomb range.'; return false; }
      if (!bag.remove(id, 1).ok) return false;
      for (const target of targets) combat.damage({ target, source: player, amount, kind: id === 'cinder/ember-flask' ? 'ember-flask' : 'shard-bomb', x: p.x, z: p.z });
      message = id === 'cinder/ember-flask' ? `Ember flask sears ${targets.length} foes.` : `Shard bomb rends ${targets.length} foes.`; return true;
    }
    if (id === 'cinder/ember-tonic') {
      if (!bag.remove(id, 1).ok) return false;
      healPlayer(20); ap = Math.min(maxAp, ap + 1); if (ap > 0) endRequested = false;
      message = 'Ember tonic restores 20 health and 1 action.'; return true;
    }
    return false;
  };
  const spend = (amount: number) => { ap = Math.max(0, ap - amount); if (ap === 0) endRequested = true; };
  const fireWeapon = (): boolean => {
    const t = ctx.world.get(player, Transform);
    const current = inventory.current ? ctx.registries.get(Weapons, inventory.current) : undefined;
    if (!t || !current) return false;
    const attackCost = current.slot >= 5 ? 2 : 1;
    if (ap < attackCost) { message = `Not enough actions for ${current.name}.`; return false; }
    const runtime = ctx.world.get(player, WeaponRuntime);
    const currentId = inventory.current!;
    const loaded = current.magazineSize !== undefined ? runtime?.loaded[currentId] ?? 0 : Infinity;
    const shots = currentId === 'cinder/mothspindle' ? 3 : currentId === 'cinder/briarward' ? 2 : 1;
    const needed = shots * current.ammoPerShot;
    if (current.ammoType && loaded < needed) { message = `${current.name} is empty — reload with R.`; return false; }
    if (runtime && current.magazineSize !== undefined) runtime.loaded[currentId] = loaded - needed;
    const dx = yawDirX(t.yaw), dz = yawDirZ(t.yaw);
    for (let shot = 0; shot < shots; shot++) {
      combat.fireAttack({ shooter: player, team: ctx.world.get(player, Collider)?.team ?? 'player', x: t.x, z: t.z, dirX: dx, dirZ: dz,
        attackId: currentId, params: current.attack.params }, current.attack.behavior, shot === 0 ? current.fireSound : '');
    }
    inventory.lastFiredAt = ctx.time.now;
    spend(attackCost); computeIntents(); revision++;
    message = `${current.name} attacks${shots > 1 ? ` (${shots} rounds)` : ''}.`;
    return true;
  };
  const applyGear = () => { gearStats(); revision++; };
  const pathToCell = (worldX: number, worldZ: number): { path: string[]; cost: number; reason: string } | null => {
    if (!mapBounds) return null;
    const t = ctx.world.get(player, Transform); if (!t) return null;
    const cs = world.desc.cellSize;
    const tx = Math.floor(worldX / cs), tz = Math.floor(worldZ / cs);
    const sx = Math.floor(t.x / cs), sz = Math.floor(t.z / cs);
    if (tx === sx && tz === sz) return { path: [], cost: 0, reason: 'You are already there.' };
    if (tx < mapBounds.originX || tz < mapBounds.originZ || tx >= mapBounds.originX + mapBounds.width || tz >= mapBounds.originZ + mapBounds.height) return { path: [], cost: 0, reason: 'Outside the current wing.' };
    const lx = tx - mapBounds.originX, lz = tz - mapBounds.originZ;
    if (mapWalkable[lz * mapBounds.width + lx] !== '1') return { path: [], cost: 0, reason: 'That tile is not walkable.' };
    const occupied = occupiedCells();
    const targetKey = `${tx},${tz}`;
    if (occupied.has(targetKey)) return { path: [], cost: 0, reason: 'Something occupies that tile.' };
    const startKey = `${sx},${sz}`;
    const queue: { x: number; z: number }[] = [{ x: sx, z: sz }];
    const parent = new Map<string, string | null>([[startKey, null]]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const x = current.x + dx, z = current.z + dz;
        const lxx = x - mapBounds.originX, lzz = z - mapBounds.originZ;
        if (lxx < 0 || lzz < 0 || lxx >= mapBounds.width || lzz >= mapBounds.height) continue;
        if (mapWalkable[lzz * mapBounds.width + lxx] !== '1') continue;
        const key = `${x},${z}`;
        if (parent.has(key) || occupied.has(key)) continue;
        parent.set(key, `${current.x},${current.z}`);
        queue.push({ x, z });
      }
    }
    const path: string[] = [];
    let cursor: string | null = targetKey;
    while (cursor && cursor !== startKey) {
      path.push(cursor);
      cursor = parent.get(cursor) ?? null;
    }
    if (cursor !== startKey) return { path: [], cost: 0, reason: 'No route to that tile.' };
    path.reverse();
    return { path, cost: path.length, reason: '' };
  };
  const moveToCell = (worldX: number, worldZ: number): boolean => {
    const route = pathToCell(worldX, worldZ);
    if (!route || !route.path.length) { message = route?.reason ?? 'No route to that tile.'; return false; }
    if (route.cost > ap) { message = `Needs ${route.cost} actions; you have ${ap}.`; return false; }
    const t = ctx.world.get(player, Transform)!;
    const cs = world.desc.cellSize;
    const radius = ctx.world.get(player, Collider)?.radius ?? 0.35;
    let moved = 0;
    for (const key of route.path) {
      if (ap < 1) break;
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      const x = (cx + 0.5) * cs, z = (cz + 0.5) * cs;
      if (!world.isFree(x, z, radius)) { message = 'The route is blocked.'; break; }
      t.prevX = t.x; t.prevZ = t.z; t.x = x; t.z = z;
      spend(1); moved++;
    }
    if (moved > 0) { revealAround(); computeIntents(); revision++; message = `Moved ${moved} tile${moved === 1 ? '' : 's'}.`; }
    return moved > 0;
  };
  const isoHover = (screenX: number, screenY: number): CinderHover | null => {
    const modes = ctx.services.tryGet(ViewModes);
    if (modes?.mode !== 'isometric') return null;
    const point = modes.pickGround(screenX, screenY); if (!point) return null;
    const t = ctx.world.get(player, Transform); if (!t) return null;
    const cs = world.desc.cellSize;
    const tx = Math.floor(point.x / cs), tz = Math.floor(point.z / cs);
    let target: EntityId | undefined;
    for (const id of live) {
      const et = ctx.world.get(id, Transform), health = ctx.world.get(id, Health);
      if (!et || health?.dead) continue;
      if (Math.floor(et.x / cs) === tx && Math.floor(et.z / cs) === tz) { target = id; break; }
    }
    if (target !== undefined) {
      const et = ctx.world.get(target, Transform)!, health = ctx.world.get(target, Health);
      const def = ctx.registries.get(Weapons, inventory.current ?? '');
      if (!def || !health) return null;
      const distance = Math.hypot(et.x - t.x, et.z - t.z);
      const range = typeof def.attack.params['range'] === 'number' ? def.attack.params['range'] : def.attack.behavior === 'core/melee' ? 2.5 : 80;
      const cost = def.slot >= 5 ? 2 : 1;
      const los = world.lineOfSight(t.x, t.z, et.x, et.z);
      if (!los || distance > range || ap < cost) return Object.freeze({ kind: 'blocked' as const, label: 'ATTACK UNAVAILABLE', cost: 0, detail: !los ? 'no line of sight' : distance > range ? `out of range (${Math.ceil(distance)}m)` : `needs ${cost} AP` });
      return Object.freeze({ kind: 'attack' as const, label: `ATTACK · ${def.name}`, cost, detail: `${health.hp} / ${health.max} HP · ${Math.ceil(distance)}m` });
    }
    const route = pathToCell(point.x, point.z);
    if (!route) return null;
    if (!route.path.length) return Object.freeze({ kind: 'blocked' as const, label: 'MOVE', cost: 0, detail: route.reason });
    if (route.cost > ap) return Object.freeze({ kind: 'blocked' as const, label: 'MOVE', cost: 0, detail: `needs ${route.cost} AP` });
    return Object.freeze({ kind: 'move' as const, label: 'MOVE', cost: route.cost, detail: `${route.cost} tile${route.cost === 1 ? '' : 's'}` });
  };
  const handleIsoClick = (worldX: number, worldZ: number): void => {
    if (phase !== 'player' || inventoryOpen || craftingOpen || gridOpen || dialogue) return;
    const t = ctx.world.get(player, Transform); if (!t) return;
    const cs = world.desc.cellSize;
    const tx = Math.floor(worldX / cs), tz = Math.floor(worldZ / cs);
    let target: EntityId | undefined;
    for (const id of live) {
      const et = ctx.world.get(id, Transform), health = ctx.world.get(id, Health);
      if (!et || health?.dead) continue;
      if (Math.floor(et.x / cs) === tx && Math.floor(et.z / cs) === tz) { target = id; break; }
    }
    if (target !== undefined) {
      const et = ctx.world.get(target, Transform)!;
      const def = ctx.registries.get(Weapons, inventory.current ?? '');
      if (!def) return;
      const distance = Math.hypot(et.x - t.x, et.z - t.z);
      const range = typeof def.attack.params['range'] === 'number' ? def.attack.params['range'] : def.attack.behavior === 'core/melee' ? 2.5 : 80;
      if (distance > range) { message = `Target is out of ${def.name} range (${Math.ceil(distance)}m).`; return; }
      if (!world.lineOfSight(t.x, t.z, et.x, et.z)) { message = 'No line of sight to that target.'; return; }
      t.yaw = yawOf(et.x - t.x, et.z - t.z);
      fireWeapon();
      return;
    }
    moveToCell(worldX, worldZ);
  };
  const chooseClass = (id: string) => {
    if (phase !== 'class-select') return;
    const def = classById(id);
    if (!def) return;
    activeClass = def; activeClassId = def.id;
    ctx.world.add(player, PlayerAvatar, { visual: def.avatarVisual, scale: 1, y: 0 });
    const rank = masteryRank(mastery[def.id]), bonus = masteryBonuses(rank);
    maxAp = def.ap; ap = maxAp; round = 1; depth = 1; phase = 'player'; portal = false; kills = 0; offer = 0; offers = Object.freeze([]);
    hp.max = def.maxHealth + legacyRank * 5 + bonus.health; hp.hp = hp.max;
    buffs.classDamage = def.damage + bonus.damage; buffs.classArmor = def.armor + bonus.armor; buffs.classPulse = def.pulse;
    buffs.power = 0; buffs.shell = 0;
    if (def.extraWeapon) {
      const extraDef = ctx.registries.get(Weapons, def.extraWeapon);
      if (extraDef?.ammoType) combat.giveAmmo(player, extraDef.ammoType, Math.max(5, (extraDef.magazineSize ?? 2) * 2));
      grantWeapon(def.extraWeapon);
    }
    for (const item of def.startItems) bag.add(item.id, item.count + (item.id === 'cinder/draught' ? bonus.draughts : 0));
    gearStats();
    runs = attempt; save();
    kit.objectives.record('depths', 1, 'depth-1');
    populate(); computeIntents();
    message = `${def.name} enters the vault on ${currentThreat().name}. WASD moves one tile; Enter ends the turn.`;
    revision++;
  };
  const inventoryConfirm = () => {
    if (!inventoryOpen || phase !== 'player') return;
    if (ap < 1) { message = 'No actions remain. End the turn.'; return; }
    const entries = inventoryEntries();
    if (!entries.length) { message = 'Your pack is empty.'; return; }
    inventoryCursor = Math.max(0, Math.min(inventoryCursor, entries.length - 1));
    const entry = entries[inventoryCursor]!;
    if (entry.source === 'equipment') {
      const result = bag.unequip(entry.equipmentSlot!);
      if (!result.ok) { message = result.reason; return; }
      applyGear(); spend(1); message = `${entry.name} unequipped.`; revision++; return;
    }
    const def = ctx.registries.get(Items, entry.id);
    if (!def) return;
    if (def.slot) {
      const result = bag.equip(entry.id);
      if (!result.ok) { message = result.reason; return; }
      applyGear(); spend(1); message = `${def.name} equipped.`; revision++; return;
    }
    if (CONSUMABLES.has(entry.id)) {
      if (!useConsumable(entry.id)) return;
      spend(1); revision++;
    }
  };
  const resolveCommand = (command: CinderCommand) => {
    if (command.type === 'choose-class') { chooseClass(command.classId); return; }
    if (command.type === 'choose-threat') {
      if (phase !== 'class-select') return;
      selectedThreat = command.threatId as CinderThreatId;
      message = `Vault threat: ${threatById(selectedThreat)?.name ?? selectedThreat}.`;
      revision++; return;
    }
    if (phase !== 'player') return;
    if (command.type === 'choose') {
      if (command.offer !== offer || !offers[command.index]) return;
      const choice = offers[command.index]!;
      let claimed = false;
      if (choice.kind === 'weapon') { if (grantWeapon(choice.id)) { claimed = true; message = `${choice.name} joins your arsenal.`; } }
      else {
        applyRelic(choice.id);
        claimed = true; message = `${choice.name} bound to this run.`;
      }
      if (!claimed || !progression.consumeLevel().ok) return;
      offers = Object.freeze([]); if (progression.pending > 0) draw(); revision++;
    } else if (command.type === 'pulse') {
      if (inventoryOpen || craftingOpen || gridOpen || dialogue) return;
      const t = ctx.world.get(player, Transform)!;
      const targets = [...live].filter(e => { const p = ctx.world.get(e, Transform); return p ? Math.hypot(p.x - t.x, p.z - t.z) <= 9 + 2 * levels.pulse && world.lineOfSight(t.x, t.z, p.x, p.z) : false; });
      if (!targets.length) { message = 'No enemies within pulse range.'; return; }
      if (ap < 1) { message = 'No actions remain.'; return; }
      if (!kit.actions.execute('pulse').ok) { message = 'Ember pulse is recharging.'; return; }
      for (const target of targets) combat.damage({ target, source: player, amount: (35 + 20 * levels.pulse) * (1 + buffs.classPulse), kind: 'cinder-pulse', x: t.x, z: t.z });
      spend(1); computeIntents(); message = 'Ember pulse released.'; revision++;
    } else if (command.type === 'toggle-inventory') {
      if (inventoryOpen) { inventoryOpen = false; message = 'Pack closed.'; }
      else { inventoryOpen = true; craftingOpen = false; gridOpen = false; dialogue = null; activeNpc = undefined; inventoryCursor = 0; message = 'Pack open. TAB filters; X drops; C crafts; I closes.'; }
      revision++;
    } else if (command.type === 'inventory-move') {
      if (!inventoryOpen) return;
      const entries = inventoryEntries();
      if (entries.length) inventoryCursor = (inventoryCursor + command.delta + entries.length) % entries.length;
      revision++;
    } else if (command.type === 'inventory-confirm') {
      inventoryConfirm();
    } else if (command.type === 'inventory-filter') {
      if (!inventoryOpen) return;
      cycleInventoryFilter();
    } else if (command.type === 'inventory-drop') {
      dropInventoryItem();
    } else if (command.type === 'toggle-crafting') {
      if (craftingOpen) { craftingOpen = false; message = 'Forge closed.'; }
      else { craftingOpen = true; inventoryOpen = false; gridOpen = false; dialogue = null; activeNpc = undefined; craftingCursor = 0; message = 'Ember forge open. Up/Down select; Enter craft; C closes.'; }
      revision++;
    } else if (command.type === 'crafting-move') {
      if (!craftingOpen) return;
      const count = recipeViews().length;
      if (count) craftingCursor = (craftingCursor + command.delta + count) % count;
      revision++;
    } else if (command.type === 'crafting-confirm') {
      if (!craftingOpen) return;
      const recipe = recipeViews()[craftingCursor]; if (!recipe) return;
      if (!recipe.canCraft) { message = recipe.reason; return; }
      craftRecipe(recipe.id);
    } else if (command.type === 'craft') {
      craftingOpen = true; craftRecipe(command.recipe);
    } else if (command.type === 'toggle-grid') {
      gridOpen = !gridOpen;
      if (gridOpen) { inventoryOpen = false; craftingOpen = false; dialogue = null; activeNpc = undefined; message = 'Tactical grid open. M closes.'; }
      else message = 'Tactical grid closed.';
      revision++;
    } else if (command.type === 'dialogue-choice') {
      chooseDialogue(command.index);
    } else if (command.type === 'dialogue-close') {
      if (dialogue) { closeDialogue(); message = 'You step away.'; }
    } else if (command.type === 'iso-click') {
      handleIsoClick(command.x, command.z);
    } else if (command.type === 'toggle-help') {
      helpOpen = !helpOpen; hover = null; message = helpOpen ? 'Vault field guide open. H closes.' : 'Field guide closed.'; revision++;
    } else if (command.type === 'end-turn') {
      inventoryOpen = false; craftingOpen = false; gridOpen = false; dialogue = null; activeNpc = undefined;
      beginEnemyTurn();
    }
  };
  const maybeDescend = () => {
    if (phase !== 'player' || !portal || depth >= DEPTHS.length) return false;
    const exit = exitTrigger(), t = ctx.world.get(player, Transform);
    if (!exit || !t || Math.hypot(t.x - exit.x, t.z - exit.z) > exit.radius) return false;
    leaveFloor(); return true;
  };
  const classViews = () => CinderClasses.map(def => {
    const xp = mastery[def.id], rank = masteryRank(xp), next = masteryNext(xp);
    const startingHealth = def.maxHealth + legacyRank * 5 + masteryBonuses(rank).health;
    return Object.freeze({ id: def.id, name: def.name, epithet: def.epithet, description: def.description,
      maxHealth: startingHealth, ap: def.ap, extraWeapon: def.extraWeapon, masteryRank: rank, masteryXp: xp, masteryNext: next });
  });

  ctx.services.get(Interactions).register(ctx, 'cinder/npcs', (actor, pose) => {
    if (phase !== 'player' || dialogue || inventoryOpen || craftingOpen || gridOpen) return [];
    const candidates: { id: string; priority: number; distance: number; use(): void }[] = [];
    for (const id of npcs) {
      const npc = ctx.world.get(id, Npc), t = ctx.world.get(id, Transform);
      if (!npc || !t) continue;
      const distance = Math.hypot(t.x - pose.x, t.z - pose.z);
      if (distance > 3 || !world.lineOfSight(pose.x, pose.z, t.x, t.z)) continue;
      candidates.push({ id: String(id), priority: 0.2, distance, use() { if (actor === player) openDialogue(id); } });
    }
    return candidates;
  });
  // The mode owns discrete actor turns; core autonomous AI is disabled by this service.
  ctx.services.provide(TurnControl, {
    active: true as const,
    get phase() { return phase === 'victory' || phase === 'defeat' ? 'ended' as const : phase; },
    get round() { return round; }, get ap() { return ap; }, get maxAp() { return maxAp; },
  });
  ctx.services.provide(Cinder, { enqueue: command => (phase === 'class-select' || phase === 'player') && queue.enqueue(command), state() {
    syncOwned();
    const bossHp = boss === undefined ? undefined : ctx.world.get(boss, Health);
    const bossDef = boss === undefined ? undefined : ctx.world.get(boss, Enemy);
    const bossName = bossDef ? ctx.registries.get(Enemies, bossDef.def)?.name ?? 'Warden' : '';
    const bossTransform = boss === undefined ? undefined : ctx.world.get(boss, Transform);
    const end = exitTrigger();
    const target = bossHp && !bossHp.dead && bossTransform
      ? Object.freeze({ kind: (depth === DEPTHS.length ? 'keeper' : 'warden') as 'keeper' | 'warden', name: bossName, x: bossTransform.x, z: bossTransform.z })
      : portal && end ? Object.freeze({ kind: 'exit' as const, name: 'The descent', x: end.x, z: end.z }) : null;
    const arsenal = [...owned].map(weaponCard).sort((a, b) => a.slot - b.slot);
    const entries = inventoryEntries();
    inventoryCursor = entries.length ? Math.min(inventoryCursor, entries.length - 1) : 0;
    const recipes = recipeViews();
    craftingCursor = recipes.length ? Math.min(craftingCursor, recipes.length - 1) : 0;
    const selectedMastery = activeClassId ? masteryRank(mastery[activeClassId]) : 0;
    const overlay = helpOpen ? 'help' as const : dialogue ? 'dialogue' as const : gridOpen ? 'grid' as const : craftingOpen ? 'crafting' as const : inventoryOpen ? 'inventory' as const : 'none' as const;
    return Object.freeze({ phase, depth, depths: DEPTHS.length, depthTitle: DEPTHS[depth - 1]!, round, ap, maxAp, intents,
      level: progression.level, xp: progression.xp, xpToNext: progression.xpToNext, health: hp.hp, maxHealth: hp.max,
      embers: kit.resources.get('embers'), cooldown: kit.actions.remaining('pulse'), kills, remaining: live.size, offer, offers,
      arsenal: Object.freeze(arsenal),
      boons: Object.freeze(relics.filter(r => levels[r.id] > 0).map(r => Object.freeze({ ...r, stacks: levels[r.id] }))),
      classId: activeClassId, className: activeClass?.name ?? null, masteryRank: selectedMastery,
      masteryXp: activeClassId ? mastery[activeClassId] : 0, masteryNext: activeClassId ? masteryNext(mastery[activeClassId]) : null,
      classes: Object.freeze(classViews()), threatId: selectedThreat, threatName: currentThreat().name, threats: CinderThreats, highestThreat, hover, helpOpen,
      overlay, inventory: entries, inventoryCapacity: bag.definition.capacity, inventoryOpen, inventoryFilter, inventoryCursor,
      craftingOpen, craftingCursor, recipes, gridOpen, map: mapView(), nearbyNpc: nearestNpc(), dialogue,
      target, boss: bossHp && !bossHp.dead ? Object.freeze({ name: bossName, health: bossHp.hp, max: bossHp.max,
        role: (depth === DEPTHS.length ? 'keeper' : 'warden') as 'keeper' | 'warden', enraged: bossEnraged }) : null,
      portal, legacy, rank: legacyRank, run: attempt, seed: `${ctx.preset.seed}:${attempt}`, profile: profileStatus, message, revision });
  } });

  ctx.events.on(Died, event => {
    if (phase === 'victory' || phase === 'defeat') return;
    if (event.entity === player) { finish(false); return; }
    if (!live.delete(event.entity)) return;
    const enemy = ctx.world.get(event.entity, Enemy);
    const def = enemy ? ctx.registries.get(Enemies, enemy.def) : undefined;
    kills++;
    kit.resources.transact({ gain: { embers: 3 + levels.bounty * 2 + buffs.emberBonus } }, 'slain');
    const gain = progression.grant(Math.max(4, Math.round((def?.score ?? 50) / 10)));
    if (gain.ok && gain.levels > 0) {
      hp.max += gain.levels * 5; healPlayer(gain.levels * 6);
      if (!offers.length) draw();
      message = `LEVEL ${progression.level} — choose a boon with 7, 8 or 9.`;
    }
    const elite = ctx.world.get(event.entity, Elite);
    if (event.source === player) {
      const heal = levels.siphon * 4 + buffs.lifesteal;
      if (heal > 0) healPlayer(heal);
      if (levels.warpath > 0 && phase === 'player') { ap = Math.min(maxAp, ap + levels.warpath); if (ap > 0) endRequested = false; message = 'Warpath grants an extra action.'; }
    }
    if (elite?.volatile) {
      const e = ctx.world.get(event.entity, Transform), p = ctx.world.get(player, Transform);
      if (e && p && Math.hypot(e.x - p.x, e.z - p.z) <= 3.2) {
        combat.damage({ target: player, source: 0, amount: elite.volatile, kind: 'elite-detonation', x: e.x, z: e.z });
        ctx.events.emit(Impact, { x: e.x, z: e.z, y: 0.8, nx: 0, nz: 0, target: player, effect: 'fx-fireball', sound: 'explosion-small' });
        message = 'The Emberbound elite detonates.';
      }
    }
    dropLoot(def?.score ?? 50);
    if (elite || (levels.shardfinder > 0 && (def?.score ?? 0) >= 500)) addLoot('cinder/ember-shard', 'Elite shard');
    if (event.entity === boss) {
      portal = true;
      message = depth === DEPTHS.length ? 'The keeper falls. The vault is yours.' : 'The warden falls. The descent is open.';
      if (depth === DEPTHS.length) finish(true);
    }
    computeIntents();
    revision++;
  });

  // Turn controller: free look, one-tile movement, one-shot attack input and end-turn.
  ctx.systems.add({ id: 'cinder/game.control', phase: 'control', update() {
    const tick = input.tick;
    ctx.world.each(Player, (e) => {
      const intent = ctx.world.get(e, Intent); const t = ctx.world.get(e, Transform);
      if (!intent || !t) return;
      intent.moveX = 0; intent.moveZ = 0; intent.fire = false; intent.firePressed = false; intent.use = false; intent.reload = false;
      intent.weaponSlot = 0; intent.weaponCycle = 0;
      if (phase === 'class-select') {
        hover = null;
        for (let i = 0; i < 3; i++) if (tick.pressed(`cinder/class-${i + 1}`)) queue.enqueue({ type: 'choose-class', classId: CinderClasses[i]!.id });
        for (let i = 0; i < CinderThreats.length; i++) if (tick.pressed(`cinder/boon-${i + 1}`)) queue.enqueue({ type: 'choose-threat', threatId: CinderThreats[i]!.id });
        return;
      }
      if (phase !== 'player') return;
      hover = null;
      t.yaw -= tick.lookX * (settings?.lookSensitivity ?? 0.0024);
      if (tick.pressed('cinder/help')) { queue.enqueue({ type: 'toggle-help' }); return; }
      if (helpOpen) return;
      if (dialogue) {
        if (tick.pressed('core/use')) queue.enqueue({ type: 'dialogue-close' });
        for (let i = 0; i < 4; i++) if (tick.pressed(`cinder/dialogue-${i + 1}`)) queue.enqueue({ type: 'dialogue-choice', index: i });
        return;
      }
      if (gridOpen) {
        if (tick.pressed('cinder/grid')) queue.enqueue({ type: 'toggle-grid' });
        return;
      }
      if (craftingOpen) {
        if (tick.pressed('cinder/crafting')) queue.enqueue({ type: 'toggle-crafting' });
        else if (tick.pressed('cinder/inventory')) queue.enqueue({ type: 'toggle-inventory' });
        else if (tick.pressed('cinder/grid')) queue.enqueue({ type: 'toggle-grid' });
        else if (tick.pressed('cinder/inventory-up')) queue.enqueue({ type: 'crafting-move', delta: -1 });
        else if (tick.pressed('cinder/inventory-down')) queue.enqueue({ type: 'crafting-move', delta: 1 });
        else if (tick.pressed('cinder/end-turn')) queue.enqueue({ type: 'crafting-confirm' });
        return;
      }
      if (inventoryOpen) {
        if (tick.pressed('cinder/inventory')) queue.enqueue({ type: 'toggle-inventory' });
        else if (tick.pressed('cinder/crafting')) queue.enqueue({ type: 'toggle-crafting' });
        else if (tick.pressed('cinder/grid')) queue.enqueue({ type: 'toggle-grid' });
        else if (tick.pressed('cinder/inventory-filter')) queue.enqueue({ type: 'inventory-filter' });
        else if (tick.pressed('cinder/inventory-drop')) queue.enqueue({ type: 'inventory-drop' });
        else if (tick.pressed('cinder/inventory-up')) queue.enqueue({ type: 'inventory-move', delta: -1 });
        else if (tick.pressed('cinder/inventory-down')) queue.enqueue({ type: 'inventory-move', delta: 1 });
        else if (tick.pressed('cinder/end-turn')) queue.enqueue({ type: 'inventory-confirm' });
        return;
      }
      if (tick.pressed('cinder/inventory')) { queue.enqueue({ type: 'toggle-inventory' }); return; }
      if (tick.pressed('cinder/crafting')) { queue.enqueue({ type: 'toggle-crafting' }); return; }
      if (tick.pressed('cinder/grid')) { queue.enqueue({ type: 'toggle-grid' }); return; }
      const modes = ctx.services.tryGet(ViewModes);
      if (modes?.mode === 'isometric') {
        const pointer = input.tick.pointer;
        hover = pointer?.inside ? isoHover(pointer.x, pointer.y) : null;
      }
      if (modes?.mode === 'isometric' && tick.pressed('cinder/iso-click')) {
        const pointer = input.tick.pointer;
        if (pointer?.inside) {
          const point = modes.pickGround(pointer.x, pointer.y);
          if (point) queue.enqueue({ type: 'iso-click', x: point.x, z: point.z });
        }
        return;
      }
      if (tick.pressed('core/use')) { intent.use = true; return; }
      if (tick.pressed('cinder/end-turn')) { queue.enqueue({ type: 'end-turn' }); return; }
      if (tick.pressed('cinder/boon-1')) queue.enqueue({ type: 'choose', index: 0, offer });
      else if (tick.pressed('cinder/boon-2')) queue.enqueue({ type: 'choose', index: 1, offer });
      else if (tick.pressed('cinder/boon-3')) queue.enqueue({ type: 'choose', index: 2, offer });
      else if (tick.pressed('cinder/pulse')) queue.enqueue({ type: 'pulse' });
      let wanted: string | undefined;
      for (let slot = 1; slot <= 6; slot++) if (tick.pressed(`core/weapon-${slot}`)) wanted = inventory.weapons.find(id => ctx.registries.get(Weapons, id)?.slot === slot);
      if (tick.pressed('core/weapon-next') || tick.pressed('core/weapon-prev')) {
        const order = [...inventory.weapons].sort((a, b) => (ctx.registries.get(Weapons, a)?.slot ?? 0) - (ctx.registries.get(Weapons, b)?.slot ?? 0));
        if (order.length > 1) {
          const index = Math.max(0, order.indexOf(inventory.current ?? ''));
          wanted = order[(index + (tick.pressed('core/weapon-next') ? 1 : order.length - 1)) % order.length];
        }
      }
      if (wanted && wanted !== inventory.current) {
        inventory.current = wanted; inventory.switchedAt = ctx.time.now;
        const runtime = ctx.world.get(e, WeaponRuntime); if (runtime) runtime.reload = null;
        message = `${ctx.registries.get(Weapons, wanted)?.name ?? wanted} ready.`; revision++; return;
      }
      const current = inventory.current ? ctx.registries.get(Weapons, inventory.current) : undefined;
      if (tick.pressed('core/fire') && current) { fireWeapon(); return; }
      if (tick.pressed('core/reload') && current && current.magazineSize !== undefined) {
        const runtime = ctx.world.get(e, WeaponRuntime);
        const loaded = runtime?.loaded[inventory.current!] ?? 0;
        const reserve = inventory.ammo[current.ammoType] ?? 0;
        if (runtime && loaded < current.magazineSize && reserve > 0 && ap > 0) {
          const amount = Math.min(current.magazineSize - loaded, reserve);
          runtime.loaded[inventory.current!] = loaded + amount; inventory.ammo[current.ammoType] = reserve - amount; runtime.reload = null;
          spend(1); message = `Reloaded ${current.name}.`; revision++; computeIntents();
        } else message = 'Nothing to reload.';
        return;
      }
      const forward = tick.pressed('core/move-forward') ? 1 : tick.pressed('core/move-back') ? -1 : 0;
      const strafe = tick.pressed('core/strafe-right') ? 1 : tick.pressed('core/strafe-left') ? -1 : 0;
      // One cardinal tile per press; forward takes precedence over simultaneous strafe.
      const straight = forward !== 0 ? forward : 0;
      const side = straight === 0 ? strafe : 0;
      if ((!straight && !side) || ap < 1) return;
      // In isometric mode WASD is camera-relative; in first person it follows the player's facing.
      const movementYaw = modes?.mode === 'isometric' ? modes.yaw : t.yaw;
      const fx = yawDirX(movementYaw), fz = yawDirZ(movementYaw);
      const f = Math.abs(fx) >= Math.abs(fz) ? { x: Math.sign(fx), z: 0 } : { x: 0, z: Math.sign(fz) };
      const r = { x: -f.z, z: f.x };
      const dir = { x: f.x * straight + r.x * side, z: f.z * straight + r.z * side };
      const cs = world.desc.cellSize;
      const target = cellOf(t.x + dir.x * cs, t.z + dir.z * cs);
      const occupied = occupiedCells(); occupied.delete(`${Math.floor(t.x / cs)},${Math.floor(t.z / cs)}`);
      if (occupied.has(`${target.cx},${target.cz}`) || !world.isFree(target.x, target.z, ctx.world.get(e, Collider)?.radius ?? 0.35)) { message = 'Something blocks the way.'; return; }
      t.prevX = t.x; t.prevZ = t.z; t.x = target.x; t.z = target.z;
      revealAround(); spend(1); computeIntents(); revision++; message = 'You step through the vault.';
    });
  } });

  ctx.systems.add({ id: 'cinder/game.run', phase: 'rules', update() {
    if (flow.ended) return;
    const cinder = ctx.services.tryGet(SessionControl);
    if (cinder?.playing === false) { queue.clear(); return; }
    syncOwned();
    const command = queue.drainOne();
    if (command) resolveCommand(command);
    if (!bossEnraged && boss !== undefined) {
      const bossHp = ctx.world.get(boss, Health);
      if (bossHp && !bossHp.dead && bossHp.hp <= bossHp.max * 0.5) {
        bossEnraged = true; message = `${depth === DEPTHS.length ? 'The Cinder Keeper' : 'The Ash Warden'} is enraged.`; revision++;
      }
    }
    if (phase === 'player' && maybeDescend()) { /* next depth loaded */ }
    else if (phase === 'player' && (endRequested || ap <= 0)) beginEnemyTurn();
    else if (phase === 'enemy' && !enemyActed && ctx.time.now >= enemyActAt) executeEnemyTurn();
    else if (phase === 'enemy' && enemyActed && ctx.time.now >= enemyResumeAt) startPlayerTurn();
    if (phase === 'player' || phase === 'enemy') {
      flow.setObjective(phase === 'enemy' ? 'Enemies act.' : portal ? 'The descent is open — step onto the glowing pad.' : `Defeat ${depth === DEPTHS.length ? 'the Cinder Keeper' : 'the Ash Warden'}.`);
      flow.setStatus('depth', 'Depth', `${depth} / ${DEPTHS.length}`);
      flow.setStatus('round', 'Round', String(round));
      flow.setStatus('ap', 'Actions', `${ap} / ${maxAp}`);
      flow.setStatus('level', 'Level', String(progression.level));
      flow.setStatus('xp', 'Experience', `${progression.xp} / ${progression.xpToNext}`);
      flow.setStatus('remaining', 'Souls', String(live.size));
      flow.setStatus('embers', 'Embers', String(kit.resources.get('embers')));
    }
  } });
}

export default definePlugin({ register(ctx) {
  ctx.register(AiBehaviors, 'cinder/manual', {
    description: 'Cinder manual-turn metadata. Autonomous movement is disabled; actions/supportHeal describe enemy turn behavior.',
    validateParams(p, r) {
      for (const key of Object.keys(p)) if (!['actions', 'supportHeal', 'preferredRange'].includes(key)) r.at(key).error('unknown parameter. Supported: actions, supportHeal, preferredRange');
      if (p['actions'] !== undefined && (typeof p['actions'] !== 'number' || !Number.isInteger(p['actions']) || p['actions'] < 1 || p['actions'] > 3)) r.at('actions').error('must be an integer from 1 to 3.');
      if (p['supportHeal'] !== undefined && (typeof p['supportHeal'] !== 'number' || !Number.isFinite(p['supportHeal']) || p['supportHeal'] < 0 || p['supportHeal'] > 100)) r.at('supportHeal').error('must be a number from 0 to 100.');
      if (p['preferredRange'] !== undefined && (typeof p['preferredRange'] !== 'number' || !Number.isFinite(p['preferredRange']) || p['preferredRange'] < 1 || p['preferredRange'] > 100)) r.at('preferredRange').error('must be a number from 1 to 100.');
    },
    start: () => () => {},
  });
  ctx.register(Prefabs, 'cinder/npc', {
    description: 'A friendly Cinder NPC with dialogue and a role-specific service.',
    start(owner) {
      return (at, params) => {
        const role: NpcRole = params['role'] === 'cartographer' ? 'cartographer' : params['role'] === 'oracle' ? 'oracle' : 'smith';
        const def = NPC_DEFS[role];
        const e = owner.world.create();
        owner.world.add(e, Transform, makeTransform(at.x, at.z, at.yaw));
        owner.world.add(e, Visual, { key: def.visual, state: 'idle', stateAt: owner.time.now, y: 0, scale: 1, tint: role === 'oracle' ? '#d8b4ff' : '', renderer: '' });
        owner.world.add(e, Npc, { role, name: def.name, title: def.title, portrait: def.portrait, healed: false, revealed: false, bloodPact: false, traded: false, line: def.line });
        return e;
      };
    },
  });
  ctx.provideRole(ExperienceRole, 'cinder/experience', {
    name: 'Cinder Vault', description: 'A turn-based three-depth dungeon roguelite with classes, loot and persistent mastery.', pointer: 'free',
    controls: [
      ['WASD / mouse', 'Step / aim'], ['Click / Space', 'Attack (1 AP; heavy 2 AP)'], ['Enter', 'End turn'],
      ['E', 'Talk / interact'], ['I', 'Open pack'], ['TAB · DEL · C', 'Filter · drop · craft'], ['M', 'Tactical grid'], ['O', 'Toggle isometric view'], ['Z / X', 'Rotate isometric camera'],
      ['↑ / ↓ · Enter', 'Select · use / equip'], ['R', 'Reload (1 AP)'], ['1–6', 'Switch weapon'],
      ['V', 'Pulse (1 AP)'], ['7 / 8 / 9', 'Choose level boon / threat'], ['1 / 2 / 3 (start)', 'Choose class'], ['1–4', 'Dialogue option'], ['H', 'Field guide'],
    ],
  });
  ctx.provideRole(ControllerRole, 'cinder/turn-controller', {
    name: 'Cinder turn controller', description: 'One-tile steps, free aim and action-point turns owned by the mode.',
    activate() {},
  });
  ctx.register(DamageModifiers, 'cinder/relics', { description: 'Class, gear and boon damage/armor modifiers.', order: -20,
    start: owner => (req, amount) => {
      const source = owner.world.get(req.source, Buffs), target = owner.world.get(req.target, Buffs);
      const elite = owner.world.get(req.target, Elite), health = owner.world.get(req.target, Health);
      if (target && req.source !== 0 && !owner.world.isAlive(req.source)) return 0;
      const execute = source && health && health.hp < health.max * 0.5 ? source.execute : 0;
      const boost = source ? 1 + source.power * .25 + source.classDamage + source.gearDamage + execute : 1;
      const reduction = target ? Math.min(.75, target.shell * .12 + target.classArmor + target.gearArmor + (elite?.armor ?? 0)) : 0;
      return amount * boost * (1 - reduction);
    } });
  for (const [id, key, label] of [['pulse', 'KeyV', 'Ember pulse'], ['boon-1', 'Digit7', 'Choose boon 1'], ['boon-2', 'Digit8', 'Choose boon 2'], ['boon-3', 'Digit9', 'Choose boon 3'],
    ['end-turn', 'Enter', 'End turn'], ['inventory', 'KeyI', 'Inventory'], ['inventory-up', 'ArrowUp', 'Inventory previous'], ['inventory-down', 'ArrowDown', 'Inventory next'],
    ['inventory-filter', 'Tab', 'Cycle pack filter'], ['inventory-drop', 'Delete', 'Drop selected item'], ['grid', 'KeyM', 'Toggle tactical grid'], ['crafting', 'KeyC', 'Toggle crafting'],
    ['iso-click', 'Mouse0', 'Isometric move/attack'], ['help', 'KeyH', 'Field guide'],
    ['class-1', 'Digit1', 'Choose class 1'], ['class-2', 'Digit2', 'Choose class 2'], ['class-3', 'Digit3', 'Choose class 3'],
    ['dialogue-1', 'Digit1', 'Dialogue option 1'], ['dialogue-2', 'Digit2', 'Dialogue option 2'], ['dialogue-3', 'Digit3', 'Dialogue option 3'], ['dialogue-4', 'Digit4', 'Dialogue option 4']] as const)
    ctx.register(InputActions, `cinder/${id}`, { label, keys: [key] });
  ctx.provideRole(ModeRole, 'cinder/vault', { name: 'Cinder Vault', description: 'A turn-based three-depth dungeon roguelite with classes, loot and persistent mastery.', activate: run });
  ctx.addValidator(v => {
    if (v.selectedRole(ModeRole) !== 'cinder/vault') return;
    const map = v.registries.get(Maps, String(v.preset.options['map']));
    const r = v.reporter('preset', 'options.map');
    if (!map) { r.error('select the cinder/vault dungeon map.'); return; }
    for (let depth = 1; depth <= DEPTHS.length; depth++) {
      const tagged = map.world.spawns.filter(s => s.tags.includes(`dungeon-depth-${depth}`));
      for (const role of ['start', 'warden', 'exit']) if (!tagged.some(s => s.tags.includes(`dungeon-role-${role}`))) r.error(`depth ${depth} needs a dungeon-role-${role} marker.`);
      if (tagged.filter(s => s.tags.includes('dungeon-role-loot')).length < 2) r.error(`depth ${depth} needs at least two loot rooms.`);
      if (!map.world.triggers.some(t => t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depth}`))) r.error(`depth ${depth} needs a dungeon-exit zone.`);
    }
    for (const id of ['cinder/thrall', 'cinder/imp', 'cinder/hound', 'cinder/acolyte', 'cinder/brute', 'cinder/warden', 'cinder/keeper']) if (!v.registries.has(Enemies, id)) r.error(`missing enemy ${id}.`);
    for (const id of ['cinder/medkit', 'cinder/rounds-cache', 'cinder/sparks-cache']) if (!v.registries.has(Pickups, id)) r.error(`missing pickup ${id}.`);
    for (const weapon of cinderArsenal) if (!v.registries.has(Weapons, weapon.id)) r.error(`missing weapon ${weapon.id}.`);
    for (const item of ['cinder/draught', 'cinder/ember-flask', 'cinder/ember-tonic', 'cinder/shard-bomb', 'cinder/ashplate', 'cinder/iron-band', 'cinder/warden-plate', 'cinder/oracle-lens', 'cinder/hunters-charm', 'cinder/obsidian-edge', 'cinder/gilded-chain', 'cinder/ember-shard'])
      if (!v.registries.has(Items, item)) r.error(`missing item ${item}.`);
    if (!v.registries.has(MechanicKits, 'cinder/kit')) r.error('missing cinder/kit.');
    for (const role of [ProgressionMechanicRole, InventoryMechanicRole, CraftingMechanicRole]) {
      const selected = v.selectedRole(role);
      const providers = role.id === ProgressionMechanicRole.id ? ProgressionProviders : role.id === InventoryMechanicRole.id ? InventoryProviders : CraftingProviders;
      if (!selected || !v.registries.has(providers, selected)) r.error(`select a ${role.id} provider with a matching factory.`);
    }
    if (!v.registries.has(Prefabs, 'core/player')) r.error('enable core/player.');
  });
} });
