import type { CellDesc, DoorDesc, Json, LightDesc, Reporter, SolidDesc, SpawnDesc, TriggerDesc, WorldDescription } from '../../sdk/index.ts';
import { isObject, vArray, vBool, vJson, vNumber, vObject, vOneOf, vString } from '../../sdk/index.ts';

export const GRID_MAP_SCHEMA = 1;
const MAX_CELLS = 96;

function vColor(v: unknown, r: Reporter): number | undefined {
  const s = vString(v, r);
  if (s === undefined) return undefined;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return r.error(`"${s}" is not a colour like "#ffaa33"`);
  return parseInt(s.slice(1), 16);
}

function vLocalId(v: unknown, r: Reporter, seen: Set<string>): string | undefined {
  const s = vString(v, r, { max: 60 });
  if (s === undefined) return undefined;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) return r.error(`"${s}" must be lowercase letters, digits and "-"`);
  if (seen.has(s)) return r.error(`duplicate id "${s}"; ids of doors, spawns, triggers and lights must be unique within a map`);
  seen.add(s);
  return s;
}

function vTags(v: unknown, r: Reporter): string[] | undefined {
  if (v === undefined) return [];
  const a = vArray(v, r, { max: 16 });
  if (!a) return undefined;
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const s = vString(a[i], r.at(i), { max: 40 });
    if (s === undefined) return undefined;
    out.push(s);
  }
  return out;
}

/**
 * Translates the grid authoring format (schema 1) into the authoritative WorldDescription.
 * Nothing outside this file interprets tile characters.
 */
