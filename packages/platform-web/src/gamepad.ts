/**
 * Gamepad API adapter (SDK 3 input v2). `poll()` runs right before `InputCore.beginTick()` (and during rebinding
 * capture): standard-mapping buttons become virtual keys ("GamepadA"...) routed like keyboard keys, sticks and
 * triggers become analog sources, and the right stick can also drive `lookX/lookY` for mouse-look games.
 */
import { GAMEPAD_BUTTONS } from '@bulkhead/sdk/contracts/input.ts';
import type { InputCore } from './input.ts';
import { createActionLookup } from './input.ts';

/** The subset of the DOM Gamepad the adapter reads (so tests can pass plain objects). */
export interface GamepadLike {
  readonly connected: boolean;
  readonly mapping: string;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: readonly number[];
}

export interface GamepadOptions {
  actions: () => ReadonlyArray<{ id: string; keys: readonly string[] }>;
  isCaptured: () => boolean;
  /** Defaults to navigator.getGamepads(). */
  getPads?: () => ReadonlyArray<GamepadLike | null>;
  /** Right-stick look speed in "mouse pixels" per tick at full deflection (default 14; 0 disables). */
  lookPixelsPerTick?: number;
  /** Button press threshold for analog buttons (default 0.5). */
  threshold?: number;
}

const ACTIVITY = 0.3;

export function bindGamepads(core: InputCore, opts: GamepadOptions): { poll(): void; refresh(): void } {
  const lookup = createActionLookup(opts.actions);
  const getPads = opts.getPads ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []));
  const threshold = opts.threshold ?? 0.5;
  const look = opts.lookPixelsPerTick ?? 14;
  const down = new Set<string>();
  return {
    refresh() { lookup.refresh(); },
    poll() {
      const pads = getPads().filter((p): p is GamepadLike => !!p && p.connected);
      const now = new Set<string>();
      let lx = 0, ly = 0, rx = 0, ry = 0, lt = 0, rt = 0;
      for (const p of pads) {
        p.buttons.forEach((b, i) => { const name = GAMEPAD_BUTTONS[i]; if (name && (b.pressed || b.value > threshold)) now.add(name); });
        const a = p.axes;
        const pick = (cur: number, v: number | undefined): number => (v !== undefined && Math.abs(v) > Math.abs(cur) ? v : cur);
        lx = pick(lx, a[0]); ly = pick(ly, a[1]); rx = pick(rx, a[2]); ry = pick(ry, a[3]);
        lt = Math.max(lt, p.buttons[6]?.value ?? 0); rt = Math.max(rt, p.buttons[7]?.value ?? 0);
      }
      if (now.size > 0 || Math.max(Math.abs(lx), Math.abs(ly), Math.abs(rx), Math.abs(ry)) > ACTIVITY) core.noteDevice('gamepad');
      if (core.capturing) {
        for (const k of now) if (!down.has(k) && core.offerCapture(k)) break;
        down.clear();
        for (const k of now) down.add(k);
        return;
      }
      const active = opts.isCaptured();
      for (const k of [...down]) {
        if (!now.has(k) || !active) { down.delete(k); core.releaseKey(k); }
      }
      if (!active) {
        for (const s of ['gamepad:left', 'gamepad:right', 'gamepad:triggers'] as const) core.setAnalog(s, 0, 0);
        return;
      }
      for (const k of now) if (!down.has(k)) { down.add(k); core.pressKey(k, lookup.get(k)); }
      core.setAnalog('gamepad:left', lx, ly);
      core.setAnalog('gamepad:right', rx, ry);
      core.setAnalog('gamepad:triggers', lt, rt);
      if (look > 0) {
        const mag = Math.hypot(rx, ry);
        if (mag > 0.15) {
          const k = ((mag - 0.15) / 0.85) * look / mag;
          core.addLook(rx * k, ry * k);
        }
      }
    },
  };
}
