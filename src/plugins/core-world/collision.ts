import type { RayHit } from '../../sdk/index.ts';

export interface Box {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Inactive boxes (open doors) are ignored by every query. */
  active: boolean;
}

/**
 * Planar kinematic collision against axis-aligned boxes. Small maps -> brute force over boxes is plenty
 * (a few hundred slab tests per query). All queries read the same box list, so door state is consistent everywhere.
 */
export class CollisionWorld {
  readonly boxes: Box[];
  readonly maxX: number;
  readonly maxZ: number;

  constructor(boxes: Box[], maxX: number, maxZ: number) {
    this.boxes = boxes;
    this.maxX = maxX;
    this.maxZ = maxZ;
  }

  isFree(x: number, z: number, r: number): boolean {
    if (x - r < 0 || z - r < 0 || x + r > this.maxX || z + r > this.maxZ) return false;
    for (const b of this.boxes) {
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
        for (const b of this.boxes) {
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
   * Continuous ray (r = 0) or swept-circle (r > 0, boxes inflated by r) query. (dirX, dirZ) must be unit length.
   * Returns the nearest hit within maxDist or null. Because it is analytic, speed never lets anything tunnel.
   */
  raycast(x: number, z: number, dirX: number, dirZ: number, maxDist: number, r = 0): RayHit | null {
    let best = maxDist;
    let hitBox: Box | undefined;
    let nx = 0;
    let nz = 0;
    for (const b of this.boxes) {
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
      if (tEnter < 0) {
        // Started inside (touching after a bounce offset is excluded by tExit <= 0 above): report an immediate hit
        // through the nearest face so callers can back out instead of tunnelling.
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
