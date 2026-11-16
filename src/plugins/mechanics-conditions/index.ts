import { ConditionMechanicRole, ConditionProviders, SessionControl, createDeadline, createOwnedInstances, definePlugin } from '../../sdk/index.ts';
import type { Deadline } from '../../sdk/index.ts';

export default definePlugin({ register(ctx) {
  ctx.provideRole(ConditionMechanicRole, 'mechanics/conditions', { name: 'Timed conditions', description: 'Named target conditions over an explicit clock' });
  ctx.register(ConditionProviders, 'mechanics/conditions', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-conditions');
    return { create(owner, id, clock) {
      if (!clock?.active || !['turns', 'seconds'].includes(clock.domain)) throw new Error('Conditions require a live explicit clock');
      const lease = instances.acquire(owner, id);
      const entries = new Map<string, { target: string; condition: string; deadline: Deadline }>();
      let releaseOwner = () => {}, releaseProvider = () => {};
      const dispose = () => { for (const entry of entries.values()) entry.deadline.dispose(); entries.clear(); lease.dispose(); releaseOwner(); releaseProvider(); };
      releaseOwner = owner.scope.add(dispose, 'condition-deadlines');
      releaseProvider = provider.scope.add(dispose, 'condition-deadlines');
      const active = () => lease.active && clock.active;
      const prune = () => { for (const [key, entry] of entries) if (!entry.deadline.active || entry.deadline.due()) { entry.deadline.dispose(); entries.delete(key); } };
      const valid = (value: string) => typeof value === 'string' && value.length > 0 && value.length <= 128;
      const key = (target: string, condition: string) => JSON.stringify([target, condition]);
      const writable = () => !active() ? 'Disposed conditions or clock' : owner.services.tryGet(SessionControl)?.playing === false ? 'Session is paused' : '';
      return Object.freeze({ id, domain: clock.domain, get active() { return active(); }, dispose,
        apply(target: string, condition: string, duration: number) {
          const reason = writable(); if (reason) return { ok: false, reason };
          if (!valid(target) || !valid(condition)) return { ok: false, reason: 'Invalid target or condition' };
          prune(); const k = key(target, condition), existing = entries.get(k);
          if (!existing && entries.size >= 256) return { ok: false, reason: 'Condition capacity reached' };
          const deadline = existing?.deadline ?? createDeadline(owner, clock);
          const result = deadline.arm(duration);
          if (!result.ok) { if (!existing) deadline.dispose(); return { ok: false, reason: result.code }; }
          if (!existing) entries.set(k, { target, condition, deadline });
          return { ok: true, reason: '' };
        },
        remove(target: string, condition: string) {
          const reason = writable(); if (reason) return { ok: false, reason };
          if (!valid(target) || !valid(condition)) return { ok: false, reason: 'Invalid target or condition' };
          const k = key(target, condition), entry = entries.get(k); entry?.deadline.dispose(); entries.delete(k);
          return { ok: true, reason: '' };
        },
        has(target: string, condition: string) { if (!active()) return false; prune(); return entries.has(key(target, condition)); },
        snapshot() { if (!active()) return Object.freeze([]); prune(); return Object.freeze([...entries.values()].map(entry => Object.freeze({ target: entry.target, condition: entry.condition, remaining: entry.deadline.remaining() }))); },
      });
    } };
  } });
} });
