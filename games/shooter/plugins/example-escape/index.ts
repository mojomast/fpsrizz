import type { SessionContext } from '../../../../src/sdk/index.ts';
import { Flow, Maps, ModeRole, Prefabs, definePlugin, spawnPrefab } from '../../../../src/sdk/index.ts';
import { Died, TriggerFired, World } from '../../contracts/shooter.ts';

const MODE_ID = 'example/escape';

function escapeMode(ctx: SessionContext): void {
  const desc = ctx.services.get(World).desc;
  const flow = ctx.services.get(Flow);
  const player = spawnPrefab(ctx, String(ctx.config['playerPrefab']), desc.playerStart);
  for (const spawn of desc.spawns) spawnPrefab(ctx, spawn.prefab, spawn, spawn.params);

  flow.setObjective('Find a route to the exit');
  ctx.events.on(TriggerFired, (trigger) => {
    if (trigger.by === player && trigger.kind === 'zone' && trigger.tags.includes('exit')) {
      flow.end({ outcome: 'victory', title: 'Escaped', detail: 'You reached the exit.', stats: [] });
    }
  });
  ctx.events.on(Died, (death) => {
    if (death.entity === player) flow.end({ outcome: 'defeat', title: 'You died', detail: 'You did not reach the exit.', stats: [] });
  });
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ModeRole, MODE_ID, { name: 'Escape', description: 'Find a route to the exit. Dying ends the run.', activate: escapeMode });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== MODE_ID) return;
      const prefab = String(ctx.config['playerPrefab']);
      if (!v.registries.has(Prefabs, prefab)) v.reporter('preset', `config.${ctx.pluginId}.playerPrefab`).error(`unknown prefab "${prefab}". Enable the plugin that provides the player (e.g. core/player).`);
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return;
      if (!map.world.triggers.some((t) => t.kind === 'zone' && t.tags.includes('exit'))) {
        v.reporter(v.registries.ownerOf(Maps, mapId as string) ?? 'preset', `map "${mapId as string}".triggers`).error('the escape mode needs a zone trigger tagged "exit". Add one, or select a different game mode.');
      }
    });
  },
});
