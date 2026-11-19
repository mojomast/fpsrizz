import type { CellDesc, Json, LightDesc, MapFormat, Reporter, SolidDesc, SpawnDesc, TriggerDesc, WorldDescription } from '@bulkhead/sdk';
import { MapFormats, Prefabs, definePlugin, isObject, vArray, vNumber, vObject, vString } from '@bulkhead/sdk';

const MAX_SIZE = 96;
type Rng = { next(): number; int(min: number, max: number): number };
type Rect = { x: number; z: number; w: number; h: number; cx: number; cz: number; index: number };

function seeded(seed: number): Rng {
  let state = (seed >>> 0) || 1;
  const next = (): number => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
  return { next, int: (min, max) => Math.floor(min + next() * (max - min)) };
}

function color(value: unknown, r: Reporter, fallback: string): number | undefined {
  const text = value === undefined ? fallback : vString(value, r, { max: 7 });
  const hex = text ?? fallback;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : r.error(`"${hex}" must be a colour like "#ffaa33"`);
}

function surfaces(value: unknown, r: Reporter): { border: string; wall: string; room: string; corridor: string; ceiling: string } | undefined {
  const object = vObject(value, r);
  if (!object) return undefined;
  const read = (key: string, fallback: string): string | undefined => object[key] === undefined ? fallback : vString(object[key], r.at(key), { max: 60 });
  const border = read('border', 'wall-brick'), wall = read('wall', 'wall-panel'), room = read('room', 'floor-concrete');
  const corridor = read('corridor', 'floor-plate'), ceiling = read('ceiling', 'ceiling-panel');
  return border && wall && room && corridor && ceiling ? { border, wall, room, corridor, ceiling } : undefined;
}