export function buildGridMap(id: string, data: Json, r: Reporter): WorldDescription | undefined {
  const before = r.issues.length;
  const o = vObject(data, r);
  if (!o) return undefined;
  if (o.schema !== GRID_MAP_SCHEMA) return r.at('schema').error(`unsupported grid map schema ${JSON.stringify(o.schema)}; this build understands schema ${GRID_MAP_SCHEMA}`);
  const name = vString(o.name, r.at('name'), { max: 80 }) ?? '';
  const cs = o.cellSize === undefined ? 2 : (vNumber(o.cellSize, r.at('cellSize'), { min: 1, max: 8 }) ?? 2);
  const wallHeight = o.wallHeight === undefined ? 3 : (vNumber(o.wallHeight, r.at('wallHeight'), { min: 2, max: 8 }) ?? 3);

  // legend
  const legend = new Map<string, CellDesc>();
  const lo = vObject(o.legend, r.at('legend'));
  if (lo)
    for (const [ch, def] of Object.entries(lo)) {
      const lr = r.at('legend').at(ch);
      if (ch.length !== 1) {
        lr.error('legend keys must be single characters');
        continue;
      }
      const d = vObject(def, lr);
      if (!d) continue;
      const solid = d.solid === undefined ? false : (vBool(d.solid, lr.at('solid')) ?? false);
      const tex = (k: string): string => (d[k] === undefined ? '' : (vString(d[k], lr.at(k), { max: 60 }) ?? ''));
      const cell: CellDesc = { solid, wall: tex('wall'), floor: tex('floor'), ceiling: tex('ceiling') };
      if (solid && !cell.wall) lr.error('solid tiles need a "wall" texture key');
      if (!solid && !cell.floor) lr.error('walkable tiles need a "floor" texture key');
      legend.set(ch, cell);
    }

  // grid
  const rows = vArray(o.grid, r.at('grid'), { min: 3, max: MAX_CELLS });
  let width = 0;
  const height = rows?.length ?? 0;
  const cells: CellDesc[] = [];
  if (rows) {
    for (let z = 0; z < rows.length; z++) {
      const row = rows[z];
      const rr = r.at('grid').at(z);
      if (typeof row !== 'string') {
        rr.error('each grid row must be a string');
        continue;
      }
      if (z === 0) {
        width = row.length;
        if (width < 3 || width > MAX_CELLS) rr.error(`rows must be 3..${MAX_CELLS} characters wide, got ${width}`);
      } else if (row.length !== width) {
        rr.error(`row is ${row.length} characters wide but row 0 is ${width}; all rows must have equal width`);
        continue;
      }
      for (let x = 0; x < row.length; x++) {
        const cell = legend.get(row[x]!);
        if (!cell) {
          rr.error(`column ${x}: character "${row[x]}" is not in the legend`);
          cells.push({ solid: true, wall: '', floor: '', ceiling: '' });
        } else cells.push(cell);
      }
    }
  }
  if (r.issues.length > before) return undefined;

  const at = (cx: number, cz: number): CellDesc | undefined => (cx < 0 || cz < 0 || cx >= width || cz >= height ? undefined : cells[cz * width + cx]);
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      if ((x === 0 || z === 0 || x === width - 1 || z === height - 1) && !at(x, z)!.solid) r.at('grid').at(z).error(`column ${x}: the map border must be solid, otherwise actors could leave the world`);

  const ids = new Set<string>();
  /** Reads `cell: [cx, cz]` (+ optional `offset: [ox, oz]` in cell fractions) and returns a world position on an open cell. */
  const vCellPos = (src: Record<string, unknown>, pr: Reporter): { cx: number; cz: number; x: number; z: number } | undefined => {
    const c = vArray(src.cell, pr.at('cell'), { min: 2, max: 2 });
    if (!c) return undefined;
    const cx = vNumber(c[0], pr.at('cell').at(0), { int: true, min: 0, max: width - 1 });
    const cz = vNumber(c[1], pr.at('cell').at(1), { int: true, min: 0, max: height - 1 });
    if (cx === undefined || cz === undefined) return undefined;
    if (at(cx, cz)!.solid) return pr.at('cell').error(`cell [${cx}, ${cz}] is a solid wall; choose a walkable cell`);
    let ox = 0;
    let oz = 0;
    if (src.offset !== undefined) {
      const off = vArray(src.offset, pr.at('offset'), { min: 2, max: 2 });
      ox = (off && vNumber(off[0], pr.at('offset').at(0), { min: -0.45, max: 0.45 })) ?? 0;
      oz = (off && vNumber(off[1], pr.at('offset').at(1), { min: -0.45, max: 0.45 })) ?? 0;
    }
    return { cx, cz, x: (cx + 0.5 + ox) * cs, z: (cz + 0.5 + oz) * cs };
  };
  const deg = (v: unknown, pr: Reporter): number => (v === undefined ? 0 : ((vNumber(v, pr, { min: -360, max: 360 }) ?? 0) * Math.PI) / 180);
  const list = (key: string, max: number): [Record<string, unknown>, Reporter][] => {
    if (o[key] === undefined) return [];
    const a = vArray(o[key], r.at(key), { max });
    const out: [Record<string, unknown>, Reporter][] = [];
    (a ?? []).forEach((item, i) => {
      const io = vObject(item, r.at(key).at(i));
      if (io) out.push([io, r.at(key).at(i)]);
    });
    return out;
  };

  // solids: merge horizontal runs of identical wall tiles
  const solids: SolidDesc[] = [];
  for (let z = 0; z < height; z++) {
    let x = 0;
    while (x < width) {
      const c = at(x, z)!;
      if (!c.solid) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < width && at(end, z)!.solid && at(end, z)!.wall === c.wall) end++;
      solids.push({ id: `wall:${x},${z}`, minX: x * cs, minZ: z * cs, maxX: end * cs, maxZ: (z + 1) * cs, surface: c.wall });
      x = end;
    }
  }

  // doors
  const doors: DoorDesc[] = [];
  const doorCells = new Set<number>();
  for (const [d, dr] of list('doors', 64)) {
    const did = vLocalId(d.id, dr.at('id'), ids);
    const p = vCellPos(d, dr);
    const surface = d.surface === undefined ? 'door' : (vString(d.surface, dr.at('surface'), { max: 60 }) ?? 'door');
    const locked = d.locked === undefined ? false : (vBool(d.locked, dr.at('locked')) ?? false);
    if (did === undefined || !p) continue;
    const ew = at(p.cx - 1, p.cz)?.solid && at(p.cx + 1, p.cz)?.solid;
    const ns = at(p.cx, p.cz - 1)?.solid && at(p.cx, p.cz + 1)?.solid;
    if (!ew && !ns) {
      dr.at('cell').error(`door "${did}" must sit in a one-cell gap between two walls (west+east or north+south)`);
      continue;
    }
    if (doorCells.has(p.cz * width + p.cx)) {
      dr.at('cell').error(`two doors share cell [${p.cx}, ${p.cz}]`);
      continue;
    }
    doorCells.add(p.cz * width + p.cx);
    const half = cs * 0.1;
    const axis = ew ? 'x' : 'z';
    doors.push({
      id: did,
      cellX: p.cx,
      cellZ: p.cz,
      axis,
      locked,
      surface,
      minX: axis === 'x' ? p.cx * cs : p.x - half,
      maxX: axis === 'x' ? (p.cx + 1) * cs : p.x + half,
      minZ: axis === 'x' ? p.z - half : p.cz * cs,
      maxZ: axis === 'x' ? p.z + half : (p.cz + 1) * cs,
    });
  }

  // player start
  let playerStart = { x: cs * 1.5, z: cs * 1.5, yaw: 0 };
  const ps = vObject(o.playerStart, r.at('playerStart'));
  if (ps) {
    const p = vCellPos(ps, r.at('playerStart'));
    if (p) {
      if (doorCells.has(p.cz * width + p.cx)) r.at('playerStart').at('cell').error('the player cannot start inside a door');
      playerStart = { x: p.x, z: p.z, yaw: deg(ps.yaw, r.at('playerStart').at('yaw')) };
    }
  }

  // spawns
  const spawns: SpawnDesc[] = [];
  for (const [s, sr] of list('spawns', 512)) {
    const sid = vLocalId(s.id, sr.at('id'), ids);
    const prefab = vString(s.prefab, sr.at('prefab'), { max: 120 });
    const p = vCellPos(s, sr);
    const tags = vTags(s.tags, sr.at('tags'));
    const params = s.params === undefined ? {} : vJson(vObject(s.params, sr.at('params')), sr.at('params'));
    if (sid === undefined || prefab === undefined || !p || !tags || params === undefined || !isObject(params)) continue;
    if (doorCells.has(p.cz * width + p.cx)) {
      sr.at('cell').error(`spawn "${sid}" is inside a door cell`);
      continue;
    }
    spawns.push({ id: sid, prefab, x: p.x, z: p.z, yaw: deg(s.yaw, sr.at('yaw')), tags, params: params as Record<string, Json> });
  }

  // triggers
  const triggers: TriggerDesc[] = [];
  const faces = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] } as const;
  for (const [t, tr] of list('triggers', 128)) {
    const tid = vLocalId(t.id, tr.at('id'), ids);
    const kind = vOneOf(t.kind, tr.at('kind'), ['switch', 'zone'] as const);
    const p = vCellPos(t, tr);
    const tags = vTags(t.tags, tr.at('tags'));
    const opens = t.opens === undefined ? '' : (vString(t.opens, tr.at('opens'), { max: 60 }) ?? '');
    if (tid === undefined || kind === undefined || !p || !tags) continue;
    if (opens && !doors.some((d) => d.id === opens)) {
      tr.at('opens').error(`trigger "${tid}" opens door "${opens}", but this map has no door with that id (doors: ${doors.map((d) => d.id).join(', ') || 'none'})`);
      continue;
    }
    if (kind === 'switch') {
      const face = vOneOf(t.face, tr.at('face'), ['n', 's', 'e', 'w'] as const);
      if (face === undefined) continue;
      const [fx, fz] = faces[face];
      if (!at(p.cx + fx, p.cz + fz)?.solid) {
        tr.at('face').error(`switch "${tid}" is mounted on the ${face} side of cell [${p.cx}, ${p.cz}], but there is no wall there`);
        continue;
      }
      const once = t.once === undefined ? true : (vBool(t.once, tr.at('once')) ?? true);
      triggers.push({ id: tid, kind, x: p.x + fx * cs * 0.5, z: p.z + fz * cs * 0.5, radius: cs * 0.9, tags, opens, nx: -fx, nz: -fz, once });
    } else {
      const radius = t.radius === undefined ? cs * 0.45 : (vNumber(t.radius, tr.at('radius'), { min: 0.2, max: cs * 4 }) ?? cs * 0.45);
      const once = t.once === undefined ? false : (vBool(t.once, tr.at('once')) ?? false);
      triggers.push({ id: tid, kind, x: p.x, z: p.z, radius, tags, opens, nx: 0, nz: 0, once });
    }
  }

  // lights
  const lights: LightDesc[] = [];
  for (const [l, lr] of list('lights', 64)) {
    const lid = vLocalId(l.id, lr.at('id'), ids);
    const p = vCellPos(l, lr);
    const color = vColor(l.color, lr.at('color'));
    const intensity = l.intensity === undefined ? 1 : vNumber(l.intensity, lr.at('intensity'), { min: 0, max: 8 });
    const distance = l.distance === undefined ? cs * 5 : vNumber(l.distance, lr.at('distance'), { min: 0.5, max: 100 });
    const y = l.y === undefined ? wallHeight * 0.8 : vNumber(l.y, lr.at('y'), { min: 0, max: wallHeight });
    if (lid === undefined || !p || color === undefined || intensity === undefined || distance === undefined || y === undefined) continue;
    lights.push({ id: lid, x: p.x, y, z: p.z, color, intensity, distance });
  }

  let ambient = { color: 0x8890a0, intensity: 0.35 };
  if (o.ambient !== undefined) {
    const a = vObject(o.ambient, r.at('ambient'));
    const color = a && vColor(a.color, r.at('ambient').at('color'));
    const intensity = a && vNumber(a.intensity, r.at('ambient').at('intensity'), { min: 0, max: 4 });
    if (color !== undefined && intensity !== undefined) ambient = { color, intensity };
  }
  let fog = { color: 0x0a0c10, near: cs * 2, far: cs * 16 };
  if (o.fog !== undefined) {
    const f = vObject(o.fog, r.at('fog'));
    const color = f && vColor(f.color, r.at('fog').at('color'));
    const near = f && vNumber(f.near, r.at('fog').at('near'), { min: 0, max: 500 });
    const far = f && vNumber(f.far, r.at('fog').at('far'), { min: 1, max: 1000 });
    if (color !== undefined && near !== undefined && far !== undefined) {
      if (far <= near) r.at('fog').error('"far" must be greater than "near"');
      else fog = { color, near, far };
    }
  }

  if (r.issues.length > before) return undefined;
  return { id, name, cellSize: cs, width, height, wallHeight, cells, solids, doors, spawns, triggers, lights, playerStart, ambient, fog };
}
