import { Transform, Visual, defineComponent, definePlugin, yawOf } from '@bulkhead/sdk';
import { AttackBehaviors, Combat, Impact, World } from '../../contracts/shooter.ts';
import type { EntityId, Json, Params, Reporter } from '@bulkhead/sdk';
import type { AttackShot } from '../../contracts/shooter.ts';

/** Private per-projectile state. */
interface Ricochet {
  shooter: EntityId;
  team: string;
  dirX: number;
  dirZ: number;
  speed: number;
  radius: number;
  damage: number;
  falloff: number;
  maxBounces: number;
  bounces: number;
  rangeLeft: number;
}
const RicochetState = defineComponent<Ricochet>('example/ricochet.state');

const KNOWN = ['damage', 'speed', 'radius', 'bounces', 'range', 'damageFalloff', 'visual'];
/** Distance a bounced projectile is pushed off the surface so the next sweep does not start inside the wall. */
const EPS = 1e-3;
/** Max sweep segments per tick; a projectile that exhausts it is destroyed (degenerate corner). */
const MAX_SEGMENTS = 8;
const PROJECTILE_Y = 0.9;

const isNum = (v: Json | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function checkNumber(params: Params, key: string, r: Reporter, required: boolean, min: number, max: number, integer = false): void {
  const v = params[key];
  if (v === undefined) {
    if (required) r.error(`${key}: required`);
    return;
  }
  if (!isNum(v)) return r.error(`${key}: must be a finite number`);
  if (v < min || v > max) return r.error(`${key}: must be between ${min} and ${max}, got ${v}`);
  if (integer && !Number.isInteger(v)) r.error(`${key}: must be an integer, got ${v}`);
}

export default definePlugin({
  register(ctx) {
    const defaultBounces = (): number => {
      const c = ctx.config['bounces'];
      return typeof c === 'number' ? c : 3;
    };
    ctx.register(AttackBehaviors, 'example/ricochet', {
      description: 'Projectile that bounces off walls up to N times, consuming its full travel distance every tick.',
      validateParams(params, r) {
        for (const k of Object.keys(params)) if (!KNOWN.includes(k)) r.error(`unknown parameter "${k}". Known: ${KNOWN.join(', ')}`);
        checkNumber(params, 'damage', r, true, 0, 10000);
        checkNumber(params, 'speed', r, true, 0.1, 100000);
        checkNumber(params, 'radius', r, false, 0.01, 2);
        checkNumber(params, 'bounces', r, false, 0, 8, true);
        checkNumber(params, 'range', r, false, 0.1, 10000);
        checkNumber(params, 'damageFalloff', r, false, 0, 10);
        const vis = params['visual'];
        if (vis !== undefined && (typeof vis !== 'string' || vis === '')) r.error('visual: must be a non-empty string');
      },
      start(sctx) {
        const world = sctx.services.get(World);
        const combat = sctx.services.get(Combat);

        sctx.systems.add({
          id: 'example/ricochet.move',
          phase: 'movement',
          update(dt) {
            sctx.world.each(RicochetState, (id, p) => {
              const tr = sctx.world.get(id, Transform);
              if (!tr) return;
              tr.prevX = tr.x;
              tr.prevZ = tr.z;
              let remaining = p.speed * dt;
              for (let seg = 0; ; seg++) {
                if (remaining <= 1e-9) break;
                if (p.rangeLeft <= 0 || seg >= MAX_SEGMENTS) return void sctx.world.destroy(id);
                const len = Math.min(remaining, p.rangeLeft);
                const wall = world.raycast(tr.x, tr.z, p.dirX, p.dirZ, len, p.radius);
                const reach = wall ? Math.min(wall.t, len) : len;
                const actor = combat.sweepActors(tr.x, tr.z, p.dirX, p.dirZ, reach, p.radius, p.shooter, p.team);
                if (actor) {
                  combat.damage({ target: actor.entity, amount: p.damage, kind: 'ricochet', source: p.shooter, x: actor.x, z: actor.z });
                  sctx.events.emit(Impact, { x: actor.x, z: actor.z, y: PROJECTILE_Y, nx: -p.dirX, nz: -p.dirZ, target: actor.entity, effect: 'fx-blood', sound: 'impact-flesh' });
                  return void sctx.world.destroy(id);
                }
                tr.x += p.dirX * reach;
                tr.z += p.dirZ * reach;
                remaining -= reach;
                p.rangeLeft -= reach;
                if (!wall) {
                  if (p.rangeLeft <= 1e-9) return void sctx.world.destroy(id);
                  continue;
                }
                if (p.bounces >= p.maxBounces) {
                  sctx.events.emit(Impact, { x: tr.x, z: tr.z, y: PROJECTILE_Y, nx: wall.nx, nz: wall.nz, target: 0, effect: 'fx-spark', sound: 'impact-wall' });
                  return void sctx.world.destroy(id);
                }
                // Reflect d' = d - 2(d.n)n (only when moving into the surface), then step off it.
                const dot = p.dirX * wall.nx + p.dirZ * wall.nz;
                if (dot < 0) {
                  p.dirX -= 2 * dot * wall.nx;
                  p.dirZ -= 2 * dot * wall.nz;
                  const l = Math.hypot(p.dirX, p.dirZ) || 1;
                  p.dirX /= l;
                  p.dirZ /= l;
                }
                tr.x += wall.nx * EPS;
                tr.z += wall.nz * EPS;
                p.bounces++;
                p.damage *= p.falloff;
                sctx.events.emit(Impact, { x: tr.x, z: tr.z, y: PROJECTILE_Y, nx: wall.nx, nz: wall.nz, target: 0, effect: 'fx-spark', sound: 'ricochet-bounce' });
              }
              tr.yaw = yawOf(p.dirX, p.dirZ);
            });
          },
        });

        return (shot: AttackShot) => {
          const q = shot.params;
          const num = (k: string, d: number): number => {
            const v = q[k];
            return isNum(v) ? v : d;
          };
          const id = sctx.world.create();
          const yaw = yawOf(shot.dirX, shot.dirZ);
          sctx.world.add(id, Transform, { x: shot.x, z: shot.z, yaw, prevX: shot.x, prevZ: shot.z, prevYaw: yaw });
          const vis = q['visual'];
          sctx.world.add(id, Visual, {
            key: typeof vis === 'string' ? vis : 'fx-ricochet',
            state: 'fly',
            stateAt: sctx.time.now,
            y: PROJECTILE_Y,
            scale: 1,
            tint: '',
            renderer: '',
          });
          sctx.world.add(id, RicochetState, {
            shooter: shot.shooter,
            team: shot.team,
            dirX: shot.dirX,
            dirZ: shot.dirZ,
            speed: num('speed', 20),
            radius: num('radius', 0.12),
            damage: num('damage', 0),
            falloff: num('damageFalloff', 1),
            maxBounces: Math.round(num('bounces', defaultBounces())),
            bounces: 0,
            rangeLeft: num('range', 80),
          });
        };
      },
    });

    ctx.defineContent('weapon', 'example/ricochet-rifle', {
      name: 'Ricochet Rifle',
      slot: 3,
      starter: true,
      behavior: 'example/ricochet',
      params: { damage: 18, speed: 22, radius: 0.12, range: 80, damageFalloff: 1, visual: 'fx-ricochet' },
      ammoType: 'core/cells-ammo',
      ammoPerShot: 1,
      cooldown: 0.4,
      auto: false,
      view: 'weapon-ricochet',
      fireSound: 'ricochet-fire',
      recoil: 0.5,
      flash: '#ff5cf0',
    });
  },
});
