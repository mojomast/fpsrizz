/** Lightweight entity/component storage. Plain data, stable numeric ids that are never reused within a session. */
export type EntityId = number;

export interface ComponentToken<T> {
  readonly id: string;
  readonly _t?: T;
}

/** Multi-component query: entities that have every `with` component and none of the `without` components. */
export interface QuerySpec {
  readonly with: readonly ComponentToken<unknown>[];
  readonly without?: readonly ComponentToken<unknown>[];
}

/** What changed in a query since the handle was created or last drained. Ids are in event order, without duplicates. */
export interface QueryChanges {
  /** Entities that started matching. */
  readonly added: readonly EntityId[];
  /** Entities that stopped matching (component removed, `without` component added, or destroyed). */
  readonly removed: readonly EntityId[];
  /** Matching entities whose `with` component was replaced by add() or flagged with markChanged(). Excludes `added`. */
  readonly changed: readonly EntityId[];
}

/**
 * A live view over a multi-component query. Membership is cached and updated incrementally when components are
 * added or removed, so iterating costs O(matches) rather than a manual join. Iteration order is the order entities
 * started matching (deterministic). Each handle tracks its own added/removed/changed sets.
 */
export interface Query {
  readonly size: number;
  /** Visits matching live entities. Iterates a snapshot, so mutating the world inside the callback is safe. */
  each(fn: (id: EntityId) => void): void;
  /** Snapshot of the matching entity ids. */
  ids(): EntityId[];
  has(id: EntityId): boolean;
  /** Changes since creation or the last drain(), without clearing them. */
  peek(): QueryChanges;
  /** Returns the changes since creation or the last drain() and clears them. */
  drain(): QueryChanges;
  /** Stops tracking. Further use throws. */
  dispose(): void;
}

class QueryCore {
  readonly members = new Set<EntityId>();
  readonly handles = new Set<QueryHandle>();
  readonly withIds: readonly string[];
  readonly withoutIds: readonly string[];
  readonly key: string;
  constructor(key: string, spec: QuerySpec) {
    this.key = key;
    this.withIds = spec.with.map((t) => t.id);
    this.withoutIds = (spec.without ?? []).map((t) => t.id);
  }
}

class QueryHandle implements Query {
  private addedSet = new Set<EntityId>();
  private removedSet = new Set<EntityId>();
  private changedSet = new Set<EntityId>();
  private disposed = false;
  private readonly core: QueryCore;
  private readonly store: EntityStore;
  private readonly release: () => void;
  constructor(core: QueryCore, store: EntityStore, release: () => void) {
    this.core = core; this.store = store; this.release = release;
  }
  get size(): number { this.live(); return this.core.members.size; }
  each(fn: (id: EntityId) => void): void {
    this.live();
    for (const id of [...this.core.members]) if (this.core.members.has(id) && this.store.isAlive(id)) fn(id);
  }
  ids(): EntityId[] { this.live(); return [...this.core.members]; }
  has(id: EntityId): boolean { this.live(); return this.core.members.has(id); }
  peek(): QueryChanges {
    this.live();
    return { added: [...this.addedSet], removed: [...this.removedSet], changed: [...this.changedSet].filter((id) => !this.addedSet.has(id)) };
  }
  drain(): QueryChanges {
    const out = this.peek();
    this.addedSet.clear(); this.removedSet.clear(); this.changedSet.clear();
    return out;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }
  /** @internal */ noteAdded(id: EntityId): void {
    if (this.removedSet.delete(id)) { this.changedSet.add(id); return; } // left and re-entered before a drain
    this.addedSet.add(id);
  }
  /** @internal */ noteRemoved(id: EntityId): void {
    this.changedSet.delete(id);
    if (this.addedSet.delete(id)) return; // entered and left before a drain: nothing to report
    this.removedSet.add(id);
  }
  /** @internal */ noteChanged(id: EntityId): void { this.changedSet.add(id); }
  private live(): void { if (this.disposed) throw new Error('query handle was disposed'); }
}