function build(id: string, data: Json, r: Reporter): WorldDescription | undefined {
  if (!isObject(data)) return r.error('expected a dungeon recipe object');
  const schema = vNumber(data['schema'], r.at('schema'), { int: true, min: 1, max: 1 });
  const name = vString(data['name'] ?? 'Procedural dungeon', r.at('name'), { max: 80 });
  const seed = vNumber(data['seed'], r.at('seed'), { int: true, min: 0, max: 4294967295 });
  const cellSize = data['cellSize'] === undefined ? 2 : vNumber(data['cellSize'], r.at('cellSize'), { min: 1, max: 8 });
  const wallHeight = data['wallHeight'] === undefined ? 4 : vNumber(data['wallHeight'], r.at('wallHeight'), { min: 2, max: 8 });
  const floorWidth = data['floorWidth'] === undefined ? 30 : vNumber(data['floorWidth'], r.at('floorWidth'), { int: true, min: 18, max: 48 });
  const floorHeight = data['floorHeight'] === undefined ? 30 : vNumber(data['floorHeight'], r.at('floorHeight'), { int: true, min: 18, max: 48 });
  const gap = data['gap'] === undefined ? 2 : vNumber(data['gap'], r.at('gap'), { int: true, min: 1, max: 4 });
  const markerPrefab = data['markerPrefab'] === undefined ? 'dungeon/marker' : vString(data['markerPrefab'], r.at('markerPrefab'), { max: 120 });
  const surf = surfaces(data['surfaces'] ?? {}, r.at('surfaces'));
  const ambientObject = data['ambient'] === undefined ? {} : vObject(data['ambient'], r.at('ambient'));
  const fogObject = data['fog'] === undefined ? {} : vObject(data['fog'], r.at('fog'));
  const ambientColor = color(ambientObject?.['color'], r.at('ambient').at('color'), '#c9b89b');
  const ambientIntensity = vNumber(ambientObject?.['intensity'] ?? 0.9, r.at('ambient').at('intensity'), { min: 0, max: 4 });
  const fogColor = color(fogObject?.['color'], r.at('fog').at('color'), '#241e1b');
  const fogNear = vNumber(fogObject?.['near'] ?? 8, r.at('fog').at('near'), { min: 0, max: 500 });
  const fogFar = vNumber(fogObject?.['far'] ?? 46, r.at('fog').at('far'), { min: 1, max: 1000 });
  const torchObject = vObject(data['torch'] ?? {}, r.at('torch'));
  const torchColor = color(torchObject?.['color'], r.at('torch').at('color'), '#ffbc64');
  const torchIntensity = vNumber(torchObject?.['intensity'] ?? 1.5, r.at('torch').at('intensity'), { min: 0, max: 8 });
  const torchDistance = vNumber(torchObject?.['distance'] ?? 12, r.at('torch').at('distance'), { min: 1, max: 60 });
  const floorList = vArray(data['floors'], r.at('floors'), { min: 1, max: 3 });
  if (floorList === undefined) return undefined;
  const floors: { name: string; rooms: number }[] = [];
  for (let i = 0; i < floorList.length; i++) {
    const floor = vObject(floorList[i], r.at('floors').at(i));
    if (!floor) continue;
    const floorName = vString(floor['name'] ?? `Depth ${i + 1}`, r.at('floors').at(i).at('name'), { max: 60 });
    const rooms = vNumber(floor['rooms'] ?? 7, r.at('floors').at(i).at('rooms'), { int: true, min: 4, max: 12 });
    if (floorName && rooms) floors.push({ name: floorName, rooms });
  }
  if (!schema || !name || seed === undefined || !cellSize || !wallHeight || !floorWidth || !floorHeight || !gap ||
      !markerPrefab || !surf || ambientColor === undefined || !ambientIntensity || fogColor === undefined ||
      fogNear === undefined || fogFar === undefined || torchColor === undefined || !torchIntensity || !torchDistance ||
      floors.length !== floorList.length || r.failed) return undefined;
  if (fogFar <= fogNear) return r.at('fog').error('"far" must be greater than "near"');
  const width = floors.length * floorWidth + (floors.length - 1) * gap;
  if (width > MAX_SIZE || floorHeight > MAX_SIZE) return r.at('floors').error(`dungeon is ${width}x${floorHeight} cells; each dimension must be at most ${MAX_SIZE}`);

  const cells: CellDesc[] = Array.from({ length: width * floorHeight }, () => ({
    solid: true, wall: surf.border, floor: '', ceiling: '',
  }));
  const spawns: SpawnDesc[] = [];
  const triggers: TriggerDesc[] = [];
  const lights: LightDesc[] = [];
  let playerStart = { x: cellSize * 1.5, z: cellSize * 1.5, yaw: 0 };

  for (let depth = 0; depth < floors.length; depth++) {
    const ox = depth * (floorWidth + gap);
    const rng = seeded((seed ^ (Math.imul(depth + 1, 0x9e3779b1))) >>> 0);
    const floor = floors[depth]!;
    const interiorX = ox + 1, interiorZ = 1, interiorW = floorWidth - 2, interiorH = floorHeight - 2;
    const fill = (x: number, z: number, cell: CellDesc) => { cells[z * width + x] = cell; };
    for (let z = interiorZ; z < interiorZ + interiorH; z++) {
      for (let x = interiorX; x < interiorX + interiorW; x++) fill(x, z, { solid: true, wall: surf.wall, floor: '', ceiling: '' });
    }

    const cols = Math.ceil(Math.sqrt(floor.rooms));
    const rows = Math.ceil(floor.rooms / cols);
    const slots: { x0: number; x1: number; z0: number; z1: number; col: number; row: number }[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        slots.push({
          x0: interiorX + Math.floor(col * interiorW / cols),
          x1: interiorX + Math.floor((col + 1) * interiorW / cols),
          z0: interiorZ + Math.floor(row * interiorH / rows),
          z1: interiorZ + Math.floor((row + 1) * interiorH / rows),
          col, row,
        });
      }
    }
    // Deterministic shuffle, then keep exactly the requested room count.
    for (let i = slots.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      const swap = slots[i]!; slots[i] = slots[j]!; slots[j] = swap;
    }
    const used = slots.slice(0, floor.rooms).sort((a, b) => a.row - b.row || a.col - b.col);
    const rooms: Rect[] = used.map((slot, index) => {
      const maxW = slot.x1 - slot.x0 - 2, maxH = slot.z1 - slot.z0 - 2;
      if (maxW < 4 || maxH < 4) return r.at('floors').at(depth).at('rooms').error('room slots are too small; reduce floors/rooms or enlarge the floor');
      const w = rng.int(Math.min(6, maxW), maxW + 1);
      const h = rng.int(Math.min(6, maxH), maxH + 1);
      const x = rng.int(slot.x0 + 1, slot.x1 - w);
      const z = rng.int(slot.z0 + 1, slot.z1 - h);
      for (let cz = z; cz < z + h; cz++) {
        for (let cx = x; cx < x + w; cx++) fill(cx, cz, { solid: false, wall: '', floor: surf.room, ceiling: surf.ceiling });
      }
      return { x, z, w, h, cx: x + Math.floor(w / 2), cz: z + Math.floor(h / 2), index };
    }) as Rect[];
    if (r.failed) return undefined;

    const carve = (x: number, z: number) => {
      if (x <= ox || x >= ox + floorWidth - 1 || z <= 0 || z >= floorHeight - 1) return;
      const current = cells[z * width + x]!;
      if (current.solid) fill(x, z, { solid: false, wall: '', floor: surf.corridor, ceiling: surf.ceiling });
    };
    const connect = (a: Rect, b: Rect) => {
      const horizontalFirst = rng.next() < 0.5;
      if (horizontalFirst) {
        const dir = b.cx >= a.cx ? 1 : -1;
        for (let x = a.cx; x !== b.cx + dir; x += dir) carve(x, a.cz);
        const dirZ = b.cz >= a.cz ? 1 : -1;
        for (let z = a.cz; z !== b.cz + dirZ; z += dirZ) carve(b.cx, z);
      } else {
        const dirZ = b.cz >= a.cz ? 1 : -1;
        for (let z = a.cz; z !== b.cz + dirZ; z += dirZ) carve(a.cx, z);
        const dir = b.cx >= a.cx ? 1 : -1;
        for (let x = a.cx; x !== b.cx + dir; x += dir) carve(x, b.cz);
      }
    };
    // Prim-style nearest-room connection keeps every room reachable while allowing branches.
    const connected = [rooms[0]!], remaining = rooms.slice(1);
    while (remaining.length) {
      let best: { a: Rect; b: Rect; d: number } | undefined;
      for (const a of connected) for (const b of remaining) {
        const d = Math.abs(a.cx - b.cx) + Math.abs(a.cz - b.cz);
        if (!best || d < best.d) best = { a, b, d };
      }
      const pick = best!;
      connect(pick.a, pick.b);
      connected.push(pick.b);
      remaining.splice(remaining.indexOf(pick.b), 1);
    }
    if (rooms.length > 4) {
      const a = rooms[rng.int(0, rooms.length)]!, b = rooms[rng.int(0, rooms.length)]!;
      if (a !== b) connect(a, b);
    }

    let start = rooms[0]!, exit = rooms[1]!, bestDistance = -1;
    for (const a of rooms) for (const b of rooms) {
      const d = Math.abs(a.cx - b.cx) + Math.abs(a.cz - b.cz);
      if (d > bestDistance) { bestDistance = d; start = a; exit = b; }
    }
    let warden = start, wardenDistance = -1;
    for (const room of rooms) {
      if (room === start || room === exit) continue;
      const d = Math.abs(room.cx - start.cx) + Math.abs(room.cz - start.cz);
      if (d > wardenDistance) { wardenDistance = d; warden = room; }
    }

    const world = (room: Rect) => ({ x: (room.cx + 0.5) * cellSize, z: (room.cz + 0.5) * cellSize });
    const exitCell = (room: Rect): { x: number; z: number } | null => {
      const candidates: { x: number; z: number; d: number }[] = [];
      for (let x = room.x; x < room.x + room.w; x++) {
        for (const z of [room.z - 1, room.z + room.h]) {
          const cell = cells[z * width + x];
          if (cell && !cell.solid && cell.floor === surf.corridor) candidates.push({ x, z, d: Math.abs(x - room.cx) + Math.abs(z - room.cz) });
        }
      }
      for (let z = room.z; z < room.z + room.h; z++) {
        for (const x of [room.x - 1, room.x + room.w]) {
          const cell = cells[z * width + x];
          if (cell && !cell.solid && cell.floor === surf.corridor) candidates.push({ x, z, d: Math.abs(x - room.cx) + Math.abs(z - room.cz) });
        }
      }
      candidates.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
      return candidates[0] ?? null;
    };
    const startExit = exitCell(start);
    const startYaw = startExit
      ? Math.atan2(-((startExit.x - start.cx) * cellSize), -((startExit.z - start.cz) * cellSize))
      : 0;
    if (depth === 0) playerStart = { ...world(start), yaw: startYaw };
    for (const room of rooms) {
      const role = room === start ? 'start' : room === exit ? 'exit' : room === warden ? 'warden' : 'loot';
      const at = world(room);
      spawns.push({
        id: `depth-${depth + 1}-room-${room.index}`,
        prefab: markerPrefab,
        x: at.x, z: at.z, yaw: room === start ? startYaw : 0,
        tags: ['dungeon-room', `dungeon-depth-${depth + 1}`, `dungeon-role-${role}`, 'dungeon-spawn'],
        params: { room: room.index, depth: depth + 1, role },
      });
      if (room === start || room === exit || room === warden) {
        lights.push({
          id: `depth-${depth + 1}-light-${role}`,
          x: at.x, y: 2.4, z: at.z,
          color: torchColor, intensity: torchIntensity, distance: torchDistance,
        });
      }
    }
    const exitAt = world(exit);
    triggers.push({
      id: `depth-${depth + 1}-descent`,
      kind: 'zone', x: exitAt.x, z: exitAt.z, radius: cellSize * 1.05,
      tags: ['exit', 'dungeon-exit', `dungeon-depth-${depth + 1}`],
      opens: '', nx: 0, nz: 0, once: false,
    });
  }

  const solids: SolidDesc[] = [];
  for (let z = 0; z < floorHeight; z++) {
    let x = 0;
    while (x < width) {
      const cell = cells[z * width + x]!;
      if (!cell.solid) { x++; continue; }
      const wall = cell.wall || surf.border;
      let end = x + 1;
      while (end < width && cells[z * width + end]!.solid && (cells[z * width + end]!.wall || surf.border) === wall) end++;
      solids.push({ id: `wall-${x}-${z}`, minX: x * cellSize, minZ: z * cellSize, maxX: end * cellSize, maxZ: (z + 1) * cellSize, surface: wall });
      x = end;
    }
  }
  return {
    id, name, cellSize, width, height: floorHeight, wallHeight, cells, solids,
    doors: [], spawns, triggers, lights, playerStart,
    ambient: { color: ambientColor, intensity: ambientIntensity },
    fog: { color: fogColor, near: fogNear, far: fogFar },
  };
}

export default definePlugin({
  register(ctx) {
    ctx.register(MapFormats, 'dungeon/generator', {
      description: 'Seeded room-and-corridor grid wings with room markers, descent pads and lights.',
      build,
    } satisfies MapFormat);
    ctx.register(Prefabs, 'dungeon/marker', {
      description: 'Inert map marker consumed by a game mode; produces an empty entity if spawned.',
      start(owner) { return () => owner.world.create(); },
    });
  },
});
