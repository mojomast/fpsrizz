/**
 * Rendering SDK for presentation plugins. Import this ONLY from plugins that draw; simulation plugins must not.
 *
 * `THREE` is the project's rendering namespace. In this build it is "mini3", a small WebGL2 renderer that mirrors the
 * subset of the Three.js API listed in ARCHITECTURE.md (same class and property names). Rendering plugins get real
 * scene-graph access - Groups, Meshes, materials, textures - inside scene roots they own.
 */
import * as THREE from '../platform/render/mini3/index.ts';
import type { SessionContext, Painter } from './index.ts';
import { defineService } from './core.ts';

export { THREE };

export interface TextureOptions {
  /** Repeat wrapping for tiling surfaces (default false = clamp). */
  repeat?: boolean;
}

export interface RenderService {
  /**
   * Creates a scene root owned by the calling plugin. Layer "world" is drawn with the world camera; layer "view" is
   * drawn afterwards on a cleared depth buffer with a fixed camera (first-person weapon models).
   * The root is detached automatically when the plugin's session scope is disposed - but geometries, materials and
   * textures you create yourself must be released through `own()` or `shared()`.
   */
  createRoot(ctx: SessionContext, layer: 'world' | 'view'): THREE.Group;
  /** World camera. The presentation plugin copies the active View into it each frame. */
  readonly camera: THREE.PerspectiveCamera;
  /** Camera of the "view" layer: at the origin looking down -Z, vertical fov 50. */
  readonly viewCamera: THREE.PerspectiveCamera;
  /** Scene-wide environment for the world layer. */
  setEnvironment(env: { background: number; fog: { color: number; near: number; far: number } | null }): void;
  /** Ties a disposable GPU resource to the plugin's session scope and returns it. */
  own<T extends { dispose(): void }>(ctx: SessionContext, resource: T): T;
  /**
   * Shared, reference-counted resource keyed by `key`. Created on first use, disposed when the last owner's scope ends.
   */
  shared<T extends { dispose(): void }>(ctx: SessionContext, key: string, create: () => T): T;
  /** Shared nearest-filtered texture painted by a theme Painter (keyed by `key`). */
  texture(ctx: SessionContext, key: string, painter: Painter, opts?: TextureOptions): THREE.Texture;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** Stats of the last rendered frame. */
  readonly stats: { calls: number; triangles: number; geometries: number; textures: number };
}
export const Render = defineService<RenderService>('sdk/render');
