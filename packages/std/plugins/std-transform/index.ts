import { PrevTransform, Transform3D, definePlugin } from '@bulkhead/sdk';
import type { Pose } from '@bulkhead/sdk';

const copyInto = (dst: Pose, src: Pose): void => {
  dst.position.x = src.position.x; dst.position.y = src.position.y; dst.position.z = src.position.z;
  dst.rotation.x = src.rotation.x; dst.rotation.y = src.rotation.y; dst.rotation.z = src.rotation.z; dst.rotation.w = src.rotation.w;
  dst.scale.x = src.scale.x; dst.scale.y = src.scale.y; dst.scale.z = src.scale.z;
};

/**
 * Runs first in the "input" phase (order -1000): PrevTransform := Transform3D. Movement in later phases then changes
 * Transform3D, and render sync interpolates PrevTransform -> Transform3D with the frame's alpha.
 * Entities that gain a Transform3D get a PrevTransform equal to it (no interpolation from the origin).
 */
export default definePlugin({
  activate(ctx) {
    const all = ctx.world.query({ with: [Transform3D] });
    ctx.systems.add({
      id: 'std/transform.capture-prev',
      phase: 'input',
      order: -1000,
      update: () => {
        all.drain();
        all.each((e) => {
          const t = ctx.world.get(e, Transform3D)!;
          const prev = ctx.world.get(e, PrevTransform);
          if (prev) copyInto(prev, t);
          else ctx.world.add(e, PrevTransform, { position: { ...t.position }, rotation: { ...t.rotation }, scale: { ...t.scale } });
        });
      },
    });
  },
});
