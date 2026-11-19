import type { DoorState, EntityId, InteractionCandidate, InteractionProvider, MapDef, SessionContext, TriggerState, WorldDescription, WorldService } from '../../../../src/sdk/index.ts';
import { Collider, DoorChanged, Intent, Interactions, MapFormats, Maps, Player, Prefabs, Transform, TriggerFired, UseFailed, World, definePlugin, isObject, vId, vString, yawDirX, yawDirZ } from '../../../../src/sdk/index.ts';
import type { Box } from './collision.ts';
import { CollisionWorld } from './collision.ts';
import { buildGridMap } from './grid.ts';
import { GridNav } from './nav.ts';

const NAV_RADIUS = 0.3;
const DOOR_SECONDS = 0.45;

/** Builds the collision boxes (walls + one box per door) for a world description. */
export function createCollision(desc: WorldDescription): { col: CollisionWorld; doorBoxes: Map<string, Box> } {
  const boxes: Box[] = desc.solids.map((s) => ({ id: s.id, minX: s.minX, minZ: s.minZ, maxX: s.maxX, maxZ: s.maxZ, active: true }));
  const doorBoxes = new Map<string, Box>();
  for (const d of desc.doors) {
    const b: Box = { id: `door:${d.id}`, minX: d.minX, minZ: d.minZ, maxX: d.maxX, maxZ: d.maxZ, active: true };
    boxes.push(b);
    doorBoxes.set(d.id, b);
  }
  return { col: new CollisionWorld(boxes, desc.width * desc.cellSize, desc.height * desc.cellSize), doorBoxes };
}

