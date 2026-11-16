import { Audio, ThemeRole, View, ViewModes, World, definePlugin, Impact } from '../../sdk/index.ts';
import { ActorRenderers, Render, THREE } from '../../sdk/render.ts';
import { createActors, billboardRenderer, DEFAULT_RENDERER_ID } from './actors.ts';
import { installAudioHooks } from './audiohooks.ts';
import { ThemeAssets } from './assets.ts';
import { createEffects } from './effects.ts';
import { createWeaponView } from './weaponview.ts';
import { buildWorldMeshes } from './worldmesh.ts';

export default definePlugin({
  register(ctx) {
    ctx.register(ActorRenderers, DEFAULT_RENDERER_ID, billboardRenderer);
  },

  activate(ctx) {
    const render = ctx.services.tryGet(Render);
    if (!render) return; // headless: nothing to draw
    const theme = ctx.role(ThemeRole)?.provider;
    if (!theme) {
      ctx.log.error('no theme selected; presentation disabled');
      return;
    }
    const world = ctx.services.get(World);
    const desc = world.desc;
    const assets = new ThemeAssets(ctx, render, theme);

    // Environment, ambient light and the level's lights
    render.setEnvironment({ background: desc.fog.color, fog: desc.fog });
    ctx.scope.add(() => render.setEnvironment({ background: 0x000000, fog: null }), 'environment');
    const root = render.createRoot(ctx, 'world');
    // Reference maps use artistic intensities, not physical units. PI compensates Lambert's BRDF;
    // decay 0 keeps distance-independent intensity within Three's smooth range cutoff.
    root.add(new THREE.AmbientLight(desc.ambient.color, desc.ambient.intensity * Math.PI));
    for (const l of desc.lights) {
      const light = new THREE.PointLight(l.color, l.intensity * Math.PI, l.distance, 0);
      light.position.set(l.x, l.y, l.z);
      light.name = `light:${l.id}`;
      root.add(light);
    }

    const meshes = buildWorldMeshes(ctx, root, world, assets);
    const actors = createActors(ctx, root, assets);
    const effects = createEffects(ctx, root, assets);
    const weapon = createWeaponView(ctx, assets, root);
    const audio = ctx.services.tryGet(Audio);
    if (audio) installAudioHooks(ctx, audio);

    ctx.events.on(Impact, (e) => effects.spawn(e.effect, e.x, e.y, e.z, e.nx, e.nz, ctx.time.now));

    const cam = render.camera;
    cam.rotation.order = 'YXZ';
    let overhead = false;
    ctx.systems.addFrame({
      id: 'core/presentation.frame',
      order: 100, // after the camera provider has published this frame's View
      update(alpha, frameDt) {
        const time = ctx.time.now + alpha * ctx.time.step;
        const view = ctx.services.tryGet(View); // provided by the camera role, which activates after plugins
        const nextOverhead = ctx.services.tryGet(ViewModes)?.mode === 'isometric';
        if (nextOverhead !== overhead) {
          overhead = nextOverhead;
          meshes.setOverhead(overhead);
          weapon.setVisible(!overhead);
          render.setEnvironment({ background: desc.fog.color, fog: overhead ? null : desc.fog });
        }
        if (view) {
          cam.position.set(view.x, view.y, view.z);
          cam.rotation.set(view.pitch, view.yaw, view.roll);
          if (cam.fov !== view.fov) {
            cam.fov = view.fov;
            cam.updateProjectionMatrix();
          }
        }
        meshes.update(time);
        actors.update(alpha, time, view?.yaw ?? 0);
        effects.update(time, view?.yaw ?? 0);
        weapon.update(view, time, frameDt);
      },
    });
  },
});
