import type { ContentKind, Json, Params, Prefab, Reporter, ValidationContext } from '../../../../src/sdk/index.ts';
import type { AmmoDef, PickupDef, WeaponDef } from '../../contracts/shooter.ts';
import { Prefabs, Transform, Visual, isObject, makeTransform, vBool, vId, vJson, vNumber, vObject, vString } from '../../../../src/sdk/index.ts';
import { AmmoTypes, AttackBehaviors, PickupEffects, Pickups, Pickup, Weapons } from '../../contracts/shooter.ts';

const key = (v: unknown, r: Reporter, fallback?: string): string | undefined => (v === undefined && fallback !== undefined ? fallback : vString(v, r, { max: 60, nonEmpty: fallback === undefined }));

export function vParams(v: unknown, r: Reporter): Params | undefined {
  if (v === undefined) return {};
  const o = vObject(v, r);
  const j = o && vJson(o, r);
  return j !== undefined && isObject(j) ? (j as Record<string, Json>) : undefined;
}

export const ammoKind: ContentKind = {
  description: 'An ammunition type: { name, max, start }.',
  load(data, c) {
    const o = vObject(data, c.r);
    if (!o) return;
    const name = vString(o.name, c.r.at('name'), { max: 40 });
    const max = vNumber(o.max, c.r.at('max'), { int: true, min: 1, max: 9999 });
    const start = o.start === undefined ? 0 : vNumber(o.start, c.r.at('start'), { int: true, min: 0, max: 9999 });
    if (name === undefined || max === undefined || start === undefined) return;
    if (start > max) return void c.r.at('start').error(`start (${start}) exceeds max (${max})`);
    c.register(AmmoTypes, c.id, { name, max, start } satisfies AmmoDef);
  },
};

