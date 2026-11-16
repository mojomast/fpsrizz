import { ExperienceRole, MechanicKits, SessionControl, Verdant, VerdantWorlds, createDeadline, createMechanicKit, definePlugin, isObject, vArray, vNumber, vString } from '../../sdk/index.ts';
import type { VerdantCommand, VerdantStation } from '../../sdk/index.ts';

const actions = ['water', 'biomass', 'convert', 'restore', 'wait'] as const;
export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'verdant/relay', { name: 'Verdant Relay', description: 'Restore an archipelago, one considered day at a time.', pointer: 'free', controls: [['Station buttons', 'Select a relay'], ['Action buttons', 'Harvest, convert, restore or wait'], ['Restart', 'Begin again']] });
    ctx.contentKind('verdant-world', { description: 'A colony restoration archipelago.', load(data, c) {
      if (!isObject(data)) { c.r.error('expected a world object'); return; }
      for (const key of Object.keys(data)) if (!['name', 'kit', 'days', 'stations'].includes(key)) c.r.at(key).error('unknown property');
      const name = vString(data.name, c.r.at('name'), { max: 80, nonEmpty: true });
      const kit = vString(data.kit, c.r.at('kit'), { max: 100, nonEmpty: true });
      const days = vNumber(data.days, c.r.at('days'), { min: 3, max: 100, int: true });
      const raw = vArray(data.stations, c.r.at('stations'), { min: 3, max: 3 });
      const stations: VerdantStation[] = [];
      raw?.forEach((item, i) => {
        const r = c.r.at('stations').at(i);
        if (!isObject(item)) { r.error('expected station'); return; }
        for (const key of Object.keys(item)) if (!['id', 'name', 'x', 'z'].includes(key)) r.at(key).error('unknown property');
        const id = vString(item.id, r.at('id'), { max: 40, nonEmpty: true });
        const stationName = vString(item.name, r.at('name'), { max: 60, nonEmpty: true });
        const x = vNumber(item.x, r.at('x'), { min: -10, max: 10 });
        const z = vNumber(item.z, r.at('z'), { min: -10, max: 10 });
        if (id && !/^[a-z][a-z0-9_.-]*$/.test(id)) r.at('id').error('use a lowercase local station id');
        if (id && stationName && x !== undefined && z !== undefined) stations.push(Object.freeze({ id, name: stationName, x, z }));
      });
      if (new Set(stations.map(s => s.id)).size !== stations.length) c.r.at('stations').error('station IDs must be unique');
      if (!c.r.failed && name && kit && days !== undefined && stations.length === 3) c.register(VerdantWorlds, c.id, Object.freeze({ name, kit, days, stations: Object.freeze(stations) }));
    } });
    ctx.addValidator(v => {
      const id = v.preset.options['world'];
      const world = typeof id === 'string' ? v.registries.get(VerdantWorlds, id) : undefined;
      if (!world) { v.reporter('preset', 'options.world').error('select an installed verdant-world'); return; }
      const kit = v.registries.get(MechanicKits, world.kit);
      const r = v.reporter('preset', 'options.world');
      if (!kit) r.error('world must select an installed mechanic kit');
      else {
        if (kit.domain !== 'turns') r.error('verdant kit domain must be turns');
        for (const id of ['water', 'biomass', 'charge']) if (!kit.resources.some(x => x.id === id)) r.error(`kit needs resource ${id}`);
        for (const id of actions) if (!kit.actions.some(x => x.id === id)) r.error(`kit needs action ${id}`);
        if (kit.objectives.length !== 1 || !kit.objectives.some(x => x.id === 'relays' && x.target === world.stations.length && !x.requires?.length)) {
          r.error('kit must contain exactly one unlocked relays objective targeting all stations');
        }
      }
      if (v.selectedRole(ExperienceRole) !== 'verdant/relay') v.reporter('preset', 'roles.sdk/experience').error('select verdant/relay');
    });
  },
  activate(ctx) {
    const world = ctx.registries.require(VerdantWorlds, String(ctx.preset.options['world']));
    let kit = createMechanicKit(ctx, world.kit, 'verdant/colony');
    let dryWind = createDeadline(ctx, kit.clock, 3), season = createDeadline(ctx, kit.clock, world.days);
    let restored: string[] = [], status: 'playing' | 'won' | 'lost' = 'playing', revision = 0;
    let message = `Restore all ${world.stations.length} relays before the final day. Every third day costs one water.`;
    const queue: VerdantCommand[] = [];
    const playing = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    ctx.scope.add(() => kit.dispose(), 'verdant-kit');
    ctx.services.provide(Verdant, {
      world,
      get actionDefinitions() { return kit.actions.definitions; },
      get revision() { return revision; },
      state: () => ({
        turn: kit.clock.now,
        days: world.days,
        status,
        resources: { ...kit.resources.snapshot() },
        restored: [...restored],
        cooldowns: Object.fromEntries(actions.map(id => [id, kit.actions.remaining(id)])),
        forecast: dryWind.remaining() === 1 ? 'Dry wind tomorrow · −1 water' : 'Calm · no water drain',
        message,
        revision,
      }),
      enqueue(command) {
        if (ctx.signal.aborted || !playing() || queue.length >= 32 || !isObject(command)) return false;
        if (command.type === 'restart') { queue.push({ type: 'restart' }); return true; }
        if (command.type !== 'act' || typeof command.action !== 'string' || !actions.includes(command.action as typeof actions[number])) return false;
        if (command.station !== undefined && typeof command.station !== 'string') return false;
        if (command.action === 'restore' && !world.stations.some(s => s.id === command.station)) return false;
        queue.push({ type: 'act', action: command.action as typeof actions[number], ...(typeof command.station === 'string' ? { station: command.station } : {}) }); return true;
      },
    });
    ctx.systems.add({ id: 'verdant/game.commands', phase: 'control', update() {
      if (!playing()) { queue.length = 0; return; }
      const command = queue.shift(); if (!command) return;
      if (command.type === 'restart') {
        dryWind.dispose(); season.dispose(); kit.dispose(); kit = createMechanicKit(ctx, world.kit, 'verdant/colony');
        dryWind = createDeadline(ctx, kit.clock, 3); season = createDeadline(ctx, kit.clock, world.days);
        restored = []; status = 'playing'; message = 'A fresh season begins.'; revision++; queue.length = 0; return;
      }
      if (status !== 'playing') return;
      if (command.action === 'restore' && (!command.station || restored.includes(command.station))) { message = 'That relay is already restored.'; revision++; return; }
      const result = kit.actions.execute(command.action);
      if (!result.ok) { message = result.reason; revision++; return; }
      if (command.action === 'restore' && command.station) {
        restored.push(command.station);
        kit.objectives.record('relays', 1, command.station);
      }
      kit.clock.advance(1);
      if (kit.objectives.complete) { status = 'won'; message = 'The relays sing again. The archipelago is thriving.'; }
      else {
        const windDue = dryWind.due();
        const drained = !windDue || kit.resources.transact({ spend: { water: 1 } }, 'dry-wind').ok;
        if (windDue && drained) dryWind.arm(3);
        if (!drained) { status = 'lost'; message = 'Dry winds exhausted the colony water. Restart to try a new plan.'; }
        else if (season.due()) { status = 'lost'; message = 'The season ended before the relays were restored.'; }
        else message = command.action === 'restore' ? 'Relay restored; living green returns to the island.' : 'The colony completes its day.';
      }
      revision++; if (status !== 'playing') queue.length = 0;
    } });
  },
});
