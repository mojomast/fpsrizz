import { isObject, vArray, vNumber, vString } from '../../../../src/sdk/index.ts';
import type { Reporter } from '../../../../src/sdk/index.ts';
import type { SkyPoint, SkyDelivery, SkyRoute } from '../../contracts/sky.ts';

function keys(value: Record<string, unknown>, allowed: string[], r: Reporter) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) r.at(key).error('unknown property');
}
function point(value: unknown, r: Reporter): SkyPoint | undefined {
  if (!isObject(value)) return r.error('expected a point with x and z');
  keys(value, ['x', 'z'], r);
  const x = vNumber(value.x, r.at('x'), { min: -9, max: 9 });
  const z = vNumber(value.z, r.at('z'), { min: -8, max: 8 });
  return x === undefined || z === undefined ? undefined : Object.freeze({ x, z });
}
export function loadRoute(data: unknown, r: Reporter): SkyRoute | undefined {
  if (!isObject(data)) return r.error('expected a sky-route object');
  keys(data, ['name', 'deliveries'], r);
  const name = vString(data.name, r.at('name'), { max: 80, nonEmpty: true });
  if (name && !name.trim()) r.at('name').error('name must not be blank');
  const raw = vArray(data.deliveries, r.at('deliveries'), { min: 1, max: 8 });
  const deliveries: SkyDelivery[] = [], ids = new Set<string>();
  raw?.forEach((entry, i) => {
    const p = r.at('deliveries').at(i);
    if (!isObject(entry)) { p.error('expected a delivery object'); return; }
    keys(entry, ['id', 'pickup', 'beacon'], p);
    const id = vString(entry.id, p.at('id'), { max: 64, nonEmpty: true });
    if (id && !/^[a-z][a-z0-9_.-]*$/.test(id)) p.at('id').error('use a lowercase local id');
    if (id && ids.has(id)) p.at('id').error('duplicate delivery id');
    if (id) ids.add(id);
    const pickup = point(entry.pickup, p.at('pickup')), beacon = point(entry.beacon, p.at('beacon'));
    if (id && pickup && beacon) deliveries.push(Object.freeze({ id, pickup, beacon }));
  });
  for (let i = 0; i < deliveries.length; i++) for (let j = 0; j < i; j++) {
    for (const kind of ['pickup', 'beacon'] as const) {
      const a = deliveries[i]![kind], b = deliveries[j]![kind];
      if (Math.hypot(a.x - b.x, a.z - b.z) < 2.7) r.at('deliveries').at(i).at(kind).error(`must be at least 2.7 units from other ${kind} points`);
    }
  }
  if (r.failed || !name || !raw || deliveries.length !== raw.length) return;
  return Object.freeze({ name, deliveries: Object.freeze(deliveries) });
}
