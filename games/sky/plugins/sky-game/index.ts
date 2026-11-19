import { ExperienceRole, MechanicKits, SessionControl, createDeadline, createMechanicKit, definePlugin, isObject } from '@bulkhead/sdk';
import { Sky, SkyRoutes } from '../../contracts/sky.ts';
import type { SkyCommand } from '../../contracts/sky.ts';
import { loadRoute } from './content.ts';

const near = (x: number, z: number, p: { x: number; z: number }) => Math.hypot(x - p.x, z - p.z) <= 1.35;

export default definePlugin({
  register(ctx) {
    ctx.contentKind('sky-route', { description: 'Paired cargo pickups and beacon destinations', load(data, c) { const route = loadRoute(data, c.r); if (route) c.register(SkyRoutes, c.id, route); } });
    ctx.provideRole(ExperienceRole, 'sky/salvage', { name: 'Sky Salvage', description: 'Recover cargo among floating islands and deliver it to matching beacons.', pointer: 'free', controls: [['WASD / arrows', 'Fly'], ['E', 'Recover / deliver'], ['Space', 'Boost'], ['F', 'Repair'], ['R', 'Restart']] });
    ctx.addValidator(v => {
      const id = v.preset.options['mechanicKit'];
      const kit = typeof id === 'string' ? v.registries.get(MechanicKits, id) : undefined;
      const routeId = v.preset.options['route'];
      const route = typeof routeId === 'string' ? v.registries.get(SkyRoutes, routeId) : undefined;
      if (!route) v.reporter('preset', 'options.route').error('select an installed sky-route');
      const r = v.reporter('preset', 'options.mechanicKit');
      if (!kit) r.error('select an installed mechanic-kit');
      else {
        if (kit.domain !== 'seconds') r.error('Sky Salvage requires a seconds clock');
        for (const resource of ['energy', 'hull', 'cargo']) if (!kit.resources.some(x => x.id === resource)) r.error(`missing resource ${resource}`);
        for (const action of ['collect', 'deliver', 'boost', 'repair']) if (!kit.actions.some(x => x.id === action)) r.error(`missing action ${action}`);
        if (kit.objectives.length !== 1 || kit.objectives[0]?.id !== 'deliveries' || kit.objectives[0].requires?.length || (route && kit.objectives[0].target !== route.deliveries.length)) r.error('the sole objective must be deliveries, with no prerequisites and target matching the route delivery count');
        const cargo = kit.resources.find(x => x.id === 'cargo');
        if (cargo && (cargo.initial !== 0 || cargo.max !== 1)) r.error('cargo must start at 0 with capacity 1');
        const collect = kit.actions.find(x => x.id === 'collect'), deliver = kit.actions.find(x => x.id === 'deliver');
        if (collect && (collect.gain?.['cargo'] !== 1 || collect.spend?.['cargo'])) r.error('collect must gain one cargo');
        if (deliver && (deliver.spend?.['cargo'] !== 1 || deliver.gain?.['cargo'])) r.error('deliver must spend one cargo');
        const boost = kit.actions.find(x => x.id === 'boost'), repair = kit.actions.find(x => x.id === 'repair');
        if (boost && (!(boost.spend?.['energy']! > 0) || boost.cooldown <= 0)) r.error('boost must spend energy and have a positive cooldown');
        if (repair && (!(repair.spend?.['energy']! > 0) || !(repair.gain?.['hull']! > 0) || repair.cooldown <= 0)) r.error('repair must spend energy, gain hull and have a positive cooldown');
      }
      if (v.selectedRole(ExperienceRole) !== 'sky/salvage') v.reporter('preset', 'roles.sdk/experience').error('select sky/salvage');
    });
  },
  activate(ctx) {
    const kitId = String(ctx.preset.options['mechanicKit']);
    const route = ctx.registries.require(SkyRoutes, String(ctx.preset.options['route']));
    let kit = createMechanicKit(ctx, kitId, 'flight');
    let boost = createDeadline(ctx, kit.clock), immunity = createDeadline(ctx, kit.clock);
    let x = 0, z = 0, cargo: number | null = null, status: 'playing' | 'won' | 'lost' = 'playing';
    let collected = route.deliveries.map(() => false), delivered = route.deliveries.map(() => false), revision = 0;
    let message = 'Recover a crate at the north islands. Deliver it to the matching numbered beacon.';
    const queue: SkyCommand[] = [];
    const playing = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    ctx.services.provide(Sky, {
      route, kit: kit.definition,
      state: () => ({ x, z, cargo, status, collected: [...collected], delivered: [...delivered], energy: kit.resources.get('energy'), hull: kit.resources.get('hull'), time: kit.clock.now, boostRemaining: kit.actions.remaining('boost'), repairRemaining: kit.actions.remaining('repair'), revision, message }),
      enqueue(command) {
        if (ctx.signal.aborted || !playing() || queue.length >= 32 || !isObject(command)) return false;
        if (command.type === 'move') {
          if (typeof command.x !== 'number' || typeof command.z !== 'number' || !Number.isFinite(command.x) || !Number.isFinite(command.z) || Math.abs(command.x) > 1 || Math.abs(command.z) > 1 || (!command.x && !command.z)) return false;
          queue.push({ type: 'move', x: command.x, z: command.z });
        } else if (command.type === 'collect' || command.type === 'deliver' || command.type === 'boost' || command.type === 'repair' || command.type === 'restart') queue.push({ type: command.type });
        else return false;
        return true;
      },
    });
    ctx.systems.add({ id: 'sky/game.flight', phase: 'movement', update(dt) {
      if (!playing()) { queue.length = 0; return; }
      const command = queue.shift();
      if (command?.type === 'restart') {
        boost.dispose(); immunity.dispose(); kit.dispose(); kit = createMechanicKit(ctx, kitId, 'flight');
        boost = createDeadline(ctx, kit.clock); immunity = createDeadline(ctx, kit.clock);
        x = 0; z = 0; cargo = null; status = 'playing'; collected = route.deliveries.map(() => false); delivered = route.deliveries.map(() => false); queue.length = 0; message = 'Flight reset. Recover the crates.'; revision++; return;
      }
      if (status !== 'playing') { queue.length = 0; return; }
      kit.clock.advance(dt);
      if (command?.type === 'move') {
        const length = Math.hypot(command.x, command.z); const speed = boost.armed && !boost.due() ? 10 : 5;
        x = Math.max(-9, Math.min(9, x + command.x / length * speed * dt)); z = Math.max(-8, Math.min(8, z + command.z / length * speed * dt));
      } else if (command?.type === 'collect') {
        const index = route.deliveries.findIndex((p, i) => !collected[i] && near(x, z, p.pickup));
        if (cargo === null && index >= 0) {
          const result = kit.actions.execute('collect');
          if (result.ok) { cargo = index; collected[index] = true; message = `Crate ${index + 1} aboard. Fly south to beacon ${index + 1}.`; }
          else message = `Recovery unavailable: ${result.reason}`;
        } else message = 'Approach an unclaimed crate with an empty hold.';
      } else if (command?.type === 'deliver') {
        if (cargo !== null && near(x, z, route.deliveries[cargo]!.beacon) && kit.actions.execute('deliver').ok) {
          const index = cargo; cargo = null; delivered[index] = true;
          kit.objectives.record('deliveries', 1, `beacon-${route.deliveries[index]!.id}`);
          message = `Beacon ${index + 1} supplied.`;
          if (kit.objectives.complete) { status = 'won'; message = 'All beacons supplied. Flight complete!'; }
        } else message = 'Carry a crate to its matching beacon.';
      } else if (command?.type === 'boost') {
        if (kit.actions.execute('boost').ok) { boost.arm(1.5); message = 'Boost engaged.'; } else message = 'Boost cooling down or insufficient energy.';
      } else if (command?.type === 'repair') {
        const result = kit.actions.execute('repair');
        if (result.ok) message = 'Hull repaired.'; else {
          const repair = kit.definition.actions.find(a => a.id === 'repair')!;
          message = `Repair needs ${repair.spend?.['energy']} energy and ${repair.gain?.['hull']} missing hull; cooldown ${kit.actions.remaining('repair').toFixed(1)}s.`;
        }
      }
      const hazardX = Math.sin(kit.clock.now * 0.9) * 4;
      if ((!immunity.armed || immunity.due()) && Math.hypot(x - hazardX, z) < 0.8) {
        const damage = Math.min(20, kit.resources.get('hull'));
        if (damage > 0 && kit.resources.transact({ spend: { hull: damage } }, 'storm collision').ok) { immunity.arm(1.5); message = 'Storm drone impact! Avoid the moving red hazard.'; }
        if (kit.resources.get('hull') <= 0) { status = 'lost'; message = 'Drone lost. Press R to launch again.'; }
      }
      revision++;
    } });
  },
});
