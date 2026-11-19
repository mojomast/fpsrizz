/**
 * Uniform-grid spatial hash on the XZ plane (SDK 3, P1.8): the broad phase for grid worlds, proximity queries and
 * anything that would otherwise test every object. Boxes may carry an optional Y range that queries also filter on.
 *
 * Results are deterministic: every query returns keys in insertion order (the order `set()` first saw them), so
 * code that used to loop over an array keeps the same visiting order when it switches to the hash.
 *
 *   const grid = new SpatialHash<EntityId>(4);
 *   grid.set(e, { minX: 0, minZ: 0, maxX: 2, maxZ: 1 });
 *   for (const e of grid.near(x, z, 6)) ...
 */
export interface Aabb2 { minX: number; minZ: number; maxX: number; maxZ: number; minY?: number; maxY?: number }

interface Entry { box: Aabb2; seq: number; cells: number[]; mark: number }

const OFF = 0x8000;
const cellKey = (ix: number, iz: number): number => (ix + OFF) * 0x10000 + (iz + OFF);

export class SpatialHash<K> {
  readonly cellSize: number;
  private readonly inv: number;
  private readonly cells = new Map<number, K[]>();
  private readonly entries = new Map<K, Entry>();
  private seq = 0;
  private stamp = 0;
  // Occupied cell bounds (grow only): rays are clipped to them.
  private bx0 = Infinity; private bz0 = Infinity; private bx1 = -Infinity; private bz1 = -Infinity;

  constructor(cellSize = 4) {
    if (!(cellSize > 0)) throw new Error('SpatialHash cellSize must be > 0');
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
  }

  get size(): number { return this.entries.size; }
  has(key: K): boolean { return this.entries.has(key); }
  get(key: K): Readonly<Aabb2> | undefined { return this.entries.get(key)?.box; }
  keys(): K[] { return [...this.entries.keys()]; }

  private ci(v: number): number {
    const i = Math.floor(v * this.inv);
    return i < -OFF + 1 ? -OFF + 1 : i > OFF - 2 ? OFF - 2 : i;
  }

