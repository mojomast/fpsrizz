import type { Prefab, RoleInfo, SessionContext, ViewState } from '../../sdk/index.ts';
import { AmmoTypes, CameraRole, Collider, ControllerRole, Damaged, Died, Health, Input, InputActions, Intent, Inventory, Player, Prefabs, Settings, Transform, View, Weapons, World, angleDelta, defineComponent, definePlugin, makeTransform, yawDirX, yawDirZ } from '../../sdk/index.ts';

const EYE_HEIGHT = 1.5;
const RADIUS = 0.35;
const DEFAULT_SENSITIVITY = 0.0024;
const KEY_TURN_SPEED = 2.6;

/** Planar velocity kept between ticks for snappy-but-smooth acceleration. Private to this plugin. */
const Motion = defineComponent<{ vx: number; vz: number }>('core/player.motion');

const A = {
  forward: 'core/move-forward',
  back: 'core/move-back',
  left: 'core/strafe-left',
  right: 'core/strafe-right',
  turnLeft: 'core/turn-left',
  turnRight: 'core/turn-right',
  fire: 'core/fire',
  use: 'core/use',
  next: 'core/weapon-next',
  prev: 'core/weapon-prev',
} as const;
const SLOTS = [1, 2, 3, 4, 5];

const playerPrefab = (maxHealth: number): Prefab => ({
  description: 'The player actor with the default loadout (every weapon marked "starter", ammo "start" amounts).',
  start: (ctx) => (at) => {
    const e = ctx.world.create();
    ctx.world.add(e, Transform, makeTransform(at.x, at.z, at.yaw));
    ctx.world.add(e, Collider, { radius: RADIUS, team: 'player', solid: true });
    ctx.world.add(e, Health, { hp: maxHealth, max: maxHealth, dead: false });
    ctx.world.add(e, Intent, { moveX: 0, moveZ: 0, fire: false, firePressed: false, use: false, weaponSlot: 0, weaponCycle: 0 });
    ctx.world.add(e, Player, { kills: 0, hurtAt: -10, speed: 0 });
    ctx.world.add(e, Motion, { vx: 0, vz: 0 });
    const weapons = ctx.registries
      .entries(Weapons)
      .filter((w) => w.value.starter)
      .sort((a, b) => a.value.slot - b.value.slot)
      .map((w) => w.id);
    const ammo: Record<string, number> = {};
    const ammoMax: Record<string, number> = {};
    for (const a of ctx.registries.entries(AmmoTypes)) {
      ammo[a.id] = a.value.start;
      ammoMax[a.id] = a.value.max;
    }
    ctx.world.add(e, Inventory, { weapons, current: weapons[0] ?? null, ammo, ammoMax, nextFireAt: 0, lastFiredAt: -10, switchedAt: -10 });
    return e;
  },
});

/** WASD + mouse yaw. Reads the per-tick input snapshot, so press edges act exactly once even during catch-up ticks. */
function fpsController(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const input = ctx.services.get(Input);
  const settings = ctx.services.tryGet(Settings);
  const speed = ctx.config['moveSpeed'] as number;
  const out = { x: 0, z: 0 };

  ctx.systems.add({
    id: 'core/player.controller',
    phase: 'control',
    update(dt) {
      const tick = input.tick;
      ctx.world.each(Player, (e, player) => {
        const t = ctx.world.get(e, Transform);
        const intent = ctx.world.get(e, Intent);
        const motion = ctx.world.get(e, Motion);
        if (!t || !intent || !motion) return;
        const dead = ctx.world.get(e, Health)?.dead ?? false;
        intent.moveX = dead ? 0 : (tick.held(A.right) ? 1 : 0) - (tick.held(A.left) ? 1 : 0);
        intent.moveZ = dead ? 0 : (tick.held(A.forward) ? 1 : 0) - (tick.held(A.back) ? 1 : 0);
        intent.fire = !dead && tick.held(A.fire);
        intent.firePressed = !dead && tick.pressed(A.fire);
        intent.use = !dead && tick.pressed(A.use);
        intent.weaponSlot = 0;
        intent.weaponCycle = 0;
        if (!dead) {
          for (const s of SLOTS) if (tick.pressed(`core/weapon-${s}`)) intent.weaponSlot = s;
          if (tick.pressed(A.next)) intent.weaponCycle = 1;
          else if (tick.pressed(A.prev)) intent.weaponCycle = -1;
          t.yaw -= tick.lookX * (settings?.lookSensitivity ?? DEFAULT_SENSITIVITY);
          t.yaw += ((tick.held(A.turnLeft) ? 1 : 0) - (tick.held(A.turnRight) ? 1 : 0)) * KEY_TURN_SPEED * dt;
        }
        // Desired planar velocity in world space (forward = yawDir, right = perpendicular).
        const fx = yawDirX(t.yaw);
        const fz = yawDirZ(t.yaw);
        let wx = fx * intent.moveZ - fz * intent.moveX;
        let wz = fz * intent.moveZ + fx * intent.moveX;
        const len = Math.hypot(wx, wz);
        if (len > 1) {
          wx /= len;
          wz /= len;
        }
        const k = Math.min(1, dt * (len > 0 ? 14 : 10));
        motion.vx += (wx * speed - motion.vx) * k;
        motion.vz += (wz * speed - motion.vz) * k;
        if (Math.abs(motion.vx) + Math.abs(motion.vz) > 1e-4) {
          world.moveCircle(t.x, t.z, RADIUS, motion.vx * dt, motion.vz * dt, out);
          // Keep only the velocity that actually moved us, so sliding along a wall does not "store" speed into it.
          motion.vx = (out.x - t.x) / dt;
          motion.vz = (out.z - t.z) / dt;
          t.x = out.x;
          t.z = out.z;
        }
        player.speed = Math.min(1, Math.hypot(motion.vx, motion.vz) / speed);
      });
    },
  });
}

