/** Experimental standalone geometry. It is not connected to the game world or movement. */
export interface Vec3 { x: number; y: number; z: number }
export interface Volume { min: Vec3; max: Vec3 }
export interface Cylinder { x: number; z: number; bottom: number; top: number; radius: number }
export interface VerticalHit { t: number; point: Vec3; normal: Vec3; solidIndex: number }

// Keeping all operands bounded prevents overflow in differences and distance calculations.
export const VERTICAL_LIMIT = 1e9;

function number(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= VERTICAL_LIMIT;
}
function vector(v: Vec3): boolean {
  return !!v && number(v.x) && number(v.y) && number(v.z);
}
function volume(v: Volume): boolean {
  return !!v && vector(v.min) && vector(v.max) && v.min.x < v.max.x && v.min.y < v.max.y && v.min.z < v.max.z;
}
function copy(v: Vec3): Vec3 { return { x: v.x, y: v.y, z: v.z }; }

/** A bounded world of closed solid boxes. Invalid inputs throw RangeError.
 * Inputs are copied; later caller mutations do not change the world.
 */
export class VerticalWorld {
  private readonly bounds: Volume;
  private readonly solids: Volume[];

  constructor(bounds: Volume, solids: readonly Volume[]) {
    if (!volume(bounds) || !Array.isArray(solids)) throw new RangeError('invalid world bounds or solids');
    this.bounds = { min: copy(bounds.min), max: copy(bounds.max) };
    this.solids = solids.map((s) => {
      if (!volume(s) || s.min.x < bounds.min.x || s.min.y < bounds.min.y || s.min.z < bounds.min.z ||
          s.max.x > bounds.max.x || s.max.y > bounds.max.y || s.max.z > bounds.max.z) throw new RangeError('invalid solid volume');
      return { min: copy(s.min), max: copy(s.max) };
    });
  }

  /** Closed segment against solids only, including touching faces and endpoints.
   * t is the fraction along the segment. Start inside/on a solid hits at zero,
   * with its nearest outward face normal; face ties resolve X, Y, Z, min before max.
   * Equal-distance solids resolve by input order. World bounds are not ray obstacles.
   */
  segment(start: Vec3, end: Vec3): VerticalHit | null {
    if (!vector(start) || !vector(end)) throw new RangeError('invalid segment');
    const axes = ['x', 'y', 'z'] as const;
    let best: VerticalHit | null = null;
    for (let i = 0; i < this.solids.length; i++) {
      const box = this.solids[i]!;
      let enter = 0;
      let exit = 1;
      let normal: Vec3 = { x: 0, y: 0, z: 0 };
      let inside = true;
      let nearest = Infinity;
      let insideNormal: Vec3 = normal;
      for (const axis of axes) {
        const p = start[axis];
        const d = end[axis] - p;
        const lo = box.min[axis];
        const hi = box.max[axis];
        if (p < lo || p > hi) inside = false;
        for (const [distance, sign] of [[Math.abs(p - lo), -1], [Math.abs(hi - p), 1]] as const) {
          if (distance < nearest) {
            nearest = distance;
            insideNormal = { x: 0, y: 0, z: 0 };
            insideNormal[axis] = sign;
          }
        }
        if (d === 0) {
          if (p < lo || p > hi) { exit = -1; break; }
          continue;
        }
        let near = (lo - p) / d;
        let far = (hi - p) / d;
        let sign = -1;
        if (near > far) { [near, far] = [far, near]; sign = 1; }
        if (near > enter) {
          enter = near;
          normal = { x: 0, y: 0, z: 0 };
          normal[axis] = sign;
        }
        exit = Math.min(exit, far);
        if (enter > exit) break;
      }
      if (enter > exit || exit < 0 || enter > 1) continue;
      if (inside) normal = insideNormal;
      if (best && enter >= best.t) continue;
      best = { t: enter, point: { x: start.x + (end.x - start.x) * enter, y: start.y + (end.y - start.y) * enter, z: start.z + (end.z - start.z) * enter }, normal, solidIndex: i };
    }
    return best;
  }

  /** Direction need not be unit length. Distance and the resulting endpoint must be bounded. */
  ray(origin: Vec3, direction: Vec3, distance: number): VerticalHit | null {
    if (!vector(origin) || !vector(direction) || !number(distance) || distance < 0) throw new RangeError('invalid ray');
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0) throw new RangeError('ray direction must be nonzero');
    return this.segment(origin, { x: origin.x + direction.x / length * distance, y: origin.y + direction.y / length * distance, z: origin.z + direction.z / length * distance });
  }

  /** An upright, positive-size cylinder is free when contained by the world and
   * not penetrating a solid. Tangency to world bounds or a solid is free.
   */
  isCylinderFree(c: Cylinder): boolean {
    if (!c || !number(c.x) || !number(c.z) || !number(c.bottom) || !number(c.top) || !number(c.radius) || c.radius <= 0 || c.bottom >= c.top) throw new RangeError('invalid cylinder');
    const b = this.bounds;
    if (c.x - c.radius < b.min.x || c.x + c.radius > b.max.x || c.z - c.radius < b.min.z || c.z + c.radius > b.max.z || c.bottom < b.min.y || c.top > b.max.y) return false;
    for (const s of this.solids) {
      if (c.top <= s.min.y || c.bottom >= s.max.y) continue;
      const dx = c.x - Math.max(s.min.x, Math.min(s.max.x, c.x));
      const dz = c.z - Math.max(s.min.z, Math.min(s.max.z, c.z));
      if (Math.hypot(dx, dz) < c.radius) return false;
    }
    return true;
  }
}
