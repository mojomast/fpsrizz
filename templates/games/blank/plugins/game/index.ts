// __TITLE__: the game's rules and presentation in one plugin. Split them (game + presentation plugins) as it grows.
import { ExperienceRole, Renderable, Transform3D, definePlugin, defineService, quatFromEuler, transform3d, worldPose } from '../../../../../src/sdk/index.ts';
import { Render, THREE } from '../../../../../src/sdk/render.ts';

const NS = '__NS__';
/** Read-only state for tests, tools and other plugins. */
export interface GameState { spinner: number; spins: number }
export const Game = defineService<GameState>(`${NS}/state`);

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, `${NS}/game`, { name: '__TITLE__', description: 'A blank SDK 3 scene.', pointer: 'free', controls: [] });
  },
  activate(ctx) {
    // Simulation: entities with a Transform3D + Renderable are drawn by std/render-sync (interpolated at 60 Hz).
    const ground = ctx.world.create();
    ctx.world.add(ground, Transform3D, transform3d({ position: { y: -0.05 } }));
    ctx.world.add(ground, Renderable, { shape: 'box', size: { x: 20, y: 0.1, z: 20 }, color: 0x4a5a4a });
    const spinner = ctx.world.create();
    ctx.world.add(spinner, Transform3D, transform3d({ position: { y: 1 } }));
    ctx.world.add(spinner, Renderable, { shape: 'box', size: { x: 1, y: 1, z: 1 }, color: 0xd08040 });
    const state: GameState = { spinner, spins: 0 };
    ctx.services.provide(Game, state);
    ctx.persist({ save: () => ({ spins: state.spins }), load: (d) => { state.spins = (d as { spins: number }).spins; } });
    ctx.systems.add({ id: `${NS}/spin`, phase: 'world', update: () => {
      ctx.world.get(spinner, Transform3D)!.rotation = quatFromEuler(ctx.time.now);
      state.spins = Math.floor(ctx.time.now / (Math.PI * 2));
    } });

    // Presentation (skipped in headless tests): lights and a camera.
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    render.setEnvironment({ background: 0x9fc4e0, fog: null });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xdfefff, 0x404830, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-4, 10, 6); root.add(sun);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    render.setWorldCamera(ctx, camera);
    ctx.systems.addFrame({ id: `${NS}/camera`, order: 200, update(alpha) {
      const p = worldPose(ctx.world, spinner, alpha)?.position;
      if (!p) return;
      camera.position.set(p.x + 4, p.y + 3, p.z + 6);
      camera.lookAt(p.x, p.y, p.z);
    } });
  },
});
