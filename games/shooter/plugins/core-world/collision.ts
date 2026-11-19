import { SpatialHash } from '../../../../src/sdk/index.ts';
import type { RayHit } from '../../contracts/shooter.ts';

export interface Box {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Inactive boxes (open doors) are ignored by every query. */
  active: boolean;
}

/** Maps with at least this many boxes use the spatial hash broad phase (P1.8); smaller ones stay brute force. */
export const GRID_THRESHOLD = 128;

/**
 * Planar kinematic collision against axis-aligned boxes. Small maps: brute force over boxes. Large maps: a uniform
 * spatial hash narrows each query to nearby boxes, visited in the same (array) order, so `isFree` and `raycast`
 * return exactly what brute force returns. All queries read the same box list, so door state is consistent everywhere.
 * Box geometry is fixed after construction (only `active` may change).
 */
export class CollisionWorld {
  readonly boxes: Box[];
  readonly maxX: number;
  readonly maxZ: number;
  /** Broad phase over box indices (undefined for small maps). */
  readonly grid: SpatialHash<number> | undefined;

  constructor(boxes: Box[], maxX: number, maxZ: number, options: { grid?: boolean; cellSize?: number } = {}) {
    this.boxes = boxes;
    this.maxX = maxX;
    this.maxZ = maxZ;
    const useGrid = options.grid ?? boxes.length >= GRID_THRESHOLD;
    if (useGrid) {
      const grid = new SpatialHash<number>(options.cellSize ?? 4);
      boxes.forEach((b, i) => grid.set(i, b));
      this.grid = grid;
    } else this.grid = undefined;
  }

  /** Boxes that may touch the disc (x, z, r), in array order. */
  private around(x: number, z: number, r: number): readonly Box[] {
    if (!this.grid) return this.boxes;
    return this.grid.candidates({ minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r }).map((i) => this.boxes[i]!);
  }

