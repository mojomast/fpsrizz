/** Lightweight entity/component storage. Plain data, stable numeric ids that are never reused within a session. */
export type EntityId = number;

export interface ComponentToken<T> {
  readonly id: string;
  readonly _t?: T;
}

export class EntityStore {
  private nextId = 1;
  private owners = new Map<EntityId, string>();
  private stores = new Map<string, Map<EntityId, unknown>>();
  private doomed = new Set<EntityId>();
  private scratch: EntityId[][] = [];
  private depth = 0;

  /** Creates an entity immediately. Systems iterating right now will not visit it during their current pass. */
  create(owner: string): EntityId {
    const id = this.nextId++;
    this.owners.set(id, owner);
    return id;
  }

  /**
   * Marks an entity destroyed. It stops being alive at once (queries skip it, isAlive is false),
   * but its component data is physically removed at the next flush(), after the running system returns.
   */
  destroy(id: EntityId): void {
    if (this.owners.has(id)) this.doomed.add(id);
  }

  isAlive(id: EntityId): boolean {
    return this.owners.has(id) && !this.doomed.has(id);
  }

  ownerOf(id: EntityId): string | undefined {
    return this.owners.get(id);
  }

  add<T>(id: EntityId, token: ComponentToken<T>, data: T): T {
    if (!this.owners.has(id)) throw new Error(`Cannot add component ${token.id} to missing entity ${id}`);
    let s = this.stores.get(token.id);
    if (!s) this.stores.set(token.id, (s = new Map()));
    s.set(id, data);
    return data;
  }

  /** Returns component data, or undefined when the entity is dead/destroyed or lacks the component. */
  get<T>(id: EntityId, token: ComponentToken<T>): T | undefined {
    if (this.doomed.has(id)) return undefined;
    return this.stores.get(token.id)?.get(id) as T | undefined;
  }

  has(id: EntityId, token: ComponentToken<unknown>): boolean {
    return !this.doomed.has(id) && (this.stores.get(token.id)?.has(id) ?? false);
  }

  remove(id: EntityId, token: ComponentToken<unknown>): void {
    this.stores.get(token.id)?.delete(id);
  }

  /**
   * Visits every live entity that has the component. Iterates a snapshot of ids, so creating or destroying
   * entities inside the callback is safe: new ones are not visited in this pass, destroyed ones are skipped.
   */
  each<T>(token: ComponentToken<T>, fn: (id: EntityId, data: T) => void): void {
    const s = this.stores.get(token.id);
    if (!s || s.size === 0) return;
    const ids = (this.scratch[this.depth] ??= []);
    ids.length = 0;
    for (const id of s.keys()) ids.push(id);
    this.depth++;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        if (this.doomed.has(id)) continue;
        const data = s.get(id);
        if (data !== undefined) fn(id, data as T);
      }
    } finally {
      this.depth--;
    }
  }

  /** First live entity with the component, if any (handy for singletons such as the player). */
  first<T>(token: ComponentToken<T>): EntityId | undefined {
    const s = this.stores.get(token.id);
    if (s) for (const id of s.keys()) if (!this.doomed.has(id)) return id;
    return undefined;
  }

  count(token?: ComponentToken<unknown>): number {
    if (!token) return this.owners.size - this.doomed.size;
    return this.stores.get(token.id)?.size ?? 0;
  }

  /** Physically removes destroyed entities. Called by the scheduler after every system. */
  flush(): void {
    if (this.doomed.size === 0) return;
    for (const id of this.doomed) {
      this.owners.delete(id);
      for (const s of this.stores.values()) s.delete(id);
    }
    this.doomed.clear();
  }

  clear(): void {
    this.owners.clear();
    this.stores.clear();
    this.doomed.clear();
  }

  countsByOwner(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, o] of this.owners) if (!this.doomed.has(id)) out[o] = (out[o] ?? 0) + 1;
    return out;
  }

  /** Plain-data snapshot (debugging, tests, and the shape future save files will use). */
  snapshot(): { id: EntityId; owner: string; components: Record<string, unknown> }[] {
    const out: { id: EntityId; owner: string; components: Record<string, unknown> }[] = [];
    for (const [id, owner] of this.owners) {
      if (this.doomed.has(id)) continue;
      const components: Record<string, unknown> = {};
      for (const [cid, s] of this.stores) if (s.has(id)) components[cid] = s.get(id);
      out.push({ id, owner, components });
    }
    return out;
  }
}
