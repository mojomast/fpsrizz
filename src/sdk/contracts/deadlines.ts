/** Pollable, owner-scoped deadlines over a borrowed explicit mechanic clock. */
import type { SessionContext } from '../core.ts';
import type { MechanicClock, MechanicTimeDomain } from './mechanics.ts';
import { SessionControl } from './experience.ts';

export type DeadlineResult = { readonly ok: true } | { readonly ok: false; readonly code: 'disposed' | 'paused' | 'invalid-duration' };

export interface Deadline {
  /** False after this handle, its owner, or its borrowed clock is disposed. */
  readonly active: boolean;
  readonly domain: MechanicTimeDomain;
  /** Due deadlines stay armed until explicitly cancelled or rearmed. Inactive handles report false. */
  readonly armed: boolean;
  /** Replace the deadline with clock.now + duration; ordinary rejection leaves it unchanged. */
  arm(duration: number): DeadlineResult;
  /** Idempotent for live, unpaused handles. */
  cancel(): DeadlineResult;
  /** Zero when unarmed, due or inactive. */
  remaining(): number;
  /** Exactly clock.now >= deadline when armed and active; querying never consumes it. */
  due(): boolean;
  /** Idempotent, allowed while paused; never disposes or advances the borrowed clock. */
  dispose(): void;
}

/**
 * Create an unarmed deadline, or initialize it with a duration even during paused session activation.
 * Invalid initial state throws; subsequent arm/cancel operations return stable rejection codes.
 * Seconds require positive finite representable durations; turns additionally require safe integers.
 * No systems, callbacks, recurrence, catch-up, resource costs or clock advancement are installed.
 */
export function createDeadline(owner: SessionContext, clock: MechanicClock, initialDuration?: number): Deadline {
  if (owner.scope.disposed || !clock.active) throw new Error('Cannot create deadline with a disposed owner or clock');
  const domain = clock.domain;
  if (domain !== 'seconds' && domain !== 'turns') throw new Error('Deadline clock domain must be seconds or turns');
  const validNow = (now: number) => Number.isFinite(now) && now >= 0 && (domain !== 'turns' || Number.isSafeInteger(now));
  if (!validNow(clock.now)) throw new Error('Deadline requires a finite nonnegative clock; turns must be safe integers');
  const endAt = (duration: number): number | undefined => {
    const now = clock.now, next = now + duration;
    if (!validNow(now) || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(next) || next <= now ||
        (domain === 'turns' && (!Number.isSafeInteger(duration) || !Number.isSafeInteger(next)))) return undefined;
    return next;
  };
  let at = initialDuration === undefined ? undefined : endAt(initialDuration);
  if (initialDuration !== undefined && at === undefined) throw new Error('Deadline duration must be positive, finite and representable; turns must be safe integers');
  let live = true;
  let release = () => {};
  const active = () => live && !owner.scope.disposed && clock.active;
  const writable = (): DeadlineResult => !active() ? { ok: false, code: 'disposed' }
    : owner.services.tryGet(SessionControl)?.playing === false ? { ok: false, code: 'paused' } : { ok: true };
  const dispose = () => { if (!live) return; live = false; at = undefined; release(); };
  release = owner.scope.add(dispose, 'deadline');
  return Object.freeze({
    domain, get active() { return active(); }, get armed() { return active() && at !== undefined; },
    arm(duration: number): DeadlineResult {
      const allowed = writable(); if (!allowed.ok) return allowed;
      const next = endAt(duration); if (next === undefined) return { ok: false, code: 'invalid-duration' };
      at = next; return { ok: true };
    },
    cancel(): DeadlineResult {
      const allowed = writable(); if (!allowed.ok) return allowed;
      at = undefined; return { ok: true };
    },
    remaining: () => active() && at !== undefined ? Math.max(0, at - clock.now) : 0,
    due: () => active() && at !== undefined && clock.now >= at,
    dispose,
  });
}
