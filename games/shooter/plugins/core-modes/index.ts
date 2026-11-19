import type { RoleInfo, SessionContext } from '@bulkhead/sdk';
import { Flow, Maps, ModeRole, Player, Prefabs, definePlugin, spawnPrefab } from '@bulkhead/sdk';
import { Died, Enemy, TriggerFired, UseFailed, World } from '../../contracts/shooter.ts';

const MODE_ID = 'core/objective';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function objectiveMode(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const desc = world.desc;

  const player = spawnPrefab(ctx, String(ctx.config['playerPrefab']), desc.playerStart);
  for (const s of desc.spawns) spawnPrefab(ctx, s.prefab, s, s.params);

  const total = ctx.world.count(Enemy);
  const gates = world.triggers().filter((t) => t.desc.kind === 'switch' && t.desc.tags.includes('objective'));
  const exitOpen = (): boolean => gates.every((g) => g.fired);
  const kills = (): number => ctx.world.get(player, Player)?.kills ?? 0;
  const refresh = (): void => {
    flow.setObjective(exitOpen() ? 'Exit unlocked — reach the green exit pad' : 'Find the override switch to unlock the exit');
    flow.setStatus('hostiles', 'Hostiles down', `${kills()} / ${total}`);
  };
  refresh();

  ctx.events.on(TriggerFired, (t) => {
    if (t.kind === 'switch' && t.tags.includes('objective')) {
      flow.notify('Override engaged — exit unlocked');
      refresh();
    } else if (t.kind === 'zone' && t.tags.includes('exit') && t.by === player) {
      if (!exitOpen()) return void flow.notify('The exit is sealed — find the override switch');
      flow.end({ outcome: 'victory', title: 'Sector cleared', detail: 'You restored the override and reached the exit.', stats: [['Time', formatTime(ctx.time.now)], ['Hostiles down', `${kills()} / ${total}`]] });
    }
  });
  ctx.events.on(UseFailed, (u) => {
    if (u.by === player && u.reason === 'locked') flow.notify('Locked — the override switch opens this door');
  });
  ctx.events.on(Died, (d) => {
    if (d.entity === player) flow.end({ outcome: 'defeat', title: 'You died', detail: 'The facility claims another technician.', stats: [['Survived', formatTime(ctx.time.now)], ['Hostiles down', `${kills()} / ${total}`]] });
    else refresh();
  });
}

export default definePlugin({
  register(ctx) {
    const mode: RoleInfo = { name: 'Objective: reach the exit', description: 'Flip the override switch, then reach the exit pad. Dying ends the run.', activate: objectiveMode };
    ctx.provideRole(ModeRole, MODE_ID, mode);
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== MODE_ID) return;
      const prefab = String(ctx.config['playerPrefab']);
      if (!v.registries.has(Prefabs, prefab)) v.reporter('preset', `config.${ctx.pluginId}.playerPrefab`).error(`unknown prefab "${prefab}". Enable the plugin that provides the player (e.g. core/player).`);
      // Mode-specific objective requirements for the selected map.
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return; // the world plugin reports a missing/unknown map
      if (!map.world.triggers.some((t) => t.kind === 'zone' && t.tags.includes('exit')))
        v.reporter(v.registries.ownerOf(Maps, mapId as string) ?? 'preset', `map "${mapId as string}".triggers`).error('the objective mode needs a zone trigger tagged "exit" (the place the player must reach). Add one, or select a different game mode.');
    });
  },
});
