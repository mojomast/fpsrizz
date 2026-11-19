import { Flow, Health, Maps, ModeRole, Player, Prefabs, defineComponent, definePlugin, spawnPrefab } from '../../../../src/sdk/index.ts';
import { Combat, DamageModifiers, Died, Enemies, World } from '../../contracts/shooter.ts';
import type { EntityId, SessionContext, SpawnDesc } from '../../../../src/sdk/index.ts';

const MODE = 'example/roguelite';
const Power = defineComponent<{ multiplier: number }>('example/roguelite-power');

function play(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const combat = ctx.services.get(Combat);
  const player = spawnPrefab(ctx, 'core/player', world.desc.playerStart);
  const locations = world.desc.spawns.filter((s) => ctx.registries.has(Enemies, s.prefab));
  for (const spawn of world.desc.spawns) {
    if (!ctx.registries.has(Enemies, spawn.prefab)) spawnPrefab(ctx, spawn.prefab, spawn, spawn.params);
  }
  // The objective map can contain locked gates; encounters must not strand enemies behind them.
  for (const door of world.doors()) world.setDoorOpen(door.desc.id, true, true);

  const encounterRng = ctx.rng.fork('encounters');
  const rewardRng = ctx.rng.fork('rewards');
  const rewards = rewardRng.int(0, 2) === 0 ? ['Power', 'Vitality'] : ['Vitality', 'Power'];
  const awarded: string[] = [];
  let wave = 0;
  let enemies: EntityId[] = [];
  const remaining = (): number => enemies.filter((id) => {
    const health = ctx.world.get(id, Health);
    return health && !health.dead;
  }).length;
  const status = (): void => {
    flow.setObjective('Clear all three encounters');
    flow.setStatus('wave', 'Encounter', `${wave} / 3`);
    flow.setStatus('remaining', 'Hostiles remaining', String(remaining()));
    flow.setStatus('upgrades', 'Upgrades', awarded.join(', ') || 'None');
  };
  const startWave = (): void => {
    wave++;
    const pool: SpawnDesc[] = [...locations];
    enemies = [];
    const count = Math.min(pool.length, wave + 1);
    for (let i = 0; i < count; i++) {
      const [spawn] = pool.splice(encounterRng.int(0, pool.length), 1);
      if (spawn) enemies.push(spawnPrefab(ctx, spawn.prefab, spawn, spawn.params));
    }
    status();
    flow.notify(`Encounter ${wave} begins`);
  };
  const result = (victory: boolean): void => flow.end({
    outcome: victory ? 'victory' : 'defeat',
    title: victory ? 'Gauntlet cleared' : 'Gauntlet ended',
    detail: victory ? 'You survived all three encounters.' : 'The gauntlet claimed another survivor.',
    stats: [['Encounter', `${wave} / 3`], ['Kills', String(ctx.world.get(player, Player)?.kills ?? 0)], ['Upgrades', awarded.join(', ') || 'None']],
  });
  ctx.events.on(Died, (event) => {
    if (!flow.ended && event.entity === player) result(false);
  });
  ctx.systems.add({
    id: 'example/roguelite.progress', phase: 'rules', update() {
      if (flow.ended) return;
      const hp = ctx.world.get(player, Health);
      if (!hp || hp.dead) return void result(false);
      if (remaining() > 0) return void status();
      if (wave === 3) return void result(true);
      const reward = rewards[wave - 1]!;
      awarded.push(reward);
      if (reward === 'Power') ctx.world.add(player, Power, { multiplier: 1.5 });
      else {
        hp.max += 30;
        combat.heal(player, 30);
      }
      flow.notify(`Upgrade: ${reward}`);
      startWave();
    },
  });
  startWave();
}

export default definePlugin({
  register(ctx) {
    ctx.register(DamageModifiers, 'example/roguelite-power', {
      description: 'Boost damage dealt by a gauntlet player with Power.', order: 0,
      start: (owner) => (req, amount) => amount * (owner.world.get(req.source, Power)?.multiplier ?? 1),
    });
    ctx.provideRole(ModeRole, MODE, { name: 'Seeded Gauntlet', description: 'Survive three encounters and earn two seeded upgrades.', activate: play });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== MODE) return;
      if (!v.registries.has(Prefabs, 'core/player')) v.reporter('preset', 'roles.sdk/mode').error('Seeded Gauntlet requires the core/player prefab.');
      const id = v.preset.options['map'];
      const map = typeof id === 'string' ? v.registries.get(Maps, id) : undefined;
      if (!map) return;
      if (!map.world.spawns.some((s) => v.registries.has(Enemies, s.prefab)))
        v.reporter('preset', 'options.map').error('Seeded Gauntlet requires at least one map spawn whose prefab is an enemy definition.');
    });
  },
});