export const weaponKind: ContentKind = {
  description: 'A weapon definition selecting a registered attack behaviour.',
  load(data, c) {
    const o = vObject(data, c.r);
    if (!o) return;
    const r = c.r;
    const name = vString(o.name, r.at('name'), { max: 40 });
    const slot = vNumber(o.slot, r.at('slot'), { int: true, min: 1, max: 9 });
    const behavior = vId(o.behavior, r.at('behavior'));
    const params = vParams(o.params, r.at('params'));
    const ammoType = o.ammoType === undefined || o.ammoType === '' ? '' : vId(o.ammoType, r.at('ammoType'));
    const ammoPerShot = o.ammoPerShot === undefined ? 1 : vNumber(o.ammoPerShot, r.at('ammoPerShot'), { int: true, min: 0, max: 100 });
    const magazineSize = o.magazineSize === undefined ? undefined : vNumber(o.magazineSize, r.at('magazineSize'), { int: true, min: 1, max: 9999 });
    const reloadTime = o.reloadTime === undefined ? undefined : vNumber(o.reloadTime, r.at('reloadTime'), { min: 0.03, max: 60 });
    if (o.magazineSize !== undefined || o.reloadTime !== undefined) {
      if (o.magazineSize === undefined) r.at('magazineSize').error('required with reloadTime');
      if (o.reloadTime === undefined) r.at('reloadTime').error('required with magazineSize');
      if (!ammoType) r.at('ammoType').error('magazines require a finite ammo type');
      if (ammoPerShot !== undefined && ammoPerShot < 1) r.at('ammoPerShot').error('magazines require at least one round per shot');
      if (magazineSize !== undefined && ammoPerShot !== undefined && magazineSize < ammoPerShot) r.at('magazineSize').error('must hold at least one shot');
    }
    const cooldown = vNumber(o.cooldown, r.at('cooldown'), { min: 0.03, max: 10 });
    const auto = o.auto === undefined ? false : vBool(o.auto, r.at('auto'));
    const starter = o.starter === undefined ? false : vBool(o.starter, r.at('starter'));
    const view = key(o.view, r.at('view'));
    const fireSound = key(o.fireSound, r.at('fireSound'), '');
    const recoil = o.recoil === undefined ? 0.5 : vNumber(o.recoil, r.at('recoil'), { min: 0, max: 1 });
    const flash = o.flash === undefined ? '#ffd27a' : vString(o.flash, r.at('flash'));
    if (flash !== undefined && !/^#[0-9a-fA-F]{6}$/.test(flash)) r.at('flash').error(`"${flash}" is not a colour like "#ffaa33"`);
    if ([name, slot, behavior, params, ammoType, ammoPerShot, cooldown, auto, starter, view, fireSound, recoil, flash].includes(undefined) || r.failed) return;
    const def: WeaponDef = { name: name!, slot: slot!, attack: { behavior: behavior!, params: params! }, ammoType: ammoType!, ammoPerShot: ammoPerShot!, cooldown: cooldown!, auto: auto!, starter: starter!, view: view!, fireSound: fireSound!, recoil: recoil!, flash: flash! };
    if (magazineSize !== undefined && reloadTime !== undefined) { def.magazineSize = magazineSize; def.reloadTime = reloadTime; }
    c.register(Weapons, c.id, def);
  },
};

export const pickupKind: ContentKind = {
  description: 'A pickup definition selecting a registered pickup effect. Also registers a prefab with the same id.',
  load(data, c) {
    const o = vObject(data, c.r);
    if (!o) return;
    const r = c.r;
    const name = vString(o.name, r.at('name'), { max: 40 });
    const effect = vId(o.effect, r.at('effect'));
    const params = vParams(o.params, r.at('params'));
    const visual = key(o.visual, r.at('visual'));
    const sound = key(o.sound, r.at('sound'), '');
    const radius = o.radius === undefined ? 0.5 : vNumber(o.radius, r.at('radius'), { min: 0.1, max: 4 });
    if ([name, effect, params, visual, sound, radius].includes(undefined)) return;
    const def: PickupDef = { name: name!, effect: effect!, params: params!, visual: visual!, sound: sound!, radius: radius! };
    c.register(Pickups, c.id, def);
    const id = c.id;
    const prefab: Prefab = {
      description: `Pickup: ${def.name}`,
      start: (ctx) => (at) => {
        const e = ctx.world.create();
        ctx.world.add(e, Transform, makeTransform(at.x, at.z, 0));
        ctx.world.add(e, Pickup, { def: id });
        ctx.world.add(e, Visual, { key: def.visual, state: 'idle', stateAt: ctx.time.now, y: 0.3, scale: 1, tint: '', renderer: '' });
        return e;
      },
    };
    c.register(Prefabs, c.id, prefab);
  },
};

/** Cross-reference checks that need every plugin's registrations to be present. */
export function validateDefinitions(v: ValidationContext): void {
  const slots = new Map<number, string>();
  for (const w of v.registries.entries(Weapons)) {
    const r = v.reporter(w.owner, `weapon "${w.id}"`);
    const b = v.registries.get(AttackBehaviors, w.value.attack.behavior);
    if (!b) r.at('behavior').error(`unknown attack behaviour "${w.value.attack.behavior}". Installed: ${v.registries.ids(AttackBehaviors).join(', ') || '(none)'}. A new behaviour needs a trusted code plugin.`);
    else b.validateParams?.(w.value.attack.params, r.at('params'), v.registries);
    if (w.value.ammoType && !v.registries.has(AmmoTypes, w.value.ammoType)) r.at('ammoType').error(`unknown ammo type "${w.value.ammoType}". Installed: ${v.registries.ids(AmmoTypes).join(', ') || '(none)'}`);
    const prev = slots.get(w.value.slot);
    if (prev) r.at('slot').error(`slot ${w.value.slot} is already used by weapon "${prev}"; give each weapon its own slot (1-9)`);
    else slots.set(w.value.slot, w.id);
  }
  for (const p of v.registries.entries(Pickups)) {
    const r = v.reporter(p.owner, `pickup "${p.id}"`);
    const e = v.registries.get(PickupEffects, p.value.effect);
    if (!e) r.at('effect').error(`unknown pickup effect "${p.value.effect}". Installed: ${v.registries.ids(PickupEffects).join(', ') || '(none)'}`);
    else e.validateParams?.(p.value.params, r.at('params'), v.registries);
  }
}
