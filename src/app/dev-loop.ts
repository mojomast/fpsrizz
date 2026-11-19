/**
 * Development-only edit loop helpers (compiled out of production builds behind `__DEV__`).
 *
 * - Live reload: `scripts/dev.mjs` serves esbuild's `/esbuild` event stream; every successful rebuild sends `change`,
 *   and the page reloads.
 * - Auto-resume: just before a live reload the app records whether a game was running. After the reload the stored
 *   preset (already persisted by the app) is applied and play resumes without going through the start menu.
 */
const RESUME_KEY = 'bulkhead.dev.resume';

export interface DevLoopOptions {
  /** True when a game is running or paused and should resume after the reload. */
  shouldResume(): boolean;
}

export function installLiveReload(options: DevLoopOptions): void {
  if (typeof EventSource === 'undefined') return;
  const events = new EventSource('/esbuild');
  events.addEventListener('change', () => {
    try {
      if (options.shouldResume()) sessionStorage.setItem(RESUME_KEY, '1');
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
