import type { NavigationNode } from '@bulkhead/sdk';
import type { TacticsCommand, TacticsForecast, TacticsMission, TacticsUnit } from '../../contracts/tactics.ts';
import { ExperienceRole, Flow, NavigationRole, OutcomeRatingRole, OutcomeRatingProviders, SessionControl, definePlugin, isObject, outcomeRatingMechanic, vArray, vNumber, vOneOf, vString } from '@bulkhead/sdk';
import { Tactics, TacticsMissions, TacticsResolved } from '../../contracts/tactics.ts';

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ExperienceRole, 'board/tactics', {
      name: 'Signal Break',
      description: 'Command a squad one decision at a time.',
      pointer: 'free',
      controls: [
        ['Click / Enter', 'Select unit or issue action'],
        ['Arrow keys', 'Move board cursor'],
        ['M / A', 'Move / attack'],
        ['E', 'End turn'],
      ],
    });
    ctx.contentKind('board-mission', {
      description: 'A grid mission with squad and enemy deployments.',
      load(data, c) {
        if (!isObject(data)) return void c.r.error('expected a mission object');
        const name = vString(data.name, c.r.at('name'), {
          nonEmpty: true,
          max: 80,
        });
        const rawRows = vArray(data.rows, c.r.at('rows'), { min: 2, max: 20 });
        const rows: string[] = [];
        rawRows?.forEach((row, i) => {
          const s = vString(row, c.r.at('rows').at(i), {
            nonEmpty: true,
            max: 20,
          });
          if (s !== undefined) {
            if (!/^[.#C]+$/.test(s)) c.r.at('rows').at(i).error('use only . (floor), # (wall), and C (cover)');
            rows.push(s);
          }
        });
        if (rows.length && rows.some((r) => r.length !== rows[0]!.length))
          c.r.at('rows').error('all rows must have the same width');
        const rawUnits = vArray(data.units, c.r.at('units'), {
          min: 2,
          max: 24,
        });
        const units: TacticsUnit[] = [];
        const ids = new Set<string>();
        const occupied = new Set<string>();
        rawUnits?.forEach((u, i) => {
          const r = c.r.at('units').at(i);
          if (!isObject(u)) {
            r.error('expected a unit object');
            return;
          }
          const id = vString(u.id, r.at('id'), { nonEmpty: true, max: 40 });
          const label = vString(u.name, r.at('name'), {
            nonEmpty: true,
            max: 40,
          });
          const team = vOneOf(u.team, r.at('team'), ['squad', 'enemy'] as const);
          const x = vNumber(u.x, r.at('x'), { min: 0, max: 19, int: true });
          const y = vNumber(u.y, r.at('y'), { min: 0, max: 19, int: true });
          const hp = vNumber(u.hp, r.at('hp'), { min: 1, max: 20, int: true });
          const ap = vNumber(u.ap, r.at('ap'), { min: 1, max: 2, int: true });
          if (
            id === undefined ||
            label === undefined ||
            team === undefined ||
            x === undefined ||
            y === undefined ||
            hp === undefined ||
            ap === undefined
          )
            return;
          if (ids.has(id)) r.at('id').error('unit ids must be unique');
          ids.add(id);
          if (!rows[y] || x >= rows[y]!.length || rows[y]![x] === '#') r.error('unit must start on a traversable cell');
          if (occupied.has(`${x},${y}`)) r.error('units cannot occupy the same cell');
          occupied.add(`${x},${y}`);
          units.push({ id, name: label, team, x, y, hp, ap });
        });
        if (!units.some((u) => u.team === 'squad') || !units.some((u) => u.team === 'enemy'))
          c.r.at('units').error('include at least one squad unit and one enemy');
        if (name && rawRows && rawUnits && rows.length === rawRows.length && units.length === rawUnits.length)
          c.register(TacticsMissions, c.id, { name, rows, units });
      },
    });
    ctx.addValidator((v) => {
      const rating = v.selectedRole(OutcomeRatingRole);
      if (rating && !v.registries.has(OutcomeRatingProviders, rating))
        v.reporter('preset', 'roles.sdk/mechanic-outcome-rating').error('selected rating role needs a registered OutcomeRatingProviders factory');
      const id = v.preset.options['mission'];
      if (typeof id !== 'string' || !v.registries.has(TacticsMissions, id))
        v.reporter('preset', 'options.mission').error('select an installed board mission');
      if (v.selectedRole(ExperienceRole) !== 'board/tactics')
        v.reporter('preset', 'roles.sdk/experience').error('select board/tactics for a board mission');
      const foreignExperiences = new Set(v.roleProviders(ExperienceRole).filter(provider => provider.owner !== 'board/tactics').map(provider => provider.owner));
      const incompatible = v.activePlugins.filter(
        (id) =>
          foreignExperiences.has(id) || ['core/world', 'core/player', 'core/combat',
            'core/enemies', 'core/modes', 'core/hud', 'core/presentation', 'core/content'].includes(id),
      );
      if (incompatible.length)
        v.reporter('preset', 'plugins').error(
          `board/tactics cannot be combined with other game families: ${incompatible.join(', ')}`,
        );
    });
  },
  activate(ctx) {
    const navigation = ctx.role(NavigationRole)!.provider;
    const mission: TacticsMission = ctx.registries.require(TacticsMissions, String(ctx.preset.options['mission']));
    const units = mission.units.map((u) => ({ ...u }));
    const state = {
      mission,
      units,
      turn: 1,
      outcome: 'playing' as 'playing' | 'victory' | 'defeat',
      revision: 0,
      message: 'Select a squad member. Neutralize all hostiles.',
    };
    const queue: TacticsCommand[] = [];
    const seen = new Set<string>();
    const living = (id: string) => units.find((u) => u.id === id && u.hp > 0);
    const tile = (x: number, y: number) => mission.rows[y]?.[x];
    const free = (x: number, y: number) =>
      tile(x, y) !== undefined && tile(x, y) !== '#' && !units.some((u) => u.hp > 0 && u.x === x && u.y === y);
    const reach = (u: TacticsUnit) => {
      const origin = `${u.x},${u.y}`;
      const cells = new Map<string, { x: number; y: number }>([[origin, { x: u.x, y: u.y }]]);
      for (let y = 0; y < mission.rows.length; y++) {
        for (let x = 0; x < mission.rows[y]!.length; x++) {
          if (free(x, y)) cells.set(`${x},${y}`, { x, y });
        }
      }
      const nodes: NavigationNode[] = [...cells].map(([id, p]) => ({
        id,
        neighbors: [`${p.x},${p.y - 1}`, `${p.x - 1},${p.y}`, `${p.x + 1},${p.y}`, `${p.x},${p.y + 1}`]
          .filter(key => cells.has(key)),
      }));
      return navigation.search(nodes, origin, u.ap * 3).slice(1)
        .map(p => ({ ...cells.get(p.node)!, cost: Math.ceil(p.steps / 3) }));
    };
    const forecast = (a: TacticsUnit | undefined, b: TacticsUnit | undefined): TacticsForecast => {
      if (!a || !b || a.team === b.team)
        return {
          legal: false,
          damage: 0,
          cover: false,
          reason: 'Choose a living opponent',
        };
      if (a.ap < 1)
        return {
          legal: false,
          damage: 0,
          cover: false,
          reason: 'No action points',
        };
      const dx = b.x - a.x,
        dy = b.y - a.y;
      if (Math.abs(dx) + Math.abs(dy) > 7)
        return {
          legal: false,
          damage: 0,
          cover: false,
          reason: 'Out of range',
        };
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for (let i = 1; i < steps; i++)
        if (tile(Math.round(a.x + (dx * i) / steps), Math.round(a.y + (dy * i) / steps)) === '#')
          return {
            legal: false,
            damage: 0,
            cover: false,
            reason: 'Line of sight blocked',
          };
      const cover = tile(b.x, b.y) === 'C';
      return {
        legal: true,
        damage: cover ? 1 : 2,
        cover,
        reason: cover ? 'Target in cover' : 'Clear shot',
      };
    };
    const end = () => {
      const team = (t: TacticsUnit['team']) => units.some((u) => u.team === t && u.hp > 0);
      if (!team('enemy')) state.outcome = 'victory';
      else if (!team('squad')) state.outcome = 'defeat';
      if (state.outcome !== 'playing') {
        if (state.outcome === 'victory') ctx.events.emit(TacticsResolved, { cue: 'tactics-victory' });
        const squadSize = units.filter(u => u.team === 'squad').length;
        const rating = state.outcome === 'victory' && ctx.role(OutcomeRatingRole) ? outcomeRatingMechanic(ctx).create(ctx, 'board/victory', {
          tiers: [
            { id: 'Bronze', conditions: [{ metric: 'survivors', operator: 'at-least', value: 1 }] },
            { id: 'Silver', conditions: [{ metric: 'survivors', operator: 'at-least', value: squadSize }] },
            { id: 'Gold', conditions: [{ metric: 'survivors', operator: 'at-least', value: squadSize }, { metric: 'turns', operator: 'at-most', value: 3 }] },
          ],
        }) : undefined;
        const medal = rating?.evaluate({ survivors: units.filter(u => u.team === 'squad' && u.hp > 0).length, turns: state.turn });
        rating?.dispose();
        ctx.services.tryGet(Flow)?.end({
          outcome: state.outcome,
          title: state.outcome === 'victory' ? (ctx.preset.options['mission'] === 'board/signal-break' ? 'Signal secured' : 'Mission complete') : 'Squad lost',
          detail: state.outcome === 'victory' ? (ctx.preset.options['mission'] === 'board/signal-break' ? 'The relay is yours.' : `${mission.name}: all hostiles neutralized.`) : 'The defenders held their ground.',
          stats: [['Turns', String(state.turn)], ...(medal ? [['Medal', medal] as [string, string]] : [])],
        });
      }
    };
    const fire = (a: TacticsUnit, b: TacticsUnit) => {
      const f = forecast(a, b);
      if (!f.legal) return false;
      a.ap--;
      b.hp = Math.max(0, b.hp - f.damage);
      state.message = `${a.name} hit ${b.name} for ${f.damage}${f.cover ? ' (cover)' : ''}.`;
      ctx.events.emit(TacticsResolved, { cue: 'tactics-attack' });
      end();
      return true;
    };
    const enemyTurn = () => {
      for (const e of units.filter((u) => u.team === 'enemy' && u.hp > 0)) {
        if (state.outcome !== 'playing') break;
        e.ap = 2;
        for (let action = 0; action < 2 && e.ap > 0 && state.outcome === 'playing'; action++) {
          const targets = units
            .filter((u) => u.team === 'squad' && u.hp > 0)
            .sort(
              (a, b) =>
                Math.abs(a.x - e.x) + Math.abs(a.y - e.y) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)) ||
                (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
            );
          const target = targets.find((t) => forecast(e, t).legal);
          if (target) {
            fire(e, target);
            continue;
          }
          const goal = targets[0];
          if (!goal) break;
          const moves = reach(e)
            .filter((p) => p.cost === 1)
            .sort(
              (a, b) =>
                Math.abs(a.x - goal.x) + Math.abs(a.y - goal.y) - (Math.abs(b.x - goal.x) + Math.abs(b.y - goal.y)) ||
                a.y - b.y ||
                a.x - b.x,
            );
          const p = moves[0];
          if (!p) break;
          e.x = p.x;
          e.y = p.y;
          e.ap--;
        }
      }
      if (state.outcome === 'playing') {
        state.turn++;
        units.filter((u) => u.team === 'squad' && u.hp > 0).forEach((u) => (u.ap = 2));
        state.message = 'Your turn. Squad action points restored.';
      }
    };
    ctx.services.provide(Tactics, {
      state,
      enqueue(command) {
        if (
          ctx.services.tryGet(SessionControl)?.playing === false ||
          !command ||
          typeof command !== 'object' ||
          typeof command.id !== 'string' ||
          !command.id.trim() ||
          command.id.length > 128 ||
          seen.has(command.id) ||
          seen.size >= 4096 ||
          queue.length >= 128 ||
          state.outcome !== 'playing'
        )
          return false;
        if (command.type === 'move') {
          if (
            typeof command.unit !== 'string' ||
            !command.unit ||
            !Number.isSafeInteger(command.x) ||
            !Number.isSafeInteger(command.y)
          )
            return false;
        } else if (command.type === 'attack') {
          if (
            typeof command.unit !== 'string' ||
            !command.unit ||
            typeof command.target !== 'string' ||
            !command.target
          )
            return false;
        } else if (command.type !== 'end-turn') return false;
        seen.add(command.id);
        queue.push({ ...command });
        return true;
      },
      reachable(id) {
        const u = living(id);
        return u && u.team === 'squad' && state.outcome === 'playing' ? reach(u) : [];
      },
      forecast(a, b) {
        return forecast(living(a), living(b));
      },
    });
    ctx.systems.add({
      id: 'board/tactics.commands',
      phase: 'control',
      update() {
        while (queue.length) {
          const c = queue.shift()!;
          if (state.outcome !== 'playing') continue;
          if (c.type === 'end-turn') {
            enemyTurn();
            state.revision++;
            continue;
          }
          const u = living(c.unit);
          if (!u || u.team !== 'squad') {
            state.message = 'Invalid unit.';
            state.revision++;
            continue;
          }
          if (c.type === 'move') {
            const p = reach(u).find((p) => p.x === c.x && p.y === c.y);
            if (p) {
              u.x = p.x;
              u.y = p.y;
              u.ap -= p.cost;
              state.message = `${u.name} moved · ${p.cost} AP.`;
              ctx.events.emit(TacticsResolved, { cue: 'tactics-move' });
            } else state.message = 'Destination unreachable.';
          } else {
            const b = living(c.target);
            if (!b || !fire(u, b)) state.message = forecast(u, b).reason;
          }
          state.revision++;
        }
      },
    });
  },
});
