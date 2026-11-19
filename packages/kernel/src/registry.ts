import { ID_PATTERN } from './validate.ts';

/** Typed handle for a registry kind. Create with defineRegistry() in the SDK. */
export interface RegistryToken<T> {
  readonly kind: string;
  readonly _t?: T;
}

export interface RegistryEntry<T> {
  id: string;
  value: T;
  owner: string;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

/** One isolated set of registries. A fresh set is built for every validated plugin graph. */
export class RegistrySet {
  private maps = new Map<string, Map<string, RegistryEntry<unknown>>>();

  register<T>(token: RegistryToken<T>, id: string, value: T, owner: string): void {
    if (!ID_PATTERN.test(id)) throw new RegistryError(`Plugin "${owner}" tried to register ${token.kind} with invalid id "${id}". Ids must be namespaced, e.g. "my-plugin/thing".`);
    let m = this.maps.get(token.kind);
    if (!m) this.maps.set(token.kind, (m = new Map()));
    const prev = m.get(id);
    if (prev) throw new RegistryError(`Duplicate ${token.kind} "${id}": already registered by "${prev.owner}", and "${owner}" tried to register it again. Registrations never overwrite; rename one of them or disable one plugin.`);
    m.set(id, { id, value, owner });
  }

  get<T>(token: RegistryToken<T>, id: string): T | undefined {
    return this.maps.get(token.kind)?.get(id)?.value as T | undefined;
  }

  require<T>(token: RegistryToken<T>, id: string): T {
    const v = this.get(token, id);
    if (v === undefined) throw new RegistryError(`Unknown ${token.kind} "${id}". Known: ${this.ids(token).join(', ') || '(none)'}`);
    return v;
  }

  has(token: RegistryToken<unknown>, id: string): boolean {
    return this.maps.get(token.kind)?.has(id) ?? false;
  }

  ownerOf(token: RegistryToken<unknown>, id: string): string | undefined {
    return this.maps.get(token.kind)?.get(id)?.owner;
  }

  entries<T>(token: RegistryToken<T>): RegistryEntry<T>[] {
    return [...(this.maps.get(token.kind)?.values() ?? [])] as RegistryEntry<T>[];
  }

  ids(token: RegistryToken<unknown>): string[] {
    return [...(this.maps.get(token.kind)?.keys() ?? [])];
  }

  removeOwner(owner: string): void {
    for (const m of this.maps.values()) for (const [id, e] of m) if (e.owner === owner) m.delete(id);
  }

  clear(): void {
    this.maps.clear();
  }

  /** kind -> owner -> count (diagnostics). */
  summary(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [kind, m] of this.maps) {
      const o = (out[kind] = {} as Record<string, number>);
      for (const e of m.values()) o[e.owner] = (o[e.owner] ?? 0) + 1;
    }
    return out;
  }

  total(): number {
    let n = 0;
    for (const m of this.maps.values()) n += m.size;
    return n;
  }
}
