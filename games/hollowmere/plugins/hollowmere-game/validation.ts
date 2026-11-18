import type { ContentLoadContext } from '../../../../src/sdk/index.ts';
import type { MetroAbility, MetroDoor, MetroEnemySpawn, MetroEnemyType, MetroNpcSpawn, MetroPickupSpawn, MetroProp, MetroRegion, MetroRoom, MetroCheckpoint, MetroWorld } from '../../contracts/metroidvania.ts';
import { isObject } from '../../../../src/sdk/index.ts';
import { MetroidvaniaWorlds } from '../../contracts/metroidvania.ts';

const ID = /^[a-z0-9][a-z0-9./_-]*$/i;
const TILE_CHARS = /^[.#=^]+$/;

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finite(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

/**
 * Validate the authored metroidvania world. This checks graph/geometry references and a few structural invariants;
 * physical jump reachability remains a playtest concern.
 */
export function loadWorld(data: unknown, c: ContentLoadContext): void {
  const r = c.r;
  if (!isObject(data)) { r.error('expected a metroidvania world object'); return; }
  const id = data['id'], name = data['name'], subtitle = data['subtitle'], intro = data['intro'], startRoom = data['startRoom'];
  if (typeof id !== 'string' || !ID.test(id) || id.length > 80) r.at('id').error('must be a valid content id');
  if (!text(name) || name.length > 80) r.at('name').error('must be a nonblank name');
  if (!text(subtitle) || subtitle.length > 120) r.at('subtitle').error('must be a nonblank subtitle');
  if (!text(intro) || intro.length > 800) r.at('intro').error('must be a nonblank introduction');
  if (typeof startRoom !== 'string' || !startRoom) r.at('startRoom').error('must name the starting room');

  const regions: MetroRegion[] = [];
  const rawRegions = data['regions'];
  if (!Array.isArray(rawRegions) || rawRegions.length < 1 || rawRegions.length > 32) r.at('regions').error('must contain 1..32 regions');
  else rawRegions.forEach((value, index) => {
    const at = r.at('regions').at(index);
    if (!isObject(value)) { at.error('expected a region object'); return; }
    if (typeof value['id'] !== 'string' || !ID.test(value['id'])) at.at('id').error('must be a valid region id');
    if (!text(value['name']) || value['name'].length > 80) at.at('name').error('must be a nonblank name');
    if (!text(value['color']) || !/^#[0-9a-f]{6}$/i.test(value['color'])) at.at('color').error('must be a #rrggbb colour');
    if (!text(value['background']) || value['background'].length > 200) at.at('background').error('must be a presentation asset path');
    if (regions.some(region => region.id === value['id'])) at.at('id').error('region ids must be unique');
    if (typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['color'] === 'string' && typeof value['background'] === 'string')
      regions.push({ id: value['id'], name: value['name'], color: value['color'], background: value['background'] });
  });
  const regionIds = new Set(regions.map(region => region.id));

  const abilities: MetroAbility[] = [];
  const rawAbilities = data['abilities'];
  if (!Array.isArray(rawAbilities) || rawAbilities.length < 1 || rawAbilities.length > 32) r.at('abilities').error('must contain 1..32 abilities');
  else rawAbilities.forEach((value, index) => {
    const at = r.at('abilities').at(index);
    if (!isObject(value)) { at.error('expected an ability object'); return; }
    if (typeof value['id'] !== 'string' || !ID.test(value['id'])) at.at('id').error('must be a valid ability id');
    if (!text(value['name']) || value['name'].length > 80) at.at('name').error('must be a nonblank name');
    if (!text(value['description']) || value['description'].length > 500) at.at('description').error('must be a useful description');
    if (!['movement', 'combat', 'utility'].includes(String(value['kind']))) at.at('kind').error('must be movement, combat or utility');
    if (!text(value['icon']) || value['icon'].length > 200) at.at('icon').error('must be a presentation asset path');
    if (!text(value['control']) || value['control'].length > 80) at.at('control').error('must describe a control');
    if (abilities.some(ability => ability.id === value['id'])) at.at('id').error('ability ids must be unique');
    if (typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['description'] === 'string'
      && typeof value['kind'] === 'string' && typeof value['icon'] === 'string' && typeof value['control'] === 'string')
      abilities.push({ id: value['id'], name: value['name'], description: value['description'], kind: value['kind'] as MetroAbility['kind'], icon: value['icon'], control: value['control'] });
  });
  const abilityIds = new Set(abilities.map(ability => ability.id));

  const enemies: MetroEnemyType[] = [];
  const rawEnemies = data['enemies'];
  if (!Array.isArray(rawEnemies) || rawEnemies.length < 1 || rawEnemies.length > 64) r.at('enemies').error('must contain 1..64 enemy types');
  else rawEnemies.forEach((value, index) => {
    const at = r.at('enemies').at(index);
    if (!isObject(value)) { at.error('expected an enemy type'); return; }
    if (typeof value['id'] !== 'string' || !ID.test(value['id'])) at.at('id').error('must be a valid enemy id');
    if (!text(value['name']) || value['name'].length > 80) at.at('name').error('must be a nonblank name');
    if (!['walker', 'charger', 'flyer', 'boss'].includes(String(value['kind']))) at.at('kind').error('must be walker, charger, flyer or boss');
    for (const field of ['health', 'damage', 'speed', 'w', 'h', 'attackRange'] as const) {
      if (!finite(value[field], field === 'health' ? 1 : 0, 1000)) at.at(field).error('must be a finite nonnegative number');
    }
    if (!['grunt', 'spitter', 'spider', 'skeleton', 'ghost', 'golem', 'bat'].includes(String(value['sprite']))) at.at('sprite').error('unknown sprite key');
    if (value['tint'] !== undefined && (typeof value['tint'] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value['tint']))) at.at('tint').error('must be #rrggbb');
    if (value['scale'] !== undefined && !finite(value['scale'], 0.2, 4)) at.at('scale').error('must be 0.2..4');
    if (value['projectile'] !== undefined && typeof value['projectile'] !== 'boolean') at.at('projectile').error('must be boolean');
    if (value['boss'] !== undefined && typeof value['boss'] !== 'boolean') at.at('boss').error('must be boolean');
    if (enemies.some(enemy => enemy.id === value['id'])) at.at('id').error('enemy ids must be unique');
    if (typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['kind'] === 'string'
      && typeof value['health'] === 'number' && typeof value['damage'] === 'number' && typeof value['speed'] === 'number'
      && typeof value['w'] === 'number' && typeof value['h'] === 'number' && typeof value['sprite'] === 'string'
      && typeof value['attackRange'] === 'number')
      enemies.push({ id: value['id'], name: value['name'], kind: value['kind'] as MetroEnemyType['kind'], health: value['health'], damage: value['damage'], speed: value['speed'], w: value['w'], h: value['h'], sprite: value['sprite'] as MetroEnemyType['sprite'], ...(typeof value['tint'] === 'string' ? { tint: value['tint'] } : {}), ...(typeof value['scale'] === 'number' ? { scale: value['scale'] } : {}), attackRange: value['attackRange'], ...(value['projectile'] === true ? { projectile: true } : {}), ...(value['boss'] === true ? { boss: true } : {}) });
  });
  const enemyIds = new Set(enemies.map(enemy => enemy.id));

  const rooms: MetroRoom[] = [];
  const rawRooms = data['rooms'];
  if (!Array.isArray(rawRooms) || rawRooms.length < 1 || rawRooms.length > 128) r.at('rooms').error('must contain 1..128 rooms');
  else rawRooms.forEach((value, index) => {
    const at = r.at('rooms').at(index);
    if (!isObject(value)) { at.error('expected a room object'); return; }
    if (typeof value['id'] !== 'string' || !ID.test(value['id'])) at.at('id').error('must be a valid room id');
    if (!text(value['name']) || value['name'].length > 80) at.at('name').error('must be a nonblank name');
    if (typeof value['region'] !== 'string' || !regionIds.has(value['region'])) at.at('region').error('must reference a declared region');
    if (!['moss', 'root', 'archive', 'keep', 'throne'].includes(String(value['tileset']))) at.at('tileset').error('unknown tileset');
    const map = value['map'];
    if (!isObject(map)) at.at('map').error('expected a map rectangle');
    else {
      for (const field of ['x', 'y', 'w', 'h'] as const) if (!integer(map[field], 0, 512)) at.at('map').at(field).error('must be an integer 0..512');
      if (typeof map['w'] === 'number' && map['w'] < 1) at.at('map').at('w').error('must be positive');
      if (typeof map['h'] === 'number' && map['h'] < 1) at.at('map').at('h').error('must be positive');
    }
    const rawRows = value['rows'];
    const rows: string[] = [];
    if (!Array.isArray(rawRows) || rawRows.length < 8 || rawRows.length > 40) at.at('rows').error('must contain 8..40 rows');
    else {
      rawRows.forEach((row, rowIndex) => {
        if (typeof row !== 'string' || row.length < 10 || row.length > 80) at.at('rows').at(rowIndex).error('row must be a 10..80 character string');
        else {
          if (!TILE_CHARS.test(row)) at.at('rows').at(rowIndex).error('use only ., #, = and ^');
          if (rows.length && row.length !== rows[0]!.length) at.at('rows').at(rowIndex).error('all rows must have the same width');
          rows.push(row);
        }
      });
      if (rows.length && !rows.some(row => row.includes('.'))) at.at('rows').error('room must contain walkable space');
    }
    const width = rows[0]?.length ?? 0, height = rows.length;
    const rawDoors = value['doors'];
    const doors: MetroDoor[] = [];
    if (!Array.isArray(rawDoors)) at.at('doors').error('must be an array');
    else rawDoors.forEach((door, doorIndex) => {
      const d = at.at('doors').at(doorIndex);
      if (!isObject(door)) { d.error('expected a door object'); return; }
      if (typeof door['id'] !== 'string' || !door['id']) d.at('id').error('must be nonblank');
      if (!text(door['label'])) d.at('label').error('must be nonblank');
      for (const field of ['x', 'y', 'w', 'h'] as const) if (!finite(door[field], 0, 200)) d.at(field).error('must be a finite positive rectangle size');
      if (!text(door['to'])) d.at('to').error('must name a destination room');
      const entry = door['entry'];
      if (!isObject(entry) || !finite(entry['x'], 0, 200) || !finite(entry['y'], 0, 200)) d.at('entry').error('must contain finite x/y');
      if (door['requires'] !== undefined && typeof door['requires'] !== 'string') d.at('requires').error('must be an ability id');
      if (door['requires'] !== undefined && typeof door['requires'] === 'string' && !abilityIds.has(door['requires'])) d.at('requires').error('must reference a declared ability');
      if (door['requiresItems'] !== undefined && (!Array.isArray(door['requiresItems']) || door['requiresItems'].some(item => typeof item !== 'string'))) d.at('requiresItems').error('must be an array of item ids');
      if (typeof door['id'] === 'string' && typeof door['label'] === 'string' && typeof door['to'] === 'string' && isObject(entry)
        && typeof door['x'] === 'number' && typeof door['y'] === 'number' && typeof door['w'] === 'number' && typeof door['h'] === 'number'
        && typeof entry['x'] === 'number' && typeof entry['y'] === 'number')
        doors.push({ id: door['id'], label: door['label'], x: door['x'], y: door['y'], w: door['w'], h: door['h'], to: door['to'], entry: { x: entry['x'], y: entry['y'] }, ...(typeof door['requires'] === 'string' ? { requires: door['requires'] } : {}), ...(Array.isArray(door['requiresItems']) ? { requiresItems: door['requiresItems'] as string[] } : {}), ...(typeof door['message'] === 'string' ? { message: door['message'] } : {}) });
    });
    const rawPickups = value['pickups'];
    const pickups: MetroPickupSpawn[] = [];
    if (!Array.isArray(rawPickups)) at.at('pickups').error('must be an array');
    else rawPickups.forEach((pickup, pickupIndex) => {
      const p = at.at('pickups').at(pickupIndex);
      if (!isObject(pickup)) { p.error('expected a pickup object'); return; }
      if (typeof pickup['id'] !== 'string' || !pickup['id']) p.at('id').error('must be nonblank');
      if (!['ability', 'item', 'health', 'focus', 'ember', 'lore'].includes(String(pickup['kind']))) p.at('kind').error('unknown pickup kind');
      if (!finite(pickup['x'], 0, 200) || !finite(pickup['y'], 0, 200)) p.error('pickup needs finite x/y');
      if (!text(pickup['label']) || pickup['label'].length > 120) p.at('label').error('must be a useful label');
      if (!text(pickup['icon']) || pickup['icon'].length > 200) p.at('icon').error('must be a presentation asset path');
      if (pickup['kind'] === 'ability' && (typeof pickup['key'] !== 'string' || !abilityIds.has(pickup['key']))) p.at('key').error('must reference a declared ability');
      if (pickup['kind'] === 'item' && (typeof pickup['key'] !== 'string' || !ID.test(pickup['key']))) p.at('key').error('must reference an item id');
      if (pickup['amount'] !== undefined && !finite(pickup['amount'], 0, 1000)) p.at('amount').error('must be a finite amount');
      if (pickup['text'] !== undefined && (typeof pickup['text'] !== 'string' || pickup['text'].length > 800)) p.at('text').error('lore text is too long');
      if (typeof pickup['id'] === 'string' && typeof pickup['kind'] === 'string' && typeof pickup['label'] === 'string'
        && typeof pickup['icon'] === 'string' && typeof pickup['x'] === 'number' && typeof pickup['y'] === 'number')
        pickups.push({ id: pickup['id'], x: pickup['x'], y: pickup['y'], kind: pickup['kind'] as MetroPickupSpawn['kind'], label: pickup['label'], icon: pickup['icon'], ...(typeof pickup['key'] === 'string' ? { key: pickup['key'] } : {}), ...(typeof pickup['amount'] === 'number' ? { amount: pickup['amount'] } : {}), ...(typeof pickup['text'] === 'string' ? { text: pickup['text'] } : {}) });
    });
    const rawEnemySpawns = value['enemies'];
    const enemySpawns: MetroEnemySpawn[] = [];
    if (!Array.isArray(rawEnemySpawns)) at.at('enemies').error('must be an array');
    else rawEnemySpawns.forEach((spawn, spawnIndex) => {
      const e = at.at('enemies').at(spawnIndex);
      if (!isObject(spawn)) { e.error('expected an enemy spawn'); return; }
      if (typeof spawn['id'] !== 'string' || !spawn['id']) e.at('id').error('must be nonblank');
      if (typeof spawn['type'] !== 'string' || !enemyIds.has(spawn['type'])) e.at('type').error('must reference a declared enemy');
      if (!finite(spawn['x'], 0, 200) || !finite(spawn['y'], 0, 200)) e.error('enemy spawn needs finite x/y');
      if (spawn['patrol'] !== undefined && !finite(spawn['patrol'], 0, 200)) e.at('patrol').error('must be finite');
      if (spawn['elite'] !== undefined && typeof spawn['elite'] !== 'boolean') e.at('elite').error('must be boolean');
      if (typeof spawn['id'] === 'string' && typeof spawn['type'] === 'string' && typeof spawn['x'] === 'number' && typeof spawn['y'] === 'number')
        enemySpawns.push({ id: spawn['id'], type: spawn['type'], x: spawn['x'], y: spawn['y'], ...(typeof spawn['patrol'] === 'number' ? { patrol: spawn['patrol'] } : {}), ...(spawn['elite'] === true ? { elite: true } : {}) });
    });
    const rawCheckpoints = value['checkpoints'];
    const checkpoints: MetroCheckpoint[] = [];
    if (!Array.isArray(rawCheckpoints)) at.at('checkpoints').error('must be an array');
    else rawCheckpoints.forEach((checkpoint, checkpointIndex) => {
      const p = at.at('checkpoints').at(checkpointIndex);
      if (!isObject(checkpoint)) { p.error('expected a checkpoint'); return; }
      if (typeof checkpoint['id'] !== 'string' || !checkpoint['id']) p.at('id').error('must be nonblank');
      if (!text(checkpoint['name']) || checkpoint['name'].length > 80) p.at('name').error('must be nonblank');
      if (!finite(checkpoint['x'], 0, 200) || !finite(checkpoint['y'], 0, 200)) p.error('checkpoint needs finite x/y');
      if (typeof checkpoint['id'] === 'string' && typeof checkpoint['name'] === 'string' && typeof checkpoint['x'] === 'number' && typeof checkpoint['y'] === 'number')
        checkpoints.push({ id: checkpoint['id'], name: checkpoint['name'], x: checkpoint['x'], y: checkpoint['y'] });
    });
    const rawNpcs = value['npcs'];
    const npcs: MetroNpcSpawn[] = [];
    if (!Array.isArray(rawNpcs)) at.at('npcs').error('must be an array');
    else rawNpcs.forEach((npc, npcIndex) => {
      const n = at.at('npcs').at(npcIndex);
      if (!isObject(npc)) { n.error('expected an NPC'); return; }
      if (typeof npc['id'] !== 'string' || !npc['id']) n.at('id').error('must be nonblank');
      if (!text(npc['name']) || npc['name'].length > 80) n.at('name').error('must be nonblank');
      if (!['smith', 'scholar'].includes(String(npc['role']))) n.at('role').error('must be smith or scholar');
      if (!text(npc['title']) || npc['title'].length > 120) n.at('title').error('must be nonblank');
      if (!text(npc['line']) || npc['line'].length > 500) n.at('line').error('must be nonblank');
      if (!text(npc['portrait']) || npc['portrait'].length > 200) n.at('portrait').error('must be a presentation asset path');
      if (!finite(npc['x'], 0, 200) || !finite(npc['y'], 0, 200)) n.error('NPC needs finite x/y');
      if (typeof npc['id'] === 'string' && typeof npc['name'] === 'string' && typeof npc['role'] === 'string'
        && typeof npc['title'] === 'string' && typeof npc['line'] === 'string' && typeof npc['portrait'] === 'string'
        && typeof npc['x'] === 'number' && typeof npc['y'] === 'number')
        npcs.push({ id: npc['id'], name: npc['name'], role: npc['role'] as MetroNpcSpawn['role'], title: npc['title'], line: npc['line'], portrait: npc['portrait'], x: npc['x'], y: npc['y'] });
    });
    const rawProps = value['props'];
    const props: MetroProp[] = [];
    if (!Array.isArray(rawProps)) at.at('props').error('must be an array');
    else rawProps.forEach((prop, propIndex) => {
      const p = at.at('props').at(propIndex);
      if (!isObject(prop) || !['arch', 'root', 'torch', 'banner', 'rune', 'statue', 'crystal'].includes(String(prop['kind']))) { p.error('expected a known prop kind'); return; }
      if (!finite(prop['x'], 0, 200) || !finite(prop['y'], 0, 200)) p.error('prop needs finite x/y');
      if (prop['w'] !== undefined && !finite(prop['w'], 0, 200)) p.at('w').error('must be finite');
      if (prop['h'] !== undefined && !finite(prop['h'], 0, 200)) p.at('h').error('must be finite');
      if (typeof prop['kind'] === 'string' && typeof prop['x'] === 'number' && typeof prop['y'] === 'number')
        props.push({ kind: prop['kind'] as MetroProp['kind'], x: prop['x'], y: prop['y'], ...(typeof prop['w'] === 'number' ? { w: prop['w'] } : {}), ...(typeof prop['h'] === 'number' ? { h: prop['h'] } : {}) });
    });
    if (typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['region'] === 'string'
      && typeof value['tileset'] === 'string' && isObject(map) && typeof map['x'] === 'number' && typeof map['y'] === 'number'
      && typeof map['w'] === 'number' && typeof map['h'] === 'number' && rows.length)
      rooms.push({ id: value['id'], name: value['name'], region: value['region'], map: { x: map['x'], y: map['y'], w: map['w'], h: map['h'] }, tileset: value['tileset'] as MetroRoom['tileset'], rows, doors, pickups, enemies: enemySpawns, checkpoints, npcs, props });
  });
  const roomIds = new Set(rooms.map(room => room.id));
  const pickupIds = new Set<string>();
  for (const [index, room] of rooms.entries()) {
    for (const [doorIndex, door] of room.doors.entries()) if (!roomIds.has(door.to)) r.at('rooms').at(index).at('doors').at(doorIndex).at('to').error('references an unknown room');
    for (const [pickupIndex, pickup] of room.pickups.entries()) {
      if (pickupIds.has(pickup.id)) r.at('rooms').at(index).at('pickups').at(pickupIndex).at('id').error('pickup ids must be unique across the world');
      pickupIds.add(pickup.id);
    }
  }
  if (typeof startRoom === 'string' && !roomIds.has(startRoom)) r.at('startRoom').error('must reference a declared room');
  // Every authored room must be reachable in the graph ignoring ability gates. Physical reachability is playtested.
  if (typeof startRoom === 'string' && roomIds.has(startRoom)) {
    const seen = new Set([startRoom]);
    const queue = [startRoom];
    while (queue.length) {
      const current = queue.shift()!;
      const room = rooms.find(candidate => candidate.id === current);
      if (!room) continue;
      for (const door of room.doors) if (!seen.has(door.to)) { seen.add(door.to); queue.push(door.to); }
    }
    for (const room of rooms) if (!seen.has(room.id)) r.at('rooms').error(`room "${room.id}" is not connected from the start room`);
  }
  // World map rectangles should not overlap; overlap makes the map unreadable.
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i]!.map, b = rooms[j]!.map;
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
      r.at('rooms').at(i).at('map').error(`overlaps room "${rooms[j]!.id}" on the world map`);
  }
  const victory = data['victory'];
  if (!isObject(victory) || !text(victory['title']) || !text(victory['text'])) r.at('victory').error('must contain title and text');
  if (typeof id === 'string' && typeof name === 'string' && typeof subtitle === 'string' && typeof intro === 'string'
    && typeof startRoom === 'string' && regions.length && rooms.length && abilities.length && enemies.length && isObject(victory)
    && typeof victory['title'] === 'string' && typeof victory['text'] === 'string')
    c.register(MetroidvaniaWorlds, id, Object.freeze({
      id, name, subtitle, intro, startRoom, regions: Object.freeze(regions), rooms: Object.freeze(rooms),
      abilities: Object.freeze(abilities), enemies: Object.freeze(enemies), victory: Object.freeze({ title: victory['title'], text: victory['text'] }),
    }) as MetroWorld);
}