function createWorld(ctx: SessionContext, desc: WorldDescription): WorldService {
  const providers = new Map<string, InteractionProvider>();
  ctx.services.provide(Interactions, {
    register(owner, id, provider) {
      if (typeof id !== 'string' || !id.trim() || id === 'core/world') throw new Error('interaction provider id must be non-empty and not reserved: core/world');
      if (typeof provider !== 'function') throw new Error(`interaction provider "${id}" must be a function`);
      if (providers.has(id)) throw new Error(`duplicate interaction provider "${id}"`);
      providers.set(id, provider);
      return owner.scope.add(() => { if (providers.get(id) === provider) providers.delete(id); }, 'interaction-provider');
    },
  });
  const { col, doorBoxes } = createCollision(desc);
  const nav = new GridNav(desc.width, desc.height, desc.cellSize);
  const doors: DoorState[] = desc.doors.map((d) => ({ desc: d, open: false, locked: d.locked, openness: 0 }));
  const doorById = new Map(doors.map((d) => [d.desc.id, d]));
  const doorAtCell = new Map(doors.map((d) => [d.desc.cellZ * desc.width + d.desc.cellX, d]));
  const triggers: TriggerState[] = desc.triggers.map((t) => ({ desc: t, fired: false }));
  let version = 0;
  const blocked = (cx: number, cz: number): boolean => {
    const i = cz * desc.width + cx;
    if (desc.cells[i]!.solid) return true;
    const d = doorAtCell.get(i);
    return d !== undefined && !d.open;
  };

  const service: WorldService = {
    desc,
    get version() {
      return version;
    },
    moveCircle: (x, z, r, dx, dz, out) => col.moveCircle(x, z, r, dx, dz, out),
    raycast: (x, z, dx, dz, max, r) => col.raycast(x, z, dx, dz, max, r),
    lineOfSight: (ax, az, bx, bz) => col.lineOfSight(ax, az, bx, bz),
    isFree: (x, z, r) => col.isFree(x, z, r),
    findPath: (ax, az, bx, bz, out) => nav.findPath(ax, az, bx, bz, blocked, col, NAV_RADIUS, out),
    doors: () => doors,
    door: (id) => doorById.get(id),
    setDoorOpen(id, open, force = false) {
      const d = doorById.get(id);
      if (!d) return false;
      if (d.open === open) return true;
      if (d.locked && !force) return false;
      if (!open) {
        // Refuse to close on top of an actor.
        let occupied = false;
        const dd = d.desc;
        ctx.world.each(Collider, (e, c) => {
          const t = ctx.world.get(e, Transform);
          if (t && t.x + c.radius > dd.minX && t.x - c.radius < dd.maxX && t.z + c.radius > dd.minZ && t.z - c.radius < dd.maxZ) occupied = true;
        });
        if (occupied) return false;
      }
      d.open = open;
      if (open) d.locked = false;
      doorBoxes.get(id)!.active = !open;
      version++;
      ctx.events.emit(DoorChanged, { id, open, x: (d.desc.minX + d.desc.maxX) / 2, z: (d.desc.minZ + d.desc.maxZ) / 2 });
      return true;
    },
    triggers: () => triggers,
  };

  const fire = (t: TriggerState, by: EntityId): void => {
    if (t.fired && t.desc.once) return;
    t.fired = true;
    if (t.desc.opens) service.setDoorOpen(t.desc.opens, true, true);
    ctx.events.emit(TriggerFired, { id: t.desc.id, kind: t.desc.kind, tags: t.desc.tags, by, x: t.desc.x, z: t.desc.z });
  };

  ctx.systems.add({
    id: 'core/world.snapshot-poses',
    phase: 'input',
    order: -100,
    update() {
      ctx.world.each(Transform, (_e, t) => {
        t.prevX = t.x;
        t.prevZ = t.z;
        t.prevYaw = t.yaw;
      });
    },
  });

  const inside = new Set<string>();
  ctx.systems.add({
    id: 'core/world.doors-and-triggers',
    phase: 'world',
    update(dt) {
      for (const d of doors) {
        const target = d.open ? 1 : 0;
        if (d.openness !== target) d.openness = Math.max(0, Math.min(1, d.openness + (d.open ? dt : -dt) / DOOR_SECONDS));
      }
      // Use: nearest switch in reach and in front, otherwise the nearest door.
      ctx.world.each(Intent, (e, intent) => {
        if (!intent.use) return;
        const t = ctx.world.get(e, Transform);
        if (!t) return;
        const fx = yawDirX(t.yaw);
        const fz = yawDirZ(t.yaw);
        let best: { provider: string; candidate: InteractionCandidate } | undefined;
        const offer = (provider: string, candidate: InteractionCandidate): void => {
          if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim() || !Number.isFinite(candidate.priority) || !Number.isFinite(candidate.distance) || candidate.distance < 0 || typeof candidate.use !== 'function') {
            throw new Error(`invalid interaction candidate from "${provider}"`);
          }
          const b = best?.candidate;
          if (!best || !b || candidate.priority < b.priority || (candidate.priority === b.priority && (candidate.distance < b.distance || (candidate.distance === b.distance && (provider < best.provider || (provider === best.provider && provider !== 'core/world' && candidate.id < b.id)))))) best = { provider, candidate };
        };
        for (const tr of triggers) {
          if (tr.desc.kind !== 'switch' || (tr.fired && tr.desc.once)) continue;
          const dx = tr.desc.x - t.x;
          const dz = tr.desc.z - t.z;
          const d = Math.hypot(dx, dz);
          if (d > tr.desc.radius || (d > 0.3 && (dx * fx + dz * fz) / d < 0.35)) continue;
          offer('core/world', { id: tr.desc.id, priority: 0, distance: d, use: () => fire(tr, e) });
        }
        for (const door of doors) {
            const dx = (door.desc.minX + door.desc.maxX) / 2 - t.x;
            const dz = (door.desc.minZ + door.desc.maxZ) / 2 - t.z;
            const d = Math.hypot(dx, dz);
            if (d > desc.cellSize * 0.95 || (d > 0.3 && (dx * fx + dz * fz) / d < 0.2)) continue;
          offer('core/world', { id: door.desc.id, priority: 1, distance: d, use: () => {
            if (door.locked) ctx.events.emit(UseFailed, { by: e, reason: 'locked' });
            else service.setDoorOpen(door.desc.id, !door.open);
          } });
        }
        for (const [id, provider] of [...providers].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
          const candidates = provider(e, { ...t });
          if (!Array.isArray(candidates)) throw new Error(`interaction provider "${id}" must return an array`);
          const ids = new Set<string>();
          for (const candidate of candidates) {
            offer(id, candidate);
            if (ids.has(candidate.id)) throw new Error(`duplicate interaction candidate "${candidate.id}" from "${id}"`);
            ids.add(candidate.id);
          }
        }
        if (best) (best as { candidate: InteractionCandidate }).candidate.use();
        else ctx.events.emit(UseFailed, { by: e, reason: 'nothing' });
      });
      // Zones fire when a player enters (edge-triggered per entity).
      ctx.world.each(Player, (e) => {
        const t = ctx.world.get(e, Transform);
        if (!t) return;
        for (const tr of triggers) {
          if (tr.desc.kind !== 'zone') continue;
          const key = `${tr.desc.id}:${e}`;
          const isIn = Math.hypot(tr.desc.x - t.x, tr.desc.z - t.z) <= tr.desc.radius;
          if (isIn && !inside.has(key)) {
            inside.add(key);
            fire(tr, e);
          } else if (!isIn) inside.delete(key);
        }
      });
    },
  });
  return service;
}

