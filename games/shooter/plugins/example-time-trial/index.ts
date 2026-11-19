import { Flow, Maps, ModeRole, Player, Prefabs, definePlugin, spawnPrefab } from '../../../../src/sdk/index.ts';
import { Died, Enemy, TriggerFired, UseFailed, World } from '../../contracts/shooter.ts';
import type { SessionContext } from '../../../../src/sdk/index.ts';

const ID = 'example/time-trial';
const formatTime = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function run(ctx: SessionContext): void {
  const world = ctx.services.get(World);
  const flow = ctx.services.get(Flow);
  const player = spawnPrefab(ctx, String(ctx.config['playerPrefab']), world.desc.playerStart);
  for (const spawn of world.desc.spawns) spawnPrefab(ctx, spawn.prefab, spawn, spawn.params);
  const gates = world.triggers().filter((t) => t.desc.kind === 'switch' && t.desc.tags.includes('objective'));
  const total = ctx.world.count(Enemy);
  const started = ctx.time.now;
  const limit = Number(ctx.config['seconds']);
  const elapsed = (): number => ctx.time.now - started;
  const kills = (): number => ctx.world.get(player, Player)?.kills ?? 0;
  const unlocked = (): boolean => gates.every((gate) => gate.fired);
  const stats = (): [string, string][] => [
    ['Time', formatTime(Math.min(elapsed(), limit))],
    ['Hostiles down', `${kills()} / ${total}`],
    ['Overrides', `${gates.filter((gate) => gate.fired).length} / ${gates.length}`],
  ];
  const expire = (): boolean => {
    if (flow.ended) return true;
    if (elapsed() < limit) return false;
    flow.setStatus('time', 'Time left', '0:00');
    flow.end({ outcome: 'defeat', title: 'Time expired', detail: 'The raid deadline passed before you escaped.', stats: stats() });
    return true;
  };
  const publish = (): void => {
    flow.setObjective(unlocked() ? 'Exit unlocked — reach the green exit pad' : 'Activate the override switch, then reach the exit');
    flow.setStatus('time', 'Time left', formatTime(Math.ceil(Math.max(0, limit - elapsed()))));
    flow.setStatus('overrides', 'Overrides', `${gates.filter((gate) => gate.fired).length} / ${gates.length}`);
    flow.setStatus('hostiles', 'Hostiles down', `${kills()} / ${total}`);
  };
  publish();

  ctx.events.on(TriggerFired, (event) => {
    if (expire() || event.by !== player) return;
    if (event.kind === 'switch' && event.tags.includes('objective')) {
      flow.notify(unlocked() ? 'Override engaged — exit unlocked' : 'Override engaged');
      publish();
    } else if (event.kind === 'zone' && event.tags.includes('exit')) {
      if (!unlocked()) return void flow.notify('The exit is sealed — find the override switch');
      flow.end({ outcome: 'victory', title: 'Raid complete', detail: 'You activated the override and escaped in time.', stats: stats() });
    }
  });
  ctx.events.on(UseFailed, (event) => {
    if (!flow.ended && event.by === player && event.reason === 'locked') flow.notify('Locked — the override switch opens this door');
  });
  ctx.events.on(Died, (event) => {
    if (expire()) return;
    if (event.entity === player) flow.end({ outcome: 'defeat', title: 'You died', detail: 'The raid ended before you could escape.', stats: stats() });
    else publish();
  });
  ctx.systems.add({ id: `${ID}.timer`, phase: 'rules', update() { if (!expire()) publish(); } });
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ModeRole, ID, { name: 'Time Trial Raid', description: 'Activate the override and escape before the deadline.', activate: run });
    ctx.addValidator((v) => {
      if (v.selectedRole(ModeRole) !== ID) return;
      const prefab = String(ctx.config['playerPrefab']);
      if (!v.registries.has(Prefabs, prefab)) v.reporter('preset', `config.${ID}.playerPrefab`).error(`unknown player prefab "${prefab}". Enable its provider or select a registered prefab.`);
      const mapId = v.preset.options['map'];
      const map = typeof mapId === 'string' ? v.registries.get(Maps, mapId) : undefined;
      if (!map) return;
      const r = v.reporter(v.registries.ownerOf(Maps, String(mapId)) ?? 'preset', `map "${String(mapId)}".triggers`);
      if (!map.world.triggers.some((t) => t.kind === 'switch' && t.tags.includes('objective'))) r.error('Time Trial needs a switch tagged "objective". Add one or select another map.');
      if (!map.world.triggers.some((t) => t.kind === 'zone' && t.tags.includes('exit') && !t.once)) r.error('Time Trial needs a repeatable zone tagged "exit" so the player can return after activating the switch. Add one or select another map.');
    });
  },
});
