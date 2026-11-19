import { PrevTransform, Transform, Transform3D, definePlugin, quatFromEuler } from '@bulkhead/sdk';
import type { Pose, Quat } from '@bulkhead/sdk';

const setQuat = (q: Quat, yaw: number): void => { const r = quatFromEuler(yaw); q.x = r.x; q.y = r.y; q.z = r.z; q.w = r.w; };
const fresh = (x: number, z: number, yaw: number): Pose => ({ position: { x, y: 0, z }, rotation: quatFromEuler(yaw), scale: { x: 1, y: 1, z: 1 } });

/**
 * Adapter between SDK 2's planar `Transform` and SDK 3's `Transform3D`. The planar component stays authoritative:
 * the bridge overwrites Transform3D's x/z/yaw each tick (keeping any y, scale or parent you set) and writes
 * PrevTransform from prevX/prevZ/prevYaw so interpolation matches the shooter's own renderer.
 */
export default definePlugin({
  activate(ctx) {
    const planar = ctx.world.query({ with: [Transform] });
    ctx.systems.add({
      id: 'shooter/transform3d.mirror',
      phase: 'presentation',
      order: 1000,
      update: () => {
        planar.drain();
        planar.each((e) => {
          const p = ctx.world.get(e, Transform)!;
          const t = ctx.world.get(e, Transform3D);
          if (!t) ctx.world.add(e, Transform3D, fresh(p.x, p.z, p.yaw));
          else { t.position.x = p.x; t.position.z = p.z; setQuat(t.rotation, p.yaw); }
          const prev = ctx.world.get(e, PrevTransform);
          if (!prev) ctx.world.add(e, PrevTransform, fresh(p.prevX, p.prevZ, p.prevYaw));
          else { prev.position.x = p.prevX; prev.position.z = p.prevZ; prev.position.y = (t ?? prev).position.y; setQuat(prev.rotation, p.prevYaw); }
        });
      },
    });
  },
});
