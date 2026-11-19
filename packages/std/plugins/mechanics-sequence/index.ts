import { SequenceMechanicRole, SequenceProviders, SessionControl, createOwnedInstances, definePlugin } from '@bulkhead/sdk';
import type { SequenceDefinition } from '@bulkhead/sdk';

function definitionCopy(input: SequenceDefinition): SequenceDefinition {
  if (!input || !Array.isArray(input.steps) || input.steps.length === 0) throw new Error('Sequence requires a nonempty steps array');
  const steps: string[] = [], seen = new Set<string>();
  for (const step of input.steps) {
    if (typeof step !== 'string' || !step.trim() || step.length > 128 || seen.has(step)) {
      throw new Error('Sequence steps must be unique nonblank keys of at most 128 characters');
    }
    seen.add(step); steps.push(step);
  }
  const rounds = input.rounds;
  if (!Number.isSafeInteger(rounds) || rounds <= 0 || !Number.isSafeInteger(steps.length * rounds)) {
    throw new Error('Sequence rounds and total step count must be positive safe integers');
  }
  return Object.freeze({ steps: Object.freeze(steps), rounds });
}

export default definePlugin({ register(ctx) {
  ctx.provideRole(SequenceMechanicRole, 'mechanics/sequence', {
    name: 'Ordered steps and rounds', description: 'Expected-step acceptance, finite rounds and terminal progression',
  });
  ctx.register(SequenceProviders, 'mechanics/sequence', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-sequence');
    return { create(owner, id, input) {
      const definition = definitionCopy(input);
      const instance = instances.acquire(owner, id);
      let index = 0, round = 1, revision = 0;
      return Object.freeze({
        id, definition, dispose: instance.dispose,
        get active() { return instance.active; },
        get revision() { return revision; },
        get round() { return round; },
        get index() { return index; },
        get complete() { return index === definition.steps.length; },
        advance(step: string) {
          if (!instance.active) return { ok: false, reason: 'Disposed sequence' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          if (index === definition.steps.length) return { ok: false, reason: 'Sequence is complete' };
          if (step !== definition.steps[index]) return { ok: false, reason: 'Unexpected sequence step' };
          index++; revision++;
          if (index === definition.steps.length && round < definition.rounds) { round++; index = 0; }
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });
