import type { SessionContext } from '../core.ts';

export interface OwnedInstance {
  /** Invalidated by either owning scope; retained handles never alias a recreated instance. */
  readonly active: boolean;
  /** Release both registrations and the live ID. Idempotent, including during scope teardown. */
  dispose(): void;
}

/**
 * Shared factory lifetime bookkeeping. Create once in a provider's start(owner), not at module scope.
 * Each consumer context has its own live ID namespace; domains needing separate namespaces use separate pools.
 * Validate game definitions before acquire. The returned lease owns identity/lifetime only, not gameplay state.
 */
export function createOwnedInstances(provider: SessionContext, kind: string): {
  acquire(owner: SessionContext, id: string): OwnedInstance;
} {
  const owners = new WeakMap<SessionContext, Set<string>>();
  return Object.freeze({ acquire(owner: SessionContext, id: string): OwnedInstance {
    if (provider.scope.disposed || owner.scope.disposed) throw new Error('Cannot create an instance in a disposed scope');
    if (typeof id !== 'string' || !id.length || id.length > 128) throw new Error('Instance id must contain 1..128 characters');
    const ids = owners.get(owner) ?? new Set<string>();
    if (ids.has(id)) throw new Error(`Duplicate live ${kind} instance ${id}`);
    owners.set(owner, ids); ids.add(id);
    let live = true;
    let releaseOwner = () => {}, releaseProvider = () => {};
    const dispose = () => {
      if (!live) return;
      live = false; ids.delete(id); releaseOwner(); releaseProvider();
    };
    releaseOwner = owner.scope.add(dispose, kind);
    releaseProvider = provider.scope.add(dispose, kind);
    return Object.freeze({ get active() { return live && !owner.scope.disposed && !provider.scope.disposed; }, dispose });
  } });
}
