import type { Scope } from './scope.ts';

export interface EventToken<T> {
  readonly id: string;
  readonly _t?: T;
}
export interface CommandToken<P, R = void> {
  readonly id: string;
  readonly _t?: (p: P) => R;
}
export interface ServiceToken<T> {
  readonly id: string;
  readonly _t?: T;
}

type Handler = { fn: (payload: unknown) => void; owner: string };

/**
 * Events are facts that already happened. Delivery timing:
 *  - emitted while a system runs -> queued, delivered right after that system returns (before the next system);
 *  - emitted from a handler -> appended to the same drain, delivered in order;
 *  - emitted outside a tick (activation, UI) -> delivered immediately.
 */
export class EventBus {
  private handlers = new Map<string, Handler[]>();
  private queue: { id: string; payload: unknown }[] = [];
  private draining = false;
  /** Set by the scheduler while a system is executing. */
  deferring = false;
  onHandlerError: (error: unknown, owner: string, eventId: string) => void = (e) => {
    throw e;
  };

  on<T>(token: EventToken<T>, fn: (payload: T) => void, owner: string, scope: Scope): void {
    const h: Handler = { fn: fn as (p: unknown) => void, owner };
    let list = this.handlers.get(token.id);
    if (!list) this.handlers.set(token.id, (list = []));
    list.push(h);
    scope.add(() => {
      const l = this.handlers.get(token.id);
      if (!l) return;
      const i = l.indexOf(h);
      if (i >= 0) l.splice(i, 1);
    }, 'event-subscription');
  }

  emit<T>(token: EventToken<T>, payload: T): void {
    this.queue.push({ id: token.id, payload });
    if (!this.deferring && !this.draining) this.drain();
  }

  drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      let n = 0;
      while (this.queue.length > 0) {
        if (++n > 10000) {
          this.queue.length = 0;
          throw new Error('Event storm: more than 10000 events in one drain (handlers are probably emitting in a loop)');
        }
        const ev = this.queue.shift()!;
        const list = this.handlers.get(ev.id);
        if (!list) continue;
        for (const h of [...list]) {
          try {
            h.fn(ev.payload);
          } catch (e) {
            this.onHandlerError(e, h.owner, ev.id);
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }

  handlerCount(): number {
    let n = 0;
    for (const l of this.handlers.values()) n += l.length;
    return n;
  }
  clear(): void {
    this.handlers.clear();
    this.queue.length = 0;
  }
}

/** Commands are requests to change gameplay. Exactly one plugin handles each command type; dispatch is synchronous. */
export class CommandBus {
  private handlers = new Map<string, Handler & { call: (p: unknown) => unknown }>();

  handle<P, R>(token: CommandToken<P, R>, fn: (payload: P) => R, owner: string, scope: Scope): void {
    const prev = this.handlers.get(token.id);
    if (prev) throw new Error(`Command "${token.id}" is already handled by "${prev.owner}"; "${owner}" cannot register a second handler.`);
    this.handlers.set(token.id, { fn: fn as (p: unknown) => void, call: fn as (p: unknown) => unknown, owner });
    scope.add(() => {
      if (this.handlers.get(token.id)?.owner === owner) this.handlers.delete(token.id);
    }, 'command-handler');
  }

  dispatch<P, R>(token: CommandToken<P, R>, payload: P): R {
    const h = this.handlers.get(token.id);
    if (!h) throw new Error(`No active plugin handles command "${token.id}". Is the plugin that owns it enabled?`);
    return h.call(payload) as R;
  }

  canDispatch(token: CommandToken<never, unknown>): boolean {
    return this.handlers.has(token.id);
  }
  handlerCount(): number {
    return this.handlers.size;
  }
  clear(): void {
    this.handlers.clear();
  }
}

/** Services answer immediate queries. One provider per token. */
export class ServiceMap {
  private map = new Map<string, { impl: unknown; owner: string }>();

  provide<T>(token: ServiceToken<T>, impl: T, owner: string, scope: Scope): void {
    const prev = this.map.get(token.id);
    if (prev) throw new Error(`Service "${token.id}" is already provided by "${prev.owner}"; "${owner}" cannot provide it again.`);
    this.map.set(token.id, { impl, owner });
    scope.add(() => {
      if (this.map.get(token.id)?.impl === impl) this.map.delete(token.id);
    }, 'service');
  }

  get<T>(token: ServiceToken<T>): T {
    const e = this.map.get(token.id);
    if (!e) throw new Error(`Service "${token.id}" is not available. Enable the plugin that provides it, or declare it as a dependency so it activates first.`);
    return e.impl as T;
  }

  tryGet<T>(token: ServiceToken<T>): T | undefined {
    return this.map.get(token.id)?.impl as T | undefined;
  }

  list(): { id: string; owner: string }[] {
    return [...this.map].map(([id, e]) => ({ id, owner: e.owner }));
  }
  clear(): void {
    this.map.clear();
  }
}
