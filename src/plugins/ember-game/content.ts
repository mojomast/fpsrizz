import { isObject, vArray, vNumber, vString } from '../../sdk/index.ts';
import type { EmberConfig, EmberPoint, EmberWave, Reporter } from '../../sdk/index.ts';

function keys(data: Record<string, unknown>, allowed: readonly string[], r: Reporter): void {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) r.at(key).error('unknown property');
}

export function loadDefense(data: unknown, r: Reporter): EmberConfig | undefined {
  if (!isObject(data)) return r.error('expected defense configuration');
  keys(data, ['name', 'kit', 'pads', 'lane', 'waves', 'range', 'damage', 'fireInterval', 'reward', 'leakDamage'], r);
  const name = vString(data.name, r.at('name'), { max: 80, nonEmpty: true });
  const kit = vString(data.kit, r.at('kit'), { max: 100, nonEmpty: true });
  const number = (obj: Record<string, unknown>, key: string, rr: Reporter, min: number, max: number, int = false) =>
    vNumber(obj[key], rr.at(key), { min, max, int });
  const points = (key: string, min: number, max: number) => vArray(data[key], r.at(key), { min, max })?.map((p, i) => {
    const rr = r.at(key).at(i);
    if (!isObject(p)) { rr.error('expected point'); return undefined; }
    keys(p, ['x', 'z'], rr);
    const x = number(p, 'x', rr, -30, 30), z = number(p, 'z', rr, -30, 30);
    return x === undefined || z === undefined ? undefined : Object.freeze({ x, z });
  });
  const pads = points('pads', 1, 24), lane = points('lane', 2, 32);
  const waves = vArray(data.waves, r.at('waves'), { min: 1, max: 12 })?.map((w, i) => {
    const rr = r.at('waves').at(i);
    if (!isObject(w)) { rr.error('expected wave'); return undefined; }
    keys(w, ['count', 'health', 'speed', 'interval'], rr);
    const count = number(w, 'count', rr, 1, 100, true), health = number(w, 'health', rr, 1, 1000);
    const speed = number(w, 'speed', rr, 0.1, 10), interval = number(w, 'interval', rr, 0.1, 20);
    return count === undefined || health === undefined || speed === undefined || interval === undefined
      ? undefined : Object.freeze({ count, health, speed, interval });
  });
  const range = number(data, 'range', r, 0.1, 30), damage = number(data, 'damage', r, 0.1, 100);
  const fireInterval = number(data, 'fireInterval', r, 0.1, 20), reward = number(data, 'reward', r, 0, 100, true);
  const leakDamage = number(data, 'leakDamage', r, 1, 100, true);
  if (lane && lane.every(Boolean) && lane.some((p, i) => i > 0 && p!.x === lane[i - 1]!.x && p!.z === lane[i - 1]!.z)) {
    r.at('lane').error('consecutive points must be distinct');
  }
  if (pads && pads.every(Boolean) && pads.some((p, i) => pads.slice(0, i).some(q => q!.x === p!.x && q!.z === p!.z))) {
    r.at('pads').error('pad positions must be distinct');
  }
  if (r.failed || !name || !kit || !pads || !lane || !waves || pads.some(p => !p) || lane.some(p => !p) || waves.some(w => !w)
      || range === undefined || damage === undefined || fireInterval === undefined || reward === undefined || leakDamage === undefined) return;
  return Object.freeze({ name, kit, pads: Object.freeze(pads as EmberPoint[]), lane: Object.freeze(lane as EmberPoint[]),
    waves: Object.freeze(waves as EmberWave[]), range, damage, fireInterval, reward, leakDamage });
}
