import { definePlugin, MechanicClockProviders, ClockMechanicRole, SessionControl, createOwnedInstances } from '../../sdk/index.ts';

export default definePlugin({ register(ctx) {
  ctx.provideRole(ClockMechanicRole, 'mechanics/clock', { name: 'Explicit clocks', description: 'Consumer-advanced seconds or turns' });
  ctx.register(MechanicClockProviders, 'mechanics/clock', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-clock');
    return { create(owner, id, domain) {
      if (provider.scope.disposed || owner.scope.disposed) throw new Error('Cannot create clock in a disposed scope');
      if (typeof id !== 'string' || !id.length || id.length > 128) throw new Error('Instance id must contain 1..128 characters');
      if (domain !== 'seconds' && domain !== 'turns') throw new Error('Clock domain must be seconds or turns');
      const instance = instances.acquire(owner, id);
      let now = 0;
      return Object.freeze({ id, domain, get active() { return instance.active; }, get now() { return now; }, dispose: instance.dispose,
        advance(amount: number) {
          if (!instance.active) return { ok: false, reason: 'Disposed clock' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          const next = now + amount;
          if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(next) || next <= now || (domain === 'turns' && (!Number.isSafeInteger(amount) || !Number.isSafeInteger(next)))) return { ok: false, reason: 'Advance must be positive, finite and representable; turns must be safe integers' };
          now = next;
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });
