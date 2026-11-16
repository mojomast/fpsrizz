import type { AttackBehavior, EntityId, Params, PickupEffect, Reporter, SessionContext } from '../../sdk/index.ts';
import { AmmoTypes, Combat, Impact, Transform, Visual, Weapons, World, defineComponent, makeTransform, vId, vNumber, vString } from '../../sdk/index.ts';

const num = (p: Params, k: string, fallback: number): number => (typeof p[k] === 'number' ? (p[k] as number) : fallback);
const str = (p: Params, k: string, fallback: string): string => (typeof p[k] === 'string' ? (p[k] as string) : fallback);

function checkNum(p: Params, r: Reporter, k: string, min: number, max: number, required = false): void {
  if (p[k] === undefined) {
    if (required) r.at(k).error('is required');
    return;
  }
  vNumber(p[k], r.at(k), { min, max });
}
function checkStr(p: Params, r: Reporter, k: string): void {
  if (p[k] !== undefined) vString(p[k], r.at(k), { max: 60, nonEmpty: false });
}
function checkKnown(p: Params, r: Reporter, known: string[]): void {
  for (const k of Object.keys(p)) if (!known.includes(k)) r.at(k).error(`unknown parameter. Supported: ${known.join(', ')}`);
}

/** Height at which shots travel / impacts appear (cosmetic; simulation is planar). */
const SHOT_Y = 1.15;

/** Instant ray: stops at the first wall or actor. params: damage, range, spread (radians), pellets, kind, impact, impactActor */
export const hitscan: AttackBehavior = {
  description: 'Instant ray that stops at the first blocking obstacle. params: damage*, range, spread (radians), pellets, kind, impact, impactActor, impactSound, impactActorSound',
  validateParams(p, r) {
    checkKnown(p, r, ['damage', 'range', 'spread', 'pellets', 'kind', 'impact', 'impactActor', 'impactSound', 'impactActorSound']);
    checkNum(p, r, 'damage', 0, 10000, true);
    checkNum(p, r, 'range', 0.5, 500);
    checkNum(p, r, 'spread', 0, 1);
    checkNum(p, r, 'pellets', 1, 32);
    for (const k of ['kind', 'impact', 'impactActor', 'impactSound', 'impactActorSound']) checkStr(p, r, k);
  },
  start(ctx) {
    const combat = ctx.services.get(Combat);
    return (shot) => {
      const p = shot.params;
      const pellets = Math.round(num(p, 'pellets', 1));
      const spread = num(p, 'spread', 0);
      const range = num(p, 'range', 60);
      for (let i = 0; i < pellets; i++) {
        const a = spread > 0 ? ctx.rng.range(-spread, spread) : 0;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const dx = shot.dirX * c - shot.dirZ * s;
        const dz = shot.dirX * s + shot.dirZ * c;
        const hit = combat.hitscan(shot.x, shot.z, dx, dz, range, shot.shooter, shot.team);
        if (hit.entity) {
          combat.damage({ target: hit.entity, amount: num(p, 'damage', 0), kind: str(p, 'kind', 'bullet'), source: shot.shooter, x: hit.x, z: hit.z });
          ctx.events.emit(Impact, { x: hit.x, z: hit.z, y: SHOT_Y, nx: -dx, nz: -dz, target: hit.entity, effect: str(p, 'impactActor', 'fx-blood'), sound: str(p, 'impactActorSound', 'impact-flesh') });
        } else if (hit.hitWall) {
          ctx.events.emit(Impact, { x: hit.x, z: hit.z, y: SHOT_Y, nx: hit.nx, nz: hit.nz, target: 0, effect: str(p, 'impact', 'fx-spark'), sound: str(p, 'impactSound', 'impact-wall') });
        }
      }
    };
  },
};

/** Short forward sweep that damages the nearest opposing actor in reach. params: damage, range, kind */
export const melee: AttackBehavior = {
  description: 'Close-range strike blocked by walls. params: damage*, range, kind, impactActor, impactActorSound',
  validateParams(p, r) {
    checkKnown(p, r, ['damage', 'range', 'kind', 'impactActor', 'impactActorSound']);
    checkNum(p, r, 'damage', 0, 10000, true);
    checkNum(p, r, 'range', 0.2, 10);
    for (const k of ['kind', 'impactActor', 'impactActorSound']) checkStr(p, r, k);
  },
  start(ctx) {
    const combat = ctx.services.get(Combat);
    const world = ctx.services.get(World);
    return (shot) => {
      const p = shot.params;
      const range = num(p, 'range', 1.4);
      const wall = world.raycast(shot.x, shot.z, shot.dirX, shot.dirZ, range, 0.1);
      const hit = combat.sweepActors(shot.x, shot.z, shot.dirX, shot.dirZ, wall ? wall.t : range, 0.35, shot.shooter, shot.team);
      if (!hit) return;
      combat.damage({ target: hit.entity, amount: num(p, 'damage', 0), kind: str(p, 'kind', 'melee'), source: shot.shooter, x: hit.x, z: hit.z });
      ctx.events.emit(Impact, { x: hit.x, z: hit.z, y: SHOT_Y, nx: -shot.dirX, nz: -shot.dirZ, target: hit.entity, effect: str(p, 'impactActor', 'fx-blood'), sound: str(p, 'impactActorSound', 'impact-flesh') });
    };
  },
};

interface Projectile {
  dirX: number;
  dirZ: number;
  speed: number;
  radius: number;
  damage: number;
  /** Remaining travel distance. */
  left: number;
  shooter: EntityId;
  team: string;
  kind: string;
  impact: string;
  impactSound: string;
}
const Projectile = defineComponent<Projectile>('core/projectile');

/**
 * Travelling projectile, advanced by continuous sweeps so speed can never tunnel it through a wall or an actor.
 * params: damage, speed, radius, range, kind, visual, impact, impactSound
 */
export const projectile: AttackBehavior = {
  description: 'Travelling projectile with swept collision. params: damage*, speed*, radius, range, kind, visual, impact, impactSound',
  validateParams(p, r) {
    checkKnown(p, r, ['damage', 'speed', 'radius', 'range', 'kind', 'visual', 'impact', 'impactSound']);
    checkNum(p, r, 'damage', 0, 10000, true);
    checkNum(p, r, 'speed', 0.5, 2000, true);
    checkNum(p, r, 'radius', 0.02, 2);
    checkNum(p, r, 'range', 0.5, 500);
    for (const k of ['kind', 'visual', 'impact', 'impactSound']) checkStr(p, r, k);
  },
  start(ctx) {
    const combat = ctx.services.get(Combat);
    const world = ctx.services.get(World);

    const explode = (e: EntityId, pr: Projectile, x: number, z: number, nx: number, nz: number, target: EntityId): void => {
      if (target) combat.damage({ target, amount: pr.damage, kind: pr.kind, source: pr.shooter, x, z });
      ctx.events.emit(Impact, { x, z, y: SHOT_Y, nx, nz, target, effect: pr.impact, sound: pr.impactSound });
      ctx.world.destroy(e);
    };

    ctx.systems.add({
      id: 'core/combat.projectiles',
      phase: 'movement',
      update(dt) {
        ctx.world.each(Projectile, (e, pr) => {
          const t = ctx.world.get(e, Transform);
          if (!t) return;
          const dist = Math.min(pr.speed * dt, pr.left);
          const wall = world.raycast(t.x, t.z, pr.dirX, pr.dirZ, dist, pr.radius);
          const reach = wall ? wall.t : dist;
          const actor = combat.sweepActors(t.x, t.z, pr.dirX, pr.dirZ, reach, pr.radius, pr.shooter, pr.team);
          if (actor) return explode(e, pr, actor.x, actor.z, -pr.dirX, -pr.dirZ, actor.entity);
          if (wall) return explode(e, pr, wall.x, wall.z, wall.nx, wall.nz, 0);
          t.x += pr.dirX * dist;
          t.z += pr.dirZ * dist;
          pr.left -= dist;
          if (pr.left <= 1e-6) ctx.world.destroy(e);
        });
      },
    });

    return (shot) => {
      const p = shot.params;
      const radius = num(p, 'radius', 0.15);
      const e = ctx.world.create();
      const t = ctx.world.add(e, Transform, makeTransform(shot.x, shot.z, 0));
      const pr = ctx.world.add(e, Projectile, {
        dirX: shot.dirX,
        dirZ: shot.dirZ,
        speed: num(p, 'speed', 12),
        radius,
        damage: num(p, 'damage', 0),
        left: num(p, 'range', 60),
        shooter: shot.shooter,
        team: shot.team,
        kind: str(p, 'kind', 'plasma'),
        impact: str(p, 'impact', 'fx-spark'),
        impactSound: str(p, 'impactSound', 'explosion-small'),
      });
      ctx.world.add(e, Visual, { key: str(p, 'visual', 'fx-plasma'), state: 'fly', stateAt: ctx.time.now, y: SHOT_Y - 0.25, scale: 1, tint: '', renderer: '' });
      // Leave the shooter's body with a swept move so a muzzle pressed against a wall cannot spawn the shot beyond it.
      const lead = 0.45;
      const wall = world.raycast(shot.x, shot.z, shot.dirX, shot.dirZ, lead, radius);
      if (wall) return explode(e, pr, wall.x, wall.z, wall.nx, wall.nz, 0);
      t.x = t.prevX = shot.x + shot.dirX * lead;
      t.z = t.prevZ = shot.z + shot.dirZ * lead;
    };
  },
};

