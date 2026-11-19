import { SessionControl, ResourceMechanicRole, ResourcePoolProviders, MechanicResourcesChanged } from '@bulkhead/sdk';
import type { ResourcePoolProvider, ResourceTransaction, SessionContext } from '@bulkhead/sdk';
import type { CatalogEntry } from '@bulkhead/kernel/host.ts';

export const ALTERNATE = 'z-test/resources';

/** Independent test implementation: Map-backed candidate-state transactions, no production provider imports. */
function alternateResources(provider: SessionContext): ResourcePoolProvider {
  const liveByOwner = new Map<SessionContext, Set<string>>();
  return { create(owner, id, input) {
    if (owner.signal.aborted || provider.signal.aborted) throw new Error('Disposed owner');
    if (typeof id !== 'string' || id.length < 1 || id.length > 128) throw new Error('Invalid instance id');
    if (!Array.isArray(input) || input.length < 1 || input.length > 64) throw new Error('Invalid resource definitions');
    const limits = new Map<string, number>();
    let balances = new Map<string, number>();
    for (const d of input) {
      if (!d || !/^[a-z][a-z0-9_.-]{0,63}$/.test(d.id) || limits.has(d.id) || typeof d.label !== 'string' || !d.label.trim() || d.label.length > 120 ||
          !Number.isFinite(d.initial) || !Number.isFinite(d.max) || d.initial < 0 || d.max < d.initial) throw new Error('Invalid resource definition');
      limits.set(d.id, d.max); balances.set(d.id, d.initial);
    }
    const definitions = Object.freeze(input.map(d => Object.freeze({ ...d })));
    const ids = liveByOwner.get(owner) ?? new Set<string>();
    if (ids.has(id)) throw new Error('Duplicate resource instance');
    ids.add(id); liveByOwner.set(owner, ids);
    let active = true, revision = 0;
    let releaseOwner = () => {}, releaseProvider = () => {};
    const dispose = () => {
      if (!active) return;
      active = false; ids.delete(id);
      if (!ids.size) liveByOwner.delete(owner);
      releaseOwner(); releaseProvider();
    };
    releaseOwner = owner.scope.add(dispose, 'test-resource-pool');
    releaseProvider = provider.scope.add(dispose, 'test-resource-pool');
    const evaluate = (transaction: ResourceTransaction): { next?: Map<string, number>; reason: string } => {
      if (!active || owner.signal.aborted || provider.signal.aborted) return { reason: 'Disposed' };
      if (owner.services.tryGet(SessionControl)?.playing === false) return { reason: 'Paused' };
      if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction) || Object.keys(transaction).some(key => key !== 'gain' && key !== 'spend')) return { reason: 'Invalid transaction' };
      for (const amounts of [transaction.spend, transaction.gain]) {
        if (amounts === undefined) continue;
        if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts) || Object.keys(amounts).length > 64) return { reason: 'Invalid amounts' };
        for (const [key, amount] of Object.entries(amounts)) {
          if (!limits.has(key) || !Number.isFinite(amount) || amount < 0) return { reason: 'Invalid amount' };
        }
      }
      const next = new Map<string, number>();
      for (const [key, balance] of balances) {
        const debit = transaction.spend?.[key] ?? 0, credit = transaction.gain?.[key] ?? 0;
        const value = balance - debit + credit;
        // Credits cannot finance an unaffordable debit in the same transaction.
        if (debit > balance || !Number.isFinite(value) || value < 0 || value > limits.get(key)!) return { reason: 'Resource bounds' };
        next.set(key, value);
      }
      return { next, reason: '' };
    };
    const snapshot = () => Object.freeze(Object.fromEntries(balances));
    return Object.freeze({ id, definitions, get active() { return active; }, get revision() { return revision; },
      get(key: string) { return balances.get(key) ?? 0; }, snapshot,
      preview(transaction: ResourceTransaction) { const result = evaluate(transaction); return { ok: result.next !== undefined, reason: result.reason }; },
      transact(transaction: ResourceTransaction, reason = '') {
        if (typeof reason !== 'string' || reason.length > 256) return { ok: false, reason: 'Invalid reason' };
        const result = evaluate(transaction);
        if (!result.next) return { ok: false, reason: result.reason };
        balances = result.next; revision++;
        provider.events.emit(MechanicResourcesChanged, Object.freeze({ owner: owner.pluginId, instance: id, revision, reason, values: snapshot() }));
        return { ok: true, reason: '' };
      }, dispose,
    });
  } };
}

export const alternateEntry: CatalogEntry = {
  manifest: { schema: 1, id: ALTERNATE, name: 'Independent test resources', kind: 'code', version: '1.0.0', sdk: '^2.0.0' },
  load: async () => ({ default: { register(ctx) {
    ctx.provideRole(ResourceMechanicRole, ALTERNATE, { name: 'Independent test resources', description: 'Map-backed contract test implementation' });
    ctx.register(ResourcePoolProviders, ALTERNATE, { start: alternateResources });
  } } }),
};
