import { definePlugin, MechanicActionProviders, ActionMechanicRole, MechanicActionCommitted, SessionControl } from '@bulkhead/sdk';
import type { SessionContext, ResourceAmounts, MechanicActionDefinition } from '@bulkhead/sdk';

function amountsCopy(input: ResourceAmounts | undefined, known: Set<string>): ResourceAmounts | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 64) throw new Error('Invalid action amounts');
  for (const [id, value] of Object.entries(input)) if (!known.has(id) || !Number.isFinite(value) || value < 0) throw new Error(`Invalid action amount for ${id}`);
  return Object.freeze({ ...input });
}

export default definePlugin({ register(ctx) {
  ctx.provideRole(ActionMechanicRole, 'mechanics/actions', { name: 'Resource actions', description: 'Costs and gains with explicit-clock cooldowns' });
  ctx.register(MechanicActionProviders, 'mechanics/actions', { start(provider) {
    const owners = new WeakMap<SessionContext, Set<string>>();
    return { create(owner, id, resources, clock, input) {
      if (owner.scope.disposed || provider.scope.disposed) throw new Error('Cannot create actions in a disposed scope');
      if (typeof id !== 'string' || !id.length || id.length > 128) throw new Error('Instance id must contain 1..128 characters');
      if (!resources?.active || !Array.isArray(resources.definitions) || typeof resources.preview !== 'function' || typeof resources.transact !== 'function' || !clock?.active || !['seconds', 'turns'].includes(clock.domain) || !Number.isFinite(clock.now) || clock.now < 0) throw new Error('Actions require live compatible resource and clock handles');
      if (!Array.isArray(input) || input.length > 128) throw new Error('Actions require at most 128 definitions');
      const known = new Set(resources.definitions.map(d => d.id));
      const actionIds = new Set<string>();
      const definitions = Object.freeze(input.map(d => {
        if (!d || typeof d.id !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(d.id) || actionIds.has(d.id)) throw new Error('Invalid or duplicate action id');
        if (typeof d.label !== 'string' || !d.label.trim() || d.label.length > 120) throw new Error(`Invalid label for ${d.id}`);
        if (!Number.isFinite(d.cooldown) || d.cooldown < 0 || (clock.domain === 'turns' && !Number.isSafeInteger(d.cooldown))) throw new Error(`Invalid cooldown for ${d.id}`);
        actionIds.add(d.id);
        return Object.freeze({ id: d.id, label: d.label, cooldown: d.cooldown, spend: amountsCopy(d.spend, known), gain: amountsCopy(d.gain, known) });
      }));
      const byId = new Map<string, MechanicActionDefinition>(definitions.map(d => [d.id, d]));
      const ids = owners.get(owner) ?? new Set<string>();
      if (ids.has(id)) throw new Error(`Duplicate live action instance ${id}`);
      owners.set(owner, ids); ids.add(id);
      const ready = new Map<string, number>();
      let live = true, revision = 0, busy = false;
      let releaseOwner = () => {}, releaseProvider = () => {};
      const dispose = () => { if (!live) return; live = false; ids.delete(id); releaseOwner(); releaseProvider(); };
      releaseOwner = owner.scope.add(dispose, 'mechanic-actions');
      releaseProvider = provider.scope.add(dispose, 'mechanic-actions');
      const active = () => live && resources.active && clock.active;
      const remaining = (key: string) => Math.max(0, (ready.get(key) ?? 0) - clock.now);
      function preview(key: string) {
        if (!active()) return { ok: false, reason: 'Disposed action or bound handle' };
        if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
        const d = byId.get(key);
        if (!d) return { ok: false, reason: `Unknown action ${key}` };
        if (!Number.isFinite(clock.now) || clock.now < 0) return { ok: false, reason: 'Invalid clock' };
        if (remaining(key) > 0) return { ok: false, reason: 'Action is cooling down' };
        if (busy) return { ok: false, reason: 'Action execution in progress' };
        const end = clock.now + d.cooldown;
        if (!Number.isFinite(end) || (clock.domain === 'turns' && !Number.isSafeInteger(end))) return { ok: false, reason: 'Cooldown exceeds clock range' };
        return resources.preview({ spend: d.spend, gain: d.gain });
      }
      return Object.freeze({ id, definitions, get active() { return active(); }, get revision() { return revision; }, remaining, preview, dispose,
        execute(key: string) {
          const check = preview(key);
          if (!check.ok) return check;
          const d = byId.get(key)!;
          const at = clock.now, previous = ready.get(key);
          // Reserve every observable action field before transact can notify immediate observers.
          busy = true; ready.set(key, at + d.cooldown); revision++;
          try {
            const result = resources.transact({ spend: d.spend, gain: d.gain }, `action:${key}`);
            if (!result.ok) {
              if (previous === undefined) ready.delete(key); else ready.set(key, previous);
              revision--;
              return result;
            }
            provider.events.emit(MechanicActionCommitted, Object.freeze({ owner: owner.pluginId, instance: id, action: key, at, domain: clock.domain }));
            return { ok: true, reason: '' };
          } finally { busy = false; }
        },
      });
    } };
  } });
} });
