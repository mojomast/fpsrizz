import type {
  CapabilityState,
  MetroBossView,
  MetroCheckpoint,
  MetroCommand,
  MetroDoor,
  MetroEffectView,
  MetroEnemyType,
  MetroEnemyView,
  MetroInventoryView,
  MetroNpcSpawn,
  MetroPickupSpawn,
  MetroRoom,
  MetroState,
  MetroStatus,
  MetroWorld,
  PlatformerBody,
  RoomMapDefinition,
  RoomMapHandle,
  SessionContext,
} from '../../sdk/index.ts';
import {
  CapabilityRole,
  ExperienceRole,
  Flow,
  Input,
  InputActions,
  Items,
  Metroidvania,
  MetroidvaniaWorlds,
  PlatformerRole,
  Profile,
  RoomMapRole,
  SessionControl,
  ThemeRole,
  capabilityMechanic,
  createCommandQueue,
  createPlatformerBody,
  definePlugin,
  inventoryMechanic,
  isObject,
  platformerMechanic,
  roomMapMechanic,
} from '../../sdk/index.ts';
import { loadWorld } from './validation.ts';

const SAVE_KEY = 'hollowmere/save.v1';
const PACK_ID = 'hollowmere/pack';
const MAP_ID = 'hollowmere/map';
const ABILITY_ID = 'hollowmere/abilities';
const MAX_SAVE = 200000;

type Rect = { x: number; y: number; w: number; h: number };
type EnemyRuntime = {
  id: string;
  spawnId: string;
  def: MetroEnemyType;
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  health: number; maxHealth: number;
  facing: 1 | -1;
  state: MetroEnemyView['state'];
  timer: number; cooldown: number; hurt: number;
  patrolOrigin: number; patrol: number;
  elite: boolean;
  phase: number;
};
type ProjectileRuntime = { id: string; x: number; y: number; vx: number; vy: number; kind: 'bolt' | 'enemy'; life: number; damage: number };
type EffectRuntime = MetroEffectView & { age: number };
type CheckpointRuntime = MetroCheckpoint & { roomId: string };
type SaveData = Readonly<{
  schema: 1; world: string; room: string; checkpoint: Readonly<{ id: string; room: string; x: number; y: number }>;
  abilities: readonly string[]; items: readonly { id: string; count: number }[]; collected: readonly string[];
  flags: readonly string[]; embers: number; maxHealth: number; maxFocus: number; swordLevel: number;
  kills: number; deaths: number; playTime: number; map: Readonly<{ visited: readonly string[]; revealed: readonly string[] }>;
}>;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const distance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);
const id = (prefix: string, index: number): string => `${prefix}-${index}`;

function effect(idValue: string, kind: MetroEffectView['kind'], x: number, y: number, life = 0.28, text?: string, color?: string): EffectRuntime {
  return { id: idValue, kind, x, y, age: 0, life, ...(text ? { text } : {}), ...(color ? { color } : {}) };
}

