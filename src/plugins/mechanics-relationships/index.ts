import { RelationshipMechanicRole, RelationshipProviders, SessionControl, createOwnedInstances, definePlugin } from '../../sdk/index.ts';
import type { RelationshipDefinition, RelationshipPair } from '../../sdk/index.ts';

const actor = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 128;
const canonical = (a: string, b: string): [string, string] => a < b ? [a, b] : [b, a];
// JSON encoding avoids collisions even when actor IDs contain punctuation or separators.
const key = (a: string, b: string) => JSON.stringify(canonical(a, b));
function copy(input: RelationshipDefinition): RelationshipDefinition {
  if (!input || !Number.isFinite(input.min) || !Number.isFinite(input.max) || input.min > input.max || !Array.isArray(input.pairs) || input.pairs.length > 4096) throw new Error('Invalid relationship bounds or pairs');
  const seen = new Set<string>();
  const pairs = Array.from(input.pairs, (pair: RelationshipPair) => {
    if (!pair || !actor(pair.a) || !actor(pair.b) || pair.a === pair.b || !Number.isFinite(pair.score) || pair.score < input.min || pair.score > input.max) throw new Error('Invalid relationship pair');
    const id = key(pair.a, pair.b);
    if (seen.has(id)) throw new Error('Duplicate relationship pair');
    seen.add(id);
    const [a, b] = canonical(pair.a, pair.b);
    return Object.freeze({ a, b, score: pair.score });
  });
  return Object.freeze({ min: input.min, max: input.max, pairs: Object.freeze(pairs) });
}
export default definePlugin({ register(ctx) {
  ctx.provideRole(RelationshipMechanicRole, 'mechanics/relationships', { name: 'Pair relationships', description: 'Bounded symmetric pair scores' });
  ctx.register(RelationshipProviders, 'mechanics/relationships', { start(provider) {
    const instances = createOwnedInstances(provider, 'mechanic-relationships');
    return { create(owner, id, input) {
      const definition = copy(input), lease = instances.acquire(owner, id);
      const values = new Map(definition.pairs.map(p => [key(p.a, p.b), p.score]));
      let revision = 0;
      return Object.freeze({ id, definition, dispose: lease.dispose,
        get active() { return lease.active; }, get revision() { return revision; },
        get(a: string, b: string) { return actor(a) && actor(b) && a !== b ? values.get(key(a, b)) : undefined; },
        snapshot() { return Object.freeze(definition.pairs.map(p => Object.freeze({ a: p.a, b: p.b, score: values.get(key(p.a, p.b))! }))); },
        change(a: string, b: string, delta: number) {
          if (!lease.active) return { ok: false, reason: 'Disposed relationships' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          if (!actor(a) || !actor(b) || a === b || !Number.isFinite(delta)) return { ok: false, reason: 'Invalid relationship change' };
          const pair = key(a, b), value = values.get(pair);
          if (value === undefined) return { ok: false, reason: 'Unknown relationship pair' };
          values.set(pair, Math.max(definition.min, Math.min(definition.max, value + delta))); revision++;
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });
