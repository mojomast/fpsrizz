import { NavAgent, NavAgentState, Renderable, Transform3D, definePlugin, transform3d } from '@bulkhead/sdk';
import type { EntityId } from '@bulkhead/sdk';
import { Sandbox, SandboxNav } from '../../contracts/sandbox.ts';

/** Breadcrumbs shown along the follower's remaining path (pooled; unused ones hide below the floor). */
const CRUMBS = 24;

export default definePlugin({
  activate(ctx) {
    const sandbox = ctx.services.get(Sandbox);
    const follower = ctx.world.create();
    ctx.world.add(follower, Transform3D, transform3d({ position: { x: 9, y: 0, z: 9 } }));
    // The navmesh point is at floor level; the visible capsule is a child lifted by half its height.
    const body = ctx.world.create();
    ctx.world.add(body, Transform3D, transform3d({ position: { y: 0.7 }, parent: follower }));
    ctx.world.add(body, Renderable, { shape: 'capsule', size: { x: 0.6, y: 1.4, z: 0.6 }, color: 0xd0503c });
    ctx.world.add(follower, NavAgent, { speed: 3.2, arriveDistance: 1.4, repathDistance: 0.6 });
    const crumbs: EntityId[] = [];
    for (let i = 0; i < CRUMBS; i++) {
      const c = ctx.world.create();
      ctx.world.add(c, Transform3D, transform3d({ position: { y: -5 } }));
      ctx.world.add(c, Renderable, { shape: 'sphere', size: { x: 0.18, y: 0.18, z: 0.18 }, color: 0xffcc33 });
      crumbs.push(c);
    }
    ctx.systems.add({
      id: 'sandbox/navmesh-follow', phase: 'control', update: () => {
        const hero = ctx.world.get(sandbox.hero, Transform3D)!.position;
        ctx.world.get(follower, NavAgent)!.target = { x: hero.x, y: hero.y - 0.9, z: hero.z };
      },
    });
    ctx.systems.add({
      id: 'sandbox/navmesh-crumbs', phase: 'presentation', update: () => {
        const st = ctx.world.get(follower, NavAgentState);
        const from = ctx.world.get(follower, Transform3D)!.position;
        const pts = [from, ...(st?.path ?? [])];
        // Evenly spaced dots along the polyline.
        const out: { x: number; y: number; z: number }[] = [];
        for (let i = 1; i < pts.length && out.length < CRUMBS; i++) {
          const a = pts[i - 1]!, b = pts[i]!;
          const n = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / 0.6));
          for (let k = 1; k <= n && out.length < CRUMBS; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n + 0.12, z: a.z + (b.z - a.z) * k / n });
        }
        crumbs.forEach((c, i) => { ctx.world.get(c, Transform3D)!.position = out[i] ?? { x: 0, y: -5, z: 0 }; });
      },
    });
    ctx.services.provide(SandboxNav, { follower });
  },
});
