/**
 * Gameplay-test helpers: tiny ASCII test maps, a test content pack (maps + weapons + enemies), and small
 * utilities to place actors, record events and drive the headless game deterministically.
 */
import type { CatalogEntry, Session } from '../../src/kernel/host.ts';
import type { EventToken } from '../../src/kernel/bus.ts';
import type { ComponentToken, EntityId } from '../../src/kernel/ecs.ts';
import { Collider, Flow, Health, Inventory, Player, Transform, spawnPrefab, yawOf } from '../../src/sdk/index.ts';
import { Combat, Enemy, EnemyAi, World } from '../../games/shooter/contracts/shooter.ts';
import type { FlowService } from '../../src/sdk/index.ts';
import type { CombatService, EnemyService, WorldService } from '../../games/shooter/contracts/shooter.ts';
import { createHeadlessGame, headlessPreset } from './game.ts';
import type { HeadlessGame } from './game.ts';

export type Obj = Record<string, unknown>;

export const CELL = 2;
export const CORE_PLUGINS = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content'];
export const TEST_PLUGINS = [...CORE_PLUGINS, 'test/maps'];

export const PLAYER_RADIUS = 0.35;
export const TICK = 1 / 60;

/** World-space centre of a grid cell (cell size 2). */
export const cellCenter = (cx: number, cz: number): { x: number; z: number } => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL });

/** Yaw (radians) that faces +X / -X / +Z / -Z. 0 faces -Z; positive turns left. */
export const FACE_EAST = -Math.PI / 2;
export const FACE_WEST = Math.PI / 2;
export const FACE_NORTH = 0; // -Z
export const FACE_SOUTH = Math.PI; // +Z

// ---------------------------------------------------------------------------------------------------------------------
// ASCII maps
// ---------------------------------------------------------------------------------------------------------------------

export interface GridOpts {
  name?: string;
  /** '#' wall, '.' floor, 'S' player start, 'E' exit zone, '1'..'9' doors (id "door1".."door9"). */
  grid: string[];
  /** Player start yaw in degrees (default 0 = facing -Z). */
  yawDeg?: number;
  /** Door ids that start locked. */
  locked?: string[];
  triggers?: unknown[];
  spawns?: unknown[];
  /** false: no exit zone at all. Default: if the grid has no 'E', a sealed pocket with an exit zone is appended. */
  exit?: boolean;
}

/** Builds `core/grid` map data from ASCII rows (see GridOpts). */
export function gridMapData(o: GridOpts): Obj {
  let rows = [...o.grid];
  const width = rows[0]!.length;
  let hasExit = rows.some((r) => r.includes('E'));
  if (!hasExit && o.exit !== false) {
    rows = [...rows, `#E${'#'.repeat(width - 2)}`, '#'.repeat(width)];
    hasExit = true;
  }
  const doors: Obj[] = [];
  const triggers: unknown[] = [];
  let start: [number, number] | undefined;
  rows.forEach((row, cz) => {
    [...row].forEach((ch, cx) => {
      if (ch === 'S' && !start) start = [cx, cz];
      if (ch >= '1' && ch <= '9') doors.push({ id: `door${ch}`, cell: [cx, cz], locked: (o.locked ?? []).includes(`door${ch}`) });
      if (ch === 'E') triggers.push({ id: triggers.length === 0 ? 'exit' : `exit${triggers.length}`, kind: 'zone', cell: [cx, cz], radius: 0.9, tags: ['exit'] });
    });
  });
  if (!start) throw new Error('gridMapData: grid needs an S marker');
  const floor = { floor: 'floor-plate', ceiling: 'ceiling-panel' };
  const legend: Obj = { '#': { solid: true, wall: 'wall-panel' }, '.': floor, S: floor, E: floor };
  for (let d = 1; d <= 9; d++) legend[String(d)] = floor;
  return {
    schema: 1,
    format: 'core/grid',
    name: o.name ?? 'Test map',
    cellSize: CELL,
    wallHeight: 3,
    legend,
    grid: rows,
    playerStart: { cell: start, yaw: o.yawDeg ?? 0 },
    doors,
    triggers: [...triggers, ...(o.triggers ?? [])],
    spawns: o.spawns ?? [],
  };
}

/** Two rooms split by a wall; the only connection is `door1` (axis z slab, 0.4 m thick) at cell (6,3). */
export const HALL: string[] = [
  '#############',
  '#.....#.....#',
  '#.....#.....#',
  '#S....1.....#',
  '#.....#.....#',
  '#.....#.....#',
  '#############',
];
/** Same as HALL, but row 5 has a gap in the partition so there is a way around the door. */
export const HALL_WITH_GAP: string[] = [
  '#############',
  '#.....#.....#',
  '#.....#.....#',
  '#S....1.....#',
  '#.....#.....#',
  '#...........#',
  '#############',
];
/** One big open room (no doors). */
export const OPEN_ROOM: string[] = [
  '#################',
  '#...............#',
  '#...............#',
  '#S..............#',
  '#...............#',
  '#...............#',
  '#...............#',
  '#################',
];
/** Exit room behind a locked door; the switch is on the north wall at cell (3,1). */
export const OBJECTIVE_ROOMS: string[] = [
  '#############',
  '#S....#.....#',
  '#.....1...E.#',
  '#.....#.....#',
  '#############',
];
export const OBJECTIVE_TRIGGERS: unknown[] = [{ id: 'override', kind: 'switch', cell: [3, 1], face: 'n', opens: 'door1', tags: ['objective'] }];

