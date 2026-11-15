import type { CollisionWorld } from './collision.ts';

/**
 * Small grid A* (8-connected, no corner cutting) plus line-of-sight smoothing.
 * `blocked(cx, cz)` reflects solid cells and closed doors, so navigation follows the same world state as collision.
 */
export class GridNav {
  private w: number;
  private h: number;
  private cell: number;
  private g: Float32Array;
  private from: Int32Array;
  private state: Uint8Array; // 0 new, 1 open, 2 closed
  private heap: number[] = [];
  private f: Float32Array;
  private cells: number[] = [];

  constructor(width: number, height: number, cellSize: number) {
    this.w = width;
    this.h = height;
    this.cell = cellSize;
    this.g = new Float32Array(width * height);
    this.f = new Float32Array(width * height);
    this.from = new Int32Array(width * height);
    this.state = new Uint8Array(width * height);
  }

  findPath(ax: number, az: number, bx: number, bz: number, blocked: (cx: number, cz: number) => boolean, col: CollisionWorld, agentRadius: number, out: number[]): boolean {
    out.length = 0;
    const { w, h, cell } = this;
    const sx = Math.floor(ax / cell);
    const sz = Math.floor(az / cell);
    const tx = Math.floor(bx / cell);
    const tz = Math.floor(bz / cell);
    if (sx < 0 || sz < 0 || tx < 0 || tz < 0 || sx >= w || tx >= w || sz >= h || tz >= h) return false;
    if (blocked(tx, tz)) return false;
    const start = sz * w + sx;
    const goal = tz * w + tx;
    if (start === goal) {
      out.push(bx, bz);
      return true;
    }
    this.state.fill(0);
    const heap = this.heap;
    heap.length = 0;
    this.g[start] = 0;
    this.f[start] = 0;
    this.from[start] = -1;
    this.state[start] = 1;
    this.push(start);
    let found = false;
    while (heap.length > 0) {
      const cur = this.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (this.state[cur] === 2) continue;
      this.state[cur] = 2;
      const cx = cur % w;
      const cz = (cur - cx) / w;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h || blocked(nx, nz)) continue;
          if (dx !== 0 && dz !== 0 && (blocked(cx + dx, cz) || blocked(cx, cz + dz))) continue;
          const n = nz * w + nx;
          if (this.state[n] === 2) continue;
          const ng = this.g[cur]! + (dx !== 0 && dz !== 0 ? 1.4142 : 1);
          if (this.state[n] === 1 && ng >= this.g[n]!) continue;
          this.g[n] = ng;
          this.f[n] = ng + Math.hypot(tx - nx, tz - nz);
          this.from[n] = cur;
          this.state[n] = 1;
          this.push(n);
        }
      }
    }
    if (!found) return false;
    const cells = this.cells;
    cells.length = 0;
    for (let c = goal; c !== start && c >= 0; c = this.from[c]!) cells.push(c);
    cells.reverse();
    // Smooth: from the current anchor, skip ahead to the farthest waypoint reachable in a straight swept line.
    let px = ax;
    let pz = az;
    let i = 0;
    while (i < cells.length) {
      let far = i;
      for (let j = cells.length - 1; j > i; j--) {
        const c = cells[j]!;
        const wx = j === cells.length - 1 ? bx : ((c % w) + 0.5) * cell;
        const wz = j === cells.length - 1 ? bz : (Math.floor(c / w) + 0.5) * cell;
        const d = Math.hypot(wx - px, wz - pz);
        if (d < 1e-6 || col.raycast(px, pz, (wx - px) / d, (wz - pz) / d, d, agentRadius) === null) {
          far = j;
          break;
        }
      }
      const c = cells[far]!;
      const wx = far === cells.length - 1 ? bx : ((c % w) + 0.5) * cell;
      const wz = far === cells.length - 1 ? bz : (Math.floor(c / w) + 0.5) * cell;
      out.push(wx, wz);
      px = wx;
      pz = wz;
      i = far + 1;
    }
    return true;
  }

  private push(n: number): void {
    const heap = this.heap;
    const f = this.f;
    let i = heap.length;
    heap.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]!]! <= f[n]!) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = n;
  }

  private pop(): number {
    const heap = this.heap;
    const f = this.f;
    const top = heap[0]!;
    const last = heap.pop()!;
    const n = heap.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && f[heap[c + 1]!]! < f[heap[c]!]!) c++;
        if (f[heap[c]!]! >= f[last]!) break;
        heap[i] = heap[c]!;
        i = c;
      }
      heap[i] = last;
    }
    return top;
  }
}
