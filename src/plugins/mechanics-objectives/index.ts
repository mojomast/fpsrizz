import { definePlugin, ObjectiveProviders, ObjectiveMechanicRole, MechanicObjectiveChanged, SessionControl } from '../../sdk/index.ts';
import type { SessionContext, ObjectiveDefinition } from '../../sdk/index.ts';

function definitionsCopy(input: readonly ObjectiveDefinition[]): readonly ObjectiveDefinition[] {
  if (!Array.isArray(input) || input.length > 128) throw new Error('Objectives require at most 128 definitions');
  const ids = new Set<string>();
  const definitions = input.map(d => {
    if (!d || typeof d.id !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(d.id) || ids.has(d.id)) throw new Error('Invalid or duplicate objective id');
    if (typeof d.label !== 'string' || !d.label.trim() || d.label.length > 120) throw new Error(`Invalid label for ${d.id}`);
    if (!Number.isSafeInteger(d.target) || d.target < 1) throw new Error(`Objective target must be a positive safe integer: ${d.id}`);
    if (d.requires !== undefined && (!Array.isArray(d.requires) || d.requires.length > 128 || d.requires.some((x: unknown) => typeof x !== 'string') || new Set(d.requires).size !== d.requires.length)) throw new Error(`Invalid prerequisites for ${d.id}`);
    ids.add(d.id);
    return Object.freeze({ id: d.id, label: d.label, target: d.target, requires: Object.freeze([...(d.requires ?? [])]) });
  });
  const byId = new Map(definitions.map(d => [d.id, d]));
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Objective dependency cycle at ${id}`);
    const d = byId.get(id);
    if (!d) throw new Error(`Unknown objective prerequisite ${id}`);
    visiting.add(id); for (const dependency of d.requires) visit(dependency); visiting.delete(id); visited.add(id);
  }
  for (const d of definitions) visit(d.id);
  return Object.freeze(definitions);
}

export default definePlugin({ register(ctx) {
  ctx.provideRole(ObjectiveMechanicRole, 'mechanics/objectives', { name: 'Objective tracks', description: 'Prerequisites and bounded receipt-deduplicated progress' });
  ctx.register(ObjectiveProviders, 'mechanics/objectives', { start(provider) {
    const owners = new WeakMap<SessionContext, Set<string>>();
    return { create(owner, id, input) {
      if (owner.scope.disposed || provider.scope.disposed) throw new Error('Cannot create objectives in a disposed scope');
      if (typeof id !== 'string' || !id.length || id.length > 128) throw new Error('Instance id must contain 1..128 characters');
      const definitions = definitionsCopy(input);
      const ids = owners.get(owner) ?? new Set<string>();
      if (ids.has(id)) throw new Error(`Duplicate live objective instance ${id}`);
      owners.set(owner, ids); ids.add(id);
      let live = true, revision = 0;
      const values = new Map(definitions.map(d => [d.id, 0]));
      const byId = new Map(definitions.map(d => [d.id, d]));
      const receipts = new Set<string>();
      const complete = (key: string) => values.get(key) === byId.get(key)?.target;
      const unlocked = (d: ObjectiveDefinition) => (d.requires ?? []).every(complete);
      let releaseOwner = () => {}, releaseProvider = () => {};
      const dispose = () => { if (!live) return; live = false; ids.delete(id); receipts.clear(); releaseOwner(); releaseProvider(); };
      releaseOwner = owner.scope.add(dispose, 'mechanic-objectives');
      releaseProvider = provider.scope.add(dispose, 'mechanic-objectives');
      return Object.freeze({ id, get active() { return live; }, get revision() { return revision; }, get complete() { return definitions.every(d => complete(d.id)); }, dispose,
        snapshot() { return Object.freeze(definitions.map(d => Object.freeze({ ...d, value: values.get(d.id)!, complete: complete(d.id), unlocked: unlocked(d) }))); },
        record(key: string, amount = 1, receipt?: string) {
          if (!live) return { ok: false, reason: 'Disposed objective track' };
          if (owner.services.tryGet(SessionControl)?.playing === false) return { ok: false, reason: 'Session is paused' };
          const d = byId.get(key);
          if (!d || !Number.isSafeInteger(amount) || amount <= 0) return { ok: false, reason: 'Unknown objective or invalid positive integral amount' };
          if (receipt !== undefined && (typeof receipt !== 'string' || !receipt.length || receipt.length > 128)) return { ok: false, reason: 'Receipt must contain 1..128 characters' };
          if (receipt !== undefined && receipts.has(receipt)) return { ok: false, reason: 'Receipt already recorded' };
          if (!unlocked(d) || complete(key)) return { ok: false, reason: 'Objective is locked or already complete' };
          // Reject new receipts at capacity rather than silently forgetting old successful receipts.
          if (receipt !== undefined && receipts.size >= 4096) return { ok: false, reason: 'Receipt capacity reached (4096)' };
          const old = values.get(key)!;
          const value = old + Math.min(amount, d.target - old);
          values.set(key, value); if (receipt !== undefined) receipts.add(receipt); revision++;
          provider.events.emit(MechanicObjectiveChanged, Object.freeze({ owner: owner.pluginId, instance: id, objective: key, value, complete: complete(key) }));
          return { ok: true, reason: '' };
        },
      });
    } };
  } });
} });
