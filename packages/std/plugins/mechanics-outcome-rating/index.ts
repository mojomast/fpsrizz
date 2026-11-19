import { OutcomeRatingProviders, OutcomeRatingRole, createOwnedInstances, definePlugin } from '@bulkhead/sdk';
import type { OutcomeRatingDefinition } from '@bulkhead/sdk';

function copyDefinition(input: OutcomeRatingDefinition): OutcomeRatingDefinition {
  if (!input || !Array.isArray(input.tiers) || input.tiers.length < 1 || input.tiers.length > 32)
    throw new Error('Rating requires 1..32 tiers');
  const ids = new Set<string>();
  const key = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
  const tiers = Array.from(input.tiers, tier => {
    if (!tier || !key(tier.id) || ids.has(tier.id) || !Array.isArray(tier.conditions) || tier.conditions.length < 1 || tier.conditions.length > 32)
      throw new Error('Rating tiers need unique IDs and 1..32 conditions');
    ids.add(tier.id);
    const conditions = Array.from(tier.conditions as OutcomeRatingDefinition['tiers'][number]['conditions'], condition => {
      if (!condition || !key(condition.metric) || !['at-most', 'at-least'].includes(condition.operator) || !Number.isFinite(condition.value))
        throw new Error('Invalid rating condition');
      return Object.freeze({ metric: condition.metric, operator: condition.operator, value: condition.value });
    });
    return Object.freeze({ id: tier.id, conditions: Object.freeze(conditions) });
  });
  return Object.freeze({ tiers: Object.freeze(tiers) });
}

export default definePlugin({ register(ctx) {
  ctx.provideRole(OutcomeRatingRole, 'mechanics/outcome-rating', { name: 'Outcome ratings', description: 'Best matching tier from explicit metrics' });
  ctx.register(OutcomeRatingProviders, 'mechanics/outcome-rating', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-outcome-rating');
    return { create(owner, id, input) {
      const definition = copyDefinition(input);
      const instance = instances.acquire(owner, id);
      return Object.freeze({ id, definition, get active() { return instance.active; }, dispose: instance.dispose,
        evaluate(metrics: Readonly<Record<string, number>>) {
          if (!instance.active) throw new Error('Disposed rating');
          for (const tier of definition.tiers) for (const condition of tier.conditions) {
            if (!metrics || !Object.hasOwn(metrics, condition.metric) || !Number.isFinite(metrics[condition.metric]))
              throw new Error(`Missing or invalid metric ${condition.metric}`);
          }
          let result: string | undefined;
          for (const tier of definition.tiers) {
            if (tier.conditions.every(c => c.operator === 'at-most' ? metrics[c.metric]! <= c.value : metrics[c.metric]! >= c.value)) result = tier.id;
          }
          return result;
        },
      });
    } };
  } });
} });
