import RAPIER from '@dimforge/rapier3d-compat';
import { CharacterController, CharacterMove, CharacterState, Physics, PhysicsCollider, PhysicsCollision, PrevTransform, RigidBody, Transform3D, definePlugin } from '../../sdk/index.ts';
import type { EntityId, PhysicsService, PhysicsRayHit, Vec3 } from '../../sdk/index.ts';

let ready: Promise<void> | undefined;
/** Rapier's WASM is embedded in the compat build; init once per page/process. */
const initRapier = (): Promise<void> => (ready ??= RAPIER.init());

interface Body {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  controller?: RAPIER.KinematicCharacterController;
  key: string;
  type: RigidBody['type'];
}

const keyOf = (rb: RigidBody, col: PhysicsCollider, cc: CharacterController | undefined): string => JSON.stringify([rb, col, cc ?? null]);
const v3 = (v: { x: number; y: number; z: number }): Vec3 => ({ x: v.x, y: v.y, z: v.z });

function colliderDesc(c: PhysicsCollider): RAPIER.ColliderDesc {
  const s = { x: 1, y: 1, z: 1, ...c.size };
  let d: RAPIER.ColliderDesc;
  switch (c.shape) {
    case 'ball': d = RAPIER.ColliderDesc.ball(s.x / 2); break;
    case 'capsule': d = RAPIER.ColliderDesc.capsule(Math.max(0, s.y - s.x) / 2, s.x / 2); break;
    case 'cylinder': d = RAPIER.ColliderDesc.cylinder(s.y / 2, s.x / 2); break;
    default: d = RAPIER.ColliderDesc.cuboid(s.x / 2, s.y / 2, s.z / 2);
  }
  if (c.offset) d.setTranslation(c.offset.x, c.offset.y, c.offset.z);
  if (c.friction !== undefined) d.setFriction(c.friction);
  if (c.restitution !== undefined) d.setRestitution(c.restitution);
  if (c.density !== undefined) d.setDensity(c.density);
  d.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  if (c.sensor) { d.setSensor(true); d.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL); }
  return d;
}

