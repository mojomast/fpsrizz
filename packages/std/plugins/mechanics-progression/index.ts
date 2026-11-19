import { ProgressionMechanicRole, ProgressionProviders, MechanicProgressionChanged, SessionControl, createOwnedInstances, definePlugin } from '@bulkhead/sdk';
import type { MechanicProgression, ProgressionDefinition } from '@bulkhead/sdk';

function definitionCopy(input: ProgressionDefinition): ProgressionDefinition {
  if (!input || typeof input !== 'object') throw new Error('Progression definition is required');
  const startLevel = input.startLevel;
  const baseXp = input.baseXp;
  const growth = input.growth;
  const maxLevel = input.maxLevel ?? 1000;
  if (!Number.isSafeInteger(startLevel) || startLevel < 1 || startLevel > 1000) throw new Error('startLevel must be a safe integer from 1 to 1000');
  if (!Number.isSafeInteger(baseXp) || baseXp < 1 || baseXp > 1_000_000_000) throw new Error('baseXp must be a safe integer from 1 to 1,000,000,000');
  if (!Number.isSafeInteger(growth) || growth < 0 || growth > 1_000_000_000) throw new Error('growth must be a safe integer from 0 to 1,000,000,000');
  if (!Number.isSafeInteger(maxLevel) || maxLevel < startLevel || maxLevel > 10_000) throw new Error('maxLevel must be a safe integer from startLevel to 10,000');
  return Object.freeze({ startLevel, baseXp, growth, maxLevel });
}

export default definePlugin({ register(ctx) {
  ctx.provideRole(ProgressionMechanicRole, 'mechanics/progression', {
    name: 'Experience and levels', description: 'Deterministic XP thresholds, level counts and pending level rewards',
  });
  ctx.register(ProgressionProviders, 'mechanics/progression', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-progression');
    return { create(owner, id, input) {
      const definition = definitionCopy(input);
      const instance = instances.acquire(owner, id);
      const threshold = (level: number): number => definition.baseXp + (level - definition.startLevel) * definition.growth;
      let level = definition.startLevel, xp = 0, totalXp = 0, pending = 0, revision = 0;
      const changed = (reason: string) => provider.events.emit(MechanicProgressionChanged, Object.freeze({
        owner: owner.pluginId, instance: id, reason, revision, level, xp, xpToNext: threshold(level), totalXp, pending,
      }));
      return Object.freeze({
        id, definition, dispose: instance.dispose,
        get active() { return instance.active; },
        get revision() { return revision; },
        get level() { return level; },
        get xp() { return xp; },
        get xpToNext() { return threshold(level); },
        get totalXp() { return totalXp; },
        get pending() { return pending; },
        grant(amount: number) {
          if (!instance.active) return { ok: false, reason: 'Disposed progression', levels: 0 };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused', levels: 0 };
          if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, reason: 'XP must be a positive safe integer', levels: 0 };
          if (!Number.isSafeInteger(totalXp + amount)) return { ok: false, reason: 'Lifetime XP overflow', levels: 0 };
          totalXp += amount;
          xp += amount;
          let gained = 0;
          while (level < definition.maxLevel! && xp >= threshold(level)) {
            xp -= threshold(level);
            level++;
            pending++;
            gained++;
          }
          if (level === definition.maxLevel) xp = Math.min(xp, threshold(level));
          revision++;
          changed('grant');
          return { ok: true, reason: '', levels: gained };
        },
        consumeLevel() {
          if (!instance.active) return { ok: false, reason: 'Disposed progression' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          if (pending === 0) return { ok: false, reason: 'No pending level reward' };
          pending--; revision++;
          changed('consume');
          return { ok: true, reason: '' };
        },
      } satisfies MechanicProgression);
    } };
  } });
} });
