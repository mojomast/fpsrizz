import type { SessionContext } from '@bulkhead/sdk';
import { Collider, ControllerRole, Health, Input, InputActions, Intent, Player, Settings, Transform, defineComponent, definePlugin, yawDirX, yawDirZ } from '@bulkhead/sdk';
import { World } from '../../contracts/shooter.ts';

const Motion = defineComponent<{ vx: number; vz: number; dashX: number; dashZ: number; dashUntil: number; nextDash: number }>('example/dash-controller.motion');

function controller(ctx: SessionContext): void {
  const input = ctx.services.get(Input);
  const world = ctx.services.get(World);
  const settings = ctx.services.tryGet(Settings);
  const speed = ctx.config['moveSpeed'] as number;
  const sprint = ctx.config['sprintMultiplier'] as number;
  const dashSpeed = ctx.config['dashSpeed'] as number;
  const duration = ctx.config['dashDuration'] as number;
  const cooldown = ctx.config['dashCooldown'] as number;
  const out = { x: 0, z: 0 };

  ctx.scope.add(() => ctx.world.each(Player, (e) => ctx.world.remove(e, Motion)), 'dash-motion');
  ctx.systems.add({
    id: 'example/dash-controller.control', phase: 'control',
    update(dt) {
      const tick = input.tick;
      ctx.world.each(Player, (e, player) => {
        const t = ctx.world.get(e, Transform);
        const intent = ctx.world.get(e, Intent);
        if (!t || !intent) return;
        const motion = ctx.world.get(e, Motion) ?? ctx.world.add(e, Motion, { vx: 0, vz: 0, dashX: 0, dashZ: 0, dashUntil: 0, nextDash: 0 });
        const dead = ctx.world.get(e, Health)?.dead ?? false;
        intent.moveX = dead ? 0 : Number(tick.held('core/strafe-right')) - Number(tick.held('core/strafe-left'));
        intent.moveZ = dead ? 0 : Number(tick.held('core/move-forward')) - Number(tick.held('core/move-back'));
        intent.fire = !dead && tick.held('core/fire');
        intent.firePressed = !dead && tick.pressed('core/fire');
        intent.use = !dead && tick.pressed('core/use');
        intent.reload = !dead && tick.pressed('core/reload');
        intent.weaponSlot = 0;
        intent.weaponCycle = 0;
        if (dead) {
          motion.vx = motion.vz = motion.dashUntil = 0;
          player.speed = 0;
          return;
        }
        for (let slot = 1; slot <= 9; slot++) if (tick.pressed(`core/weapon-${slot}`)) intent.weaponSlot = slot;
        if (tick.pressed('core/weapon-next')) intent.weaponCycle = 1;
        else if (tick.pressed('core/weapon-prev')) intent.weaponCycle = -1;
        t.yaw -= tick.lookX * (settings?.lookSensitivity ?? 0.0024);
        t.yaw += (Number(tick.held('core/turn-left')) - Number(tick.held('core/turn-right'))) * 2.6 * dt;
        const fx = yawDirX(t.yaw), fz = yawDirZ(t.yaw);
        let wx = fx * intent.moveZ - fz * intent.moveX;
        let wz = fz * intent.moveZ + fx * intent.moveX;
        const length = Math.hypot(wx, wz);
        if (length > 0) { wx /= length; wz /= length; }
        if (tick.pressed('example/dash') && ctx.time.now >= motion.nextDash && ctx.time.now >= motion.dashUntil) {
          motion.dashX = length > 0 ? wx : fx;
          motion.dashZ = length > 0 ? wz : fz;
          motion.dashUntil = ctx.time.now + duration;
          motion.nextDash = ctx.time.now + cooldown;
        }
        if (ctx.time.now < motion.dashUntil) {
          motion.vx = motion.dashX * dashSpeed;
          motion.vz = motion.dashZ * dashSpeed;
        } else {
          const target = speed * (tick.held('example/sprint') ? sprint : 1);
          const k = Math.min(1, dt * (length > 0 ? 14 : 10));
          motion.vx += (wx * target - motion.vx) * k;
          motion.vz += (wz * target - motion.vz) * k;
        }
        if (dt > 0) {
          world.moveCircle(t.x, t.z, ctx.world.get(e, Collider)?.radius ?? 0.35, motion.vx * dt, motion.vz * dt, out);
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

export default definePlugin({
  register(ctx) {
    ctx.register(InputActions, 'example/sprint', { label: 'Sprint', keys: ['ShiftLeft', 'ShiftRight'] });
    ctx.register(InputActions, 'example/dash', { label: 'Dash', keys: ['ControlLeft', 'ControlRight'] });
    ctx.provideRole(ControllerRole, 'example/dash-controller', { name: 'Dash controller', description: 'WASD, mouse yaw, Shift to sprint, Ctrl to dash.', activate: controller });
  },
});