export default definePlugin({
  async activate(ctx) {
    await initRapier();
    const world = new RAPIER.World({ x: 0, y: Number(ctx.config.gravityY ?? -9.81), z: 0 });
    world.timestep = ctx.time.step;
    const queue = new RAPIER.EventQueue(true);
    const bodies = new Map<EntityId, Body>();
    const byCollider = new Map<number, EntityId>();
    const simulated = ctx.world.query({ with: [Transform3D, RigidBody, PhysicsCollider] });
    // Bodies created by plugins that activated earlier: queries report no backlog, so build them on the first sync.
    let initial: EntityId[] | undefined = simulated.ids();
    ctx.scope.add(() => { bodies.clear(); byCollider.clear(); queue.free(); world.free(); }, 'rapier-world');

    const drop = (e: EntityId): void => {
      const b = bodies.get(e);
      if (!b) return;
      bodies.delete(e);
      byCollider.delete(b.collider.handle);
      if (b.controller) world.removeCharacterController(b.controller);
      world.removeRigidBody(b.body);
    };
    const build = (e: EntityId): void => {
      const t = ctx.world.get(e, Transform3D)!, rb = ctx.world.get(e, RigidBody)!, col = ctx.world.get(e, PhysicsCollider)!, cc = ctx.world.get(e, CharacterController);
      if (t.parent !== undefined) ctx.log.warn(`entity ${e}: physics bodies must be root entities; its parent is ignored`);
      const desc = rb.type === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic() : rb.type === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.kinematicPositionBased();
      desc.setTranslation(t.position.x, t.position.y, t.position.z).setRotation(t.rotation);
      if (rb.linvel) desc.setLinvel(rb.linvel.x, rb.linvel.y, rb.linvel.z);
      if (rb.linearDamping !== undefined) desc.setLinearDamping(rb.linearDamping);
      if (rb.angularDamping !== undefined) desc.setAngularDamping(rb.angularDamping);
      if (rb.gravityScale !== undefined) desc.setGravityScale(rb.gravityScale);
      if (rb.ccd) desc.setCcdEnabled(true);
      if (rb.lockRotations) desc.lockRotations();
      const body = world.createRigidBody(desc);
      const collider = world.createCollider(colliderDesc(col), body);
      const entry: Body = { body, collider, key: keyOf(rb, col, cc), type: rb.type };
      if (cc) {
        if (rb.type !== 'kinematic') ctx.log.warn(`entity ${e}: CharacterController needs RigidBody { type: 'kinematic' }`);
        const controller = world.createCharacterController(cc.offset ?? 0.02);
        controller.setMaxSlopeClimbAngle(cc.maxSlopeClimb ?? Math.PI / 4);
        if (cc.autostep) controller.enableAutostep(cc.autostep.maxHeight, cc.autostep.minWidth, false);
        if (cc.snapToGround) controller.enableSnapToGround(cc.snapToGround);
        entry.controller = controller;
        if (!ctx.world.has(e, CharacterState)) ctx.world.add(e, CharacterState, { grounded: false, moved: { x: 0, y: 0, z: 0 } });
      }
      bodies.set(e, entry);
      byCollider.set(collider.handle, e);
    };

    // Rapier updates its broad phase (used by scene queries and the character controller) only inside step(). After
    // bodies are created or moved outside a step, a zero-length step refreshes it without advancing the simulation.
    let queriesStale = true;
    const refreshQueries = (): void => {
      if (!queriesStale) return;
      queriesStale = false;
      const dt = world.timestep;
      world.timestep = 0;
      world.step(queue);
      world.timestep = dt;
    };

    const sync = (): void => {
      const drained = simulated.drain();
      const { removed, changed } = drained;
      const added = [...drained.added];
      if (initial) { added.unshift(...initial.filter((e) => simulated.has(e) && !added.includes(e))); initial = undefined; }
      if (added.length || removed.length || changed.length) queriesStale = true;
      for (const e of removed) drop(e);
      for (const e of added) build(e);
      for (const e of changed) {
        const b = bodies.get(e);
        const key = keyOf(ctx.world.get(e, RigidBody)!, ctx.world.get(e, PhysicsCollider)!, ctx.world.get(e, CharacterController));
        if (!b || b.key !== key) { drop(e); build(e); continue; }
        if (b.type === 'fixed') { const t = ctx.world.get(e, Transform3D)!; b.body.setTranslation(t.position, false); b.body.setRotation(t.rotation, false); }
      }
    };

    const service: PhysicsService = {
      engine: `rapier3d-compat ${RAPIER.version()}`,
      get gravity() { return v3(world.gravity); },
      set gravity(g: Vec3) { world.gravity = { x: g.x, y: g.y, z: g.z }; },
      raycast(origin, direction, maxDistance, opts = {}): PhysicsRayHit | undefined {
        sync();
        refreshQueries();
        const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
        const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
        const exclude = opts.exclude === undefined ? undefined : bodies.get(opts.exclude)?.body;
        const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, dir), maxDistance, true, opts.sensors ? undefined : RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, exclude);
        if (!hit) return undefined;
        const entity = byCollider.get(hit.collider.handle);
        if (entity === undefined) return undefined;
        const d = hit.timeOfImpact;
        return { entity, distance: d, point: { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d }, normal: v3(hit.normal) };
      },
      applyImpulse: (e, i) => bodies.get(e)?.body.applyImpulse(i, true),
      setLinearVelocity: (e, v) => bodies.get(e)?.body.setLinvel(v, true),
      linearVelocity: (e) => { const b = bodies.get(e); return b ? v3(b.body.linvel()) : undefined; },
      teleport(e, p) {
        const b = bodies.get(e), t = ctx.world.get(e, Transform3D);
        if (!t) return;
        t.position = { ...p };
        const prev = ctx.world.get(e, PrevTransform);
        if (prev) prev.position = { ...p };
        if (b) { b.body.setTranslation(p, true); if (b.type === 'kinematic') b.body.setNextKinematicTranslation(p); queriesStale = true; }
      },
      stats: () => ({ bodies: world.bodies.len(), colliders: world.colliders.len() }),
    };
    ctx.services.provide(Physics, service);

    ctx.systems.add({
      id: 'std/physics-rapier.step',
      phase: 'movement',
      order: 1000,
      update: () => {
        sync();
        refreshQueries();
        for (const [e, b] of bodies) {
          if (b.type !== 'kinematic') continue;
          const t = ctx.world.get(e, Transform3D)!;
          if (b.controller) {
            const move = ctx.world.get(e, CharacterMove);
            const desired = move?.desired ?? { x: 0, y: 0, z: 0 };
            b.controller.computeColliderMovement(b.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
            const m = b.controller.computedMovement(), cur = b.body.translation();
            b.body.setNextKinematicTranslation({ x: cur.x + m.x, y: cur.y + m.y, z: cur.z + m.z });
            const state = ctx.world.get(e, CharacterState);
            if (state) { state.grounded = b.controller.computedGrounded(); state.moved = v3(m); }
            if (move) move.desired = { x: 0, y: 0, z: 0 };
          } else {
            b.body.setNextKinematicTranslation(t.position);
            b.body.setNextKinematicRotation(t.rotation);
          }
        }
        world.step(queue);
        queriesStale = false;
        for (const [e, b] of bodies) {
          if (b.type === 'fixed') continue;
          if (b.type === 'kinematic' && !b.controller) continue;
          const t = ctx.world.get(e, Transform3D)!;
          const p = b.body.translation(), r = b.body.rotation();
          t.position.x = p.x; t.position.y = p.y; t.position.z = p.z;
          t.rotation.x = r.x; t.rotation.y = r.y; t.rotation.z = r.z; t.rotation.w = r.w;
        }
        queue.drainCollisionEvents((h1, h2, started) => {
          const a = byCollider.get(h1), b = byCollider.get(h2);
          if (a === undefined || b === undefined) return;
          const sensor = (bodies.get(a)?.collider.isSensor() ?? false) || (bodies.get(b)?.collider.isSensor() ?? false);
          ctx.events.emit(PhysicsCollision, { a, b, started, sensor });
        });
      },
    });
  },
});
