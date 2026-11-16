/**
 * Rendering SDK for presentation plugins. Import this ONLY from plugins that draw; simulation plugins must not.
 *
 * `THREE` is the official Three.js WebGL/core namespace (pinned, locally vendored with matching declarations).
 * Rendering plugins get real
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
  /**
   * Selects a scoped primary world camera. Most recently acquired live selection wins; cleanup restores the previous
   * selection, or `camera` when none remain. Does not own/dispose the camera. Resizing preserves an orthographic
   * camera's vertical extent, horizontal center and zoom, adjusting left/right to the canvas aspect ratio.
   */
  setWorldCamera(ctx: SessionContext, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera): void;
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

// ---------------------------------------------------------------------------------------------------------------------
// Custom actor renderers
// ---------------------------------------------------------------------------------------------------------------------
import type { EntityId, Visual } from './index.ts';
import { defineRegistry } from './core.ts';

/** Per-frame data handed to an actor renderer. Positions are already interpolated between simulation ticks. */
export interface ActorFrame {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Yaw of the active view (billboards rotate to this). */
  viewYaw: number;
  /** Interpolated simulation time in seconds. */
  time: number;
  visual: Readonly<Visual>;
}
export interface ActorHandle {
  /** Root object; the presentation plugin parents it under its actor root and removes it when the entity dies. */
  readonly object: THREE.Object3D;
  update(frame: ActorFrame): void;
  /** Release everything this handle created that is not shared. */
  dispose(): void;
}
/**
 * Draws entities that carry a Visual component whose `renderer` equals this registry id ("" selects the active
 * presentation plugin's default billboard). `start` runs once per session in the registering plugin's context.
 */
export interface ActorRenderer {
  description: string;
  start(ctx: SessionContext): (entity: EntityId, visual: Readonly<Visual>) => ActorHandle;
}
export const ActorRenderers = defineRegistry<ActorRenderer>('actor-renderer');
