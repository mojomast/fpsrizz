import { ExperienceRole, MechanicKits, SessionControl, actionMechanic, createMechanicKit, definePlugin, isObject } from '@bulkhead/sdk';
import { Ember, EmberConfigs } from '../../contracts/ember.ts';
import type { MechanicActions } from '@bulkhead/sdk';
import type { EmberCommand, EmberEnemy, EmberPoint } from '../../contracts/ember.ts';
import { loadDefense } from './content.ts';

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'ember/bastion', {
      name: 'Ember Bastion', description: 'Forge defenses against the ash tide.', pointer: 'free',
      controls: [['Click pad / pad buttons', 'Build a tower'], ['Launch wave', 'Start next assault'],
        ['Repair / Pulse', 'Spend scrap to save the core'], ['Escape', 'Pause']],
    });
    ctx.contentKind('ember-defense', { description: 'Authored tower-defense lane', load(data, c) {
      const config = loadDefense(data, c.r);
      if (config) c.register(EmberConfigs, c.id, config);
    } });
    ctx.addValidator(v => {
      const id = v.preset.options['defense'];
      const config = typeof id === 'string' ? v.registries.get(EmberConfigs, id) : undefined;
      if (!config) { v.reporter('preset', 'options.defense').error('select an installed ember-defense'); return; }
      if (v.selectedRole(ExperienceRole) !== 'ember/bastion') v.reporter('preset', 'roles.sdk/experience').error('select ember/bastion');
      const kit = v.registries.get(MechanicKits, config.kit), r = v.reporter('ember/game', 'kit');
      if (!kit) { r.error(`missing mechanic kit ${config.kit}`); return; }
      if (kit.domain !== 'seconds') r.error('kit must use seconds');
      if (kit.objectives.length !== config.waves.length) r.error('kit must have exactly one objective per wave');
      for (const id of ['scrap', 'integrity']) if (!kit.resources.some(x => x.id === id)) r.error(`missing resource ${id}`);
      for (const id of ['build', 'repair', 'pulse']) if (!kit.actions.some(x => x.id === id)) r.error(`missing action ${id}`);
      for (let i = 0; i < config.waves.length; i++) {
        const objective = kit.objectives.find(x => x.id === `wave-${i + 1}`);
        if (!objective) r.error(`missing objective wave-${i + 1}`);
        else if (objective.target !== 1 || (objective.requires ?? []).some(dep => !config.waves.slice(0, i).some((_, j) => dep === `wave-${j + 1}`))) {
          r.error(`wave-${i + 1} must have target 1 and only earlier wave prerequisites`);
        }
      }
    });
  },
  activate(ctx) {
    const config = ctx.registries.require(EmberConfigs, String(ctx.preset.options['defense']));
    const actionProvider = actionMechanic(ctx);
    let kit = createMechanicKit(ctx, config.kit, 'ember/bastion');
    let status: 'build' | 'wave' | 'won' | 'lost' = 'build';
    let wave = 0, revision = 0, nextId = 1, spawned = 0, spawnTimer = 0;
    let message = 'Forge towers on pads, then launch the first wave.';
    const towers: { pad: number; fire: MechanicActions }[] = [];
    const enemies: { id: number; distance: number; health: number; maxHealth: number }[] = [];
    const queue: EmberCommand[] = [];
    const segments = config.lane.slice(1).map((p, i) => Math.hypot(p.x - config.lane[i]!.x, p.z - config.lane[i]!.z));
    const length = segments.reduce((a, b) => a + b, 0);
    const inRange = (p: EmberPoint) => segments.some((n, i) => {
      const a = config.lane[i]!, b = config.lane[i + 1]!;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (n * n)));
      return Math.hypot(p.x - a.x - (b.x - a.x) * t, p.z - a.z - (b.z - a.z) * t) <= config.range;
    });
    const point = (distance: number): EmberPoint => {
      let left = distance;
      for (let i = 0; i < segments.length; i++) {
        const n = segments[i]!, a = config.lane[i]!, b = config.lane[i + 1]!;
        if (left <= n) return { x: a.x + (b.x - a.x) * left / n, z: a.z + (b.z - a.z) * left / n };
        left -= n;
      }
      return config.lane[config.lane.length - 1]!;
    };
    const playing = () => ctx.services.tryGet(SessionControl)?.playing !== false;
    const reset = () => {
      for (const tower of towers) tower.fire.dispose();
      towers.length = 0;
      kit.dispose();
      kit = createMechanicKit(ctx, config.kit, 'ember/bastion');
      status = 'build'; wave = 0; nextId = 1; spawned = 0; spawnTimer = 0;
      enemies.length = 0;
      message = 'Forge towers on pads, then launch the first wave.';
    };
    ctx.services.provide(Ember, {
      config,
      get revision() { return revision; },
      state() {
        return {
          revision, status, wave, scrap: kit.resources.get('scrap'), integrity: kit.resources.get('integrity'),
          towers: towers.map(t => t.pad),
          enemies: enemies.map(e => ({ id: e.id, ...point(e.distance), health: e.health, maxHealth: e.maxHealth, progress: e.distance / length } satisfies EmberEnemy)),
          actions: kit.actions.definitions.map(definition => {
            const result = kit.actions.preview(definition.id);
            return { definition, remaining: kit.actions.remaining(definition.id), available: result.ok, reason: result.reason };
          }),
          message,
        };
      },
      enqueue(command) {
        if (ctx.signal.aborted || !playing() || queue.length >= 32 || !isObject(command)) return false;
        if (command.type === 'build') {
          if (!Number.isInteger(command.pad)) return false;
          queue.push({ type: 'build', pad: command.pad });
        } else if (command.type === 'launch' || command.type === 'repair' || command.type === 'pulse' || command.type === 'replay') {
          queue.push({ type: command.type });
        } else return false;
        return true;
      },
    });
    ctx.systems.add({ id: 'ember/game.defense', phase: 'rules', update(dt) {
      if (!playing()) { queue.length = 0; return; }
      // The read model's cooldowns also change while waiting between waves.
      const cooling = kit.actions.definitions.some(d => kit.actions.remaining(d.id) > 0);
      kit.clock.advance(dt);
      if (cooling) revision++;
      const command = queue.shift();
      if (command) {
        if (command.type === 'replay' && (status === 'won' || status === 'lost')) {
          reset(); queue.length = 0;
        } else if (status === 'build' || status === 'wave') {
          if (command.type === 'build') {
            const p = config.pads[command.pad];
            if (!p || !inRange(p) || towers.some(t => t.pad === command.pad)) message = 'Choose an empty pad within range of the lane.';
            else {
              const result = kit.actions.execute('build');
              if (result.ok) {
                const fire = actionProvider.create(ctx, `ember/tower/${command.pad}`, kit.resources, kit.clock,
                  [{ id: 'fire', label: 'Fire', cooldown: config.fireInterval }]);
                towers.push({ pad: command.pad, fire });
                message = `Tower forged on pad ${command.pad + 1}.`;
              } else message = result.reason;
            }
          } else if (command.type === 'launch' && status === 'build') {
            status = 'wave'; spawned = 0; spawnTimer = 0; message = `Wave ${wave + 1} incoming.`;
          } else if (command.type === 'repair') {
            const result = kit.actions.execute('repair'); message = result.ok ? 'Core repaired.' : result.reason;
          } else if (command.type === 'pulse') {
            if (!enemies.length) message = 'Pulse needs enemies in the lane.';
            else {
              const result = kit.actions.execute('pulse');
              if (result.ok) { for (const e of enemies) e.health -= 6; message = 'Ember pulse strikes the lane.'; }
              else message = result.reason;
            }
          }
        }
        revision++;
      }
      if (status !== 'wave') return;
      const w = config.waves[wave]!;
      spawnTimer -= dt;
      if (spawned < w.count && spawnTimer <= 0) {
        enemies.push({ id: nextId++, distance: 0, health: w.health, maxHealth: w.health });
        spawned++; spawnTimer += w.interval;
      }
      for (const e of enemies) e.distance += w.speed * dt;
      for (const tower of towers) {
        const pad = config.pads[tower.pad]!;
        const target = enemies.filter(e => e.health > 0 && Math.hypot(point(e.distance).x - pad.x, point(e.distance).z - pad.z) <= config.range)
          .sort((a, b) => b.distance - a.distance)[0];
        if (target && tower.fire.execute('fire').ok) target.health -= config.damage;
      }
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i]!;
        if (e.health <= 0) {
          enemies.splice(i, 1);
          const def = kit.resources.definitions.find(d => d.id === 'scrap')!;
          const gain = Math.min(config.reward, def.max - kit.resources.get('scrap'));
          if (gain > 0) kit.resources.transact({ gain: { scrap: gain } }, 'salvage');
        } else if (e.distance >= length) {
          enemies.splice(i, 1);
          const damage = Math.min(config.leakDamage, kit.resources.get('integrity'));
          if (damage > 0) kit.resources.transact({ spend: { integrity: damage } }, 'breach');
          if (kit.resources.get('integrity') <= 0) {
            status = 'lost'; message = 'The core fell. Replay to rebuild.'; enemies.length = 0; break;
          }
        }
      }
      if (status === 'wave' && spawned === w.count && enemies.length === 0) {
        kit.objectives.record(`wave-${wave + 1}`, 1, `wave-${wave + 1}`);
        wave++; status = kit.objectives.complete ? 'won' : 'build';
        message = status === 'won' ? 'The ash tide is broken. Bastion holds!' : 'Wave cleared. Reinforce and launch the next.';
      }
      revision++;
    } });
  },
});
