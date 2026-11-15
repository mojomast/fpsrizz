/** Owner-bound disposable scopes. Everything a plugin or session acquires is released through one of these. */
export type Disposer = () => void;

export class ScopeDisposedError extends Error {
  constructor(label: string) {
    super(`Scope "${label}" was disposed`);
    this.name = 'ScopeDisposedError';
  }
}

export type ScopeErrorSink = (error: unknown, owner: string, kind: string) => void;

export class Scope {
  readonly owner: string;
  readonly label: string;
  private items: { fn: Disposer; kind: string }[] = [];
  private kids = new Set<Scope>();
  private ctrl = new AbortController();
  private dead = false;
  private parent: Scope | undefined;
  private sink: ScopeErrorSink | undefined;

  constructor(owner: string, label: string, parent?: Scope, sink?: ScopeErrorSink) {
    this.owner = owner;
    this.label = label;
    this.parent = parent;
    this.sink = sink ?? parent?.sink;
  }

  get disposed(): boolean {
    return this.dead;
  }
  /** Aborted when the scope is disposed; pass to fetch / async work. */
  get signal(): AbortSignal {
    return this.ctrl.signal;
  }

  /**
   * Registers a cleanup. If the scope is already disposed the cleanup runs immediately,
   * so late asynchronous work can never attach a live resource to a dead session.
   * Returns a function that releases this one resource early (idempotent).
   */
  add(fn: Disposer, kind = 'misc'): Disposer {
    if (this.dead) {
      this.run(fn, kind);
      return () => {};
    }
    const item = { fn, kind };
    this.items.push(item);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const i = this.items.indexOf(item);
      if (i >= 0) {
        this.items.splice(i, 1);
        this.run(fn, kind);
      }
    };
  }

  child(label: string, owner: string = this.owner): Scope {
    const c = new Scope(owner, label, this);
    if (this.dead) c.dispose();
    else this.kids.add(c);
    return c;
  }

  /** Resolves with the promise unless the scope died first, in which case it rejects with ScopeDisposedError. */
  async guard<T>(p: Promise<T>): Promise<T> {
    const v = await p;
    if (this.dead) throw new ScopeDisposedError(this.label);
    return v;
  }

  /** Idempotent. Children first, then own items in reverse order. One failure never blocks the rest. */
  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.ctrl.abort();
    for (const c of [...this.kids].reverse()) c.dispose();
    this.kids.clear();
    const items = this.items;
    this.items = [];
    for (let i = items.length - 1; i >= 0; i--) this.run(items[i]!.fn, items[i]!.kind);
    this.parent?.kids.delete(this);
    this.parent = undefined;
  }

  /** Live resource counts grouped by owner and kind (diagnostics). */
  stats(into: Record<string, Record<string, number>> = {}): Record<string, Record<string, number>> {
    const mine = (into[this.owner] ??= {});
    for (const it of this.items) mine[it.kind] = (mine[it.kind] ?? 0) + 1;
    for (const c of this.kids) c.stats(into);
    return into;
  }

  /** Total number of live resources in this scope tree. */
  size(): number {
    let n = this.items.length;
    for (const c of this.kids) n += c.size();
    return n;
  }

  private run(fn: Disposer, kind: string): void {
    try {
      fn();
    } catch (e) {
      if (this.sink) this.sink(e, this.owner, kind);
    }
  }
}
