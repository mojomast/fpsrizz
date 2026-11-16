import { definePlugin, ResourcePoolProviders, ResourceMechanicRole, MechanicResourcesChanged, SessionControl } from '../../sdk/index.ts';
import type { ResourceDefinition, ResourceTransaction, ResourcePool, SessionContext } from '../../sdk/index.ts';

function definitionsCopy(input: readonly ResourceDefinition[]): readonly ResourceDefinition[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 64) throw new Error('Resources require 1..64 definitions');
  const ids = new Set<string>();
  return Object.freeze(input.map(d => {
    if (!d || typeof d.id !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(d.id) || ids.has(d.id)) throw new Error('Invalid or duplicate resource id');
    if (typeof d.label !== 'string' || !d.label.trim() || d.label.length > 120) throw new Error(`Invalid label for ${d.id}`);
    if (!Number.isFinite(d.initial) || !Number.isFinite(d.max) || d.initial < 0 || d.max < 0 || d.initial > d.max) throw new Error(`Invalid bounds for ${d.id}`);
    ids.add(d.id);
    return Object.freeze({ id: d.id, label: d.label, initial: d.initial, max: d.max });
  }));
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ResourceMechanicRole, 'mechanics/resources', { name: 'Resource pools', description: 'Atomic bounded balances' });
    ctx.register(ResourcePoolProviders, 'mechanics/resources', { start(provider) {
      const owners = new WeakMap<SessionContext, Set<string>>();
      return { create(owner, id, input) {
        if (provider.scope.disposed || owner.scope.disposed) throw new Error('Cannot create resources in a disposed scope');
        if (typeof id !== 'string' || !id.length || id.length > 128) throw new Error('Instance id must contain 1..128 characters');
        const definitions = definitionsCopy(input);
        const ids = owners.get(owner) ?? new Set<string>();
        if (ids.has(id)) throw new Error(`Duplicate live resource instance ${id}`);
        owners.set(owner, ids); ids.add(id);
        let live = true, revision = 0;
        let values: Record<string, number> = Object.fromEntries(definitions.map(d => [d.id, d.initial]));
        const maxima = new Map(definitions.map(d => [d.id, d.max]));
        let releaseOwner = () => {}, releaseProvider = () => {};
        const dispose = () => { if (!live) return; live = false; ids.delete(id); releaseOwner(); releaseProvider(); };
        releaseOwner = owner.scope.add(dispose, 'mechanic-resources');
        releaseProvider = provider.scope.add(dispose, 'mechanic-resources');
        function prepare(t: ResourceTransaction): { reason: string; next?: Record<string, number> } {
          if (!live || owner.scope.disposed || provider.scope.disposed) return { reason: 'Disposed resources' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { reason: 'Session is paused' };
          if (!t || typeof t !== 'object' || Array.isArray(t) || Object.keys(t).some(k => k !== 'spend' && k !== 'gain')) return { reason: 'Invalid transaction' };
          const next = { ...values };
          for (const kind of ['spend', 'gain'] as const) {
            const amounts = t[kind];
            if (amounts === undefined) continue;
            if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts) || Object.keys(amounts).length > 64) return { reason: 'Invalid amounts' };
            for (const [key, amount] of Object.entries(amounts)) {
              if (!maxima.has(key) || !Number.isFinite(amount) || amount < 0) return { reason: `Invalid ${kind} for ${key}` };
              const value = next[key]! + (kind === 'spend' ? -amount : amount);
              if (!Number.isFinite(value) || value < 0 || value > maxima.get(key)!) return { reason: `Resource bounds exceeded: ${key}` };
              next[key] = value;
            }
          }
          return { reason: '', next };
        }
        const pool: ResourcePool = Object.freeze({ id, definitions, get active() { return live; }, get revision() { return revision; },
          get(key: string) { return maxima.has(key) ? values[key]! : 0; },
          snapshot() { return Object.freeze({ ...values }); },
          preview(t: ResourceTransaction) { const p = prepare(t); return Object.freeze({ ok: !!p.next, reason: p.reason }); },
          transact(t: ResourceTransaction, reason = '') {
            if (typeof reason !== 'string' || reason.length > 256) return { ok: false, reason: 'Transaction reason exceeds 256 characters' };
            const p = prepare(t);
            if (!p.next) return { ok: false, reason: p.reason };
            values = p.next; revision++;
            provider.events.emit(MechanicResourcesChanged, Object.freeze({ owner: owner.pluginId, instance: id, reason, revision, values: Object.freeze({ ...values }) }));
            return { ok: true, reason: '' };
          }, dispose,
        });
        return pool;
      } };
    } });
  },
});
