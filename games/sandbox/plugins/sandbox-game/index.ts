import { CharacterController, CharacterMove, CharacterState, ExperienceRole, Input, InputActions, PhysicsCollider, PhysicsCollision, Renderable, RigidBody, Transform3D, definePlugin, quatFromEuler, transform3d } from '../../../../src/sdk/index.ts';
import type { EntityId, SessionContext } from '../../../../src/sdk/index.ts';
import { Sandbox } from '../../contracts/sandbox.ts';

export const ACTIONS = { forward: 'sandbox/forward', back: 'sandbox/back', left: 'sandbox/left', right: 'sandbox/right', jump: 'sandbox/jump' } as const;
const SPEED = 5, JUMP = 5.5, GRAVITY = -9.81;

function solid(ctx: SessionContext, pos: { x: number; y: number; z: number }, size: { x: number; y: number; z: number }, color: number, type: 'fixed' | 'dynamic'): EntityId {
  const e = ctx.world.create();
  ctx.world.add(e, Transform3D, transform3d({ position: pos }));
  ctx.world.add(e, RigidBody, { type });
  ctx.world.add(e, PhysicsCollider, { shape: 'box', size, ...(type === 'dynamic' ? { density: 0.5, friction: 0.7 } : {}) });
  ctx.world.add(e, Renderable, { shape: 'box', size, color });
  return e;
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'sandbox/physics', {
      name: 'Physics sandbox', description: 'Walk around, shove a stack of crates and step on the glowing pad. Built only from SDK 3 components.', pointer: 'free',
      controls: [['WASD / arrows', 'Walk'], ['Space', 'Jump']],
    });
    ctx.register(InputActions, ACTIONS.forward, { label: 'Walk forward', keys: ['KeyW', 'ArrowUp'] });
    ctx.register(InputActions, ACTIONS.back, { label: 'Walk back', keys: ['KeyS', 'ArrowDown'] });
    ctx.register(InputActions, ACTIONS.left, { label: 'Walk left', keys: ['KeyA', 'ArrowLeft'] });
    ctx.register(InputActions, ACTIONS.right, { label: 'Walk right', keys: ['KeyD', 'ArrowRight'] });
    ctx.register(InputActions, ACTIONS.jump, { label: 'Jump', keys: ['Space'] });
  },
  activate(ctx) {
    solid(ctx, { x: 0, y: -0.5, z: 0 }, { x: 30, y: 1, z: 30 }, 0x4a5a4a, 'fixed');
    for (const [x, z, w, d] of [[0, -15, 30, 1], [0, 15, 30, 1], [-15, 0, 1, 30], [15, 0, 1, 30]] as const) solid(ctx, { x, y: 1, z }, { x: w, y: 2, z: d }, 0x6b6f78, 'fixed');
    const crates: EntityId[] = [];
    for (let layer = 0; layer < 4; layer++) for (let i = 0; i < 4 - layer; i++) crates.push(solid(ctx, { x: -1.6 + layer * 0.55 + i * 1.1, y: 0.55 + layer * 1.05, z: -5 }, { x: 1, y: 1, z: 1 }, [0xc08040, 0xb07038, 0xd09050][(i + layer) % 3]!, 'dynamic'));

    const pad = ctx.world.create();
    ctx.world.add(pad, Transform3D, transform3d({ position: { x: 5, y: 0.05, z: 2 } }));
    ctx.world.add(pad, RigidBody, { type: 'fixed' });
    ctx.world.add(pad, PhysicsCollider, { shape: 'box', size: { x: 2, y: 1, z: 2 }, sensor: true });
    ctx.world.add(pad, Renderable, { shape: 'box', size: { x: 2, y: 0.1, z: 2 }, color: 0x2f8f9f });

    const hero = ctx.world.create();
    ctx.world.add(hero, Transform3D, transform3d({ position: { x: 0, y: 1.1, z: 4 } }));
    ctx.world.add(hero, RigidBody, { type: 'kinematic' });
    ctx.world.add(hero, PhysicsCollider, { shape: 'capsule', size: { x: 0.7, y: 1.8, z: 0.7 } });
    ctx.world.add(hero, CharacterController, { autostep: { maxHeight: 0.3, minWidth: 0.2 } });
    ctx.world.add(hero, CharacterMove, { desired: { x: 0, y: 0, z: 0 } });
    ctx.world.add(hero, Renderable, { shape: 'capsule', size: { x: 0.7, y: 1.8, z: 0.7 }, color: 0xe8d8a0 });

    const state = { hero, crates, pad, padEntries: 0, onPad: false };
    ctx.services.provide(Sandbox, state);
    ctx.events.on(PhysicsCollision, (c) => {
      if (!c.sensor || !((c.a === hero && c.b === pad) || (c.a === pad && c.b === hero))) return;
      state.onPad = c.started;
      if (c.started) state.padEntries++;
      ctx.world.add(pad, Renderable, { shape: 'box', size: { x: 2, y: 0.1, z: 2 }, color: c.started ? 0x7fffd4 : 0x2f8f9f });
    });

    let vy = 0;
    ctx.systems.add({
      id: 'sandbox/hero-control', phase: 'control', update: (dt) => {
        const input = ctx.services.tryGet(Input)?.tick;
        const ix = input ? Number(input.held(ACTIONS.right)) - Number(input.held(ACTIONS.left)) : 0;
        const iz = input ? Number(input.held(ACTIONS.back)) - Number(input.held(ACTIONS.forward)) : 0;
        const len = Math.hypot(ix, iz) || 1;
        const grounded = ctx.world.get(hero, CharacterState)?.grounded ?? false;
        if (grounded && vy <= 0) vy = input?.pressed(ACTIONS.jump) ? JUMP : -1;
        else vy += GRAVITY * dt;
        const move = ctx.world.get(hero, CharacterMove)!;
        move.desired = { x: (ix / len) * SPEED * dt, y: vy * dt, z: (iz / len) * SPEED * dt };
        if (ix || iz) ctx.world.get(hero, Transform3D)!.rotation = quatFromEuler(Math.atan2(-ix, -iz));
      },
    });
  },
});
