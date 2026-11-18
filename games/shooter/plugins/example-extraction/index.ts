import { Died, Flow, Health, Maps, ModeRole, PickupEffects, Pickups, Player, Prefabs, Transform, World, defineComponent, definePlugin, spawnPrefab, vNumber } from '../../../../src/sdk/index.ts';
import type { SessionContext } from '../../../../src/sdk/index.ts';

const MODE = 'example/extraction';
const LOOT = 'example/loot';
const RunLoot = defineComponent<{ amount: number; deadline: number }>('example/extraction-loot');

function activateMode(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const player = spawnPrefab(ctx, 'core/player', world.desc.playerStart);
  const loot = ctx.world.add(player, RunLoot, { amount: 0, deadline: ctx.time.now + Number(ctx.config['duration']) });
  for (const spawn of world.desc.spawns) spawnPrefab(ctx, spawn.prefab, spawn, spawn.params);
  const exits = world.desc.triggers.filter((t) => t.kind === 'zone' && t.tags.includes('exit'));
  flow.setObjective('Collect loot and reach the exit before time runs out');
  const refresh = (): void => {
    flow.setStatus('loot', 'Loot carried', String(loot.amount));
    flow.setStatus('time', 'Time remaining', String(Math.max(0, Math.ceil(loot.deadline - ctx.time.now))));
  };
  const lose = (title: string, detail: string): void => {
    loot.amount = 0;
    refresh();
    flow.end({ outcome: 'defeat', title, detail, stats: [['Loot extracted', '0']] });
  };
  refresh();
  ctx.events.on(Died, (event) => {
    if (event.entity === player && !flow.ended) lose('You died', 'Your carried loot was lost.');
  });
  ctx.systems.add({
    id: 'example/extraction.rules', phase: 'rules',
    update() {
      if (flow.ended) return;
      if (ctx.world.get(player, Health)?.dead) return void lose('You died', 'Your carried loot was lost.');
      if (ctx.time.now >= loot.deadline) return void lose('Time expired', 'Your carried loot was lost.');
      const pose = ctx.world.get(player, Transform);
      if (pose && exits.some((exit) => Math.hypot(pose.x - exit.x, pose.z - exit.z) <= exit.radius)) {
        return void flow.end({ outcome: 'victory', title: 'Extracted', detail: 'You escaped with your loot.', stats: [['Loot extracted', String(loot.amount)]] });
      }
      refresh();
    },
  });
}

export default definePlugin({
  register(ctx) {
    ctx.register(PickupEffects, LOOT, {
      description: 'Adds a fixed amount of session loot to the extraction player.',
      validateParams(params, r) {
        for (const key of Object.keys(params)) if (key !== 'amount') r.at(key).error('unknown parameter; use amount');
        vNumber(params['amount'], r.at('amount'), { int: true, min: 1, max: 10000 });
      },
      start(owner) {
        return (target, params) => {
          const loot = owner.world.get(target, RunLoot);
          if (!loot || !owner.world.has(target, Player) || owner.world.get(target, Health)?.dead || owner.services.get(Flow).ended || owner.time.now >= loot.deadline) return false;
          loot.amount += Number(params['amount']);
          return true;
        };
      },
    });
    ctx.provideRole(ModeRole, MODE, { name: 'Extraction', description: 'Collect loot and escape before the timer expires.', activate: activateMode });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== MODE) return;
      if (!v.registries.has(Prefabs, 'core/player')) v.reporter('preset', 'roles.sdk/mode').error('extraction needs the core/player prefab; enable core/player.');
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return;
      const r = v.reporter(v.registries.ownerOf(Maps, mapId as string) ?? 'preset', `map "${String(mapId)}"`);
      if (!map.world.triggers.some((t) => t.kind === 'zone' && t.tags.includes('exit'))) r.at('triggers').error('extraction needs a zone tagged "exit"; add one to the map.');
      if (!map.world.spawns.some((s) => v.registries.get(Pickups, s.prefab)?.effect === LOOT)) r.at('spawns').error('extraction needs a pickup using effect "example/loot"; define and place one on the map.');
    });
  },
});