  /** Inserts or moves `key`. A moved key keeps its original insertion order. */
  set(key: K, box: Aabb2): void {
    const old = this.entries.get(key);
    const ix0 = this.ci(box.minX), iz0 = this.ci(box.minZ), ix1 = this.ci(box.maxX), iz1 = this.ci(box.maxZ);
    const cells: number[] = [];
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) cells.push(cellKey(ix, iz));
    if (old) {
      if (old.cells.length === cells.length && old.cells.every((c, i) => c === cells[i])) { old.box = { ...box }; return; }
      this.unlink(key, old);
    }
    for (const c of cells) {
      const list = this.cells.get(c);
      if (list) list.push(key); else this.cells.set(c, [key]);
    }
    this.entries.set(key, { box: { ...box }, seq: old ? old.seq : this.seq++, cells, mark: 0 });
    if (ix0 < this.bx0) this.bx0 = ix0;
    if (iz0 < this.bz0) this.bz0 = iz0;
    if (ix1 > this.bx1) this.bx1 = ix1;
    if (iz1 > this.bz1) this.bz1 = iz1;
  }

  delete(key: K): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    this.unlink(key, e);
    this.entries.delete(key);
    return true;
  }

  clear(): void {
    this.cells.clear(); this.entries.clear();
    this.bx0 = this.bz0 = Infinity; this.bx1 = this.bz1 = -Infinity;
  }

  private unlink(key: K, e: Entry): void {
    for (const c of e.cells) {
      const list = this.cells.get(c)!;
      const i = list.indexOf(key);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.cells.delete(c);
    }
  }

  /** Collects the keys of one cell into `out` once per query (stamp-based dedupe, no allocation per key). */
  private collect(cell: number, out: Entry[], keys: K[]): void {
    const list = this.cells.get(cell);
    if (!list) return;
    for (const k of list) {
      const e = this.entries.get(k)!;
      if (e.mark === this.stamp) continue;
      e.mark = this.stamp;
      out.push(e);
      keys.push(k);
    }
  }

  private ordered(found: Entry[], keys: K[], test?: (box: Aabb2) => boolean): K[] {
    if (found.length > 1) {
      const idx = found.map((_, i) => i).sort((a, b) => found[a]!.seq - found[b]!.seq);
      const out: K[] = [];
      for (const i of idx) if (!test || test(found[i]!.box)) out.push(keys[i]!);
      return out;
    }
    return found.length === 1 && (!test || test(found[0]!.box)) ? keys : [];
  }

  /**
   * Keys in the cells `box` covers (a superset of the overlapping ones), in insertion order. The cheapest broad
   * phase when the caller runs its own exact test.
   */
  candidates(box: Aabb2, test?: (box: Aabb2) => boolean): K[] {
    this.stamp++;
    const found: Entry[] = [], keys: K[] = [];
    const ix0 = Math.max(this.ci(box.minX), this.bx0), iz0 = Math.max(this.ci(box.minZ), this.bz0);
    const ix1 = Math.min(this.ci(box.maxX), this.bx1), iz1 = Math.min(this.ci(box.maxZ), this.bz1);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) this.collect(cellKey(ix, iz), found, keys);
    return this.ordered(found, keys, test);
  }

  /** Keys whose boxes overlap `box` (inclusive edges; Y filtered when both sides carry a Y range). */
  query(box: Aabb2): K[] {
    return this.candidates(box, (b) => b.minX <= box.maxX && b.maxX >= box.minX && b.minZ <= box.maxZ && b.maxZ >= box.minZ
      && (b.minY === undefined || box.maxY === undefined || b.minY <= box.maxY) && (b.maxY === undefined || box.minY === undefined || b.maxY >= box.minY));
  }

  /** Keys whose boxes come within `radius` of (x, z). */
  near(x: number, z: number, radius: number): K[] {
    const r2 = radius * radius;
    return this.query({ minX: x - radius, minZ: z - radius, maxX: x + radius, maxZ: z + radius }).filter((k) => {
      const b = this.entries.get(k)!.box;
      const dx = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0;
      const dz = z < b.minZ ? b.minZ - z : z > b.maxZ ? z - b.maxZ : 0;
      return dx * dx + dz * dz <= r2;
    });
  }

  /**
   * Broad phase for a ray or swept circle: every key whose box may come within `pad` of the segment from (x, z)
   * along the unit direction (dirX, dirZ) for `maxDist` (Infinity is clipped to the occupied area). Conservative:
   * run the exact test on the result. Walks the grid cells the ray crosses (Amanatides & Woo).
   */
  segment(x: number, z: number, dirX: number, dirZ: number, maxDist: number, pad = 0): K[] {
    if (this.entries.size === 0) return [];
    this.stamp++;
    const found: Entry[] = [], keys: K[] = [];
    const cs = this.cellSize;
    const k = Math.ceil(pad * this.inv);
    // Clip to the occupied bounds inflated by the pad.
    const lo = [(this.bx0 - k) * cs, (this.bz0 - k) * cs], hi = [(this.bx1 + 1 + k) * cs, (this.bz1 + 1 + k) * cs];
    const o = [x, z], d = [dirX, dirZ];
    let t0 = 0, t1 = maxDist;
    for (let a = 0; a < 2; a++) {
      if (Math.abs(d[a]!) < 1e-12) { if (o[a]! < lo[a]! || o[a]! > hi[a]!) return []; continue; }
      let ta = (lo[a]! - o[a]!) / d[a]!, tb = (hi[a]! - o[a]!) / d[a]!;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return [];
    }
    const sx = x + dirX * t0, sz = z + dirZ * t0;
    let ix = this.ci(sx), iz = this.ci(sz);
    const stepX = dirX > 0 ? 1 : -1, stepZ = dirZ > 0 ? 1 : -1;
    const nextX = (ix + (dirX > 0 ? 1 : 0)) * cs, nextZ = (iz + (dirZ > 0 ? 1 : 0)) * cs;
    let tMaxX = Math.abs(dirX) < 1e-12 ? Infinity : t0 + (nextX - sx) / dirX;
    let tMaxZ = Math.abs(dirZ) < 1e-12 ? Infinity : t0 + (nextZ - sz) / dirZ;
    const tDX = Math.abs(dirX) < 1e-12 ? Infinity : cs / Math.abs(dirX);
    const tDZ = Math.abs(dirZ) < 1e-12 ? Infinity : cs / Math.abs(dirZ);
    const visit = (cx: number, cz: number): void => {
      for (let ax = cx - k; ax <= cx + k; ax++) for (let az = cz - k; az <= cz + k; az++) this.collect(cellKey(ax, az), found, keys);
    };
    for (let guard = 0; guard < 1_000_000; guard++) {
      visit(ix, iz);
      if (tMaxX > t1 && tMaxZ > t1) break;
      if (tMaxX < tMaxZ) { ix += stepX; tMaxX += tDX; } else { iz += stepZ; tMaxZ += tDZ; }
    }
    return this.ordered(found, keys);
  }
}