export const heal: PickupEffect = {
  description: 'Restores health; not consumed at full health. params: amount*',
  validateParams(p, r) {
    checkKnown(p, r, ['amount']);
    checkNum(p, r, 'amount', 1, 10000, true);
  },
  start: (ctx: SessionContext) => (target, p) => ctx.services.get(Combat).heal(target, num(p, 'amount', 0)) > 0,
};

export const giveAmmo: PickupEffect = {
  description: 'Adds ammunition; not consumed when already full. params: ammoType*, amount*',
  validateParams(p, r, reg) {
    checkKnown(p, r, ['ammoType', 'amount']);
    const id = vId(p['ammoType'], r.at('ammoType'));
    if (id !== undefined && !reg.has(AmmoTypes, id)) r.at('ammoType').error(`unknown ammo type "${id}". Installed: ${reg.ids(AmmoTypes).join(', ') || '(none)'}`);
    checkNum(p, r, 'amount', 1, 10000, true);
  },
  start: (ctx: SessionContext) => (target, p) => ctx.services.get(Combat).giveAmmo(target, str(p, 'ammoType', ''), num(p, 'amount', 0)) > 0,
};

export const giveWeapon: PickupEffect = {
  description: 'Grants a weapon (and optionally ammo for it). params: weapon*, ammoType, amount',
  validateParams(p, r, reg) {
    checkKnown(p, r, ['weapon', 'ammoType', 'amount']);
    const w = vId(p['weapon'], r.at('weapon'));
    if (w !== undefined && !reg.has(Weapons, w)) r.at('weapon').error(`unknown weapon "${w}". Installed: ${reg.ids(Weapons).join(', ') || '(none)'}`);
    if (p['ammoType'] !== undefined) {
      const a = vId(p['ammoType'], r.at('ammoType'));
      if (a !== undefined && !reg.has(AmmoTypes, a)) r.at('ammoType').error(`unknown ammo type "${a}". Installed: ${reg.ids(AmmoTypes).join(', ') || '(none)'}`);
    }
    checkNum(p, r, 'amount', 0, 10000);
  },
  start: (ctx: SessionContext) => (target, p) => {
    const combat = ctx.services.get(Combat);
    // Grant the optional reserve first so a newly granted magazine weapon can chamber it.
    const ammo = typeof p['ammoType'] === 'string' ? combat.giveAmmo(target, p['ammoType'], num(p, 'amount', 0)) : 0;
    const got = combat.giveWeapon(target, str(p, 'weapon', ''));
    return got || ammo > 0;
  },
};