function parseSave(value: unknown, worldId: string): SaveData | undefined {
  if (!isObject(value) || value['schema'] !== 1 || value['world'] !== worldId || typeof value['room'] !== 'string') return undefined;
  const checkpoint = value['checkpoint'];
  if (!isObject(checkpoint) || typeof checkpoint['id'] !== 'string' || typeof checkpoint['room'] !== 'string'
    || typeof checkpoint['x'] !== 'number' || typeof checkpoint['y'] !== 'number') return undefined;
  const items = value['items'];
  if (!Array.isArray(items) || items.some(item => !isObject(item) || typeof item['id'] !== 'string' || typeof item['count'] !== 'number' || !Number.isSafeInteger(item['count']) || item['count'] < 1)) return undefined;
  const stringArray = (field: string): readonly string[] | undefined => {
    const raw = value[field];
    return Array.isArray(raw) && raw.length <= 512 && raw.every(entry => typeof entry === 'string' && entry.length <= 128) ? raw : undefined;
  };
  const abilities = stringArray('abilities'), collected = stringArray('collected'), flags = stringArray('flags');
  const map = value['map'];
  const nestedArray = (source: unknown, field: string): readonly string[] | undefined => {
    if (!isObject(source)) return undefined;
    const raw = source[field];
    return Array.isArray(raw) && raw.length <= 512 && raw.every(entry => typeof entry === 'string' && entry.length <= 128) ? raw : undefined;
  };
  const visited = nestedArray(map, 'visited'), revealed = nestedArray(map, 'revealed');
  if (!abilities || !collected || !flags || !visited || !revealed) return undefined;
  const numbers = ['embers', 'maxHealth', 'maxFocus', 'swordLevel', 'kills', 'deaths', 'playTime'] as const;
  if (numbers.some(field => typeof value[field] !== 'number' || !Number.isFinite(value[field]) || value[field] < 0 || value[field] > 10000000)) return undefined;
  return Object.freeze({
    schema: 1, world: worldId, room: value['room'],
    checkpoint: Object.freeze({ id: checkpoint['id'], room: checkpoint['room'], x: checkpoint['x'], y: checkpoint['y'] }),
    abilities: Object.freeze([...abilities]), items: Object.freeze(items.map(item => Object.freeze({ id: item['id'] as string, count: item['count'] as number }))),
    collected: Object.freeze([...collected]), flags: Object.freeze([...flags]), embers: value['embers'] as number,
    maxHealth: value['maxHealth'] as number, maxFocus: value['maxFocus'] as number, swordLevel: value['swordLevel'] as number,
    kills: value['kills'] as number, deaths: value['deaths'] as number, playTime: value['playTime'] as number,
    map: Object.freeze({ visited: Object.freeze([...visited]), revealed: Object.freeze([...revealed]) }),
  });
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'hollowmere/ascent', {
      name: 'Hollowmere',
      description: 'A hand-painted side-scrolling metroidvania. Explore, fight, unlock movement and break the crown.',
      pointer: 'free',
      controls: [
        ['A / D or ← / →', 'Move'], ['Space', 'Jump / double jump'], ['J', 'Saber combo'],
        ['K', 'Dash'], ['L', 'Lantern Bolt'], ['W / S', 'Aim up / down'], ['E', 'Interact'],
        ['Esc / P', 'Pause menu'], ['M', 'World map'], ['1–5', 'Pause tabs'],
      ],
    });
    ctx.contentKind('metroidvania-world', {
      description: 'An interconnected side-scrolling room graph with abilities, enemies, checkpoints and world-map regions.',
      load(data, c) { loadWorld(data, c); },
    });
    for (const [action, keys, label] of [
      ['left', ['KeyA', 'ArrowLeft'], 'Move left'], ['right', ['KeyD', 'ArrowRight'], 'Move right'],
      ['up', ['KeyW', 'ArrowUp'], 'Aim up'], ['down', ['KeyS', 'ArrowDown'], 'Aim down'],
      ['jump', ['Space', 'KeyZ'], 'Jump / double jump'], ['attack', ['KeyJ', 'Mouse0'], 'Saber'],
      ['dash', ['KeyK', 'ShiftLeft'], 'Dash'], ['bolt', ['KeyL'], 'Lantern Bolt'], ['interact', ['KeyE'], 'Interact'],
      ['pause', ['KeyP'], 'Pause menu'], ['map', ['KeyM'], 'World map'],
    ] as const) ctx.register(InputActions, `hollowmere/${action}`, { label, keys: [...keys] });
    ctx.addValidator(v => {
      const worldId = v.preset.options['world'];
      const r = v.reporter('hollowmere/game', 'options.world');
      if (typeof worldId !== 'string' || !v.registries.has(MetroidvaniaWorlds, worldId)) r.error('select an enabled metroidvania world');
      if (v.selectedRole(ExperienceRole) !== 'hollowmere/ascent') v.reporter('hollowmere/game', 'roles.sdk/experience').error('select hollowmere/ascent');
      for (const role of [PlatformerRole, CapabilityRole, RoomMapRole]) {
        if (!v.selectedRole(role)) v.reporter('hollowmere/game', `roles.${role.id}`).error('select a provider');
      }
      const selectedInventory = v.selectedRole({ id: 'sdk/mechanic-inventory' } as never);
      if (!selectedInventory) v.reporter('hollowmere/game', 'roles.sdk/mechanic-inventory').error('select an inventory provider');
      const world = typeof worldId === 'string' ? v.registries.get(MetroidvaniaWorlds, worldId) : undefined;
      if (world) {
        for (const [roomIndex, room] of world.rooms.entries()) {
          for (const [pickupIndex, pickup] of room.pickups.entries()) {
            if (pickup.kind === 'item' && pickup.key && !v.registries.has(Items, pickup.key))
              v.reporter('hollowmere/game', `world.rooms[${roomIndex}].pickups[${pickupIndex}].key`).error(`missing item "${pickup.key}"`);
          }
          for (const [doorIndex, door] of room.doors.entries()) {
            if (door.requiresItems?.some(item => !v.registries.has(Items, item)))
              v.reporter('hollowmere/game', `world.rooms[${roomIndex}].doors[${doorIndex}].requiresItems`).error('door requires an unknown item');
          }
        }
      }
    });
  },
  activate(ctx) {
    const world = ctx.registries.require(MetroidvaniaWorlds, String(ctx.preset.options['world']));
    const input = ctx.services.get(Input);
    const flow = ctx.services.get(Flow);
    const profile = ctx.services.tryGet(Profile);
    const roomById = new Map(world.rooms.map(room => [room.id, room]));
    const regionById = new Map(world.regions.map(region => [region.id, region]));
    const abilityById = new Map(world.abilities.map(ability => [ability.id, ability]));
    const enemyById = new Map(world.enemies.map(enemy => [enemy.id, enemy]));
    const mapDefinition: RoomMapDefinition = {
      id: `${world.id}-map`, name: world.name, start: world.startRoom,
      rooms: world.rooms.map(room => ({ id: room.id, name: room.name, region: room.region, map: room.map })),
      links: world.rooms.flatMap(room => room.doors.map(door => ({ from: room.id, to: door.to }))),
    };
    const makeMap = (): RoomMapHandle => roomMapMechanic(ctx).create(ctx, MAP_ID, mapDefinition);
    const abilityDefinitions = world.abilities.map(ability => ({ id: ability.id, label: ability.name, description: ability.description, kind: ability.kind }));
    const makeCapabilities = () => capabilityMechanic(ctx).create(ctx, ABILITY_ID, abilityDefinitions);
    let roomMap: RoomMapHandle = makeMap();
    let capabilities = makeCapabilities();
    const bag = inventoryMechanic(ctx).create(ctx, PACK_ID, { capacity: 20, equipmentSlots: [] });
    const platform = platformerMechanic(ctx).create({
      runSpeed: 7.2, groundAcceleration: 58, groundFriction: 48, airAcceleration: 34,
      gravity: 34, jumpSpeed: 13.2, doubleJumpSpeed: 11.8, dashSpeed: 16, dashDuration: 0.16,
      dashCooldown: 0.72, wallSlideSpeed: 3.2, wallJumpX: 8.4, wallJumpY: 11.4,
    });
    const player: PlatformerBody = createPlatformerBody(3, 16, 0.8, 1.9);
    const startingCheckpoint = (): CheckpointRuntime => {
      const room = roomById.get(world.startRoom)!;
      const checkpoint = room.checkpoints[0];
      return checkpoint ? { ...checkpoint, roomId: room.id } : { id: 'start', name: 'Mossgate Threshold', x: 3, y: 16, roomId: room.id };
    };
    let roomId = world.startRoom;
    let checkpoint: CheckpointRuntime = startingCheckpoint();
    let status: MetroStatus = 'playing';
    let revision = 0, playTime = 0, deathTimer = 0;
    let health = 100, maxHealth = 100, focus = 50, maxFocus = 50, swordLevel = 0, embers = 0;
    let kills = 0, deaths = 0;
    let message = world.intro;
    let enemies: EnemyRuntime[] = [];
    let projectiles: ProjectileRuntime[] = [];
    let effects: EffectRuntime[] = [];
    let dialogue: MetroState['dialogue'] = null;
    type MutableNpc = Omit<MetroNpcSpawn, 'line'> & { line: string };
    let dialogueNpc: MutableNpc | undefined;
    let attackTime = 0, attackCooldown = 0, comboWindow = 0, comboIndex = 0;
    let attackKind: 'none' | 'side' | 'up' | 'down' = 'none';
    let attackHits = new Set<string>();
    let invulnerable = 0;
    let doorCooldown = 0;
    const collected = new Set<string>();
    const flags = new Set<string>();
    let started = false, saveStatus = profile ? 'Checkpoint save available' : 'Session only';
    let pendingItems: readonly { id: string; count: number }[] = [];
    const queue = createCommandQueue<MetroCommand>(ctx, { capacity: 32, normalize(value) {
      if (!isObject(value)) return undefined;
      const type = value['type'];
      if (type === 'set-paused') return typeof value['paused'] === 'boolean' ? { type, paused: value['paused'] } : undefined;
      if (type === 'use-item' || type === 'dialogue-choice') return Number.isInteger(value['index']) && typeof value['index'] === 'number' && value['index'] >= 0 && value['index'] < 20 ? { type, index: value['index'] } : undefined;
      if (type === 'restart' || type === 'dialogue-close') return { type };
      return undefined;
    } });

    const room = (): MetroRoom => roomById.get(roomId)!;
    const region = () => regionById.get(room().region)!;
    const tile = (x: number, y: number): string => {
      const r = room();
      if (x < 0 || y < 0 || y >= r.rows.length || x >= (r.rows[y]?.length ?? 0)) return '#';
      return r.rows[y]![x]!;
    };
    const collision = (x: number, y: number, w: number, h: number): 'empty' | 'solid' | 'oneway' => {
      const x0 = Math.floor(x), x1 = Math.floor(x + w - 0.0001), y0 = Math.floor(y), y1 = Math.floor(y + h - 0.0001);
      let oneway = false;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const t = tile(cx, cy);
        if (t === '#') return 'solid';
        if (t === '=') oneway = true;
      }
      return oneway ? 'oneway' : 'empty';
    };
    const hazard = (x: number, y: number, w: number, h: number): boolean => {
      const x0 = Math.floor(x), x1 = Math.floor(x + w - 0.0001), y0 = Math.floor(y), y1 = Math.floor(y + h - 0.0001);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (tile(cx, cy) === '^') return true;
      return false;
    };
    const playerAbilities = () => ({
      doubleJump: capabilities.has('double-jump'),
      dash: capabilities.has('dash'),
      wallJump: capabilities.has('wall-cling'),
    });
    const sigilIds = () => ['hollowmere/sun-sigil-moss', 'hollowmere/sun-sigil-tide', 'hollowmere/sun-sigil-ember'].filter(item => bag.count(item) > 0);
    const currentCheckpointView = (): readonly (MetroCheckpoint & { activated: boolean })[] => room().checkpoints.map(entry => ({ ...entry, activated: checkpoint.id === entry.id }));
    const inventoryView = (): readonly MetroInventoryView[] => bag.slots().map(slot => {
      const def = ctx.registries.get(Items, slot.item);
      return Object.freeze({
        id: slot.item, name: def?.name ?? slot.item, description: def?.description ?? '',
        icon: def?.icon ?? 'assetrizz/hollow-icon-lore.png', rarity: def?.rarity ?? 'common',
        count: slot.count, usable: slot.item === 'hollowmere/moss-tonic' || slot.item === 'hollowmere/focus-draught',
      });
    });
    const enemyView = (enemy: EnemyRuntime): MetroEnemyView => Object.freeze({
      id: enemy.spawnId, type: enemy.def.id, name: enemy.def.name, kind: enemy.def.kind,
      x: enemy.x, y: enemy.y, w: enemy.w, h: enemy.h, health: enemy.health, maxHealth: enemy.maxHealth,
      facing: enemy.facing, state: enemy.state, windup: enemy.state === 'windup' ? Math.max(0, Math.min(1, 1 - enemy.timer / (enemy.def.boss ? .5 : .35))) : 0, elite: enemy.elite, boss: enemy.def.boss === true,
    });
    const bossView = (): MetroBossView | null => {
      const boss = enemies.find(enemy => enemy.def.boss && enemy.health > 0);
      return boss ? Object.freeze({ name: boss.def.name, health: boss.health, max: boss.maxHealth, phase: boss.phase }) : null;
    };
    const map = () => {
      const state = roomMap.state();
      const visited = new Set(state.visited), revealed = new Set(state.revealed);
      return Object.freeze({
        rooms: Object.freeze(world.rooms.map(entry => {
          const regionEntry = regionById.get(entry.region)!;
          return Object.freeze({ ...entry.map, id: entry.id, name: entry.name, region: entry.region, regionName: regionEntry.name, visited: visited.has(entry.id), revealed: revealed.has(entry.id), current: entry.id === roomId });
        })),
        links: Object.freeze(world.rooms.flatMap(entry => entry.doors.map(door => Object.freeze({ from: entry.id, to: door.to })))),
        state: Object.freeze({ current: state.current, visited: Object.freeze([...state.visited]), revealed: Object.freeze([...state.revealed]) }),
      });
    };
    const stats = () => {
      const mapState = roomMap.state();
      const unlocked = capabilities.snapshot().filter(ability => ability.unlocked).length;
      const sigils = sigilIds().length;
      const completion = Math.round(Math.min(100, (mapState.visited.length / world.rooms.length) * 60 + (unlocked / Math.max(1, world.abilities.length)) * 20 + (sigils / 3) * 15 + (flags.has('boss') ? 5 : 0)));
      return Object.freeze({
        roomsVisited: mapState.visited.length, roomsKnown: mapState.revealed.length, kills, deaths,
        playTime: Math.round(playTime), completion, swordLevel, embers, sigils, sigilIds: Object.freeze(sigilIds()),
      });
    };
    const state = (): MetroState => Object.freeze({
      status, revision, roomId, roomName: room().name, regionName: region().name, regionColor: region().color, message,
      player: Object.freeze({
        x: player.x, y: player.y, w: player.w, h: player.h, vx: player.vx, vy: player.vy, facing: player.facing,
        grounded: player.grounded, wallSliding: player.wallSliding, dashing: player.dashing, health, maxHealth, focus, maxFocus,
        invulnerable: invulnerable, attack: Object.freeze({ kind: attackKind, combo: comboIndex, progress: attackTime > 0 ? 1 - attackTime / 0.22 : 0 }),
      }),
      enemies: Object.freeze(enemies.filter(enemy => enemy.health > 0).map(enemyView)),
      projectiles: Object.freeze(projectiles.map(projectile => Object.freeze({ ...projectile }))),
      effects: Object.freeze(effects.map(entry => Object.freeze({ ...entry }))),
      pickups: Object.freeze(room().pickups.filter(pickup => !collected.has(pickup.id)).map(pickup => Object.freeze({ id: pickup.id, x: pickup.x, y: pickup.y, kind: pickup.kind, label: pickup.label, icon: pickup.icon, available: true }))),
      checkpoints: Object.freeze(currentCheckpointView()),
      npcs: Object.freeze(room().npcs.map(npc => Object.freeze({ ...npc }))),
      abilities: capabilities.snapshot(),
      inventory: inventoryView(),
      map: map(),
      dialogue,
      boss: bossView(),
      stats: stats(),
    });

    const save = (): void => {
      if (!profile) { saveStatus = 'Session only'; return; }
      try {
        const current = profile.load();
        if (!current?.ok) { saveStatus = 'Save unavailable'; return; }
        const data: SaveData = {
          schema: 1, world: world.id, room: roomId, checkpoint: { id: checkpoint.id, room: checkpoint.roomId, x: checkpoint.x, y: checkpoint.y },
          abilities: capabilities.snapshot().filter(ability => ability.unlocked).map(ability => ability.id),
          items: bag.slots().map(slot => ({ id: slot.item, count: slot.count })), collected: [...collected], flags: [...flags],
          embers, maxHealth, maxFocus, swordLevel, kills, deaths, playTime,
          map: { visited: roomMap.state().visited, revealed: roomMap.state().revealed },
        };
        const values = { ...(current.value?.values ?? {}), [SAVE_KEY]: JSON.stringify(data) } as Record<string, string | number | boolean>;
        const result = profile.save({ values });
        saveStatus = result.ok ? 'Saved at the last beacon' : 'Save unavailable';
      } catch { saveStatus = 'Save unavailable'; }
    };
    const clearSave = (): void => {
      const current = profile?.load();
      if (!profile || !current?.ok) return;
      const values = { ...(current.value?.values ?? {}) } as Record<string, string | number | boolean>;
      delete values[SAVE_KEY];
      profile.save({ values });
    };
    const addEffect = (kind: MetroEffectView['kind'], x: number, y: number, life = 0.28, text?: string, color?: string): void => {
      effects.push(effect(id('effect', revision * 100 + effects.length), kind, x, y, life, text, color));
      if (effects.length > 64) effects.shift();
    };
    const damagePlayer = (amount: number, x: number, y: number): void => {
      if (status !== 'playing' || invulnerable > 0) return;
      health = Math.max(0, health - amount);
      invulnerable = 0.9;
      addEffect('damage', x, y, 0.7, `-${amount}`, '#ff8b75');
      if (health <= 0) {
        status = 'dying'; deathTimer = 1.15; player.vx = 0; player.vy = 0;
        message = 'The lantern gutters…';
      }
    };
    const killEnemy = (enemy: EnemyRuntime): void => {
      if (enemy.health > 0) return;
      enemy.state = 'dead';
      kills++;
      embers += enemy.def.boss ? 15 : 1;
      addEffect('spark', enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, 0.45, undefined, enemy.def.tint ?? '#e9d8a8');
      if (enemy.def.boss) {
        flags.add('boss');
        status = 'victory';
        flow.end({
          outcome: 'victory', title: world.victory.title, detail: world.victory.text,
          stats: [['Rooms', `${stats().roomsVisited} / ${world.rooms.length}`], ['Sun Sigils', `${sigilIds().length} / 3`], ['Kills', String(kills)], ['Deaths', String(deaths)], ['Time', `${Math.floor(playTime / 60)}:${String(Math.floor(playTime % 60)).padStart(2, '0')}`]],
        });
      } else {
        message = `${enemy.def.name} falls.`;
      }
    };
    const damageEnemy = (enemy: EnemyRuntime, amount: number, knockX: number, knockY: number): void => {
      enemy.health = Math.max(0, enemy.health - amount);
      enemy.state = 'hurt'; enemy.hurt = 0.16; enemy.vx = knockX; enemy.vy = knockY;
      addEffect('damage', enemy.x + enemy.w / 2, enemy.y + 0.4, 0.65, `-${amount}`, '#f3d58a');
      if (enemy.health <= 0) killEnemy(enemy);
    };
    const spawnEnemies = (): void => {
      enemies = room().enemies.map((spawn, index) => {
        const def = enemyById.get(spawn.type);
        if (!def) throw new Error(`Hollowmere room ${roomId} references missing enemy ${spawn.type}`);
        const elite = spawn.elite === true;
        const healthValue = Math.round(def.health * (elite ? 1.45 : 1));
        return {
          id: id('enemy', index), spawnId: spawn.id, def, x: spawn.x, y: spawn.y, w: def.w, h: def.h, vx: 0, vy: 0,
          health: healthValue, maxHealth: healthValue, facing: -1, state: def.boss ? 'idle' : 'patrol',
          timer: 0, cooldown: 0.5 + index * 0.13, hurt: 0, patrolOrigin: spawn.x, patrol: spawn.patrol ?? 0,
          elite, phase: 1,
        };
      });
    };
    const enterRoom = (next: string, entry: { x: number; y: number }, viaDoor = false): void => {
      if (!roomById.has(next)) return;
      roomId = next;
      roomMap.enter(next);
      player.x = entry.x; player.y = entry.y; player.prevX = entry.x; player.prevY = entry.y;
      player.vx = 0; player.vy = 0; player.facing = 1; player.dashing = false; player.dashTime = 0; player.dashAvailable = true;
      projectiles = []; effects = []; enemies = []; dialogue = null; dialogueNpc = undefined; doorCooldown = 0.7;
      spawnEnemies();
      if (viaDoor) { message = room().name; revision++; }
    };
    const activateCheckpoint = (entry: CheckpointRuntime): void => {
      checkpoint = { ...entry };
      health = maxHealth; focus = maxFocus; save();
      addEffect('heal', entry.x, entry.y, 0.7, 'REST', '#9ee8b0');
      message = `${entry.name} remembers you.`;
    };
    const npcOptions = (npc: MetroNpcSpawn): readonly { id: string; label: string; hint?: string; disabled?: boolean }[] => {
      if (npc.role === 'smith') return [
        { id: 'temper', label: swordLevel >= 5 ? 'The blade is already bright' : 'Temper the lantern blade', hint: swordLevel >= 5 ? 'MASTERWORK' : '3 EMBERS · +1 SWORD DAMAGE', disabled: swordLevel >= 5 || embers < 3 },
        { id: 'mend', label: 'Rest at the forge', hint: 'RESTORE HEALTH' },
        { id: 'leave', label: 'Leave', hint: 'E CLOSE' },
      ];
      return [
        { id: 'reveal', label: 'Read the drowned map', hint: '8 EMBERS · REVEAL ARCHIVE ROOMS', disabled: embers < 8 },
        { id: 'lore', label: 'Ask about the Hollow King', hint: 'LORE' },
        { id: 'leave', label: 'Leave', hint: 'E CLOSE' },
      ];
    };
    const refreshDialogue = (): void => {
      if (!dialogueNpc) { dialogue = null; return; }
      dialogue = Object.freeze({ npcId: dialogueNpc.id, name: dialogueNpc.name, title: dialogueNpc.title, portrait: dialogueNpc.portrait, text: dialogueNpc.line, options: npcOptions(dialogueNpc) });
    };
    const openDialogue = (npc: MetroNpcSpawn): void => {
      dialogueNpc = { ...npc }; player.vx = 0; refreshDialogue(); revision++;
    };
    const closeDialogue = (): void => { dialogue = null; dialogueNpc = undefined; revision++; };
    const useItem = (index: number): void => {
      const entry = inventoryView()[index];
      if (!entry) return;
      if (entry.id === 'hollowmere/moss-tonic') {
        if (health >= maxHealth) { message = 'Health is already full.'; return; }
        if (!bag.remove(entry.id, 1).ok) return;
        health = Math.min(maxHealth, health + 35); addEffect('heal', player.x, player.y, 0.7, '+35', '#9ee8b0'); message = 'Moss tonic restores 35 health.';
      } else if (entry.id === 'hollowmere/focus-draught') {
        if (focus >= maxFocus) { message = 'Focus is already full.'; return; }
        if (!bag.remove(entry.id, 1).ok) return;
        focus = Math.min(maxFocus, focus + 30); addEffect('heal', player.x, player.y, 0.7, '+30', '#8ecbea'); message = 'Focus draught restores 30 focus.';
      } else message = `${entry.name} is not usable here.`;
      revision++;
    };
    const persistPickup = (pickup: MetroPickupSpawn): void => {
      collected.add(pickup.id);
      const x = pickup.x + 0.35, y = pickup.y + 0.35;
      if (pickup.kind === 'ability') {
        const result = capabilities.unlock(pickup.key ?? '');
        if (!result.ok) { message = result.reason; return; }
        addEffect('sigil', x, y, 0.9, pickup.label, '#e9d78e'); message = `${pickup.label} joins your lantern.`;
        save();
      } else if (pickup.kind === 'item') {
        const result = bag.add(pickup.key ?? '', 1);
        if (!result.ok) { collected.delete(pickup.id); message = result.reason; return; }
        addEffect('heal', x, y, 0.7, pickup.label, '#e9d78e'); message = `${pickup.label} added to your satchel.`;
      } else if (pickup.kind === 'health') {
        maxHealth = Math.min(260, maxHealth + (pickup.amount ?? 20)); health = maxHealth;
        addEffect('heal', x, y, 0.9, `+${pickup.amount ?? 20} VESSEL`, '#9ee8b0'); message = `A deeper vessel. Maximum health is now ${maxHealth}.`; save();
      } else if (pickup.kind === 'focus') {
        maxFocus = Math.min(160, maxFocus + (pickup.amount ?? 20)); focus = maxFocus;
        addEffect('heal', x, y, 0.9, `+${pickup.amount ?? 20} FOCUS`, '#8ecbea'); message = `Your focus widens to ${maxFocus}.`; save();
      } else if (pickup.kind === 'ember') {
        embers += pickup.amount ?? 1; addEffect('spark', x, y, 0.6, `+${pickup.amount ?? 1}`, '#e9c56a'); message = `${pickup.amount ?? 1} ember shard${(pickup.amount ?? 1) === 1 ? '' : 's'} gathered.`;
      } else if (pickup.kind === 'lore') {
        message = pickup.text ?? pickup.label; addEffect('sigil', x, y, 0.7, 'LORE', '#d8be8a');
      }
      revision++;
    };
    const startNew = (): void => {
      roomMap.dispose(); capabilities.dispose();
      roomMap = makeMap(); capabilities = makeCapabilities();
      status = 'playing'; roomId = world.startRoom; checkpoint = startingCheckpoint();
      maxHealth = 100; maxFocus = 50; health = maxHealth; focus = maxFocus;
      embers = 0; swordLevel = 0; kills = 0; deaths = 0; playTime = 0; invulnerable = 0; attackTime = 0; attackCooldown = 0;
      collected.clear(); flags.clear(); dialogue = null; dialogueNpc = undefined; enemies = []; projectiles = []; effects = [];
      bag.slots().forEach(slot => bag.remove(slot.item, slot.count));
      pendingItems = [
        ...(ctx.registries.has(Items, 'hollowmere/moss-tonic') ? [{ id: 'hollowmere/moss-tonic', count: 2 }] : []),
        ...(ctx.registries.has(Items, 'hollowmere/focus-draught') ? [{ id: 'hollowmere/focus-draught', count: 1 }] : []),
      ];
      capabilities.unlock('saber');
      enterRoom(world.startRoom, { x: 3, y: 16 });
      message = 'The lantern wakes in Mossgate. Press E at the beacon to bind your return.';
      started = true; revision++;
    };
    const load = (): boolean => {
      if (!profile) return false;
      const loaded = profile.load();
      const raw = loaded?.ok ? loaded.value?.values[SAVE_KEY] : undefined;
      if (typeof raw !== 'string' || raw.length > MAX_SAVE) return false;
      try {
        const data = parseSave(JSON.parse(raw), world.id);
        if (!data || !roomById.has(data.room) || !roomById.has(data.checkpoint.room)) return false;
        maxHealth = clamp(data.maxHealth, 20, 260); maxFocus = clamp(data.maxFocus, 10, 160);
        health = maxHealth; focus = maxFocus; embers = Math.floor(data.embers); swordLevel = clamp(Math.floor(data.swordLevel), 0, 5);
        kills = Math.floor(data.kills); deaths = Math.floor(data.deaths); playTime = data.playTime;
        pendingItems = data.items.filter(item => ctx.registries.has(Items, item.id)).map(item => ({ id: item.id, count: clamp(Math.floor(item.count), 1, 20) }));
        for (const ability of data.abilities) if (abilityById.has(ability)) capabilities.unlock(ability);
        if (!capabilities.has('saber')) capabilities.unlock('saber');
        for (const entry of data.collected) collected.add(entry);
        for (const flag of data.flags) flags.add(flag);
        for (const visited of data.map.visited) if (roomById.has(visited)) roomMap.enter(visited);
        for (const revealed of data.map.revealed) if (roomById.has(revealed)) roomMap.reveal(revealed);
        checkpoint = { id: data.checkpoint.id, name: data.checkpoint.id, roomId: data.checkpoint.room, x: data.checkpoint.x, y: data.checkpoint.y };
        roomId = data.checkpoint.room;
        status = 'playing'; started = true;
        enterRoom(roomId, { x: checkpoint.x, y: checkpoint.y });
        message = 'The lantern remembers this room.';
        revision++;
        return true;
      } catch { return false; }
    };
    const clearRoom = (): void => { enemies = []; projectiles = []; effects = []; };
    const resetToCheckpoint = (): void => {
      deaths++; status = 'playing'; health = maxHealth; focus = maxFocus; deathTimer = 0; dialogue = null; dialogueNpc = undefined;
      roomId = checkpoint.roomId; enterRoom(roomId, { x: checkpoint.x, y: checkpoint.y });
      message = `${checkpoint.name} pulls the lantern back from the dark.`;
      revision++;
    };
    const resolveCommand = (command: MetroCommand): void => {
      if (command.type === 'set-paused') {
        if (status === 'victory' || status === 'dying') return;
        status = command.paused ? 'paused' : 'playing'; revision++; return;
      }
      if (command.type === 'restart') { clearSave(); startNew(); return; }
      if (command.type === 'use-item') { useItem(command.index); return; }
      if (command.type === 'dialogue-close') { closeDialogue(); return; }
      if (command.type === 'dialogue-choice') {
        if (!dialogue || !dialogueNpc) return;
        const option = dialogue.options[command.index]; if (!option || option.disabled) return;
        if (option.id === 'leave') { closeDialogue(); return; }
        if (option.id === 'temper') {
          if (embers < 3 || swordLevel >= 5) return;
          embers -= 3; swordLevel++; dialogueNpc.line = 'The edge drinks the ember. It will bite deeper now.';
          message = `Lantern blade tempered to +${swordLevel}.`; refreshDialogue(); save(); revision++; return;
        }
        if (option.id === 'mend') {
          health = maxHealth; dialogueNpc.line = 'The forge heat closes every seam. Go carefully.';
          message = 'Brann restores your health.'; refreshDialogue(); revision++; return;
        }
        if (option.id === 'reveal') {
          if (embers < 8) return;
          embers -= 8;
          for (const entry of world.rooms) if (entry.region === 'archive') roomMap.reveal(entry.id);
          dialogueNpc.line = 'The archive is a drowned map. I have inked the paths I remember.';
          message = 'Mara reveals the Archive on your map.'; refreshDialogue(); revision++; return;
        }
        if (option.id === 'lore') {
          dialogueNpc.line = 'The Hollow King was the first Lantern Bearer. He kept the suns for himself, and the roots took the rest. Break the crown, not the light.';
          refreshDialogue(); revision++; return;
        }
      }
    };
    const spawnProjectile = (who: 'player' | 'enemy', x: number, y: number, vx: number, vy: number, damage: number): void => {
      projectiles.push({ id: id('shot', projectiles.length + revision), x, y, vx, vy, kind: who === 'player' ? 'bolt' : 'enemy', life: 1.2, damage });
    };
    const updateEnemy = (enemy: EnemyRuntime, dt: number): void => {
      if (enemy.health <= 0) return;
      enemy.hurt = Math.max(0, enemy.hurt - dt); enemy.cooldown = Math.max(0, enemy.cooldown - dt); enemy.timer = Math.max(0, enemy.timer - dt);
      if (enemy.hurt > 0) { enemy.state = 'hurt'; return; }
      const dx = (player.x + player.w / 2) - (enemy.x + enemy.w / 2), dy = (player.y + player.h / 2) - (enemy.y + enemy.h / 2);
      const distanceToPlayer = Math.hypot(dx, dy);
      enemy.facing = dx < 0 ? -1 : 1;
      if (enemy.def.boss) {
        enemy.phase = enemy.health <= enemy.maxHealth * 0.5 ? 2 : 1;
        if (enemy.state === 'windup') {
          if (enemy.timer <= 0) {
            if (distanceToPlayer < 5) damagePlayer(enemy.def.damage, player.x, player.y);
            addEffect('spark', enemy.x + enemy.w / 2, enemy.y + enemy.h, 0.8, 'SHOCKWAVE', '#c99ce8');
            if (enemy.phase === 2) for (const offset of [-0.35, 0, 0.35]) spawnProjectile('enemy', enemy.x + enemy.w / 2, enemy.y + 1, dx / Math.max(1, distanceToPlayer) * 8 + offset * 5, dy / Math.max(1, distanceToPlayer) * 8, enemy.def.damage - 4);
            enemy.state = 'chase'; enemy.cooldown = enemy.phase === 2 ? 1.25 : 2.1;
          }
          return;
        }
        if (Math.abs(dx) > enemy.def.attackRange && distanceToPlayer > 2.8) {
          enemy.vx = Math.sign(dx) * enemy.def.speed;
          enemy.x += enemy.vx * dt;
          enemy.state = 'chase';
        } else if (enemy.cooldown <= 0) {
          enemy.state = 'windup'; enemy.timer = enemy.phase === 2 ? 0.32 : 0.5; enemy.vx = 0;
        }
        return;
      }
      if (enemy.def.kind === 'flyer') {
        const hoverY = player.y - 1.5 + Math.sin((playTime + enemy.cooldown) * 2.5) * 1.4;
        enemy.x += Math.sign(dx) * enemy.def.speed * dt;
        enemy.y += clamp((hoverY - enemy.y) * 2, -enemy.def.speed, enemy.def.speed) * dt;
        enemy.state = distanceToPlayer < 12 ? 'chase' : 'patrol';
        if (enemy.def.projectile && enemy.cooldown <= 0 && distanceToPlayer < 11) {
          spawnProjectile('enemy', enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, dx / Math.max(1, distanceToPlayer) * 7.5, dy / Math.max(1, distanceToPlayer) * 7.5, enemy.def.damage);
          enemy.cooldown = 2.1; enemy.state = 'attack';
        }
        return;
      }
      const awake = distanceToPlayer < 12 || enemy.def.kind === 'boss';
      if (!awake) {
        if (enemy.patrol > 0) {
          enemy.vx = Math.sign(enemy.patrolOrigin - enemy.x) * enemy.def.speed * 0.35;
          if (Math.abs(enemy.patrolOrigin - enemy.x) < 0.3) enemy.patrol *= -1;
        } else enemy.vx = 0;
      } else if (enemy.def.kind === 'charger' && enemy.state === 'chase' && enemy.cooldown <= 0 && Math.abs(dx) < 8) {
        enemy.state = 'windup'; enemy.timer = 0.35; enemy.vx = 0;
      } else if (enemy.state === 'windup') {
        if (enemy.timer <= 0) {
          if (distanceToPlayer < enemy.def.attackRange + 1.2) damagePlayer(enemy.def.damage, player.x, player.y);
          enemy.state = 'attack'; enemy.cooldown = 1.2;
          if (enemy.def.kind === 'charger') { enemy.vx = enemy.facing * enemy.def.speed * 2.6; enemy.timer = 0.24; }
        }
      } else if (enemy.def.kind === 'charger' && enemy.timer > 0) {
        enemy.vx = enemy.facing * enemy.def.speed * 2.6;
      } else if (Math.abs(dx) > enemy.def.attackRange) {
        enemy.vx = Math.sign(dx) * enemy.def.speed;
        enemy.state = 'chase';
      } else if (enemy.cooldown <= 0) {
        enemy.state = 'windup'; enemy.timer = 0.35; enemy.vx = 0;
      } else enemy.state = 'chase';
      enemy.x += enemy.vx * dt;
      if (collision(enemy.x, enemy.y, enemy.w, enemy.h) === 'solid') {
        enemy.x -= enemy.vx * dt;
        if (Math.abs(enemy.vx) > enemy.def.speed * 1.5) { enemy.timer = 0; enemy.vx = 0; }
        else { enemy.patrol *= -1; enemy.vx = 0; }
      }
      enemy.vy = Math.min(18, enemy.vy + 34 * dt);
      enemy.y += enemy.vy * dt;
      const below = collision(enemy.x, enemy.y + enemy.h + 0.04, enemy.w, 0.05);
      if (below === 'solid' || below === 'oneway') { enemy.y = Math.floor(enemy.y + enemy.h) - enemy.h; enemy.vy = 0; }
      if (enemy.state === 'attack' && enemy.timer <= 0 && enemy.def.kind === 'charger') enemy.state = 'chase';
    };
    const updateProjectiles = (dt: number): void => {
      for (const projectile of projectiles) {
        projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt; projectile.life -= dt;
        if (projectile.life <= 0 || collision(projectile.x, projectile.y, 0.3, 0.3) === 'solid') { projectile.life = 0; continue; }
        if (projectile.kind === 'bolt') {
          for (const enemy of enemies) {
            if (enemy.health <= 0) continue;
            if (overlap({ x: projectile.x, y: projectile.y, w: 0.3, h: 0.3 }, enemy)) {
              damageEnemy(enemy, projectile.damage, Math.sign(projectile.vx) * 2, -2); projectile.life = 0; break;
            }
          }
        } else if (overlap({ x: projectile.x, y: projectile.y, w: 0.3, h: 0.3 }, player)) {
          damagePlayer(projectile.damage, player.x, player.y); projectile.life = 0;
        }
      }
      projectiles = projectiles.filter(projectile => projectile.life > 0);
    };
    const attack = (): void => {
      if (attackCooldown > 0) return;
      const up = input.tick.held('hollowmere/up'), down = input.tick.held('hollowmere/down');
      attackKind = up ? 'up' : down && !player.grounded ? 'down' : 'side';
      comboIndex = comboWindow > 0 ? (comboIndex + 1) % 3 : 0;
      attackTime = 0.22; attackCooldown = 0.26; comboWindow = 0.42; attackHits.clear();
      if (attackKind === 'side' && comboIndex === 2) player.vx = player.facing * 4.5;
    };
    const attackBox = (): Rect => {
      if (attackKind === 'up') return { x: player.x - 0.1, y: player.y - 1.25, w: player.w + 0.2, h: 1.3 };
      if (attackKind === 'down') return { x: player.x - 0.1, y: player.y + player.h - 0.05, w: player.w + 0.2, h: 1.3 };
      return { x: player.facing === 1 ? player.x + player.w - 0.05 : player.x - 1.15, y: player.y + 0.22, w: 1.2, h: 1.25 };
    };
    const updateAttack = (dt: number): void => {
      attackCooldown = Math.max(0, attackCooldown - dt); comboWindow = Math.max(0, comboWindow - dt);
      if (attackTime <= 0) { attackKind = 'none'; return; }
      attackTime = Math.max(0, attackTime - dt);
      const box = attackBox();
      for (const enemy of enemies) {
        if (enemy.health <= 0 || attackHits.has(enemy.spawnId)) continue;
        if (!overlap(box, enemy)) continue;
        attackHits.add(enemy.spawnId);
        const damage = [10, 12, 18][comboIndex]! + swordLevel * 2;
        damageEnemy(enemy, damage, player.facing * (comboIndex === 2 ? 5 : 2.2), attackKind === 'up' ? -3 : -2);
        if (attackKind === 'down' && !player.grounded) { player.vy = -10.5; player.dashAvailable = true; }
      }
      if (attackTime === 0) attackKind = 'none';
    };
    const updatePlayer = (dt: number): void => {
      const movement = (input.tick.held('hollowmere/right') ? 1 : 0) - (input.tick.held('hollowmere/left') ? 1 : 0);
      const jumpPressed = input.tick.pressed('hollowmere/jump');
      const dashPressed = input.tick.pressed('hollowmere/dash');
      if (input.tick.pressed('hollowmere/attack')) attack();
      if (input.tick.pressed('hollowmere/bolt') && capabilities.has('ember-bolt') && focus >= 10) {
        const up = input.tick.held('hollowmere/up');
        spawnProjectile('player', player.x + player.w / 2, player.y + player.h / 2, up ? 0 : player.facing * 15, up ? -15 : 0, 16 + swordLevel * 2);
        focus -= 10; addEffect('spark', player.x + player.w / 2, player.y + player.h / 2, 0.25, 'BOLT', '#8ecbea');
      }
      const result = platform.step(player, {
        moveX: movement as -1 | 0 | 1, jumpHeld: input.tick.held('hollowmere/jump'), jumpPressed, dashPressed,
        downHeld: input.tick.held('hollowmere/down'),
      }, playerAbilities(), collision, dt);
      if (result.jumped) addEffect('dust', player.x, player.y + player.h, 0.25);
      if (result.doubleJumped) addEffect('spark', player.x + 0.2, player.y + 0.2, 0.35, 'DOUBLE', '#c9e6b8');
      if (result.dashed) addEffect('dust', player.x, player.y + player.h - 0.2, 0.28);
      if (result.wallJumped) addEffect('spark', player.x, player.y + 1, 0.3, 'WALL', '#d8c48a');
      if (result.landed) addEffect('dust', player.x, player.y + player.h, 0.25);
      invulnerable = Math.max(0, invulnerable - dt); focus = Math.min(maxFocus, focus + dt * 2.2);
      if (hazard(player.x, player.y, player.w, player.h)) damagePlayer(18, player.x, player.y);
    };
    const updateDoors = (): void => {
      doorCooldown = Math.max(0, doorCooldown - 0.016);
      if (doorCooldown > 0) return;
      for (const door of room().doors) {
        if (!overlap(player, door)) continue;
        if (door.requires && !capabilities.has(door.requires)) { message = door.message ?? `${abilityById.get(door.requires)?.name ?? 'A new ability'} is required.`; doorCooldown = 1.2; return; }
        const missing = door.requiresItems?.filter(item => bag.count(item) < 1) ?? [];
        if (missing.length) { message = door.message ?? 'The crown door needs all three sun sigils.'; doorCooldown = 1.2; return; }
        const target = roomById.get(door.to); if (!target) return;
        enterRoom(door.to, door.entry, true);
        doorCooldown = 0.8;
        return;
      }
    };
    const updatePickups = (): void => {
      for (const pickup of room().pickups) {
        if (collected.has(pickup.id)) continue;
        if (overlap(player, { x: pickup.x, y: pickup.y, w: 0.7, h: 0.7 })) persistPickup(pickup);
      }
    };
    const interact = (): void => {
      const nearbyCheckpoint = room().checkpoints.find(entry => distance(player.x, player.y, entry.x, entry.y) < 1.6);
      if (nearbyCheckpoint) { activateCheckpoint({ ...nearbyCheckpoint, roomId }); return; }
      const nearbyNpc = room().npcs.find(entry => distance(player.x, player.y, entry.x, entry.y) < 2.0);
      if (nearbyNpc) { openDialogue(nearbyNpc); return; }
      message = 'Nothing answers the lantern here.';
    };
    const updateSystem = (dt: number): void => {
      if (pendingItems.length && ctx.services.tryGet(SessionControl)?.playing !== false) {
        for (const item of pendingItems) bag.add(item.id, item.count);
        pendingItems = []; revision++;
      }
      for (const command of queue.drainBatch()) resolveCommand(command);
      if (status !== 'playing') {
        if (status === 'dying') {
          deathTimer -= dt;
          if (deathTimer <= 0) resetToCheckpoint();
        }
        return;
      }
      if (dialogue) { revision++; return; }
      playTime += dt;
      if (input.tick.pressed('hollowmere/interact')) interact();
      if (dialogue) { revision++; return; }
      updatePlayer(dt);
      updateAttack(dt);
      updateDoors();
      updatePickups();
      if (status !== 'playing') { revision++; return; }
      for (const enemy of enemies) updateEnemy(enemy, dt);
      updateProjectiles(dt);
      for (const entry of effects) entry.age += dt;
      effects = effects.filter(entry => entry.age < entry.life);
      if (status === 'playing' && invulnerable > 0) health = Math.max(0, health);
      if (health <= 0 && status === 'playing') damagePlayer(1, player.x, player.y);
      revision++;
    };
    ctx.systems.add({ id: 'hollowmere/game.update', phase: 'control', update(dt) { updateSystem(dt); } });
    ctx.services.provide(Metroidvania, {
      world,
      state,
      enqueue: command => (status === 'playing' || status === 'paused') && queue.enqueue(command),
    });
    // Restore checkpoint progress if valid, otherwise begin a fresh lantern.
    const restored = load();
    if (!restored) startNew();
    else saveStatus = 'Checkpoint save loaded';
    ctx.scope.add(() => { bag.dispose(); roomMap.dispose(); capabilities.dispose(); }, 'hollowmere/state');
    // Audio hooks are data-free; presentation chooses texture/audio cues from state changes.
    void saveStatus;
  },
});

