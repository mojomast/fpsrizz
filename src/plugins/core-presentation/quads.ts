import type { Painter, VisualAnim, VisualDef } from '../../sdk/index.ts';
import { THREE } from '../../sdk/render.ts';

/**
 * Unit quad facing +Z. Vertex order: left-bottom, right-bottom, right-top, left-top.
 * `anchorY` is where the quad's origin sits vertically: 0 = bottom edge, 0.5 = centre.
 */
export function createQuadGeometry(anchorY: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const y0 = -anchorY;
  const y1 = 1 - anchorY;
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, y0, 0, 0.5, y0, 0, 0.5, y1, 0, -0.5, y1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export interface FrameGrid {
  cols: number;
  rows: number;
}

/** How many frames of `def` fit across/down the painted texture. */
export function frameGrid(def: VisualDef, painter: Painter | undefined): FrameGrid {
  if (!painter) return { cols: 1, rows: 1 };
  return { cols: Math.max(1, Math.floor(painter.width / def.frameW)), rows: Math.max(1, Math.floor(painter.height / def.frameH)) };
}

const EDGE = 0.0004;

/** Rewrites the quad's UVs to show `frame` (row-major, row 0 on top). Marks the attribute for re-upload. */
export function setFrameUv(g: THREE.BufferGeometry, grid: FrameGrid, frame: number): void {
  const uv = g.getAttribute('uv');
  if (!uv) return;
  const f = Math.max(0, Math.floor(frame));
  const col = f % grid.cols;
  const row = Math.min(grid.rows - 1, Math.floor(f / grid.cols));
  const u0 = col / grid.cols + EDGE;
  const u1 = (col + 1) / grid.cols - EDGE;
  const vTop = 1 - row / grid.rows - EDGE;
  const vBot = 1 - (row + 1) / grid.rows + EDGE;
  const a = uv.array;
  a[0] = u0; a[1] = vBot;
  a[2] = u1; a[3] = vBot;
  a[4] = u1; a[5] = vTop;
  a[6] = u0; a[7] = vTop;
  uv.needsUpdate = true;
}

/** Texture frame index of `anim` after `t` seconds. */
export function animFrame(anim: VisualAnim | undefined, t: number): number {
  if (!anim || anim.frames.length === 0) return 0;
  const n = anim.frames.length;
  const i = Math.floor(Math.max(0, t) * anim.fps);
  return anim.frames[anim.loop ? i % n : Math.min(i, n - 1)] ?? 0;
}

/** Duration of an anim in seconds (looping anims count one cycle). */
export function animDuration(anim: VisualAnim | undefined): number {
  if (!anim || anim.frames.length === 0 || anim.fps <= 0) return 0.2;
  return anim.frames.length / anim.fps;
}

export function parseColor(s: string, fallback: number): number {
  return /^#[0-9a-fA-F]{6}$/.test(s) ? parseInt(s.slice(1), 16) : fallback;
}
