// __TITLE__: a side-on platformer. Rules and presentation live in one plugin; split them as the game grows.
import {
  CharacterController, CharacterMove, CharacterState, ExperienceRole, Flow, Input, PhysicsCollider, PhysicsCollision, Renderable, RigidBody,
  Physics, Transform3D, Ui, defineComponent, definePlugin, defineService, readAxis, registerStandardControls, transform3d, worldPose,
} from '@bulkhead/sdk';
import type { EntityId, SessionContext, Vec3 } from '@bulkhead/sdk';
import { Render, THREE } from '@bulkhead/sdk/render.ts';

const NS = '__NS__';
const SPEED = 6, JUMP = 8, GRAVITY = -22, SPAWN: Vec3 = { x: 0, y: 1.2, z: 0 };
/** A collectible: sensors with this component count towards the goal. */
export const Coin = defineComponent<{ value: number }>(`${NS}/coin`);
export interface GameState { hero: EntityId; coins: number; collected: number; falls: number; won: boolean }
export const Game = defineService<GameState>(`${NS}/state`);

/** Level layout: [x, y, width] platforms (1 m thick, 3 m deep) and coin positions. Edit freely. */
const PLATFORMS: [number, number, number][] = [[0, -0.5, 14], [10, 1.5, 4], [16, 3, 4], [23, 2, 6], [31, 4, 4], [38, 0.5, 8]];
const COINS: [number, number][] = [[4, 0.8], [10, 2.8], [16, 4.3], [23, 3.3], [31, 5.3], [40, 1.8]];

function solid(ctx: SessionContext, pos: Vec3, size: Vec3, color: number): EntityId {
  const e = ctx.world.create();
  ctx.world.add(e, Transform3D, transform3d({ position: pos }));
  ctx.world.add(e, RigidBody, { type: 'fixed' });
  ctx.world.add(e, PhysicsCollider, { shape: 'box', size });
  ctx.world.add(e, Renderable, { shape: 'box', size, color });
  return e;
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, `${NS}/game`, {
      name: '__TITLE__', description: 'Run, jump and collect every coin.', pointer: 'free',
      controls: [['A / D, arrows, left stick', 'Run'], ['Space / pad A / touch A', 'Jump']],
    });
    registerStandardControls(ctx, NS); // `${NS}/move` axis, `${NS}/jump`, ... (rebindable in the pause menu)
  },
  activate(ctx) {
    for (const [x, y, w] of PLATFORMS) solid(ctx, { x, y, z: 0 }, { x: w, y: 1, z: 3 }, 0x5d7052);
    for (const [x, y] of COINS) {
      const c = ctx.world.create();
      ctx.world.add(c, Transform3D, transform3d({ position: { x, y, z: 0 } }));
      ctx.world.add(c, RigidBody, { type: 'fixed' });
      ctx.world.add(c, PhysicsCollider, { shape: 'ball', size: { x: 0.6, y: 0.6, z: 0.6 }, sensor: true });
      ctx.world.add(c, Renderable, { shape: 'sphere', size: { x: 0.5, y: 0.5, z: 0.5 }, color: 0xffcc33 });
      ctx.world.add(c, Coin, { value: 1 });
    }
    const hero = ctx.world.create();
    ctx.world.add(hero, Transform3D, transform3d({ position: SPAWN }));
    ctx.world.add(hero, RigidBody, { type: 'kinematic' });
    ctx.world.add(hero, PhysicsCollider, { shape: 'capsule', size: { x: 0.6, y: 1.6, z: 0.6 } });
    ctx.world.add(hero, CharacterController, { autostep: { maxHeight: 0.3, minWidth: 0.2 } });
    ctx.world.add(hero, CharacterMove, { desired: { x: 0, y: 0, z: 0 } });
    ctx.world.add(hero, Renderable, { shape: 'capsule', size: { x: 0.6, y: 1.6, z: 0.6 }, color: 0xe8d8a0 });

    const state: GameState = { hero, coins: COINS.length, collected: 0, falls: 0, won: false };
    ctx.services.provide(Game, state);
    let vy = 0;
    // SDK 3 rule: state outside components goes through persist (quicksave F6/F9, replays).
    ctx.persist({ save: () => ({ vy, collected: state.collected, falls: state.falls, won: state.won }), load: (d) => { Object.assign(state, d); vy = (d as { vy: number }).vy; } });

    ctx.events.on(PhysicsCollision, (c) => {
      if (!c.sensor || !c.started) return;
      const other = c.a === hero ? c.b : c.b === hero ? c.a : undefined;
      if (other === undefined || !ctx.world.has(other, Coin)) return;
      ctx.world.destroy(other);
      state.collected++;
      if (state.collected === state.coins && !state.won) {
        state.won = true;
        ctx.services.tryGet(Flow)?.end({ outcome: 'victory', title: 'All coins!', detail: `Collected ${state.coins} coins.`, stats: [['Falls', String(state.falls)], ['Time', `${ctx.time.now.toFixed(1)} s`]] });
      }
    });

    ctx.systems.add({ id: `${NS}/hero`, phase: 'control', update: (dt) => {
      const input = ctx.services.tryGet(Input)?.tick;
      const ix = input ? readAxis(input, `${NS}/move`).x : 0;
      const grounded = ctx.world.get(hero, CharacterState)?.grounded ?? false;
      if (grounded && vy <= 0) vy = input?.pressed(`${NS}/jump`) ? JUMP : -1;
      else vy += GRAVITY * dt;
      ctx.world.get(hero, CharacterMove)!.desired = { x: ix * SPEED * dt, y: vy * dt, z: 0 };
      // Fell off: back to the start. teleport() also resets the interpolation so the camera does not smear.
      if (ctx.world.get(hero, Transform3D)!.position.y < -12) {
        state.falls++; vy = 0;
        ctx.services.get(Physics).teleport(hero, SPAWN);
      }
    } });

    // ---- presentation (skipped headless) ----
    const ui = ctx.services.tryGet(Ui);
    if (ui) {
      const hud = ui.mount(ctx, 'hud', `${NS.replace(/\W/g, '-')}-hud`);
      hud.style.cssText = 'position:absolute;left:16px;top:12px;font:600 18px system-ui;color:#fff;text-shadow:0 1px 3px #000';
      ctx.systems.addFrame({ id: `${NS}/hud`, order: 300, update: () => { hud.textContent = `Coins ${state.collected}/${state.coins}`; } });
    }
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    render.setEnvironment({ background: 0x8ec5f0, fog: { color: 0x8ec5f0, near: 30, far: 90 } });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xe8f4ff, 0x405030, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.2); sun.position.set(-5, 12, 8); root.add(sun);
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    render.setWorldCamera(ctx, camera);
    ctx.systems.addFrame({ id: `${NS}/camera`, order: 200, update(alpha) {
      const p = worldPose(ctx.world, hero, alpha)?.position;
      if (!p) return;
      camera.position.set(p.x + 2, p.y + 2.5, 13);
      camera.lookAt(p.x + 2, p.y + 1, 0);
    } });
  },
});
