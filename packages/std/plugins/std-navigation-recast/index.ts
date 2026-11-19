import { init, NavMeshQuery, getNavMeshPositionsAndIndices } from 'recast-navigation';
import type { NavMesh as RecastNavMesh } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';
import { CharacterMove, NavAgent, NavAgentState, NavMesh, NavMeshBuilt, PhysicsCollider, Transform3D, debugDraw, definePlugin, navGeometryFromColliders, quatFromEuler } from '@bulkhead/sdk';
import type { NavGeometry, NavMeshInfo, NavMeshOptions, NavMeshService, Vec3 } from '@bulkhead/sdk';

let ready: Promise<void> | undefined;
/** The WASM is embedded in recast-navigation's compat build; init once per page/process. */
const initRecast = (): Promise<void> => (ready ??= init());

const v3 = (v: { x: number; y: number; z: number }): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const dist2 = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
const flatDist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

function bounds(positions: readonly number[]): NavMeshInfo['bounds'] {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < min.x) min.x = x; if (y < min.y) min.y = y; if (z < min.z) min.z = z;
    if (x > max.x) max.x = x; if (y > max.y) max.y = y; if (z > max.z) max.z = z;
  }
  return positions.length ? { min, max } : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
}

export default definePlugin({
  async activate(ctx) {
    await initRecast();
    const cfg = ctx.config;
    const defaults: Required<NavMeshOptions> = {
      cellSize: Number(cfg.cellSize ?? 0.2), cellHeight: Number(cfg.cellSize ?? 0.2) / 2,
      agentRadius: Number(cfg.agentRadius ?? 0.4), agentHeight: Number(cfg.agentHeight ?? 1.8),
      maxClimb: Number(cfg.maxClimb ?? 0.4), maxSlope: Number(cfg.maxSlope ?? 45),
    };
    const colliders = ctx.world.query({ with: [Transform3D, PhysicsCollider] });
    const agents = ctx.world.query({ with: [NavAgent, Transform3D] });
    let mesh: RecastNavMesh | undefined;
    let query: NavMeshQuery | undefined;
    let info: NavMeshInfo | undefined;
    const free = (): void => { query?.destroy(); mesh?.destroy(); query = undefined; mesh = undefined; };
    ctx.scope.add(free, 'recast-navmesh');

    const service: NavMeshService = {
      engine: 'recast-navigation',
      info: () => info,
      build(geometry?: NavGeometry, opts: NavMeshOptions = {}) {
        const t0 = performance.now();
        const source = geometry ? 'geometry' : 'colliders';
        const geo = geometry ?? navGeometryFromColliders(ctx.world, colliders.ids());
        const o = { ...defaults, ...opts };
        if (opts.cellSize !== undefined && opts.cellHeight === undefined) o.cellHeight = opts.cellSize / 2;
        const r = generateSoloNavMesh(geo.positions, geo.indices, {
          cs: o.cellSize, ch: o.cellHeight,
          walkableRadius: Math.ceil(o.agentRadius / o.cellSize),
          walkableHeight: Math.ceil(o.agentHeight / o.cellHeight),
          walkableClimb: Math.floor(o.maxClimb / o.cellHeight),
          walkableSlopeAngle: o.maxSlope,
          maxEdgeLen: Math.round(12 / o.cellSize),
          detailSampleDist: 6, detailSampleMaxError: 1,
        });
        if (!r.success || !r.navMesh) throw new Error(`std/navigation-recast: navmesh build failed (${r.error ?? 'unknown error'}) from ${geo.indices.length / 3} triangles`);
        free();
        mesh = r.navMesh;
        query = new NavMeshQuery(mesh);
        const [, navIdx] = getNavMeshPositionsAndIndices(mesh);
        info = { triangles: geo.indices.length / 3, navTriangles: navIdx.length / 3, bounds: bounds(geo.positions), buildMs: performance.now() - t0, source };
        // Paths computed on the old mesh are stale.
        for (const e of agents.ids()) { const s = ctx.world.get(e, NavAgentState); if (s) { s.path = []; delete s.pathTarget; } }
        ctx.events.emit(NavMeshBuilt, info);
        ctx.log.info(`navmesh: ${info.navTriangles} triangles from ${info.triangles} source triangles (${source}) in ${info.buildMs.toFixed(1)} ms`);
        return info;
      },
      findPath(from, to) {
        if (!query) return undefined;
        const r = query.computePath(from, to, { halfExtents: { x: 2, y: 4, z: 2 } });
        if (!r.success || !r.path.length) return undefined;
        const path = r.path.map(v3);
        // Detour returns a partial path towards the closest reachable polygon; only accept it if it ends at the goal.
        const end = query.findClosestPoint(to, { halfExtents: { x: 2, y: 4, z: 2 } });
        if (!end.success || flatDist(path[path.length - 1]!, end.point) > 0.05) return undefined;
        return path;
      },
      closestPoint(p, ext = { x: 2, y: 4, z: 2 }) {
        if (!query) return undefined;
        const r = query.findClosestPoint(p, { halfExtents: ext });
        return r.success ? v3(r.point) : undefined;
      },
      debugTriangles() {
        if (!mesh) return [];
        const [pos, idx] = getNavMeshPositionsAndIndices(mesh);
        const at = (i: number): Vec3 => ({ x: pos[i * 3]!, y: pos[i * 3 + 1]!, z: pos[i * 3 + 2]! });
        const out: Vec3[][] = [];
        for (let i = 0; i < idx.length; i += 3) out.push([at(idx[i]!), at(idx[i + 1]!), at(idx[i + 2]!)]);
        return out;
      },
    };
    ctx.services.provide(NavMesh, service);

    const auto = cfg.autoBuild !== false;
    const drawMesh = cfg.debugDraw !== false;
    let debugTris: Vec3[][] | undefined;
    ctx.events.on(NavMeshBuilt, () => { debugTris = undefined; });

    ctx.systems.add({
      id: 'std/navmesh-agents', phase: 'ai', update: (dt) => {
        // Built on the first tick so every plugin (and async level loads in activate) has spawned its colliders.
        if (!info && auto) service.build();
        if (!query) return;
        for (const e of agents.ids()) {
          const agent = ctx.world.get(e, NavAgent)!;
          const tf = ctx.world.get(e, Transform3D)!;
          let st = ctx.world.get(e, NavAgentState);
          if (!st) st = ctx.world.add(e, NavAgentState, { status: 'idle', path: [] });
          const move = ctx.world.get(e, CharacterMove);
          if (!agent.target) { st.status = 'idle'; st.path = []; delete st.pathTarget; if (move) move.desired = { x: 0, y: move.desired.y, z: 0 }; continue; }
          const target = agent.target;
          const repath = agent.repathDistance ?? 0.5;
          if (!st.pathTarget || dist2(st.pathTarget, target) > repath * repath || (st.status !== 'arrived' && !st.path.length)) {
            const path = service.findPath(tf.position, target);
            st.pathTarget = v3(target);
            if (!path) { st.status = 'unreachable'; st.path = []; if (move) move.desired = { x: 0, y: move.desired.y, z: 0 }; continue; }
            st.path = path.slice(1);
            st.status = 'moving';
          }
          const arrive = agent.arriveDistance ?? 0.2;
          let budget = (agent.speed ?? 3) * dt;
          const pos = v3(tf.position);
          let heading: number | undefined;
          while (budget > 0 && st.path.length) {
            const next = st.path[0]!;
            const d = flatDist(pos, next);
            const isLast = st.path.length === 1;
            if (d <= (isLast ? arrive : 1e-3) || d <= budget) {
              if (d > 0) heading = Math.atan2(-(next.x - pos.x), -(next.z - pos.z));
              if (isLast && d <= arrive) { st.path.shift(); break; }
              pos.x = next.x; pos.y = next.y; pos.z = next.z; budget -= d; st.path.shift();
            } else {
              const k = budget / d;
              heading = Math.atan2(-(next.x - pos.x), -(next.z - pos.z));
              pos.x += (next.x - pos.x) * k; pos.y += (next.y - pos.y) * k; pos.z += (next.z - pos.z) * k; budget = 0;
            }
          }
          if (!st.path.length) st.status = 'arrived';
          if (move) {
            // Physics character: steer it; the controller keeps it on the ground (y stays the caller's gravity).
            move.desired = { x: pos.x - tf.position.x, y: move.desired.y, z: pos.z - tf.position.z };
          } else {
            tf.position = pos;
          }
          if (heading !== undefined) tf.rotation = quatFromEuler(heading);
        }
        const dd = debugDraw(ctx);
        if (!dd.enabled || !drawMesh) return;
        debugTris ??= service.debugTriangles();
        for (const [a, b, c] of debugTris) {
          const lift = (v: Vec3): Vec3 => ({ x: v.x, y: v.y + 0.03, z: v.z });
          dd.line(lift(a!), lift(b!), { color: 0x2a7fff }); dd.line(lift(b!), lift(c!), { color: 0x2a7fff }); dd.line(lift(c!), lift(a!), { color: 0x2a7fff });
        }
        for (const e of agents.ids()) {
          const st = ctx.world.get(e, NavAgentState);
          let prev = ctx.world.get(e, Transform3D)!.position;
          for (const p of st?.path ?? []) { dd.line(prev, p, { color: 0xffcc33 }); prev = p; }
        }
      },
    });
  },
});