// ---------------------------------------------------------------------------------------------------------------------
// Test content pack
// ---------------------------------------------------------------------------------------------------------------------

export const TEST_AMMO = 'test/ammo';
export const RAIL = 'test/rail';
export const AUTO = 'test/auto';
export const BOLT = 'test/bolt';
export const DUMMY = 'test/dummy';

export const STD_CONTENT: unknown[] = [
  { kind: 'ammo', id: TEST_AMMO, data: { name: 'Test ammo', max: 1000, start: 500 } },
  { kind: 'weapon', id: RAIL, data: { name: 'Test rail', slot: 3, behavior: 'core/hitscan', params: { damage: 10, range: 100 }, ammoType: TEST_AMMO, cooldown: 0.1, auto: false, view: 'weapon-pistol', fireSound: 'pistol-fire' } },
  { kind: 'weapon', id: AUTO, data: { name: 'Test auto', slot: 4, behavior: 'core/hitscan', params: { damage: 5, range: 100 }, ammoType: TEST_AMMO, cooldown: 0.1, auto: true, view: 'weapon-pistol', fireSound: 'pistol-fire' } },
  { kind: 'weapon', id: BOLT, data: { name: 'Test bolt', slot: 5, behavior: 'core/projectile', params: { damage: 30, speed: 2000, radius: 0.1, range: 100 }, ammoType: TEST_AMMO, cooldown: 0.3, auto: false, view: 'weapon-launcher', fireSound: 'launcher-fire' } },
  { kind: 'enemy', id: DUMMY, data: { name: 'Dummy', health: 100, speed: 0, radius: 0.4, sightRange: 1, ai: 'core/chaser', painChance: 0, attack: { behavior: 'core/melee', params: { damage: 1, range: 0.2 }, cooldown: 1, range: 0.2, windup: 0.3 }, visual: 'enemy-grunt' } },
];

export const testPackManifest = (over: Obj = {}): Obj => ({
  schema: 1,
  id: 'test/maps',
  name: 'Test maps',
  version: '1.0.0',
  kind: 'content',
  sdk: '^2.0.0',
  dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0', 'core/enemies': '^1.0.0', 'core/content': '^1.0.0' },
  ...over,
});

/** Catalog entry `test/maps`: the given maps plus the standard test weapons / ammo / dummy enemy. */
export function testPack(maps: Record<string, Obj>, extraContent: unknown[] = []): CatalogEntry {
  const content: unknown[] = [...STD_CONTENT, ...extraContent];
  for (const [id, data] of Object.entries(maps)) content.push({ kind: 'map', id, data });
  return { manifest: testPackManifest(), content };
}

export function presetFor(map: string, over: Obj = {}): Obj {
  return headlessPreset({ plugins: TEST_PLUGINS, options: { map }, ...over });
}

// ---------------------------------------------------------------------------------------------------------------------
// Running games
// ---------------------------------------------------------------------------------------------------------------------

export interface Started {
  game: HeadlessGame;
  session: Session;
  player: EntityId;
  world: WorldService;
  combat: CombatService;
  ai: EnemyService;
  flow: FlowService;
}

export function handles(game: HeadlessGame): Started {
  const session = game.session();
  const player = session.entities.first(Player);
  if (player === undefined) throw new Error('no player');
  return { game, session, player, world: session.services.get(World), combat: session.services.get(Combat), ai: session.services.get(EnemyAi), flow: session.services.get(Flow) };
}

/** Starts the game on one ASCII map from the test pack. The map's own spawns are kept; call `clearEnemies` to remove them. */
export async function startOnMap(map: GridOpts | Obj, opts: { extra?: CatalogEntry[]; extraContent?: unknown[]; plugins?: string[]; seed?: number } = {}): Promise<Started> {
  const data: Obj = 'schema' in map ? (map as Obj) : gridMapData(map as GridOpts);
  const game = createHeadlessGame([testPack({ 'test/map': data }, opts.extraContent), ...(opts.extra ?? [])]);
  await game.host.apply(presetFor('test/map', { plugins: opts.plugins ?? [...TEST_PLUGINS, ...(opts.extra ?? []).map((e) => String((e.manifest as Obj)['id']))], seed: opts.seed ?? 7 }));
  return handles(game);
}

