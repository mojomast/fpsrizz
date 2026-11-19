/**
 * Host side of the SDK debug-draw service (P2.5): a bounded primitive buffer with tick/frame/seconds lifetimes and a
 * 2D-canvas overlay renderer that projects world space through the active camera. No depth test, by design: debug
 * geometry should stay visible through walls. Also draws physics colliders when asked (inspector toggle).
 */
import type { DebugDrawApi, DebugDrawOptions, Vec3 } from '../sdk/index.ts';

export type DebugPrim =
  | { k: 'line'; a: Vec3; b: Vec3; color: number; until: number; frame: boolean }
  | { k: 'box'; c: Vec3; s: Vec3; color: number; until: number; frame: boolean }
  | { k: 'sphere'; c: Vec3; r: number; color: number; until: number; frame: boolean }
  | { k: 'text'; at: Vec3; text: string; color: number; until: number; frame: boolean };

export interface DebugDrawHost {
  readonly service: DebugDrawApi;
  enabled: boolean;
  /** Called at the start of every simulation tick with the new sim time (drops expired primitives). */
  beginTick(time: number): void;
  /** Primitives alive right now (tests and the overlay). */
  primitives(): readonly DebugPrim[];
  /** Draws onto a 2D context. `viewProj` is a column-major 4x4 (projection * view). Drops one-frame primitives. */
  render(g: CanvasRenderingContext2D, viewProj: ArrayLike<number>, width: number, height: number): void;
  clear(): void;
}

const MAX = 20000;
const hex = (c: number): string => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;

export function createDebugDraw(enabled = false): DebugDrawHost {
  let prims: DebugPrim[] = [];
  let now = 0;
  const push = (p: DebugPrim): void => { if (prims.length >= MAX) prims.splice(0, prims.length - MAX + 1); prims.push(p); };
  const meta = (o: DebugDrawOptions | undefined): { color: number; until: number; frame: boolean } => ({
    color: o?.color ?? 0x00ff88, frame: !!o?.frame, until: o?.seconds && o.seconds > 0 ? now + o.seconds : -1,
  });
  const host: DebugDrawHost = {
    enabled,
    service: {
      get enabled() { return host.enabled; },
      line(a, b, o) { if (host.enabled) push({ k: 'line', a: { ...a }, b: { ...b }, ...meta(o) }); },
      box(c, s, o) { if (host.enabled) push({ k: 'box', c: { ...c }, s: { ...s }, ...meta(o) }); },
      sphere(c, r, o) { if (host.enabled) push({ k: 'sphere', c: { ...c }, r, ...meta(o) }); },
      text(at, text, o) { if (host.enabled) push({ k: 'text', at: { ...at }, text: String(text).slice(0, 200), ...meta(o) }); },
    },
    beginTick(time) {
      now = time;
      prims = prims.filter((p) => p.frame || (p.until >= 0 && p.until > time));
    },
    primitives: () => prims,
    clear() { prims = []; },
    render(g, m, w, h) {
      g.clearRect(0, 0, w, h);
      if (!prims.length) return;
      // World → screen. Returns undefined behind the camera.
      const proj = (p: Vec3): [number, number] | undefined => {
        const x = m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!, y = m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!;
        const cw = m[3]! * p.x + m[7]! * p.y + m[11]! * p.z + m[15]!;
        if (cw <= 1e-4) return undefined;
        return [((x / cw) * 0.5 + 0.5) * w, (1 - ((y / cw) * 0.5 + 0.5)) * h];
      };
      const seg = (a: Vec3, b: Vec3): void => {
        const pa = proj(a), pb = proj(b);
        if (!pa || !pb) return;
        g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]);
      };
      g.lineWidth = 1.5;
      g.font = '12px ui-monospace, monospace';
      g.textAlign = 'center';
      for (const p of prims) {
        g.strokeStyle = g.fillStyle = hex(p.color);
        g.beginPath();
        if (p.k === 'line') seg(p.a, p.b);
        else if (p.k === 'box') {
          const { c, s } = p, hx = s.x / 2, hy = s.y / 2, hz = s.z / 2;
          const v = (i: number): Vec3 => ({ x: c.x + (i & 1 ? hx : -hx), y: c.y + (i & 2 ? hy : -hy), z: c.z + (i & 4 ? hz : -hz) });
          for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] as const) seg(v(a), v(b));
        } else if (p.k === 'sphere') {
          const N = 24;
          for (let axis = 0; axis < 3; axis++) for (let i = 0; i < N; i++) {
            const pt = (t: number): Vec3 => {
              const u = Math.cos(t) * p.r, q = Math.sin(t) * p.r;
              return axis === 0 ? { x: p.c.x + u, y: p.c.y + q, z: p.c.z } : axis === 1 ? { x: p.c.x + u, y: p.c.y, z: p.c.z + q } : { x: p.c.x, y: p.c.y + u, z: p.c.z + q };
            };
            seg(pt((i / N) * Math.PI * 2), pt(((i + 1) / N) * Math.PI * 2));
          }
        } else {
          const s = proj(p.at);
          if (s) { g.strokeStyle = '#000a'; g.lineWidth = 3; g.strokeText(p.text, s[0], s[1]); g.lineWidth = 1.5; g.fillText(p.text, s[0], s[1]); }
        }
        g.stroke();
      }
      prims = prims.filter((p) => !p.frame);
    },
  };
  return host;
}
