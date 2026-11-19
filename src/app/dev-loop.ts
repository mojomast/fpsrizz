/**
 * Development-only edit loop helpers (compiled out of production builds behind `__DEV__`).
 *
 * - Live reload: `scripts/dev.mjs` serves esbuild's `/esbuild` event stream; every successful rebuild sends `change`,
 *   and the page reloads.
 * - Auto-resume: just before a live reload the app records whether a game was running. After the reload the stored
 *   preset (already persisted by the app) is applied and play resumes without going through the start menu.
 * - State-preserving reload (P2.1 step 2): when the app can take a complete RunSnapshot (all-SDK-3 presets), it is
 *   stored too and restored after the reload, so editing code or JSON content keeps your place in the game.
 *   Restore refuses snapshots from another preset or plugin set, and the app then just restarts as before.
 */
const RESUME_KEY = 'bulkhead.dev.resume';
const SNAPSHOT_KEY = 'bulkhead.dev.snapshot';

export interface DevLoopOptions {
  /** True when a game is running or paused and should resume after the reload. */
  shouldResume(): boolean;
  /** The run's snapshot to restore after the reload, if complete. */
  snapshot?(): unknown;
}

export function installLiveReload(options: DevLoopOptions): void {
  if (typeof EventSource === 'undefined') return;
  const events = new EventSource('/esbuild');
  events.addEventListener('change', () => {
    try {
      if (options.shouldResume()) {
        sessionStorage.setItem(RESUME_KEY, '1');
        const snap = options.snapshot?.();
        if (snap !== undefined) sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      }
    } catch {
      // Storage can be unavailable (privacy mode); reloading is still useful.
    }
    location.reload();
  });
}

/** Returns true once after a live reload that interrupted a running game. */
export function takeResumeRequest(): boolean {
  try {
    const want = sessionStorage.getItem(RESUME_KEY) === '1';
    sessionStorage.removeItem(RESUME_KEY);
    return want;
  } catch {
    return false;
  }
}

/** The snapshot stored by the last live reload (once), or undefined. */
export function takeResumeSnapshot(): unknown {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    sessionStorage.removeItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** Parses `?seed=N` (a uint32) for reproducing a run; undefined when absent. Invalid values are left to validation. */
export function seedOverride(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || raw.trim() === '') return undefined;
  return Number(raw);
}

/** Returns a copy of a preset object with its seed replaced, or the input unchanged when there is no override. */
export function withSeed(preset: unknown, seed: number | undefined): unknown {
  if (seed === undefined || preset === null || typeof preset !== 'object' || Array.isArray(preset)) return preset;
  return { ...(preset as Record<string, unknown>), seed };
}
