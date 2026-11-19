/**
 * Level importers (SDK 3, P2.4): Tiled (.tmj / JSON map format) and LDtk (.ldtk project JSON) → SceneDef.
 * Pure functions over parsed JSON; spawn the result with `spawnScene` or register it as content (std/scene kinds
 * "tiled-map" and "ldtk-level"). Both editors are 2D, so a plane decides how they map into 3D:
 *
 * - `plane: "xz"` (default, top-down): editor x → +x, editor y (down the screen) → +z, everything on y = 0.
 * - `plane: "xy"` (side-on): editor x → +x, editor y → -y, so the bottom row of the map sits at y = 0.
 *
 * One editor cell becomes `cellSize` metres (default 1). Tiles, objects and entities map to prefab ids through
 * the option tables, or through a custom property / field named `prefab` set in the editor. Other custom
 * properties land in the node's `props`; properties whose name is a component id ("game/coin") become overrides.
 * Things nothing maps are skipped and counted in `unmapped`, so a level can be imported incrementally.
 */
import { isObject } from '@bulkhead/kernel/validate.ts';
import type { Json } from '@bulkhead/kernel/validate.ts';
import type { SceneDef, SceneNode, Vec3Json } from './scene.ts';

export interface LevelImportOptions {
  /** Metres per editor grid cell (default 1). */
  cellSize?: number;
  /** "xz" top-down (default) or "xy" side-on. */
  plane?: 'xz' | 'xy';
  /** Height (xz) or depth (xy) coordinate for everything (default 0). */
  elevation?: number;
}
export interface LevelImportResult {
  scene: SceneDef;
  /** Keys of tiles/objects/entities that no table or `prefab` property mapped, with counts ("tile:7" → 12). */
  unmapped: Record<string, number>;
  /** Problems that stopped part of the import (unsupported encodings, external files, ...). */
  errors: string[];
}

type Obj = Record<string, unknown>;
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const r3 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Cell-space centre (cx, cy in cells, y down) → scene position. `rows` is the map height in cells (for xy). */
function place(cx: number, cy: number, rows: number, o: LevelImportOptions): Vec3Json {
  const s = o.cellSize ?? 1, e = o.elevation ?? 0;
  return o.plane === 'xy' ? [r3(cx * s), r3((rows - cy) * s), e] : [r3(cx * s), e, r3(cy * s)];
}
/** Editor rotation (degrees clockwise on screen) → SceneTransform Euler degrees. */
const rot = (deg: number, o: LevelImportOptions): Vec3Json | undefined => (deg ? (o.plane === 'xy' ? [0, 0, -deg] : [0, -deg, 0]) : undefined);