export class EntityStore {
  private nextId = 1;
  private queries = new Map<string, QueryCore>();
  /** component id -> queries that mention it (in with or without). */
  private queryIndex = new Map<string, Set<QueryCore>>();
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
    if (!this.owners.has(id) || this.doomed.has(id)) return;
    this.doomed.add(id);
    for (const core of this.queries.values()) this.update(core, id);
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
    const replaced = s.has(id);
    s.set(id, data);
    if (this.queryIndex.has(token.id)) {
      if (replaced) this.notifyChanged(id, token.id);
      else this.reindex(id, token.id);
    }
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
    if (this.stores.get(token.id)?.delete(id) && this.queryIndex.has(token.id)) this.reindex(id, token.id);
  }

  /**
   * Flags a component as changed after mutating its data in place, so queries that require it report the entity in
   * `changed`. Replacing the data with add() flags it automatically.
   */
  markChanged(id: EntityId, token: ComponentToken<unknown>): void {
    if (this.has(id, token)) this.notifyChanged(id, token.id);
  }

  /**
   * Creates a query handle. Membership is shared between handles with the same spec; change tracking is per handle.
   * Dispose the handle when done (the host does this with the owning plugin's scope).
   */
  query(spec: QuerySpec): Query {
    if (!spec.with.length) throw new Error('query needs at least one "with" component');
    const key = `${spec.with.map((t) => t.id).sort().join(',')}|${(spec.without ?? []).map((t) => t.id).sort().join(',')}`;
    let core = this.queries.get(key);
    if (!core) {
      core = new QueryCore(key, spec);
      this.queries.set(key, core);
      for (const cid of [...core.withIds, ...core.withoutIds]) {
        let set = this.queryIndex.get(cid);
        if (!set) this.queryIndex.set(cid, (set = new Set()));
        set.add(core);
      }
      const seed = this.stores.get(core.withIds[0]!);
      if (seed) for (const id of seed.keys()) if (this.matches(core, id)) core.members.add(id);
    }
    const c = core;
    const handle: QueryHandle = new QueryHandle(c, this, () => {
      c.handles.delete(handle);
      if (c.handles.size === 0) this.dropQuery(c);
    });
    c.handles.add(handle);
    return handle;
  }

  /** Number of distinct cached queries (diagnostics, leak tests). */
  queryCount(): number {
    return this.queries.size;
  }

  private matches(core: QueryCore, id: EntityId): boolean {
    if (!this.owners.has(id) || this.doomed.has(id)) return false;
    for (const cid of core.withIds) if (!this.stores.get(cid)?.has(id)) return false;
    for (const cid of core.withoutIds) if (this.stores.get(cid)?.has(id)) return false;
    return true;
  }

  private reindex(id: EntityId, componentId: string): void {
    const cores = this.queryIndex.get(componentId);
    if (cores) for (const core of cores) this.update(core, id);
  }

  private update(core: QueryCore, id: EntityId): void {
    const now = this.matches(core, id), was = core.members.has(id);
    if (now === was) return;
    if (now) { core.members.add(id); for (const h of core.handles) h.noteAdded(id); }
    else { core.members.delete(id); for (const h of core.handles) h.noteRemoved(id); }
  }

  private notifyChanged(id: EntityId, componentId: string): void {
    const cores = this.queryIndex.get(componentId);
    if (cores) for (const core of cores) if (core.members.has(id) && core.withIds.includes(componentId)) for (const h of core.handles) h.noteChanged(id);
  }

  private dropQuery(core: QueryCore): void {
    this.queries.delete(core.key);
    for (const cid of [...core.withIds, ...core.withoutIds]) {
      const set = this.queryIndex.get(cid);
      set?.delete(core);
      if (set && set.size === 0) this.queryIndex.delete(cid);
    }
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
    for (const core of this.queries.values()) core.members.clear();
  }

  countsByOwner(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, o] of this.owners) if (!this.doomed.has(id)) out[o] = (out[o] ?? 0) + 1;
    return out;
  }

  /** Next id `create()` will hand out (snapshots). */
  get nextEntityId(): EntityId { return this.nextId; }

  /**
   * Replaces every entity with `entities` (ids and owners preserved; component data deep-copied). Queries observe it
   * as removals followed by additions, exactly like destroying and creating them. Used by snapshot restore.
   */
  restore(entities: readonly { id: EntityId; owner: string; components: Record<string, unknown> }[], nextId: EntityId): void {
    for (const id of [...this.owners.keys()]) this.destroy(id);
    this.flush();
    let max = 0;
    for (const e of entities) {
      this.owners.set(e.id, e.owner);
      max = Math.max(max, e.id);
      for (const [cid, data] of Object.entries(e.components)) this.add(e.id, { id: cid }, structuredClone(data));
    }
    this.nextId = Math.max(nextId, max + 1);
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
