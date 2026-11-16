/** Independent progression implementation: one accepted-count authority, rather than a mutable round/index pair. */
import { SequenceMechanicRole, SequenceProviders, SessionControl, createOwnedInstances } from '../../src/sdk/index.ts';
import type { CatalogEntry } from '../../src/sdk/index.ts';
import manifest from '../../src/plugins/mechanics-sequence/manifest.json' with { type: 'json' };
import { codePlugin } from './host.ts';

export interface SequenceProviderCase { readonly id: string; readonly entry: CatalogEntry }
const alternateId = 'test/counted-sequence';
const alternate = codePlugin(alternateId, { register(ctx) {
  ctx.provideRole(SequenceMechanicRole, alternateId, { name: 'Counted sequence', description: 'Independent accepted-count implementation' });
  ctx.register(SequenceProviders, alternateId, { start(provider) {
    const lifetimes = createOwnedInstances(provider, 'test-counted-sequence');
    return { create(owner, id, input) {
      if (!input || !Array.isArray(input.steps) || !input.steps.length) throw new Error('Invalid steps');
      const steps: string[] = Array.from(input.steps);
      if (steps.some(key => typeof key !== 'string' || !key.trim() || key.length > 128) || new Set(steps).size !== steps.length) throw new Error('Invalid keys');
      const rounds = input.rounds, total = rounds * steps.length;
      if (!Number.isSafeInteger(rounds) || rounds < 1 || !Number.isSafeInteger(total)) throw new Error('Invalid rounds');
      const definition = Object.freeze({ steps: Object.freeze(steps), rounds });
      const lifetime = lifetimes.acquire(owner, id);
      let accepted = 0;
      return Object.freeze({
        id, definition, dispose: lifetime.dispose,
        get active() { return lifetime.active; },
        get revision() { return accepted; },
        get round() { return Math.min(rounds, Math.floor(accepted / steps.length) + 1); },
        get index() { return accepted === total ? steps.length : accepted % steps.length; },
        get complete() { return accepted === total; },
        advance(key: string) {
          if (!lifetime.active || owner.services.tryGet(SessionControl)?.playing === false || accepted === total || key !== steps[accepted % steps.length]) {
            return { ok: false, reason: 'Step rejected' };
          }
          accepted += 1;
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });

export const sequenceProviders: readonly [SequenceProviderCase, SequenceProviderCase] = [
  { id: 'mechanics/sequence', entry: { manifest, load: () => import('../../src/plugins/mechanics-sequence/index.ts') } },
  { id: alternateId, entry: alternate },
];
