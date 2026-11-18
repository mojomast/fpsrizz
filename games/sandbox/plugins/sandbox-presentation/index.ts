import { definePlugin, worldPose } from '../../../../src/sdk/index.ts';
import { Render, THREE } from '../../../../src/sdk/render.ts';
import { Sandbox } from '../../contracts/sandbox.ts';

export default definePlugin({
  activate(ctx) {
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    const sandbox = ctx.services.get(Sandbox);
    render.setEnvironment({ background: 0x9fc4e0, fog: { color: 0x9fc4e0, near: 30, far: 80 } });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xdfefff, 0x404830, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2); sun.position.set(-6, 12, 8); root.add(sun);
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
