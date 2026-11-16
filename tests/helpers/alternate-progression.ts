/** Independent progression implementation derived from one accepted-XP total and a claimed-level counter. */
import { ProgressionMechanicRole, ProgressionProviders, SessionControl, createOwnedInstances } from '../../src/sdk/index.ts';
import type { CatalogEntry, ProgressionDefinition, SessionContext } from '../../src/sdk/index.ts';
import { codePlugin } from './host.ts';

const ID = 'test/counted-progression';
const alternate = codePlugin(ID, { register(ctx) {
  ctx.provideRole(ProgressionMechanicRole, ID, { name: 'Counted progression', description: 'Independent total-XP implementation' });
  ctx.register(ProgressionProviders, ID, { start(provider) {
    const lifetimes = createOwnedInstances(provider, 'test-counted-progression');
    return { create(owner: SessionContext, id: string, input: ProgressionDefinition) {
      if (!input || !Number.isSafeInteger(input.startLevel) || input.startLevel < 1) throw new Error('Invalid startLevel');
      if (!Number.isSafeInteger(input.baseXp) || input.baseXp < 1) throw new Error('Invalid baseXp');
      if (!Number.isSafeInteger(input.growth) || input.growth < 0) throw new Error('Invalid growth');
      const maxLevel = input.maxLevel ?? 1000;
      if (!Number.isSafeInteger(maxLevel) || maxLevel < input.startLevel || maxLevel > 10000) throw new Error('Invalid maxLevel');
      const definition = Object.freeze({ startLevel: input.startLevel, baseXp: input.baseXp, growth: input.growth, maxLevel });
      const lifetime = lifetimes.acquire(owner, id);
      const need = (level: number) => definition.baseXp + (level - definition.startLevel) * definition.growth;
      let accepted = 0, claimed = 0, revision = 0;
      const derive = () => {
        let level = definition.startLevel, xp = accepted;
        while (level < maxLevel && xp >= need(level)) { xp -= need(level); level++; }
        if (level === maxLevel) xp = Math.min(xp, need(level));
        return { level, xp, completed: level - definition.startLevel };
      };
      return Object.freeze({
        id, definition, dispose: lifetime.dispose,
        get active() { return lifetime.active; },
        get revision() { return revision; },
        get level() { return derive().level; },
        get xp() { return derive().xp; },
        get xpToNext() { return need(derive().level); },
        get totalXp() { return accepted; },
        get pending() { return derive().completed - claimed; },
        grant(amount: number) {
          if (!lifetime.active) return { ok: false, reason: 'Disposed', levels: 0 };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Paused', levels: 0 };
          if (!Number.isSafeInteger(amount) || amount < 1 || !Number.isSafeInteger(accepted + amount)) return { ok: false, reason: 'Invalid XP', levels: 0 };
          const before = derive().level;
          accepted += amount; revision++;
          return { ok: true, reason: '', levels: derive().level - before };
        },
        consumeLevel() {
          if (!lifetime.active) return { ok: false, reason: 'Disposed' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Paused' };
          if (derive().completed <= claimed) return { ok: false, reason: 'None pending' };
          claimed++; revision++;
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });

export const progressionProviders: readonly { id: string; entry: CatalogEntry }[] = [
  { id: 'mechanics/progression', entry: { manifest: { schema: 1, id: 'mechanics/progression', name: 'Experience and levels', version: '1.0.0', kind: 'code', sdk: '^2.0.0', description: 'Production' }, load: () => import('../../src/plugins/mechanics-progression/index.ts') } },
  { id: ID, entry: alternate },
];
