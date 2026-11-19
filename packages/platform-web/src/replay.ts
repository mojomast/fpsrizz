/**
 * Input record / replay (SDK 3, P1.7). A replay is the seed + preset + every input call between ticks; because the
 * simulation is deterministic for a given seed and input stream, re-feeding the stream reproduces the run. The
 * file (`*.replay.json`) carries a final-state hash so a replay doubles as a regression test (tests/helpers/replay.ts).
 */
import type { InputCore, InputEvent } from './input.ts';

export const REPLAY_FORMAT = 'fpsrizz-replay';
export const REPLAY_VERSION = 1;

/** `events[i]` = [tick, ...event]: the call happened before the beginTick that started tick `tick`. */
export type ReplayEvent = [number, ...Exclude<InputEvent, ['t']>];

export interface ReplayFile {
  format: typeof REPLAY_FORMAT;
  version: number;
  sdk: string;
  preset: string;
  seed: number;
  /** Ticks simulated while recording. */
  ticks: number;
  events: ReplayEvent[];
  /** hashSnapshot() of the final state, when known. */
  hash?: string;
  /** Free-form (who/when/why); ignored by the runner. */
  meta?: Record<string, string>;
}

export interface ReplayRecorder {
  readonly ticks: number;
  readonly events: readonly ReplayEvent[];
  stop(): void;
  /** Finishes the file (does not stop recording). */
  toFile(extra?: Partial<Pick<ReplayFile, 'hash' | 'meta'>>): ReplayFile;
}

/** Starts recording `core` (replaces any other tap). Record from a fresh session start for a usable replay. */
export function recordInput(core: InputCore, info: { sdk: string; preset: string; seed: number }): ReplayRecorder {
  const events: ReplayEvent[] = [];
  let ticks = 0;
  let live = true;
  core.setTap((e) => {
    if (e[0] === 't') ticks++;
    else events.push([ticks, ...e] as ReplayEvent);
  });
  return {
    get ticks() { return ticks; },
    get events() { return events; },
    stop() { if (live) { live = false; core.setTap(undefined); } },
    toFile: (extra = {}) => ({ format: REPLAY_FORMAT, version: REPLAY_VERSION, ...info, ticks, events: events.map((e) => [...e] as ReplayEvent), ...extra }),
  };
}

/** Validates a parsed `.replay.json`. Throws with a readable message. */
export function parseReplay(raw: unknown): ReplayFile {
  const r = raw as Partial<ReplayFile> | null;
  if (!r || typeof r !== 'object' || r.format !== REPLAY_FORMAT) throw new Error('not an fpsrizz replay (format)');
  if (r.version !== REPLAY_VERSION) throw new Error(`unsupported replay version ${String(r.version)} (this build reads ${REPLAY_VERSION})`);
  if (typeof r.preset !== 'string' || typeof r.seed !== 'number' || typeof r.ticks !== 'number' || !Array.isArray(r.events)) throw new Error('replay is missing preset / seed / ticks / events');
  let last = 0;
  for (const e of r.events) {
    if (!Array.isArray(e) || typeof e[0] !== 'number' || e[0] < last || typeof e[1] !== 'string') throw new Error('replay events must be [tick, kind, ...] in tick order');
    last = e[0];
  }
  return r as ReplayFile;
}

/** Re-issues one recorded call on `core`. */
export function applyInputEvent(core: InputCore, e: InputEvent): void {
  switch (e[0]) {
    case 'p': core.press(e[1]); break;
    case 'r': core.release(e[1]); break;
    case 'l': core.addLook(e[1], e[2]); break;
    case 'ptr': core.setPointer(e[1], e[2], e[3]); break;
    case 'k': core.pressKey(e[1], e[2]); break;
    case 'ku': core.releaseKey(e[1]); break;
    case 'an': core.setAnalog(e[1], e[2], e[3]); break;
    case 'c': core.clear(); break;
    case 't': core.beginTick(); break;
  }
}

/**
 * Plays a replay into `core`: call `feed(tick)` right before beginTick of every tick (the host's before-tick hook),
 * starting at 0. Returns how many events were applied.
 */
export function replayFeeder(core: InputCore, file: ReplayFile): { feed(tick: number): number; readonly done: boolean } {
  let i = 0;
  return {
    feed(tick) {
      let n = 0;
      while (i < file.events.length && file.events[i]![0] <= tick) {
        const [, ...ev] = file.events[i++]!;
        applyInputEvent(core, ev as InputEvent);
        n++;
      }
      return n;
    },
    get done() { return i >= file.events.length; },
  };
}
