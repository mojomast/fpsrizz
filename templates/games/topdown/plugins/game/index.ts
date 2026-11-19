// __TITLE__: a top-down arena. Rules and presentation live in one plugin; split them as the game grows.
import {
  CharacterController, CharacterMove, ExperienceRole, Flow, Input, Physics, PhysicsCollider, PhysicsCollision, Renderable, RigidBody,
  Transform3D, Ui, defineComponent, definePlugin, defineService, quatFromEuler, readAxis, registerStandardControls, transform3d, worldPose,
} from '../../../../../src/sdk/index.ts';
import type { EntityId, SessionContext, Vec3 } from '../../../../../src/sdk/index.ts';
import { Render, THREE } from '../../../../../src/sdk/render.ts';

const NS = '__NS__';
const SPEED = 6, ARENA = 12, SPAWN: Vec3 = { x: 0, y: 0.9, z: 0 };
export const Gem = defineComponent<{ value: number }>(`${NS}/gem`);
/** Patrols between `from` and `to` (seconds per leg = `period`). Touching it costs a life. */
export const Hazard = defineComponent<{ from: Vec3; to: Vec3; period: number }>(`${NS}/hazard`);
export interface GameState { hero: EntityId; gems: number; collected: number; lives: number; over: boolean }
export const Game = defineService<GameState>(`${NS}/state`);

function body(ctx: SessionContext, pos: Vec3, size: Vec3, color: number, type: 'fixed' | 'kinematic', sensor = false): EntityId {
  const e = ctx.world.create();
  ctx.world.add(e, Transform3D, transform3d({ position: pos }));
  ctx.world.add(e, RigidBody, { type });
  ctx.world.add(e, PhysicsCollider, { shape: 'box', size, sensor });
  ctx.world.add(e, Renderable, { shape: 'box', size, color });
  return e;
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, `${NS}/game`, {
      name: '__TITLE__', description: 'Collect every gem; dodge the red hazards.', pointer: 'free',
      controls: [['WASD / arrows / left stick / touch stick', 'Move']],
    });
    registerStandardControls(ctx, NS);
  },
  activate(ctx) {
    body(ctx, { x: 0, y: -0.5, z: 0 }, { x: ARENA * 2, y: 1, z: ARENA * 2 }, 0x3f4a55, 'fixed');
    for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, 1], [0, ARENA, ARENA * 2, 1], [-ARENA, 0, 1, ARENA * 2], [ARENA, 0, 1, ARENA * 2]] as const) body(ctx, { x, y: 0.5, z }, { x: w, y: 1, z: d }, 0x6b7380, 'fixed');
    // Gems: the first one is right of the spawn; the rest come from the seeded RNG (same seed = same layout).
    const gemAt = (x: number, z: number): void => {
      const g = body(ctx, { x, y: 0.5, z }, { x: 0.5, y: 0.5, z: 0.5 }, 0x40e0d0, 'fixed', true);
      ctx.world.add(g, Gem, { value: 1 });
      ctx.world.get(g, Transform3D)!.rotation = quatFromEuler(Math.PI / 4);
    };
    gemAt(3, 0);
    for (let i = 0; i < 7; i++) gemAt(ctx.rng.range(-ARENA + 2, ARENA - 2), ctx.rng.range(-ARENA + 2, ARENA - 2));
    for (let i = 0; i < 3; i++) {
      const z = -8 + i * 8;
      const h = body(ctx, { x: -8, y: 0.5, z }, { x: 1, y: 1, z: 1 }, 0xe04040, 'kinematic', true);
      ctx.world.add(h, Hazard, { from: { x: -8, y: 0.5, z }, to: { x: 8, y: 0.5, z }, period: 3 + i });
    }
    const hero = ctx.world.create();
    ctx.world.add(hero, Transform3D, transform3d({ position: SPAWN }));
    ctx.world.add(hero, RigidBody, { type: 'kinematic' });
    ctx.world.add(hero, PhysicsCollider, { shape: 'capsule', size: { x: 0.7, y: 1.6, z: 0.7 } });
    ctx.world.add(hero, CharacterController, {});
    ctx.world.add(hero, CharacterMove, { desired: { x: 0, y: 0, z: 0 } });
    ctx.world.add(hero, Renderable, { shape: 'capsule', size: { x: 0.7, y: 1.6, z: 0.7 }, color: 0xf0e0b0 });

    const state: GameState = { hero, gems: 8, collected: 0, lives: 3, over: false };
    ctx.services.provide(Game, state);
    ctx.persist({ save: () => ({ collected: state.collected, lives: state.lives, over: state.over }), load: (d) => { Object.assign(state, d); } });
    const end = (victory: boolean): void => {
      if (state.over) return;
      state.over = true;
      ctx.services.tryGet(Flow)?.end(victory
        ? { outcome: 'victory', title: 'Arena cleared', detail: 'Every gem collected.', stats: [['Lives left', String(state.lives)]] }
        : { outcome: 'defeat', title: 'Out of lives', detail: `${state.collected}/${state.gems} gems.`, stats: [] });
    };
    ctx.events.on(PhysicsCollision, (c) => {
      if (!c.sensor || !c.started || state.over) return;
      const other = c.a === hero ? c.b : c.b === hero ? c.a : undefined;
      if (other === undefined) return;
      if (ctx.world.has(other, Gem)) { ctx.world.destroy(other); if (++state.collected === state.gems) end(true); }
      else if (ctx.world.has(other, Hazard)) {
        ctx.services.get(Physics).teleport(hero, SPAWN);
        if (--state.lives <= 0) end(false);
      }
    });
    ctx.systems.add({ id: `${NS}/hazards`, phase: 'world', update: () => {
      ctx.world.each(Hazard, (e, h) => {
        const k = (Math.sin((ctx.time.now / h.period) * Math.PI) + 1) / 2; // smooth back-and-forth
        const t = ctx.world.get(e, Transform3D)!;
        t.position = { x: h.from.x + (h.to.x - h.from.x) * k, y: h.from.y, z: h.from.z + (h.to.z - h.from.z) * k };
      });
    } });
    ctx.systems.add({ id: `${NS}/hero`, phase: 'control', update: (dt) => {
      const input = ctx.services.tryGet(Input)?.tick;
      const { x, y } = input ? readAxis(input, `${NS}/move`) : { x: 0, y: 0 };
      ctx.world.get(hero, CharacterMove)!.desired = { x: x * SPEED * dt, y: -2 * dt, z: y * SPEED * dt };
      if (x || y) ctx.world.get(hero, Transform3D)!.rotation = quatFromEuler(Math.atan2(-x, -y));
    } });

    // ---- presentation (skipped headless) ----
    const ui = ctx.services.tryGet(Ui);
    if (ui) {
      const hud = ui.mount(ctx, 'hud');
      hud.style.cssText = 'position:absolute;left:16px;top:12px;font:600 18px system-ui;color:#fff;text-shadow:0 1px 3px #000';
      ctx.systems.addFrame({ id: `${NS}/hud`, order: 300, update: () => { hud.textContent = `Gems ${state.collected}/${state.gems} · Lives ${state.lives}`; } });
    }
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    render.setEnvironment({ background: 0x1d232b, fog: null });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xdfe8ff, 0x202830, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-6, 14, 4); root.add(sun);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    render.setWorldCamera(ctx, camera);
    ctx.systems.addFrame({ id: `${NS}/camera`, order: 200, update(alpha) {
      const p = worldPose(ctx.world, hero, alpha)?.position;
      if (!p) return;
      camera.position.set(p.x, 18, p.z + 9);
      camera.lookAt(p.x, 0, p.z);
    } });
  },
});
