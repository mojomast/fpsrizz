import { definePlugin, worldPose } from '../../../../src/sdk/index.ts';
import { Render, THREE } from '../../../../src/sdk/render.ts';
import { Sandbox, SandboxGlow } from '../../contracts/sandbox.ts';

export default definePlugin({
  activate(ctx) {
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    const sandbox = ctx.services.get(Sandbox);
    render.setEnvironment({ background: 0x9fc4e0, fog: { color: 0x9fc4e0, near: 30, far: 80 } });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xdfefff, 0x404830, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2); sun.position.set(-6, 12, 8); root.add(sun);
    // Lamps authored in the glTF level (custom property sandbox/glow) get a point light.
    const glows = ctx.world.query({ with: [SandboxGlow] });
    const lit = new Set<number>();
    const light = (e: number): void => {
      const pose = worldPose(ctx.world, e);
      if (!pose || lit.has(e)) return;
      lit.add(e);
      const l = new THREE.PointLight(0xffd890, (ctx.world.get(e, SandboxGlow)?.intensity ?? 1) * 4, 12);
      l.position.set(pose.position.x, pose.position.y, pose.position.z);
      root.add(l);
    };
    for (const e of glows.ids()) light(e);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    render.setWorldCamera(ctx, camera);
    const target = new THREE.Vector3();
    ctx.systems.addFrame({ id: 'sandbox/camera', order: 200, update(alpha) {
      const pose = worldPose(ctx.world, sandbox.hero, alpha);
      if (!pose) return;
      target.set(pose.position.x, pose.position.y, pose.position.z);
      camera.position.set(target.x, target.y + 6, target.z + 9);
      camera.lookAt(target);
    } });
  },
});
