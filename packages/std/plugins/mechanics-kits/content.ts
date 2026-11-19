import { isObject, vArray, vNumber, vString, vOneOf } from '@bulkhead/sdk';
import type { Reporter, MechanicKitDefinition, ResourceDefinition, MechanicActionDefinition, ObjectiveDefinition, ResourceAmounts } from '@bulkhead/sdk';

function keys(data: Record<string, unknown>, allowed: readonly string[], r: Reporter) {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) r.at(key).error('unknown property');
}
function localId(value: unknown, r: Reporter): string | undefined {
  const id = vString(value, r, { max: 64, nonEmpty: true });
  if (id && !/^[a-z][a-z0-9_.-]{0,63}$/.test(id)) return r.error('use a lowercase local id starting with a letter (letters, digits, _, ., -)');
  return id;
}
function label(value: unknown, r: Reporter) {
  const text = vString(value, r, { max: 120, nonEmpty: true });
  if (text && !text.trim()) return r.error('label must not be blank');
  return text;
}
function amounts(value: unknown, resources: Set<string>, r: Reporter): ResourceAmounts | undefined {
  if (value === undefined) return undefined;
  if (!isObject(value)) return r.error('expected a resource-amount object');
  if (Object.keys(value).length > 64) r.error('at most 64 resource amounts');
  const result: Record<string, number> = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!resources.has(id)) r.at(id).error('unknown resource; declare it in resources');
    const n = vNumber(raw, r.at(id), { min: 0 });
    if (n !== undefined) result[id] = n;
  }
  return Object.freeze(result);
}
export function loadKit(data: unknown, r: Reporter): MechanicKitDefinition | undefined {
  if (!isObject(data)) return r.error('expected a mechanic-kit object');
  keys(data, ['name', 'domain', 'resources', 'actions', 'objectives'], r);
  const name = label(data.name, r.at('name'));
  const domain = vOneOf(data.domain, r.at('domain'), ['seconds', 'turns'] as const);
  const resources: ResourceDefinition[] = [], actions: MechanicActionDefinition[] = [], objectives: ObjectiveDefinition[] = [];
  const resourceIds = new Set<string>(), actionIds = new Set<string>(), objectiveIds = new Set<string>();
  vArray(data.resources, r.at('resources'), { min: 1, max: 64 })?.forEach((raw, i) => {
    const p = r.at('resources').at(i);
    if (!isObject(raw)) { p.error('expected resource object'); return; }
    keys(raw, ['id', 'label', 'initial', 'max'], p);
    const id = localId(raw.id, p.at('id')), text = label(raw.label, p.at('label'));
    const initial = vNumber(raw.initial, p.at('initial'), { min: 0 }), max = vNumber(raw.max, p.at('max'), { min: 0 });
    if (id && resourceIds.has(id)) p.at('id').error('duplicate resource id');
    if (initial !== undefined && max !== undefined && initial > max) p.at('initial').error('must not exceed max');
    if (id && text && initial !== undefined && max !== undefined) { resourceIds.add(id); resources.push(Object.freeze({ id, label: text, initial, max })); }
  });
  vArray(data.actions, r.at('actions'), { max: 128 })?.forEach((raw, i) => {
    const p = r.at('actions').at(i);
    if (!isObject(raw)) { p.error('expected action object'); return; }
    keys(raw, ['id', 'label', 'cooldown', 'spend', 'gain'], p);
    const id = localId(raw.id, p.at('id')), text = label(raw.label, p.at('label'));
    const cooldown = vNumber(raw.cooldown, p.at('cooldown'), { min: 0, ...(domain === 'turns' ? { int: true, max: Number.MAX_SAFE_INTEGER } : {}) });
    const spend = amounts(raw.spend, resourceIds, p.at('spend')), gain = amounts(raw.gain, resourceIds, p.at('gain'));
    if (id && actionIds.has(id)) p.at('id').error('duplicate action id');
    if (id && text && cooldown !== undefined) { actionIds.add(id); actions.push(Object.freeze({ id, label: text, cooldown, ...(spend === undefined ? {} : { spend }), ...(gain === undefined ? {} : { gain }) })); }
  });
  vArray(data.objectives, r.at('objectives'), { max: 128 })?.forEach((raw, i) => {
    const p = r.at('objectives').at(i);
    if (!isObject(raw)) { p.error('expected objective object'); return; }
    keys(raw, ['id', 'label', 'target', 'requires'], p);
    const id = localId(raw.id, p.at('id')), text = label(raw.label, p.at('label'));
    const target = vNumber(raw.target, p.at('target'), { min: 1, max: Number.MAX_SAFE_INTEGER, int: true });
    const requires: string[] = [];
    if (raw.requires !== undefined) vArray(raw.requires, p.at('requires'), { max: 128 })?.forEach((dep, j) => {
      const key = localId(dep, p.at('requires').at(j));
      if (key) { if (requires.includes(key)) p.at('requires').at(j).error('duplicate prerequisite'); requires.push(key); }
    });
    if (id && objectiveIds.has(id)) p.at('id').error('duplicate objective id');
    if (id && text && target !== undefined) { objectiveIds.add(id); objectives.push(Object.freeze({ id, label: text, target, requires: Object.freeze(requires) })); }
  });
  const byId = new Map(objectives.map(d => [d.id, d])), visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) { r.at('objectives').error(`prerequisite cycle at ${id}`); return; }
    const d = byId.get(id);
    if (!d) { r.at('objectives').error(`unknown prerequisite ${id}`); return; }
    visiting.add(id); for (const dep of d.requires ?? []) visit(dep); visiting.delete(id); visited.add(id);
  }
  for (const d of objectives) visit(d.id);
  if (r.failed || !name || !domain) return;
  return Object.freeze({ name, domain, resources: Object.freeze(resources), actions: Object.freeze(actions), objectives: Object.freeze(objectives) });
}