/** Starts the real arena map. */
export async function startArena(opts: { extra?: CatalogEntry[]; seed?: number } = {}): Promise<Started> {
  const game = createHeadlessGame(opts.extra ?? []);
  await game.host.apply(headlessPreset({ seed: opts.seed ?? 7 }));
  return handles(game);
}

export const motionToken: ComponentToken<{ vx: number; vz: number }> = { id: 'core/player.motion' };
export const projectileToken: ComponentToken<unknown> = { id: 'core/projectile' };

export function transformOf(s: Session, e: EntityId): Transform {
  const t = s.entities.get(e, Transform);
  if (!t) throw new Error(`entity ${e} has no Transform`);
  return t;
}

/** Teleports an actor (previous pose too) and zeroes the player's carried velocity. yaw in radians. */
export function place(s: Session, e: EntityId, x: number, z: number, yaw?: number): void {
  const t = transformOf(s, e);
  t.x = t.prevX = x;
  t.z = t.prevZ = z;
  if (yaw !== undefined) t.yaw = t.prevYaw = yaw;
  const m = s.entities.get(e, motionToken);
  if (m) m.vx = m.vz = 0;
}

export const placeAtCell = (s: Session, e: EntityId, cx: number, cz: number, yaw?: number, ox = 0, oz = 0): void => {
  const c = cellCenter(cx, cz);
  place(s, e, c.x + ox * CELL, c.z + oz * CELL, yaw);
};

/** Faces actor `e` toward a world point. */
export function faceToward(s: Session, e: EntityId, x: number, z: number): void {
  const t = transformOf(s, e);
  t.yaw = t.prevYaw = yawOf(x - t.x, z - t.z);
}

export function spawnEnemy(s: Session, def: string, x: number, z: number, yaw = 0): EntityId {
  return s.services.get(EnemyAi).spawn(def, { x, z, yaw });
}

/** Spawns any registered prefab (pickups, enemies) through the mode plugin's context. */
export function spawnAt(s: Session, prefab: string, x: number, z: number, yaw = 0): EntityId {
  return spawnPrefab(s.contexts.get('core/modes')!, prefab, { x, z, yaw });
}

export function clearEnemies(s: Session): void {
  const ids: EntityId[] = [];
  s.entities.each(Enemy, (e) => void ids.push(e));
  for (const e of ids) s.entities.destroy(e);
  s.entities.flush();
}

export function hpOf(s: Session, e: EntityId): number {
  const h = s.entities.get(e, Health);
  if (!h) throw new Error(`entity ${e} has no Health`);
  return h.hp;
}

export function inventoryOf(s: Session, e: EntityId): Inventory {
  const inv = s.entities.get(e, Inventory);
  if (!inv) throw new Error(`entity ${e} has no Inventory`);
  return inv;
}

/** Gives a weapon and makes it current with no switch delay. */
export function equip(h: Started, weapon: string): Inventory {
  h.combat.giveWeapon(h.player, weapon);
  const inv = inventoryOf(h.session, h.player);
  inv.current = weapon;
  inv.nextFireAt = 0;
  return inv;
}

/** Records every emission of an event on the session (listener lives in the session scope). */
export function record<T>(s: Session, token: EventToken<T>): T[] {
  const out: T[] = [];
  s.events.on(token, (p) => void out.push(p), 'test', s.scope);
  return out;
}

export function countProjectiles(s: Session): number {
  let n = 0;
  s.entities.each(projectileToken, () => void n++);
  return n;
}

export function colliderOf(s: Session, e: EntityId): Collider {
  const c = s.entities.get(e, Collider);
  if (!c) throw new Error(`entity ${e} has no Collider`);
  return c;
}

/** Presses `action`, runs one tick, releases it and lets the cooldown elapse. */
export function tap(game: HeadlessGame, action: string, settleTicks = 8): void {
  game.input.press(action);
  game.ticks(1);
  game.input.release(action);
  game.ticks(settleTicks);
}

/** Runs ticks until `pred()` is true (checked after every tick). Returns the ticks used, or -1 if never. */
export function runUntil(game: HeadlessGame, pred: () => boolean, maxTicks: number): number {
  for (let i = 1; i <= maxTicks; i++) {
    game.ticks(1);
    if (pred()) return i;
  }
  return -1;
}

/** Seeded PRNG (mulberry32) for the test's own randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { createHeadlessGame, headlessPreset };

/** Fails (with the faulting plugin and error) if the session paused itself because a system or handler threw. */
export function assertHealthy(h: { session: Session }): void {
  const f = h.session.fault;
  if (f || h.session.state !== 'running' || h.session.scheduler.faulted) {
    const msg = f ? `${f.owner}/${f.systemId}: ${f.error instanceof Error ? f.error.stack ?? f.error.message : String(f.error)}` : `session state ${h.session.state}`;
    throw new Error(`session faulted: ${msg}`);
  }
}