  isFree(x: number, z: number, r: number): boolean {
    if (x - r < 0 || z - r < 0 || x + r > this.maxX || z + r > this.maxZ) return false;
    for (const b of this.around(x, z, r)) {
      if (!b.active) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r - 1e-9) return false;
    }
    return true;
  }

  /** Move-then-depenetrate in sub-steps no longer than half the radius: slides along walls and around corners. */
  moveCircle(x: number, z: number, r: number, dx: number, dz: number, out: { x: number; z: number }): boolean {
    const len = Math.hypot(dx, dz);
    const steps = Math.min(16, Math.max(1, Math.ceil(len / (r * 0.5))));
    const sx = dx / steps;
    const sz = dz / steps;
    let touched = false;
    for (let s = 0; s < steps; s++) {
      x += sx;
      z += sz;
      for (let iter = 0; iter < 4; iter++) {
        let moved = false;
        // Grid maps: a push moves at most r (or out through a face), so 3r covers every box this pass can reach
        // except after an inside-the-box escape, which the next pass picks up.
        for (const b of this.around(x, z, r * 3)) {
          if (!b.active) continue;
          const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
          const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
          let px = x - cx;
          let pz = z - cz;
          const d2 = px * px + pz * pz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-12) {
            const d = Math.sqrt(d2);
            const push = r - d;
            x += (px / d) * push;
            z += (pz / d) * push;
          } else {
            // Centre is inside the box: leave through the nearest face.
            const l = x - b.minX;
            const rr = b.maxX - x;
            const t = z - b.minZ;
            const bt = b.maxZ - z;
            const m = Math.min(l, rr, t, bt);
            px = pz = 0;
            if (m === l) x = b.minX - r;
            else if (m === rr) x = b.maxX + r;
            else if (m === t) z = b.minZ - r;
            else z = b.maxZ + r;
          }
          moved = true;
          touched = true;
        }
        if (!moved) break;
      }
    }
    out.x = x;
    out.z = z;
    return touched;
  }

  /**
   * Continuous ray (r = 0) or swept-circle (r > 0: boxes inflated by r, with rounded corners) query. (dirX, dirZ) must be unit length.
   * Returns the nearest hit within maxDist or null. Because it is analytic, speed never lets anything tunnel.
   */
  raycast(x: number, z: number, dirX: number, dirZ: number, maxDist: number, r = 0): RayHit | null {
    let best = maxDist;
    let hitBox: Box | undefined;
    let nx = 0;
    let nz = 0;
    const candidates = this.grid ? this.grid.segment(x, z, dirX, dirZ, maxDist, r).map((i) => this.boxes[i]!) : this.boxes;
    for (const b of candidates) {
      if (!b.active) continue;
      const minX = b.minX - r;
      const maxX = b.maxX + r;
      const minZ = b.minZ - r;
      const maxZ = b.maxZ + r;
      let tEnter = -Infinity;
      let tExit = Infinity;
      let ax = 0; // entering axis normal
      let az = 0;
      if (Math.abs(dirX) < 1e-12) {
        if (x <= minX || x >= maxX) continue;
      } else {
        const t1 = (minX - x) / dirX;
        const t2 = (maxX - x) / dirX;
        const tn = t1 < t2 ? t1 : t2;
        const tf = t1 < t2 ? t2 : t1;
        if (tn > tEnter) {
          tEnter = tn;
          ax = dirX > 0 ? -1 : 1;
          az = 0;
        }
        if (tf < tExit) tExit = tf;
      }
      if (Math.abs(dirZ) < 1e-12) {
        if (z <= minZ || z >= maxZ) continue;
      } else {
        const t1 = (minZ - z) / dirZ;
        const t2 = (maxZ - z) / dirZ;
        const tn = t1 < t2 ? t1 : t2;
        const tf = t1 < t2 ? t2 : t1;
        if (tn > tEnter) {
          tEnter = tn;
          ax = 0;
          az = dirZ > 0 ? -1 : 1;
        }
        if (tf < tExit) tExit = tf;
      }
      if (tEnter >= tExit || tExit <= 0) continue;
      if (r > 0) {
        // The inflated box over-covers the four corners: the true swept shape is a rounded rectangle. If the ray
        // enters (or starts) in a corner region, the only part of the shape it can touch is that corner's arc.
        const px = tEnter < 0 ? x : x + dirX * tEnter;
        const pz = tEnter < 0 ? z : z + dirZ * tEnter;
        const inCornerX = px < b.minX || px > b.maxX;
        const inCornerZ = pz < b.minZ || pz > b.maxZ;
        if (inCornerX && inCornerZ) {
          const cx = px < b.minX ? b.minX : b.maxX;
          const cz = pz < b.minZ ? b.minZ : b.maxZ;
          const ox = x - cx;
          const oz = z - cz;
          const c = ox * ox + oz * oz - r * r;
          let t = 0;
          if (c > 0) {
            const bq = ox * dirX + oz * dirZ;
            const disc = bq * bq - c;
            if (disc < 0) continue;
            t = -bq - Math.sqrt(disc);
            if (t < 0) continue;
          }
          if (t < best) {
            best = t;
            hitBox = b;
            const hx = x + dirX * t - cx;
            const hz = z + dirZ * t - cz;
            const hl = Math.hypot(hx, hz);
            nx = hl > 1e-9 ? hx / hl : -dirX;
            nz = hl > 1e-9 ? hz / hl : -dirZ;
          }
          continue;
        }
      }
      if (tEnter < 0) {
        // Started inside: report an immediate hit through the nearest face so callers can back out instead of
        // tunnelling.
        const l = x - minX;
        const rr = maxX - x;
        const t = z - minZ;
        const bt = maxZ - z;
        const m = Math.min(l, rr, t, bt);
        tEnter = 0;
        ax = m === l ? -1 : m === rr ? 1 : 0;
        az = ax !== 0 ? 0 : m === t ? -1 : 1;
      }
      if (tEnter < best) {
        best = tEnter;
        hitBox = b;
        nx = ax;
        nz = az;
      }
    }
    if (!hitBox) return null;
    return { t: best, x: x + dirX * best, z: z + dirZ * best, nx, nz, solidId: hitBox.id };
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    return this.raycast(ax, az, dx / d, dz / d, d) === null;
  }
}