/** Fixed eye height, yaw only. Publishes the interpolated View each rendered frame. */
function fpCamera(ctx: SessionContext): void {
  const fov = ctx.config['fov'] as number;
  const view: ViewState = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0, roll: 0, fov, entity: 0 };
  ctx.services.provide(View, view);
  let bobPhase = 0;
  let deathT = 0;
  ctx.systems.addFrame({
    id: 'core/player.camera',
    order: -100,
    update(alpha, frameDt) {
      const e = ctx.world.first(Player);
      if (e === undefined) return;
      const t = ctx.world.get(e, Transform);
      const p = ctx.world.get(e, Player);
      if (!t || !p) return;
      view.entity = e;
      view.x = t.prevX + (t.x - t.prevX) * alpha;
      view.z = t.prevZ + (t.z - t.prevZ) * alpha;
      view.yaw = t.prevYaw + angleDelta(t.prevYaw, t.yaw) * alpha;
      const dead = ctx.world.get(e, Health)?.dead ?? false;
      deathT = dead ? Math.min(1, deathT + frameDt * 1.6) : 0;
      bobPhase += frameDt * 9 * p.speed;
      const ease = deathT * deathT * (3 - 2 * deathT);
      view.y = EYE_HEIGHT + Math.sin(bobPhase) * 0.035 * p.speed - ease * (EYE_HEIGHT - 0.35);
      view.roll = ease * 0.5;
      view.pitch = 0;
    },
  });
}

export default definePlugin({
  register(ctx) {
    const key = (id: string, label: string, keys: string[]): void => ctx.register(InputActions, id, { label, keys });
    key(A.forward, 'Move forward', ['KeyW', 'ArrowUp']);
    key(A.back, 'Move back', ['KeyS', 'ArrowDown']);
    key(A.left, 'Strafe left', ['KeyA']);
    key(A.right, 'Strafe right', ['KeyD']);
    key(A.turnLeft, 'Turn left', ['ArrowLeft']);
    key(A.turnRight, 'Turn right', ['ArrowRight']);
    key(A.fire, 'Fire', ['Mouse0', 'Space']);
    key(A.use, 'Use / open', ['KeyE', 'KeyF']);
    key(A.next, 'Next weapon', ['WheelDown', 'KeyQ']);
    key(A.prev, 'Previous weapon', ['WheelUp']);
    for (const s of SLOTS) key(`core/weapon-${s}`, `Weapon ${s}`, [`Digit${s}`]);

    ctx.register(Prefabs, 'core/player', playerPrefab(ctx.config['maxHealth'] as number));
    const controller: RoleInfo = { name: 'FPS controller', description: 'WASD movement, strafing, mouse yaw, wall sliding.', activate: fpsController };
    const camera: RoleInfo = { name: 'First-person camera', description: 'Fixed eye height, yaw only, interpolated.', activate: fpCamera };
    ctx.provideRole(ControllerRole, 'core/fps-controller', controller);
    ctx.provideRole(CameraRole, 'core/fp-camera', camera);
  },
  activate(ctx) {
    ctx.events.on(Damaged, (d) => {
      const p = ctx.world.get(d.target, Player);
      if (p) p.hurtAt = ctx.time.now;
    });
    ctx.events.on(Died, (d) => {
      const p = ctx.world.get(d.source, Player);
      if (p && d.entity !== d.source) p.kills++;
    });
  },
});