export default definePlugin({
  register(ctx) {
    ctx.register(MapFormats, 'core/grid', { description: 'Rows of legend characters plus doors, spawns, triggers and lights (schema 1).', build: buildGridMap });

    ctx.contentKind('map', {
      description: 'A playable map in a registered map format.',
      load(data, c) {
        if (!isObject(data)) return void c.r.error('expected an object');
        const format = vId(data.format, c.r.at('format'));
        if (format === undefined) return;
        const fmt = c.registries.get(MapFormats, format);
        if (!fmt) return void c.r.at('format').error(`unknown map format "${format}". Installed formats: ${c.registries.ids(MapFormats).join(', ')}`);
        const world = fmt.build(c.id, data, c.r);
        if (!world) return;
        const def: MapDef = { name: world.name, format, world, source: data };
        c.register(Maps, c.id, def);
      },
    });

    ctx.addValidator((v) => {
      // Every registered map must reference real prefabs and place things in free space.
      for (const m of v.registries.entries(Maps)) {
        const r = v.reporter(m.owner, `map "${m.id}"`);
        const w = m.value.world;
        const { col } = createCollision(w);
        for (const b of col.boxes) if (b.id.startsWith('door:')) b.active = false;
        if (!col.isFree(w.playerStart.x, w.playerStart.z, 0.35)) r.at('playerStart').error('the player start overlaps a wall');
        w.spawns.forEach((s, i) => {
          if (!v.registries.has(Prefabs, s.prefab)) r.at('spawns').at(i).at('prefab').error(`unknown prefab "${s.prefab}" (spawn "${s.id}"). Known prefabs: ${v.registries.ids(Prefabs).join(', ') || '(none)'}`);
          if (!col.isFree(s.x, s.z, 0.25)) r.at('spawns').at(i).error(`spawn "${s.id}" overlaps a wall`);
        });
      }
      const sel = v.preset.options['map'];
      const pr = v.reporter('preset', 'options.map');
      if (sel === undefined) pr.error(`no map selected. Set options.map to one of: ${v.registries.ids(Maps).join(', ') || '(no maps installed)'}`);
      else if (vString(sel, pr) !== undefined && !v.registries.has(Maps, sel as string)) pr.error(`unknown map "${String(sel)}". Installed maps: ${v.registries.ids(Maps).join(', ') || '(none)'}`);
    });
  },

  activate(ctx) {
    const map = ctx.registries.require(Maps, String(ctx.preset.options['map']));
    ctx.services.provide(World, createWorld(ctx, map.world));
    ctx.log.info(`world "${map.world.id}" ready: ${map.world.width}x${map.world.height} cells, ${map.world.solids.length} solids, ${map.world.doors.length} doors`);
  },
});
