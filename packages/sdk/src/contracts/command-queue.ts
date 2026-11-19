import type { SessionContext } from '../core.ts';
import { SessionControl } from './experience.ts';

export interface CommandQueueOptions<T> {
  /** Positive safe integer; overflow rejects the new command without evicting pending work. */
  readonly capacity: number;
  /** Validate unknown input and return an owned copy, or undefined to reject. Do not retain mutable aliases. */
  readonly normalize: (input: unknown) => T | undefined;
}

export interface CommandQueue<T> {
  /** Pending commands only. Reading size does not sample the pause gate. */
  readonly size: number;
  /** Acceptance into pending work, not gameplay success. Throws if the caller's normalizer throws. */
  enqueue(input: unknown): boolean;
  /** Transfer the oldest pending command to the caller, or undefined if empty/paused/dead/reentrant. */
  drainOne(): T | undefined;
  /** Transfer the current FIFO batch. Later enqueues belong to a later drain, even during batch processing. */
  drainBatch(): T[];
  /** Drop pending work and invalidate any in-progress normalization. Does not revoke transferred commands. */
  clear(): void;
  /** Idempotently drop pending work, reject future operations and release the scope registration. */
  dispose(): void;
}

/**
 * Owned semantic ingress, with no command schema, scheduler or gameplay authority.
 * Ingress/drains reject while SessionControl.playing is false (absence permits headless use).
 * Observing pause clears pending work. A boolean gate cannot reveal a pause/resume between observations.
 * Normalizers supply detachment; undefined is reserved for rejection. Recursive ingress/drains reject;
 * clear/dispose remain available during callbacks and cancel an in-progress enqueue. Callback errors propagate.
 */
export function createCommandQueue<T>(
  owner: Pick<SessionContext, 'scope' | 'services'>,
  options: CommandQueueOptions<T>,
): CommandQueue<T> {
  const { capacity, normalize } = options;
  if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new RangeError('command queue capacity must be a positive safe integer');
  const { scope, services } = owner;
  const pending: T[] = [];
  let dead = false, busy = false, invalidated = false;
  const clear = () => { pending.length = 0; invalidated = true; };
  const dispose = scope.add(() => { dead = true; clear(); }, 'command-queue');
  const allowed = () => {
    if (dead || scope.disposed) return false;
    const playing = services.tryGet(SessionControl)?.playing !== false;
    if (!playing) clear();
    // Service getters and normalizers may dispose the owner or this queue.
    return playing && !dead && !scope.disposed;
  };
  const guarded = <R>(rejected: R, operation: () => R): R => {
    if (busy) return rejected;
    busy = true; invalidated = false;
    try { return allowed() ? operation() : rejected; }
    finally { busy = false; }
  };
  return {
    get size() { return pending.length; },
    enqueue(input) {
      return guarded(false, () => {
        if (pending.length >= capacity) return false;
        const command = normalize(input);
        // Recheck after caller code: it can pause, clear or dispose the queue while normalizing.
        if (!allowed() || invalidated || command === undefined || pending.length >= capacity) return false;
        pending.push(command);
        return true;
      });
    },
    drainOne: () => guarded<T | undefined>(undefined, () => pending.shift()),
    drainBatch: () => guarded<T[]>([], () => pending.splice(0)),
    clear,
    dispose,
  };
}
