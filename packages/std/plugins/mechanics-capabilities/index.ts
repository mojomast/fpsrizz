import type { CapabilityDefinition, CapabilityProvider, CapabilitySet, CapabilityState, SessionContext } from '@bulkhead/sdk';
import { CapabilityRole, CapabilityUnlocked, definePlugin } from '@bulkhead/sdk';

export default definePlugin({
  register(ctx) {
    ctx.provideRole(CapabilityRole, 'mechanics/capabilities', Object.freeze({
      name: 'Capability ledger',
      description: 'Named unlock/rank state with frozen observations and idempotent, non-regressing unlocks.',
      create(owner: SessionContext, id: string, definitions: readonly CapabilityDefinition[]): CapabilitySet {
        if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new TypeError('Capability instance id must be a nonblank string of at most 128 characters');
        if (!Array.isArray(definitions)) throw new TypeError('Capability definitions must be an array');
        const seen = new Set<string>();
        const frozen: CapabilityDefinition[] = definitions.map((definition, index) => {
          if (typeof definition.id !== 'string' || !/^[a-z0-9][a-z0-9./_-]*$/i.test(definition.id) || definition.id.length > 80)
            throw new TypeError(`Capability definitions[${index}].id is not a valid content id`);
          if (seen.has(definition.id)) throw new TypeError(`Capability definitions[${index}] repeats "${definition.id}"`);
          seen.add(definition.id);
          if (typeof definition.label !== 'string' || !definition.label.trim() || definition.label.length > 80)
            throw new TypeError(`Capability definitions[${index}].label must be nonblank`);
          if (typeof definition.description !== 'string' || definition.description.length > 500)
            throw new TypeError(`Capability definitions[${index}].description is too long`);
          if (!['movement', 'combat', 'utility'].includes(definition.kind))
            throw new TypeError(`Capability definitions[${index}].kind is invalid`);
          const maxRank = definition.maxRank ?? 1;
          if (!Number.isSafeInteger(maxRank) || maxRank < 1 || maxRank > 9)
            throw new RangeError(`Capability definitions[${index}].maxRank must be 1..9`);
          return Object.freeze({ ...definition, maxRank });
        });
        const byId = new Map(frozen.map(definition => [definition.id, definition]));
        const ranks = new Map<string, number>();
        let revision = 0;
        let active = true;
        const state = (): readonly CapabilityState[] => Object.freeze(frozen.map(definition => Object.freeze({
          id: definition.id, label: definition.label, description: definition.description, kind: definition.kind,
          rank: ranks.get(definition.id) ?? 0, unlocked: (ranks.get(definition.id) ?? 0) > 0,
        })));
        const handle: CapabilitySet = Object.freeze({
          id, get active() { return active; }, get revision() { return revision; }, definitions: Object.freeze(frozen),
          has(capability: string) { return (ranks.get(capability) ?? 0) > 0; },
          rank(capability: string) { return ranks.get(capability) ?? 0; },
          unlock(capability: string, rank = 1) {
            if (!active) return { ok: false, changed: false, reason: 'Capability set is disposed' };
            const definition = byId.get(capability);
            if (!definition) return { ok: false, changed: false, reason: `Unknown capability "${capability}"` };
            if (!Number.isSafeInteger(rank) || rank < 1 || rank > (definition.maxRank ?? 1)) return { ok: false, changed: false, reason: `Invalid rank for "${capability}"` };
            const current = ranks.get(capability) ?? 0;
            if (rank <= current) return { ok: true, changed: false, reason: '' };
            ranks.set(capability, rank);
            revision++;
            owner.events.emit(CapabilityUnlocked, { owner: owner.pluginId, instance: id, capability, rank, revision });
            return { ok: true, changed: true, reason: '' };
          },
          snapshot: state,
          dispose() {
            if (!active) return;
            active = false;
            ranks.clear();
            revision++;
          },
        });
        owner.scope.add(() => handle.dispose(), 'capabilities');
        return handle;
      },
    }));
  },
});