/** Splits custom properties into props and component overrides; returns the `prefab` property if present. */
function splitProps(entries: [string, Json][]): { prefab?: string; props?: Record<string, Json>; overrides?: Record<string, Json> } {
  let prefab: string | undefined, props: Record<string, Json> | undefined, overrides: Record<string, Json> | undefined;
  for (const [k, raw] of entries) {
    let v = raw;
    if (typeof v === 'string' && /^\s*[[{]/.test(v)) { try { v = JSON.parse(v) as Json; } catch { /* keep string */ } }
    if (k === 'prefab' && typeof v === 'string') prefab = v;
    else if (k.includes('/')) (overrides ??= {})[k] = v;
    else (props ??= {})[k] = v;
  }
  return { ...(prefab ? { prefab } : {}), ...(props ? { props } : {}), ...(overrides ? { overrides } : {}) };
}
const count = (m: Record<string, number>, k: string): void => { m[k] = (m[k] ?? 0) + 1; };

// ---------------------------------------------------------------------------------------------------------------------
// Tiled
// ---------------------------------------------------------------------------------------------------------------------

export interface TiledImportOptions extends LevelImportOptions {
  /** Tile → prefab, keyed by the tile's class/type, "<tileset name>:<local id>" or the global id as a string. */
  tiles?: Record<string, string>;
  /** Object → prefab, keyed by the object's class/type or its name. */
  objects?: Record<string, string>;
  /** Import hidden layers too (default false). */
  includeHidden?: boolean;
}

const FLIP_MASK = 0x1fffffff;
const tiledProps = (v: unknown): [string, Json][] => arr(v).filter(isObject).map((p) => [String((p as Obj).name), (p as Obj).value as Json]);

/** Imports an orthogonal Tiled JSON map (finite or infinite, CSV/array tile data, embedded tilesets). */
export function importTiled(map: unknown, opts: TiledImportOptions = {}): LevelImportResult {
  const unmapped: Record<string, number> = {}, errors: string[] = [];
  if (!isObject(map) || !Array.isArray(map.layers)) return { scene: { nodes: [] }, unmapped, errors: ['not a Tiled JSON map (no layers array)'] };
  if (map.orientation !== undefined && map.orientation !== 'orthogonal') errors.push(`orientation "${String(map.orientation)}" is imported as orthogonal`);
  const tw = num(map.tilewidth, 1) || 1, th = num(map.tileheight, 1) || 1, rows = num(map.height);
  // gid → { key candidates, prefab property, props }
  interface TileInfo { keys: string[]; split: ReturnType<typeof splitProps> }
  const tiles = new Map<number, TileInfo>();
  const tilesets = arr(map.tilesets).filter(isObject) as Obj[];
  for (const ts of tilesets) {
    if (ts.source !== undefined) { errors.push(`external tileset "${String(ts.source)}" is not supported: embed it in the map (Tiled: Map > Embed Tilesets)`); continue; }
    const first = num(ts.firstgid, 1), name = str(ts.name) ?? 'tileset', n = num(ts.tilecount);
    const special = new Map((arr(ts.tiles).filter(isObject) as Obj[]).map((t) => [num(t.id), t]));
    for (let id = 0; id < Math.max(n, ...[...special.keys()].map((k) => k + 1)); id++) {
      const t = special.get(id), cls = t ? str(t.class) ?? str(t.type) : undefined;
      tiles.set(first + id, { keys: [...(cls ? [cls] : []), `${name}:${id}`, String(first + id)], split: splitProps(tiledProps(t?.properties)) });
    }
  }
  const tilePrefab = (gid: number): { prefab?: string; node: Partial<SceneNode> } => {
    const info = tiles.get(gid);
    const keys = info?.keys ?? [String(gid)];
    const prefab = info?.split.prefab ?? keys.map((k) => opts.tiles?.[k]).find(Boolean);
    if (!prefab) count(unmapped, `tile:${keys[0]}`);
    return { prefab, node: { ...(info?.split.props ? { props: info.split.props } : {}), ...(info?.split.overrides ? { overrides: info.split.overrides } : {}) } };
  };

  const layer = (l: Obj, ox: number, oy: number): SceneNode | undefined => {
    if (l.visible === false && !opts.includeHidden) return undefined;
    const lx = ox + num(l.offsetx) / tw, ly = oy + num(l.offsety) / th;
    const children: SceneNode[] = [];
    const name = str(l.name) ?? String(l.type);
    if (l.type === 'group') for (const c of arr(l.layers).filter(isObject) as Obj[]) { const n = layer(c, lx, ly); if (n) children.push(n); }
    else if (l.type === 'tilelayer') {
      if (l.encoding === 'base64' || typeof l.data === 'string') { errors.push(`layer "${name}": base64 tile data is not supported; save the map with CSV layer format`); return undefined; }
      const chunks = l.chunks ? (arr(l.chunks).filter(isObject) as Obj[]) : [{ x: 0, y: 0, width: l.width, height: l.height, data: l.data }];
      for (const ch of chunks) {
        const w = num(ch.width), data = arr(ch.data);
        data.forEach((raw, i) => {
          const gid = num(raw) & FLIP_MASK; // flip/rotation flags are dropped
          if (!gid) return;
          const { prefab, node } = tilePrefab(gid);
          if (!prefab) return;
          const cx = num(ch.x) + (i % w), cy = num(ch.y) + Math.floor(i / w);
          children.push({ prefab, name: `${name}:${cx},${cy}`, transform: { position: place(lx + cx + 0.5, ly + cy + 0.5, rows, opts) }, ...node });
        });
      }
    } else if (l.type === 'objectgroup') {
      for (const o of arr(l.objects).filter(isObject) as Obj[]) {
        if (o.visible === false && !opts.includeHidden) continue;
        const cls = str(o.class) ?? str(o.type), oname = str(o.name);
        const split = splitProps(tiledProps(o.properties));
        let prefab = split.prefab ?? (cls && opts.objects?.[cls]) ?? (oname && opts.objects?.[oname]);
        let extra: Partial<SceneNode> = {};
        const gid = num(o.gid) & FLIP_MASK;
        if (!prefab && gid) { const t = tilePrefab(gid); prefab = t.prefab; extra = t.node; }
        if (!prefab) { if (!gid) count(unmapped, `object:${cls ?? oname ?? o.id}`); continue; }
        const w = num(o.width) / tw, h = num(o.height) / th;
        // Tile objects are anchored bottom-left, everything else top-left; place at the centre.
        const x = lx + num(o.x) / tw + w / 2, y = ly + num(o.y) / th + (gid ? -h / 2 : h / 2);
        const r = rot(num(o.rotation), opts);
        const cs = opts.cellSize ?? 1;
        const props = { ...extra.props, ...split.props, ...(w || h ? { size: [r3(w * cs), r3(h * cs)] } : {}) };
        const overrides = { ...extra.overrides, ...split.overrides };
        children.push({
          prefab, name: oname ?? `${cls ?? 'object'}#${String(o.id)}`, transform: { position: place(x, y, rows, opts), ...(r ? { rotation: r } : {}) },
          ...(Object.keys(props).length ? { props } : {}), ...(Object.keys(overrides).length ? { overrides } : {}),
        });
      }
    } else return undefined; // image layers: nothing to spawn
    return { name, ...(tiledProps(l.properties).length ? { props: Object.fromEntries(tiledProps(l.properties)) } : {}), children };
  };
  const nodes = (map.layers as unknown[]).filter(isObject).map((l) => layer(l as Obj, 0, 0)).filter((n): n is SceneNode => !!n);
  return { scene: { nodes }, unmapped, errors };
}

// ---------------------------------------------------------------------------------------------------------------------
// LDtk
// ---------------------------------------------------------------------------------------------------------------------

export interface LdtkImportOptions extends LevelImportOptions {
  /** Entity identifier → prefab. */
  entities?: Record<string, string>;
  /** IntGrid cell → prefab, keyed by "<layer>.<value identifier or number>" or just the identifier/number. */
  intGrid?: Record<string, string>;
  /** Tile → prefab, keyed by "<layer>.<tile id>" or the tile id as a string. */
  tiles?: Record<string, string>;
  /** Only this level (identifier or iid). Default: every level, each placed at its world position. */
  level?: string;
}

/** Imports an LDtk project (levels embedded, not "separate level files"). */
export function importLdtk(project: unknown, opts: LdtkImportOptions = {}): LevelImportResult {
  const unmapped: Record<string, number> = {}, errors: string[] = [];
  if (!isObject(project) || !Array.isArray(project.levels)) return { scene: { nodes: [] }, unmapped, errors: ['not an LDtk project (no levels array)'] };
  const defaultGrid = num(project.defaultGridSize, 16) || 16;
  const layerDefs = new Map((arr((project.defs as Obj | undefined)?.layers).filter(isObject) as Obj[]).map((d) => [num(d.uid), d]));
  const levels = (project.levels as unknown[]).filter(isObject) as Obj[];
  const picked = opts.level ? levels.filter((l) => l.identifier === opts.level || l.iid === opts.level) : levels;
  if (opts.level && !picked.length) errors.push(`no level "${opts.level}" (levels: ${levels.map((l) => String(l.identifier)).join(', ')})`);
  // World height in cells, so side-on (xy) levels keep their relative placement.
  const worldRows = Math.max(0, ...picked.map((l) => (num(l.worldY) + num(l.pxHei)) / defaultGrid));
  const nodes: SceneNode[] = [];
  for (const lv of picked) {
    const lname = str(lv.identifier) ?? 'level';
    if (!Array.isArray(lv.layerInstances)) { errors.push(`level "${lname}" is stored in a separate file; disable "Save levels to separate files" or import that .ldtkl file`); continue; }
    const wx = opts.level ? 0 : num(lv.worldX) / defaultGrid, wy = opts.level ? 0 : num(lv.worldY) / defaultGrid;
    const rows = opts.level ? num(lv.pxHei) / defaultGrid : worldRows;
    const layers: SceneNode[] = [];
    // LDtk lists the top layer first; import bottom-up so the file order matches drawing order.
    for (const li of [...(lv.layerInstances as unknown[])].reverse().filter(isObject) as Obj[]) {
      if (li.visible === false) continue;
      const grid = num(li.__gridSize, defaultGrid) || defaultGrid, scale = grid / defaultGrid;
      const lid = str(li.__identifier) ?? 'layer', type = li.__type;
      const ox = wx + num(li.__pxTotalOffsetX) / defaultGrid, oy = wy + num(li.__pxTotalOffsetY) / defaultGrid;
      const children: SceneNode[] = [];
      if (type === 'Entities') {
        for (const en of arr(li.entityInstances).filter(isObject) as Obj[]) {
          const id = str(en.__identifier) ?? 'entity';
          const split = splitProps((arr(en.fieldInstances).filter(isObject) as Obj[]).map((f) => [String(f.__identifier), (f.__value ?? null) as Json]));
          const prefab = split.prefab ?? opts.entities?.[id];
          if (!prefab) { count(unmapped, `entity:${id}`); continue; }
          const px = arr(en.px), pivot = arr(en.__pivot), w = num(en.width), h = num(en.height);
          const cx = ox + (num(px[0]) - num(pivot[0]) * w + w / 2) / defaultGrid, cy = oy + (num(px[1]) - num(pivot[1], 1) * h + h / 2) / defaultGrid;
          const size = [r3((w / defaultGrid) * (opts.cellSize ?? 1)), r3((h / defaultGrid) * (opts.cellSize ?? 1))];
          children.push({ prefab, name: `${id}#${String(en.iid ?? children.length).slice(0, 8)}`, transform: { position: place(cx, cy, rows, opts) }, props: { ...split.props, size }, ...(split.overrides ? { overrides: split.overrides } : {}) });
        }
      } else if (type === 'IntGrid' || type === 'Tiles' || type === 'AutoLayer') {
        const cw = num(li.__cWid);
        const names = new Map((arr(layerDefs.get(num(li.layerDefUid))?.intGridValues).filter(isObject) as Obj[]).map((v) => [num(v.value), str(v.identifier)]));
        if (type === 'IntGrid') arr(li.intGridCsv).forEach((raw, i) => {
          const v = num(raw);
          if (!v) return;
          const key = names.get(v) ?? String(v);
          const prefab = opts.intGrid?.[`${lid}.${key}`] ?? opts.intGrid?.[key] ?? opts.intGrid?.[String(v)];
          if (!prefab) return count(unmapped, `intgrid:${lid}.${key}`);
          const cx = i % cw, cy = Math.floor(i / cw);
          children.push({ prefab, name: `${lid}:${cx},${cy}`, transform: { position: place(ox + (cx + 0.5) * scale, oy + (cy + 0.5) * scale, rows, opts) } });
        });
        for (const t of [...arr(li.gridTiles), ...arr(li.autoLayerTiles)].filter(isObject) as Obj[]) {
          const tid = String(num(t.t)), prefab = opts.tiles?.[`${lid}.${tid}`] ?? opts.tiles?.[tid];
          if (!prefab) { count(unmapped, `tile:${lid}.${tid}`); continue; }
          const px = arr(t.px), cx = num(px[0]) / grid, cy = num(px[1]) / grid;
          children.push({ prefab, name: `${lid}:${cx},${cy}`, transform: { position: place(ox + (cx + 0.5) * scale, oy + (cy + 0.5) * scale, rows, opts) } });
        }
      }
      if (children.length) layers.push({ name: lid, children });
    }
    const fields = splitProps((arr(lv.fieldInstances).filter(isObject) as Obj[]).map((f) => [String(f.__identifier), (f.__value ?? null) as Json]));
    nodes.push({ name: lname, ...(fields.props ? { props: fields.props } : {}), children: layers });
  }
  return { scene: { nodes }, unmapped, errors };
}
