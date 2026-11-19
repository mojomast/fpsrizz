// __TITLE__: a first-person target range. Rules and presentation live in one plugin; split them as the game grows.
import {
  CharacterController, CharacterMove, CharacterState, ExperienceRole, Flow, Input, InputActions, Physics, PhysicsCollider, Renderable, RigidBody,
  Settings, Transform3D, Ui, defineComponent, definePlugin, defineService, quatFromEuler, readAxis, registerStandardControls, transform3d, worldPose,
} from '../../../../../src/sdk/index.ts';
import type { EntityId, Vec3 } from '../../../../../src/sdk/index.ts';
import { Render, THREE } from '../../../../../src/sdk/render.ts';

const NS = '__NS__';
const SPEED = 5, JUMP = 5, GRAVITY = -18, EYE = 0.7, RANGE = 60;
export const Target = defineComponent<{ points: number }>(`${NS}/target`);
export interface GameState { player: EntityId; yaw: number; pitch: number; targets: number; hits: number; shots: number; won: boolean }
export const Game = defineService<GameState>(`${NS}/state`);

/** View direction for yaw/pitch (yaw 0 looks down -Z, like Three.js cameras). */
export const viewDir = (yaw: number, pitch: number): Vec3 => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, `${NS}/game`, {
      name: '__TITLE__', description: 'Shoot every target.', pointer: 'locked',
      controls: [['Mouse / right stick', 'Look'], ['WASD / left stick', 'Move'], ['Left click / RT / touch C', 'Fire'], ['Space', 'Jump']],
    });
    registerStandardControls(ctx, NS);
    ctx.register(InputActions, `${NS}/fire`, { label: 'Fire', keys: ['Mouse0', 'GamepadRT', 'TouchC'] });
  },
  activate(ctx) {
    const solid = (pos: Vec3, size: Vec3, color: number): EntityId => {
      const e = ctx.world.create();
      ctx.world.add(e, Transform3D, transform3d({ position: pos }));
      ctx.world.add(e, RigidBody, { type: 'fixed' });
      ctx.world.add(e, PhysicsCollider, { shape: 'box', size });
      ctx.world.add(e, Renderable, { shape: 'box', size, color });
      return e;
    };
    solid({ x: 0, y: -0.5, z: 0 }, { x: 40, y: 1, z: 40 }, 0x505a50);
    for (const [x, z, w, d] of [[0, -20, 40, 1], [0, 20, 40, 1], [-20, 0, 1, 40], [20, 0, 1, 40]] as const) solid({ x, y: 2, z }, { x: w, y: 4, z: d }, 0x707880);
    // Cover crates, kept out of the central lane so the first target stays visible from the spawn.
    for (let i = 0; i < 6; i++) solid({ x: (ctx.rng.next() < 0.5 ? -1 : 1) * ctx.rng.range(3, 14), y: 1, z: ctx.rng.range(-14, 6) }, { x: 2, y: 2, z: 2 }, 0x8a7a66);
    // Targets: the first one is straight ahead of the spawn; the rest are seeded.
    const target = (pos: Vec3): void => { const t = solid(pos, { x: 0.8, y: 0.8, z: 0.8 }, 0xe05050); ctx.world.add(t, Target, { points: 100 }); };
    target({ x: 0, y: 1.6, z: -6 });
    for (let i = 0; i < 7; i++) target({ x: ctx.rng.range(-17, 17), y: ctx.rng.range(0.8, 3.5), z: ctx.rng.range(-17, -4) });

    const player = ctx.world.create();
    ctx.world.add(player, Transform3D, transform3d({ position: { x: 0, y: 0.9, z: 8 } }));
    ctx.world.add(player, RigidBody, { type: 'kinematic' });
    ctx.world.add(player, PhysicsCollider, { shape: 'capsule', size: { x: 0.6, y: 1.8, z: 0.6 } });
    ctx.world.add(player, CharacterController, { autostep: { maxHeight: 0.3, minWidth: 0.2 } });
    ctx.world.add(player, CharacterMove, { desired: { x: 0, y: 0, z: 0 } });

    const state: GameState = { player, yaw: 0, pitch: 0, targets: 8, hits: 0, shots: 0, won: false };
    ctx.services.provide(Game, state);
    let vy = 0;
    ctx.persist({ save: () => ({ vy, yaw: state.yaw, pitch: state.pitch, hits: state.hits, shots: state.shots, won: state.won }), load: (d) => { Object.assign(state, d); vy = (d as { vy: number }).vy; } });

    ctx.systems.add({ id: `${NS}/player`, phase: 'control', update: (dt) => {
      const input = ctx.services.tryGet(Input)?.tick;
      if (!input) return;
      const sens = ctx.services.tryGet(Settings)?.lookSensitivity ?? 0.0025;
      const stick = readAxis(input, `${NS}/look`);
      state.yaw -= input.lookX * sens + stick.x * 3 * dt;
      state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch - input.lookY * sens - stick.y * 3 * dt));
      const { x, y } = readAxis(input, `${NS}/move`);
      const s = Math.sin(state.yaw), c = Math.cos(state.yaw);
      const grounded = ctx.world.get(player, CharacterState)?.grounded ?? false;
      if (grounded && vy <= 0) vy = input.pressed(`${NS}/jump`) ? JUMP : -1; else vy += GRAVITY * dt;
      // Forward (y = -1) is -Z rotated by yaw; strafe (x) is +X rotated by yaw.
      ctx.world.get(player, CharacterMove)!.desired = { x: (x * c + y * s) * SPEED * dt, y: vy * dt, z: (-x * s + y * c) * SPEED * dt };
      ctx.world.get(player, Transform3D)!.rotation = quatFromEuler(state.yaw);
      if (!input.pressed(`${NS}/fire`) || state.won) return;
      state.shots++;
      const p = ctx.world.get(player, Transform3D)!.position;
      const hit = ctx.services.get(Physics).raycast({ x: p.x, y: p.y + EYE, z: p.z }, viewDir(state.yaw, state.pitch), RANGE, { exclude: player });
      if (hit && ctx.world.has(hit.entity, Target)) {
        ctx.world.destroy(hit.entity);
        if (++state.hits === state.targets) {
          state.won = true;
          ctx.services.tryGet(Flow)?.end({ outcome: 'victory', title: 'Range cleared', detail: `${state.targets} targets.`, stats: [['Accuracy', `${Math.round((100 * state.hits) / state.shots)}%`], ['Time', `${ctx.time.now.toFixed(1)} s`]] });
        }
      }
    } });

    // ---- presentation (skipped headless) ----
    const ui = ctx.services.tryGet(Ui);
    if (ui) {
      ui.addStyles(ctx, `.${NS.replace(/\W/g, '-')}-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px #0008}`);
      ui.mount(ctx, 'hud', `${NS.replace(/\W/g, '-')}-cross`);
      const hud = ui.mount(ctx, 'hud');
      hud.style.cssText = 'position:absolute;left:16px;top:12px;font:600 18px system-ui;color:#fff;text-shadow:0 1px 3px #000';
      ctx.systems.addFrame({ id: `${NS}/hud`, order: 300, update: () => { hud.textContent = `Targets ${state.hits}/${state.targets}`; } });
    }
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    render.setEnvironment({ background: 0x9db8d0, fog: { color: 0x9db8d0, near: 20, far: 70 } });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xeef4ff, 0x404040, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-8, 14, 6); root.add(sun);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 200);
    camera.rotation.order = 'YXZ';
    render.setWorldCamera(ctx, camera);
    ctx.systems.addFrame({ id: `${NS}/camera`, order: 200, update(alpha) {
      const p = worldPose(ctx.world, player, alpha)?.position;
      if (!p) return;
      camera.position.set(p.x, p.y + EYE, p.z);
      camera.rotation.set(state.pitch, state.yaw, 0);
    } });
  },
});
