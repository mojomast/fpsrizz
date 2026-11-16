import type { EntityId, Params } from '../../sdk/index.ts';
import { Flow, Health, Maps, Player, Prefabs, Transform, Visual, World, defineComponent, definePlugin, makeTransform, vNumber, yawDirX, yawDirZ } from '../../sdk/index.ts';

interface Guard {
  range: number;
  coneCos: number;
  delay: number;
  target: EntityId;
  seenFor: number;
}
const Guard = defineComponent<Guard>('example/stealth.guard');

// Programmatic prefab calls bypass map validation; use safe defaults for invalid values there.
function numberParam(params: Params, key: string, fallback: number, min: number, max: number): number {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export default definePlugin({
  register(ctx) {
    ctx.addValidator((v) => {
      for (const map of v.registries.entries(Maps)) {
        map.value.world.spawns.forEach((spawn, i) => {
          if (spawn.prefab !== 'example/stealth-guard') return;
          const r = v.reporter(map.owner, `map "${map.id}"`).at('spawns').at(i).at('params');
          for (const key of Object.keys(spawn.params)) {
            if (key !== 'range' && key !== 'angle' && key !== 'delay') r.at(key).error(`unknown parameter "${key}"`);
          }
          for (const [key, max] of [['range', 1000], ['angle', 360], ['delay', 3600]] as const) {
            if (key in spawn.params) vNumber(spawn.params[key], r.at(key), { min: 0, max });
          }
        });
      }
    });
    ctx.register(Prefabs, 'example/stealth-guard', {
      description: 'Stationary guard with a planar vision cone; sustained sight ends the run.',
      start(ctx) {
        const world = ctx.services.get(World);
        const flow = ctx.services.get(Flow);
        ctx.systems.add({
          id: 'example/stealth.vision', phase: 'ai',
          update(dt) {
            if (flow.ended) return;
            ctx.world.each(Guard, (id, guard) => {
              if (flow.ended) return;
              const pose = ctx.world.get(id, Transform);
              if (!pose) return;
              let seen: EntityId = 0;
              ctx.world.each(Player, (player) => {
                if (seen) return;
                const health = ctx.world.get(player, Health);
                const target = ctx.world.get(player, Transform);
                if (!target || health?.dead) return;
                const dx = target.x - pose.x, dz = target.z - pose.z;
                const distance = Math.hypot(dx, dz);
                if (distance > guard.range) return;
                if (distance > 0 && (dx * yawDirX(pose.yaw) + dz * yawDirZ(pose.yaw)) / distance < guard.coneCos - 1e-12) return;
                if (world.lineOfSight(pose.x, pose.z, target.x, target.z)) seen = player;
              });
              if (!seen) { guard.target = 0; guard.seenFor = 0; return; }
              if (seen !== guard.target) { guard.target = seen; guard.seenFor = 0; }
              guard.seenFor += dt;
              if (guard.seenFor + 1e-10 >= guard.delay) {
                flow.end({ outcome: 'defeat', title: 'Detected', detail: 'A guard spotted you.', stats: [] });
              }
            });
          },
        });
        return (at, params) => {
          const id = ctx.world.create();
          const angle = numberParam(params, 'angle', 90, 0, 360);
          ctx.world.add(id, Transform, makeTransform(at.x, at.z, at.yaw));
          ctx.world.add(id, Guard, { range: numberParam(params, 'range', 8, 0, 1000), coneCos: Math.cos(angle * Math.PI / 360), delay: numberParam(params, 'delay', 1, 0, 3600), target: 0, seenFor: 0 });
          ctx.world.add(id, Visual, { key: 'enemy-grunt', state: 'idle', stateAt: ctx.time.now, y: 0, scale: 1, tint: '', renderer: '' });
          return id;
        };
      },
    });
  },
});
