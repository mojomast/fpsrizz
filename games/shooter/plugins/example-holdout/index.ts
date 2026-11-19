import { Flow, Health, Maps, ModeRole, Prefabs, Transform, definePlugin, spawnPrefab, yawOf } from '../../../../src/sdk/index.ts';
import { Died, Enemies, Enemy, World } from '../../contracts/shooter.ts';
import type { EntityId, SessionContext } from '../../../../src/sdk/index.ts';

const ID = 'example/holdout';

function run(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const zone = world.desc.triggers.find((t) => t.kind === 'zone' && t.tags.includes('exit'))!;
  const points = world.desc.spawns.filter((s) => s.tags.includes('enemy') && ctx.registries.has(Enemies, s.prefab));
  const player = spawnPrefab(ctx, String(ctx.config['playerPrefab']), world.desc.playerStart);
  for (const door of world.doors()) world.setDoorOpen(door.desc.id, true, true);
  for (const s of world.desc.spawns) {
    if (!s.tags.includes('enemy')) spawnPrefab(ctx, s.prefab, s, s.params);
  }

  const requiredTicks = Math.ceil(Number(ctx.config['holdSeconds']) / ctx.time.step);
  const intervalTicks = Math.ceil(Number(ctx.config['spawnInterval']) / ctx.time.step);
  const maxAlive = Math.max(1, Math.floor(Number(ctx.config['maxAlive'])));
  const live = new Set<EntityId>();
  let heldTicks = 0;
  let nextSpawnTick = 0;
  let score = 0;
  let kills = 0;
  const stats = (): [string, string][] => [
    ['Hold', `${Math.min(heldTicks * ctx.time.step, Number(ctx.config['holdSeconds'])).toFixed(1)} / ${Number(ctx.config['holdSeconds']).toFixed(1)} s`],
    ['Score', String(score)], ['Kills', String(kills)],
  ];
  const publish = (inside: boolean): void => {
    flow.setObjective(inside ? 'Defend the exit zone' : 'Enter the exit zone to advance');
    flow.setStatus('hold', 'Hold', stats()[0]![1]);
    flow.setStatus('score', 'Score', String(score));
    flow.setStatus('hostiles', 'Hostiles', String(live.size));
  };
  const defeat = (): void => flow.end({ outcome: 'defeat', title: 'Overrun', detail: 'You fell defending the zone.', stats: stats() });

  ctx.events.on(Died, (event) => {
    if (flow.ended) return;
    if (event.entity === player) { defeat(); return; }
    if (!live.delete(event.entity)) return;
    const enemy = ctx.world.get(event.entity, Enemy);
    score += enemy ? ctx.registries.get(Enemies, enemy.def)?.score ?? 0 : 0;
    kills++;
  });

  ctx.systems.add({
    id: `${ID}.defense`, phase: 'rules',
    update() {
      if (flow.ended) return;
      if (!ctx.world.isAlive(player) || ctx.world.get(player, Health)?.dead) { defeat(); return; }
      for (const id of live) if (!ctx.world.isAlive(id) || ctx.world.get(id, Health)?.dead) live.delete(id);
      const pose = ctx.world.get(player, Transform);
      const inside = !!pose && Math.hypot(pose.x - zone.x, pose.z - zone.z) <= zone.radius;
      if (inside) heldTicks++;
      if (heldTicks >= requiredTicks) {
        publish(inside);
        flow.end({ outcome: 'victory', title: 'Zone secured', detail: 'You held the zone.', stats: stats() });
        return;
      }
      if (pose && ctx.time.tick >= nextSpawnTick && live.size < maxAlive) {
        const available = points.filter((p) => world.isFree(p.x, p.z, ctx.registries.require(Enemies, p.prefab).radius));
        if (available.length) {
          const point = ctx.rng.pick(available);
          const id = spawnPrefab(ctx, point.prefab, { x: point.x, z: point.z, yaw: yawOf(pose.x - point.x, pose.z - point.z) }, point.params);
          live.add(id);
          nextSpawnTick = ctx.time.tick + intervalTicks;
        }
      }
      publish(inside);
    },
  });
  publish(false);
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ModeRole, ID, { name: 'Holdout', description: 'Hold the exit zone while enemies attack.', activate: run });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== ID) return;
      const playerPrefab = String(ctx.config['playerPrefab']);
      if (!v.registries.has(Prefabs, playerPrefab)) v.reporter(ID, 'config.playerPrefab').error(`unknown player prefab "${playerPrefab}"; enable its provider.`);
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return;
      const r = v.reporter(ID, 'options.map');
      if (!map.world.triggers.some((t) => t.kind === 'zone' && t.tags.includes('exit'))) r.error(`Holdout requires map "${String(mapId)}" to have a zone trigger tagged "exit".`);
      if (!map.world.spawns.some((s) => s.tags.includes('enemy') && v.registries.has(Enemies, s.prefab) && v.registries.has(Prefabs, s.prefab))) r.error(`Holdout requires map "${String(mapId)}" to have a spawn tagged "enemy" with a registered enemy prefab.`);
    });
  },
});
