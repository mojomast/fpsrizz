import type { CatalogEntry } from '../sdk/index.ts';
import type { PluginHost } from '../kernel/host.ts';

export interface FrameStats {
  fps: number;
  /** Average milliseconds of CPU work per rendered frame (simulation + render submission). */
  frameMs: number;
  /** Worst frame time (ms) over the last second. */
  worstMs: number;
  ticksLastFrame: number;
  droppedTime: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  width: number;
  height: number;
  pixelRatio: number;
}

export type ApplyResult = { ok: true } | { ok: false; error: unknown };

/** Everything the creator/dev panel may touch. It never reaches into the game loop directly. */
export interface CreatorApi {
  host: PluginHost;
  builtinPresets: readonly unknown[];
  /** Validates the complete selection in isolation, then restarts on it. On failure the running game is untouched. */
  apply(preset: unknown, extra?: CatalogEntry[]): Promise<ApplyResult>;
  frameStats(): FrameStats;
  assets(): { key: string; refs: number; owners: string[] }[];
  counts(): { uiRoots: number; sceneRoots: number; audioVoices: number };
}

export interface CreatorPanel {
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  dispose(): void;
}

/** Placeholder until the real panel lands (same signature). */
export function createCreatorPanel(_container: HTMLElement, _api: CreatorApi): CreatorPanel {
  let isOpen = false;
  return {
    get isOpen() {
      return isOpen;
    },
    open: () => void (isOpen = true),
    close: () => void (isOpen = false),
    toggle: () => void (isOpen = !isOpen),
    dispose: () => {},
  };
}
