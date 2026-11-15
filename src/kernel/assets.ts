import type { Scope } from './scope.ts';

interface Slot {
  value: unknown;
  refs: number;
  dispose: (value: never) => void;
  owners: Map<string, number>;
}

/**
 * Reference-counted shared assets (textures, geometries, materials, sound buffers...).
 * Every acquire is bound to an owner scope; the asset is disposed when its LAST owner releases it,
 * so removing one consumer never destroys something another still uses.
 */
export class AssetStore {
  private slots = new Map<string, Slot>();

  /** Returns the shared asset for `key`, creating it on first use. Released automatically with `scope`. */
  acquire<T>(scope: Scope, key: string, create: () => T, dispose: (value: T) => void): T {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { value: create(), refs: 0, dispose: dispose as (v: never) => void, owners: new Map() };
      this.slots.set(key, slot);
    }
    const s = slot;
    s.refs++;
    s.owners.set(scope.owner, (s.owners.get(scope.owner) ?? 0) + 1);
    scope.add(() => {
      s.refs--;
      const n = (s.owners.get(scope.owner) ?? 1) - 1;
      if (n <= 0) s.owners.delete(scope.owner);
      else s.owners.set(scope.owner, n);
      if (s.refs === 0 && this.slots.get(key) === s) {
        this.slots.delete(key);
        s.dispose(s.value as never);
      }
    }, 'asset');
    return s.value as T;
  }

  has(key: string): boolean {
    return this.slots.has(key);
  }
  refs(key: string): number {
    return this.slots.get(key)?.refs ?? 0;
  }
  get size(): number {
    return this.slots.size;
  }
  /** key -> { refs, owners } for the creator panel. */
  report(): { key: string; refs: number; owners: string[] }[] {
    return [...this.slots].map(([key, s]) => ({ key, refs: s.refs, owners: [...s.owners.keys()] }));
  }
}
