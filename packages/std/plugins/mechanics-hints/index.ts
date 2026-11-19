import { HintMechanicRole, HintProviders, SessionControl, createOwnedInstances, definePlugin } from '@bulkhead/sdk';

export default definePlugin({ register(ctx) {
  ctx.provideRole(HintMechanicRole, 'mechanics/hints', { name: 'Hint reveal ledger', description: 'Consumer-local ordered reveal levels and reset' });
  ctx.register(HintProviders, 'mechanics/hints', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-hints');
    return { create(owner, id, topics) {
      if (!Array.isArray(topics) || topics.length < 1 || topics.length > 128) throw new Error('Hints require 1..128 topics');
      const limits = new Map<string, number>();
      for (const topic of topics) {
        if (!topic || typeof topic.id !== 'string' || !topic.id.trim() || topic.id.length > 128 || limits.has(topic.id) || !Number.isSafeInteger(topic.levels) || topic.levels < 1 || topic.levels > 128) throw new Error('Invalid hint topic or level count');
        limits.set(topic.id, topic.levels);
      }
      const lease = instances.acquire(owner, id), levels = new Map<string, number>();
      let revision = 0;
      const reject = (topic: string) => !lease.active ? 'Disposed hint ledger' : owner.services.tryGet(SessionControl)?.playing === false ? 'Session is paused' : !limits.has(topic) ? 'Unknown hint topic' : '';
      return Object.freeze({ id, get active() { return lease.active; }, get revision() { return revision; }, dispose: lease.dispose,
        level(topic: string) { return levels.get(topic) ?? 0; },
        reveal(topic: string) {
          const error = reject(topic); if (error) return { ok: false, reason: error };
          const next = (levels.get(topic) ?? 0) + 1;
          if (next > limits.get(topic)!) return { ok: false, reason: 'All hints revealed' };
          levels.set(topic, next); revision++; return { ok: true, reason: '' };
        },
        reset(topic: string) {
          const error = reject(topic); if (error) return { ok: false, reason: error };
          if (levels.delete(topic)) revision++;
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });
