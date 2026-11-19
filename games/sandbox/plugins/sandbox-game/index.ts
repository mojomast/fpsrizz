import { CharacterController, CharacterMove, CharacterState, ExperienceRole, Input, PhysicsCollider, PhysicsCollision, Renderable, RigidBody, Transform3D, definePlugin, quatFromEuler, readAxis, registerStandardControls, spawnGltfScene, transform3d } from '@bulkhead/sdk';
import type { EntityId, SessionContext } from '@bulkhead/sdk';
import { DISPLAY_MODEL, LEVEL_MODEL, Sandbox, SandboxGoal } from '../../contracts/sandbox.ts';

export const ACTIONS = { forward: 'sandbox/forward', back: 'sandbox/back', left: 'sandbox/left', right: 'sandbox/right', jump: 'sandbox/jump', move: 'sandbox/move' } as const;
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
      controls: [['WASD / arrows / left stick / touch stick', 'Walk'], ['Space / pad A / touch A', 'Jump']],
    });
    // Keyboard + gamepad + touch default map (rebindable from the pause menu); ids match ACTIONS.
    registerStandardControls(ctx, 'sandbox');
  },
  async activate(ctx) {
    solid(ctx, { x: 0, y: -0.5, z: 0 }, { x: 30, y: 1, z: 30 }, 0x4a5a4a, 'fixed');
    for (const [x, z, w, d] of [[0, -15, 30, 1], [0, 15, 30, 1], [-15, 0, 1, 30], [15, 0, 1, 30]] as const) solid(ctx, { x, y: 1, z }, { x: w, y: 2, z: d }, 0x6b6f78, 'fixed');
    const crates: EntityId[] = [];
    for (let layer = 0; layer < 4; layer++) for (let i = 0; i < 4 - layer; i++) crates.push(solid(ctx, { x: -1.6 + layer * 0.55 + i * 1.1, y: 0.55 + layer * 1.05, z: -5 }, { x: 1, y: 1, z: 1 }, [0xc08040, 0xb07038, 0xd09050][(i + layer) % 3]!, 'dynamic'));

    // 160 decorative pebbles (no physics): one InstancedMesh draw call per colour via Renderable.instanced (P1.8).
    for (let i = 0; i < 160; i++) {
      const x = ctx.rng.range(-13.5, 13.5), z = ctx.rng.range(-13.5, 13.5);
      if (Math.abs(x) < 3 && Math.abs(z - 4) < 3) continue; // keep the spawn clear
      const pebble = ctx.world.create();
      ctx.world.add(pebble, Transform3D, transform3d({ position: { x, y: 0.04, z }, yaw: ctx.rng.range(0, Math.PI), scale: ctx.rng.range(0.6, 1.4) }));
      ctx.world.add(pebble, Renderable, { shape: 'box', size: { x: 0.18, y: 0.08, z: 0.14 }, color: i % 2 ? 0x8a8478 : 0x6f6a60, instanced: true });
    }

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

    // A rotating display model (Renderable.model, drawn by std/render-sync through std/assets).
    const display = ctx.world.create();
    ctx.world.add(display, Transform3D, transform3d({ position: { x: -3, y: 1.3, z: 7 }, scale: 2.5 }));
    ctx.world.add(display, Renderable, { model: DISPLAY_MODEL });
    solid(ctx, { x: -3, y: 0.4, z: 7 }, { x: 1, y: 0.8, z: 1 }, 0x8a8f99, 'fixed');

    const state = { hero, crates, pad, padEntries: 0, onPad: false, goal: undefined as EntityId | undefined, goalEntries: 0, props: new Map<string, EntityId>() };
    ctx.services.provide(Sandbox, state);
    // The level corner authored as glTF: node custom properties become bodies, colliders and sandbox components.
    // Preloaded (manifest "preload"), so this resolves without a network round trip.
    const level = await spawnGltfScene(ctx, LEVEL_MODEL);
    state.props = level.byName;
    state.goal = ctx.world.query({ with: [SandboxGoal] }).ids()[0];
    if (level.unknownExtras.length) ctx.log.warn(`unmapped level properties: ${level.unknownExtras.join(', ')}`);
    ctx.events.on(PhysicsCollision, (c) => {
      if (c.sensor && c.started && state.goal !== undefined && ((c.a === hero && c.b === state.goal) || (c.b === hero && c.a === state.goal))) state.goalEntries++;
    });
    ctx.events.on(PhysicsCollision, (c) => {
      if (!c.sensor || !((c.a === hero && c.b === pad) || (c.a === pad && c.b === hero))) return;
      state.onPad = c.started;
      if (c.started) state.padEntries++;
      ctx.world.add(pad, Renderable, { shape: 'box', size: { x: 2, y: 0.1, z: 2 }, color: c.started ? 0x7fffd4 : 0x2f8f9f });
    });

    ctx.systems.add({ id: 'sandbox/display-spin', phase: 'world', update: () => {
      ctx.world.get(display, Transform3D)!.rotation = quatFromEuler(ctx.time.now * 0.8);
    } });

    let vy = 0;
    // Run snapshots (quicksave, replays): everything not held in components. Entity ids survive a restore.
    ctx.persist({
      save: () => ({ vy, padEntries: state.padEntries, goalEntries: state.goalEntries, onPad: state.onPad }),
      load: (data) => {
        const d = data as { vy: number; padEntries: number; goalEntries: number; onPad: boolean };
        vy = d.vy; state.padEntries = d.padEntries; state.goalEntries = d.goalEntries; state.onPad = d.onPad;
      },
    });
    ctx.systems.add({
      id: 'sandbox/hero-control', phase: 'control', update: (dt) => {
        const input = ctx.services.tryGet(Input)?.tick;
        // One axis for keys, D-pad, gamepad stick and touch stick (analog magnitude scales the speed).
        const { x: ix, y: iz } = input ? readAxis(input, ACTIONS.move) : { x: 0, y: 0 };
        const grounded = ctx.world.get(hero, CharacterState)?.grounded ?? false;
        if (grounded && vy <= 0) vy = input?.pressed(ACTIONS.jump) ? JUMP : -1;
        else vy += GRAVITY * dt;
        const move = ctx.world.get(hero, CharacterMove)!;
        move.desired = { x: ix * SPEED * dt, y: vy * dt, z: iz * SPEED * dt };
        if (ix || iz) ctx.world.get(hero, Transform3D)!.rotation = quatFromEuler(Math.atan2(-ix, -iz));
      },
    });
  },
});
