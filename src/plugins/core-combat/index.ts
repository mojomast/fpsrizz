import type { ActorHit, AttackFn, CombatService, DamageRequest, EntityId, PickupEffectFn, ScanHit, SessionContext } from '../../sdk/index.ts';
import { AmmoTypes, AttackBehaviors, AttackFired, Collider, Combat, Damaged, DamageModifiers, DealDamage, Died, Health, Intent, Inventory, Pickup, PickupCollected, PickupEffects, Pickups, Player, Transform, WeaponDry, WeaponRuntime, WeaponSwitched, Weapons, World, definePlugin, yawDirX, yawDirZ } from '../../sdk/index.ts';
import { giveAmmo, giveWeapon, heal, hitscan, melee, projectile } from './behaviors.ts';
import { ammoKind, pickupKind, validateDefinitions, weaponKind } from './definitions.ts';

const SWITCH_DELAY = 0.3;
const EPS = 1e-9;

function createCombat(ctx: SessionContext): CombatService {
  const world = ctx.services.get(World);
  const queue: DamageRequest[] = [];
  let modifiers: ((req: Readonly<DamageRequest>, amount: number) => number)[] | undefined;
  const attackFn = (id: string): AttackFn => ctx.instantiate(AttackBehaviors, id, (def, owner) => def.start(owner));

  const combat: CombatService = {
    damage(req) {
      if (!(req.amount > 0) || !Number.isFinite(req.amount)) return;
      queue.push({ ...req });
    },
    heal(target, amount) {
      const h = ctx.world.get(target, Health);
      if (!h || h.dead || amount <= 0) return 0;
      const before = h.hp;
      h.hp = Math.min(h.max, h.hp + amount);
      return h.hp - before;
    },
    sweepActors(x, z, dirX, dirZ, maxDist, radius, ignore, ignoreTeam) {
      let best: ActorHit | null = null;
      let bestT = maxDist;
      ctx.world.each(Collider, (e, c) => {
        if (e === ignore || c.team === ignoreTeam) return;
        const t = ctx.world.get(e, Transform);
        if (!t || ctx.world.get(e, Health)?.dead) return;
        // Ray vs circle of radius (collider + sweep radius): the simulation shape, not the sprite.
        const R = c.radius + radius;
        const ox = t.x - x;
        const oz = t.z - z;
        const along = ox * dirX + oz * dirZ;
        const perp2 = ox * ox + oz * oz - along * along;
        if (perp2 > R * R) return;
        const half = Math.sqrt(R * R - perp2);
        let hitT = along - half;
        if (hitT < 0) {
          if (along + half < 0) return; // entirely behind
          hitT = 0; // already overlapping at the start
        }
        if (hitT <= bestT) {
          bestT = hitT;
          best = { entity: e, t: hitT, x: x + dirX * hitT, z: z + dirZ * hitT };
        }
      });
      return best;
    },
    hitscan(x, z, dirX, dirZ, maxDist, ignore, ignoreTeam) {
      const wall = world.raycast(x, z, dirX, dirZ, maxDist);
      const limit = wall ? wall.t : maxDist;
      const actor = combat.sweepActors(x, z, dirX, dirZ, limit, 0, ignore, ignoreTeam);
      const out: ScanHit = { t: limit, x: x + dirX * limit, z: z + dirZ * limit, nx: wall?.nx ?? 0, nz: wall?.nz ?? 0, entity: 0, hitWall: wall !== null };
      if (actor) {
        out.t = actor.t;
        out.x = actor.x;
        out.z = actor.z;
        out.nx = -dirX;
        out.nz = -dirZ;
        out.entity = actor.entity;
        out.hitWall = false;
      }
      return out;
    },
    fireAttack(shot, behavior, sound) {
      attackFn(behavior)(shot);
      ctx.events.emit(AttackFired, { shooter: shot.shooter, attackId: shot.attackId, behavior, x: shot.x, z: shot.z, dirX: shot.dirX, dirZ: shot.dirZ, sound });
    },
    giveAmmo(entity, ammoType, amount) {
      const inv = ctx.world.get(entity, Inventory);
      const def = ctx.registries.get(AmmoTypes, ammoType);
      if (!inv || !def || amount <= 0) return 0;
      const max = inv.ammoMax[ammoType] ?? def.max;
      const have = inv.ammo[ammoType] ?? 0;
      const next = Math.min(max, have + Math.floor(amount));
      inv.ammo[ammoType] = next;
      inv.ammoMax[ammoType] = max;
      return next - have;
    },
    giveWeapon(entity, weaponId) {
      const inv = ctx.world.get(entity, Inventory);
      const def = ctx.registries.get(Weapons, weaponId);
      if (!inv || !def || inv.weapons.includes(weaponId)) return false;
      inv.weapons.push(weaponId);
      if (def.magazineSize !== undefined && def.reloadTime !== undefined && def.ammoType) {
        const runtime = ctx.world.get(entity, WeaponRuntime) ?? ctx.world.add(entity, WeaponRuntime, { loaded: {}, reload: null });
        const count = runtime.loaded[weaponId] ?? 0;
        const amount = Math.min(def.magazineSize - count, inv.ammo[def.ammoType] ?? 0);
        if (amount > 0) {
          runtime.loaded[weaponId] = count + amount;
          inv.ammo[def.ammoType] = (inv.ammo[def.ammoType] ?? 0) - amount;
        }
      }
      if (inv.current === null) inv.current = weaponId;
      return true;
    },
  };

  ctx.commands.handle(DealDamage, (req) => combat.damage(req));

  // --- weapons: Intent -> switching and firing ---------------------------------------------------------------------
  const select = (e: EntityId, inv: Inventory, weapon: string, now: number): void => {
    if (inv.current === weapon) return;
    const runtime = ctx.world.get(e, WeaponRuntime);
    if (runtime) runtime.reload = null;
    inv.current = weapon;
    inv.switchedAt = now;
    inv.nextFireAt = Math.max(inv.nextFireAt, now + SWITCH_DELAY);
    ctx.events.emit(WeaponSwitched, { entity: e, weapon });
  };
  const bySlot = (inv: Inventory): string[] => [...inv.weapons].sort((a, b) => (ctx.registries.get(Weapons, a)?.slot ?? 0) - (ctx.registries.get(Weapons, b)?.slot ?? 0));

  ctx.systems.add({
    id: 'core/combat.weapons',
    phase: 'combat',
    update() {
      const now = ctx.time.now;
      ctx.world.each(Inventory, (e, inv) => {
        const intent = ctx.world.get(e, Intent);
        const t = ctx.world.get(e, Transform);
        if (!intent || !t || ctx.world.get(e, Health)?.dead) return;
        if (intent.weaponSlot > 0) {
          const w = inv.weapons.find((id) => ctx.registries.get(Weapons, id)?.slot === intent.weaponSlot);
          if (w) select(e, inv, w, now);
        } else if (intent.weaponCycle !== 0 && inv.weapons.length > 1) {
          const order = bySlot(inv);
          const i = Math.max(0, order.indexOf(inv.current ?? ''));
          select(e, inv, order[(i + (intent.weaponCycle > 0 ? 1 : order.length - 1)) % order.length]!, now);
        }
        const def = inv.current ? ctx.registries.get(Weapons, inv.current) : undefined;
        if (!def || !inv.current) return;
        const runtime = def.magazineSize !== undefined
          ? ctx.world.get(e, WeaponRuntime) ?? ctx.world.add(e, WeaponRuntime, { loaded: {}, reload: null })
          : ctx.world.get(e, WeaponRuntime);
        if (runtime?.reload && runtime.reload.weapon !== inv.current) runtime.reload = null;
        if (runtime?.reload && now + EPS >= runtime.reload.completesAt) {
          const count = runtime.loaded[inv.current] ?? 0;
          const amount = Math.min((def.magazineSize ?? 0) - count, inv.ammo[def.ammoType] ?? 0);
          runtime.loaded[inv.current] = count + amount;
          inv.ammo[def.ammoType] = (inv.ammo[def.ammoType] ?? 0) - amount;
          runtime.reload = null;
        }
        if (runtime && def.magazineSize !== undefined && def.reloadTime !== undefined && intent.reload && !runtime.reload &&
            (runtime.loaded[inv.current] ?? 0) < def.magazineSize && (inv.ammo[def.ammoType] ?? 0) > 0) {
          runtime.reload = { weapon: inv.current, completesAt: now + def.reloadTime };
        }
        if (runtime?.reload) return;
        const wants = def.auto ? intent.fire || intent.firePressed : intent.firePressed; // a tap shorter than a tick still fires
        if (!wants || now + EPS < inv.nextFireAt) return;
        const available = def.magazineSize !== undefined ? (runtime?.loaded[inv.current] ?? 0) : (inv.ammo[def.ammoType] ?? 0);
        if (def.ammoType && available < def.ammoPerShot) {
          if (intent.firePressed) ctx.events.emit(WeaponDry, { entity: e, weapon: inv.current });
          inv.nextFireAt = now + 0.2;
          return;
        }
        if (def.magazineSize !== undefined && runtime) runtime.loaded[inv.current] = available - def.ammoPerShot;
        else if (def.ammoType) inv.ammo[def.ammoType] = available - def.ammoPerShot;
        inv.nextFireAt = now + def.cooldown;
        inv.lastFiredAt = now;
        const team = ctx.world.get(e, Collider)?.team ?? '';
        combat.fireAttack({ shooter: e, team, x: t.x, z: t.z, dirX: yawDirX(t.yaw), dirZ: yawDirZ(t.yaw), attackId: inv.current, params: def.attack.params }, def.attack.behavior, def.fireSound);
      });
    },
  });

  // --- damage resolution -------------------------------------------------------------------------------------------
  ctx.systems.add({
    id: 'core/combat.damage',
    phase: 'damage',
    update() {
      if (queue.length === 0) return;
      modifiers ??= ctx.registries
        .entries(DamageModifiers)
        .sort((a, b) => a.value.order - b.value.order || (a.id < b.id ? -1 : 1))
        .map((m) => ctx.instantiate(DamageModifiers, m.id, (def, owner) => def.start(owner)));
      for (let i = 0; i < queue.length; i++) {
        const req = queue[i]!;
        const h = ctx.world.get(req.target, Health); // undefined for destroyed (stale) entities
        if (!h || h.dead) continue;
        let amount = req.amount;
        for (const m of modifiers) amount = m(req, amount);
        if (!(amount > 0)) continue;
        h.hp = Math.max(0, h.hp - amount);
        const lethal = h.hp <= 0;
        if (lethal) h.dead = true;
        ctx.events.emit(Damaged, { target: req.target, amount, kind: req.kind, source: req.source, x: req.x, z: req.z, hp: h.hp, lethal });
        if (lethal) {
          const t = ctx.world.get(req.target, Transform);
          ctx.events.emit(Died, { entity: req.target, source: req.source, kind: req.kind, x: t?.x ?? req.x, z: t?.z ?? req.z });
        }
      }
      queue.length = 0;
    },
  });

  // --- pickups -----------------------------------------------------------------------------------------------------
  const effectFn = (id: string): PickupEffectFn => ctx.instantiate(PickupEffects, id, (def, owner) => def.start(owner));
  ctx.systems.add({
    id: 'core/combat.pickups',
    phase: 'world',
    order: 10,
    update() {
      ctx.world.each(Pickup, (pe, pickup) => {
        const pt = ctx.world.get(pe, Transform);
        const def = ctx.registries.get(Pickups, pickup.def);
        if (!pt || !def) return;
        ctx.world.each(Player, (actor) => {
          if (!ctx.world.isAlive(pe)) return;
          const at = ctx.world.get(actor, Transform);
          if (!at || ctx.world.get(actor, Health)?.dead) return;
          if (Math.hypot(at.x - pt.x, at.z - pt.z) > def.radius + (ctx.world.get(actor, Collider)?.radius ?? 0.3)) return;
          if (!effectFn(def.effect)(actor, def.params)) return;
          ctx.events.emit(PickupCollected, { pickup: pe, def: pickup.def, by: actor, x: pt.x, z: pt.z, sound: def.sound, label: def.name });
          ctx.world.destroy(pe);
        });
      });
    },
  });

  return combat;
}

export default definePlugin({
  register(ctx) {
    ctx.contentKind('ammo', ammoKind);
    ctx.contentKind('weapon', weaponKind);
    ctx.contentKind('pickup', pickupKind);
    ctx.register(AttackBehaviors, 'core/hitscan', hitscan);
    ctx.register(AttackBehaviors, 'core/projectile', projectile);
    ctx.register(AttackBehaviors, 'core/melee', melee);
    ctx.register(PickupEffects, 'core/heal', heal);
    ctx.register(PickupEffects, 'core/give-ammo', giveAmmo);
    ctx.register(PickupEffects, 'core/give-weapon', giveWeapon);
    ctx.addValidator(validateDefinitions);
  },
  activate(ctx) {
    ctx.services.provide(Combat, createCombat(ctx));
  },
});
