/**
 * SDK 3 asset service (P1.4): async, reference-counted loading of static files shipped under `public/` (models,
 * sounds, level data). Provided by the host (`src/platform/assets.ts`); simulation-safe (bytes and JSON only - GPU
 * objects are built by `std/assets` on top of it).
 *
 * Every load is owned by the calling plugin's session scope: the cached bytes are dropped when the last owner's scope
 * ends. `manifest.preload` lists are awaited by the host before the plugin activates, so `peek()` works
 * synchronously inside `activate()` for those paths.
 */
import { defineService } from '../core.ts';
import type { SessionContext } from '../../kernel/host.ts';

export interface AssetProgress {
  /** Distinct assets requested so far in this app run (cache hits count once). */
  readonly total: number;
  readonly loaded: number;
  readonly failed: number;
  /** Paths still loading. */
  readonly pending: readonly string[];
}

export interface AssetService {
  /** Raw bytes of `path` (relative to the site root, e.g. "models/crate.glb"). Cached and shared between plugins. */
  bytes(ctx: SessionContext, path: string): Promise<Uint8Array>;
  /** UTF-8 text. */
  text(ctx: SessionContext, path: string): Promise<string>;
  /** Parsed JSON (the same object for every caller; treat it as read-only). */
  json<T = unknown>(ctx: SessionContext, path: string): Promise<T>;
  /** Bytes of an asset that already finished loading (preloaded or awaited earlier), otherwise undefined. */
  peek(path: string): Uint8Array | undefined;
  /** Loads several paths, reporting progress as each one completes. */
  preload(ctx: SessionContext, paths: readonly string[], onProgress?: (done: number, total: number) => void): Promise<void>;
  readonly progress: AssetProgress;
  /** Live cache entries with their owners (Creator tools / leak tests). */
  report(): { path: string; refs: number; owners: string[] }[];
}
export const Assets = defineService<AssetService>('sdk/assets');
