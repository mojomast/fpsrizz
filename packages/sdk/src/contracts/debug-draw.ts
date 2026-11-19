/**
 * Debug drawing (SDK 3, P2.5): lines, boxes, spheres and text in world space, for visualising AI paths, sensors,
 * raycasts and other invisible state. The host draws them on an overlay (no depth test) when debug drawing is on
 * (creator tools > Inspect, or `?debugdraw`); headless runs get a no-op. Cheap to call; check `enabled` before
 * computing anything expensive:
 *
 *   const dd = debugDraw(ctx);
 *   if (dd.enabled) dd.line(from, hit.point, { color: 0xff4444 });
 *
 * Lifetime: by default a primitive lasts until the next simulation tick, so draw it every tick from a simulation
 * system. `{ frame: true }` lasts one rendered frame (draw from frame systems); `{ seconds: 2 }` lasts that long in
 * simulation time.
 */
import { defineService } from '../core.ts';
import type { SessionContext } from '@bulkhead/kernel/host.ts';
import type { Vec3 } from './spatial.ts';

export interface DebugDrawOptions {
  /** sRGB hex (default 0x00ff88). */
  color?: number;
  /** Lifetime in simulation seconds (default: until the next tick). */
  seconds?: number;
  /** Lasts one rendered frame (use from frame systems). */
  frame?: boolean;
}
export interface DebugDrawApi {
  /** False when nothing will be drawn (headless, or debug drawing switched off). */
  readonly enabled: boolean;
  line(from: Vec3, to: Vec3, opts?: DebugDrawOptions): void;
  /** Axis-aligned box from its centre and full size. */
  box(center: Vec3, size: Vec3, opts?: DebugDrawOptions): void;
  /** Wire sphere (three great circles). */
  sphere(center: Vec3, radius: number, opts?: DebugDrawOptions): void;
  text(at: Vec3, text: string, opts?: DebugDrawOptions): void;
}
export const DebugDraw = defineService<DebugDrawApi>('sdk/debug-draw');

const NOOP: DebugDrawApi = { enabled: false, line() {}, box() {}, sphere() {}, text() {} };
/** The session's debug drawer, or a no-op when the host provides none. */
export const debugDraw = (ctx: Pick<SessionContext, 'services'>): DebugDrawApi => ctx.services.tryGet(DebugDraw) ?? NOOP;
