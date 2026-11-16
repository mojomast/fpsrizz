import { Hearth, HearthHouseholds, SessionControl, actionMechanic, clockMechanic, createCommandQueue, definePlugin, isObject, objectiveMechanic, relationshipMechanic, resourceMechanic, vArray, vNumber, vString } from '../../sdk/index.ts';
import type { HearthActivity, HearthCommand, HearthFinish, HearthObjectDefinition, HearthPlacement, HearthResidentDefinition, HearthRoom, HearthTile, ResourcePool } from '../../sdk/index.ts';

const categories = ['sleep', 'cooking', 'hygiene', 'seating', 'work', 'decor'] as const;
const rooms: readonly HearthRoom[] = ['bedroom', 'kitchen', 'living room', 'bathroom'];
const finishes: readonly HearthFinish[] = ['oak', 'tile', 'sage', 'terracotta'];

export default definePlugin({
  register(ctx) {
    ctx.contentKind('hearth-household', { description: 'A Common Ground household.', load(data, c) {
      if (!isObject(data)) { c.r.error('expected a household object'); return; }
      for (const key of Object.keys(data)) if (!['name', 'intro', 'residents', 'visitors', 'objects'].includes(key)) c.r.at(key).error('unknown property');
      const name = vString(data.name, c.r.at('name'), { nonEmpty: true, max: 80 });
      const intro = vString(data.intro, c.r.at('intro'), { nonEmpty: true, max: 500 });
      const residents: HearthResidentDefinition[] = [];
      vArray(data.residents, c.r.at('residents'), { min: 3, max: 3 })?.forEach((value, index) => {
        const r = c.r.at('residents').at(index);
        if (!isObject(value)) { r.error('expected a resident object'); return; }
        for (const key of Object.keys(value)) if (!['id', 'name', 'occupation', 'shiftStart', 'description'].includes(key)) r.at(key).error('unknown property');
        const id = vString(value.id, r.at('id'), { nonEmpty: true, max: 32 });
        const residentName = vString(value.name, r.at('name'), { nonEmpty: true, max: 60 });
        const occupation = vString(value.occupation, r.at('occupation'), { nonEmpty: true, max: 80 });
        const description = vString(value.description, r.at('description'), { nonEmpty: true, max: 300 });
        const shiftStart = vNumber(value.shiftStart, r.at('shiftStart'), { min: 0, max: 1199, int: true });
        if (id && !/^[a-z][a-z0-9-]*$/.test(id)) r.at('id').error('use a lowercase local ID');
        if (id && residentName && occupation && description && shiftStart !== undefined) residents.push(Object.freeze({ id, name: residentName, occupation, description, shiftStart }));
      });
      const visitors: string[] = [];
      vArray(data.visitors, c.r.at('visitors'), { min: 2, max: 2 })?.forEach((value, index) => {
        const visitor = vString(value, c.r.at('visitors').at(index), { nonEmpty: true, max: 60 });
        if (visitor) visitors.push(visitor);
      });
      const objects: HearthObjectDefinition[] = [];
      vArray(data.objects, c.r.at('objects'), { min: 18, max: 18 })?.forEach((value, index) => {
        const r = c.r.at('objects').at(index);
        if (!isObject(value)) { r.error('expected a furnishing object'); return; }
        for (const key of Object.keys(value)) if (!['id', 'name', 'category', 'cost', 'description'].includes(key)) r.at(key).error('unknown property');
        const id = vString(value.id, r.at('id'), { nonEmpty: true, max: 32 });
        const objectName = vString(value.name, r.at('name'), { nonEmpty: true, max: 60 });
        const category = vString(value.category, r.at('category'), { nonEmpty: true, max: 20 });
        const cost = vNumber(value.cost, r.at('cost'), { min: 1, max: 10000, int: true });
        const description = vString(value.description, r.at('description'), { nonEmpty: true, max: 300 });
        if (id && !/^[a-z][a-z0-9-]*$/.test(id)) r.at('id').error('use a lowercase local ID');
        if (category && !categories.some(item => item === category)) r.at('category').error('expected sleep, cooking, hygiene, seating, work or decor');
        if (id && objectName && category && categories.some(item => item === category) && cost !== undefined && description) objects.push(Object.freeze({ id, name: objectName, category: category as HearthObjectDefinition['category'], cost, description }));
      });
      if (new Set(residents.map(item => item.id)).size !== residents.length) c.r.at('residents').error('resident IDs must be unique');
      if (new Set(objects.map(item => item.id)).size !== objects.length) c.r.at('objects').error('furnishing IDs must be unique');
      if (new Set(visitors).size !== visitors.length) c.r.at('visitors').error('visitor names must be unique');
      for (const category of categories) if (objects.filter(item => item.category === category).length !== 3) c.r.at('objects').error(`expected three ${category} furnishings`);
      if (!c.r.failed && name && intro) c.register(HearthHouseholds, c.id, Object.freeze({ name, intro, residents: Object.freeze(residents), visitors: Object.freeze(visitors), objects: Object.freeze(objects) }));
    } });
    ctx.addValidator(v => {
      const id = v.preset.options['household'];
      if (typeof id !== 'string' || !v.registries.get(HearthHouseholds, id)) v.reporter('preset', 'options.household').error('select an installed hearth-household');
    });
  },
  activate(ctx) {
    const household = ctx.registries.require(HearthHouseholds, String(ctx.preset.options['household']));
    const relationshipProvider = relationshipMechanic(ctx);
    const resources = resourceMechanic(ctx), clocks = clockMechanic(ctx), actionProvider = actionMechanic(ctx), objectiveProvider = objectiveMechanic(ctx);
    const verbs: readonly HearthActivity[] = ['sleep', 'eat', 'wash', 'chat', 'reconcile', 'work', 'leisure', 'wait', 'greet', 'host', 'pay-debt'];
    const queue = createCommandQueue<HearthCommand>(ctx, { capacity: 32, normalize(input) {
      if (!isObject(input)) return undefined;
      if (input.type === 'restart') return { type: 'restart' };
      if (input.type === 'pause' && typeof input.paused === 'boolean') return { type: 'pause', paused: input.paused };
      if (input.type === 'select' && typeof input.resident === 'string') return { type: 'select', resident: input.resident };
      if (input.type === 'autonomy' && typeof input.resident === 'string' && typeof input.enabled === 'boolean') return { type: 'autonomy', resident: input.resident, enabled: input.enabled };
      if ((input.type === 'buy' || input.type === 'sell') && typeof input.object === 'string') return { type: input.type, object: input.object };
      if (Number.isInteger(input.x) && Number.isInteger(input.y) && typeof input.x === 'number' && typeof input.y === 'number' && input.x >= 0 && input.x < 8 && input.y >= 0 && input.y < 6) {
        if ((input.type === 'build-floor' || input.type === 'zone-floor') && typeof input.room === 'string' && rooms.includes(input.room as HearthRoom)) return { type: input.type, x: input.x, y: input.y, room: input.room as HearthRoom };
        if (input.type === 'remove-floor') return { type: 'remove-floor', x: input.x, y: input.y };
        if (input.type === 'finish-floor' && typeof input.finish === 'string' && finishes.includes(input.finish as HearthFinish)) return { type: 'finish-floor', x: input.x, y: input.y, finish: input.finish as HearthFinish };
        if (input.type === 'place-furniture' && typeof input.object === 'string' && (input.rotation === 0 || input.rotation === 1 || input.rotation === 2 || input.rotation === 3)) return { type: 'place-furniture', x: input.x, y: input.y, object: input.object, rotation: input.rotation };
      }
      if (input.type === 'act' && typeof input.action === 'string' && verbs.includes(input.action as HearthActivity) && (input.target === undefined || typeof input.target === 'string')) return { type: 'act', action: input.action as HearthActivity, ...(typeof input.target === 'string' ? { target: input.target } : {}) };
      return undefined;
    } });
    type Person = { id: string; pool: ResourcePool; room: string; activity: string; autonomy: boolean; shifts: number; careerProgress: number; lastShift: number };
    let clock: ReturnType<typeof clocks.create>, money: ResourcePool, people: Person[], actions: ReturnType<typeof actionProvider.create>, goals: ReturnType<typeof objectiveProvider.create>;
    let relationships: ReturnType<typeof relationshipProvider.create>;
    let furniture: string[], pairs: Set<string>, meals: number, repairShifts: number, selected: string, paused: boolean, revision = 0, events: string[], message: string, gathering: 'unplanned' | 'hosted', tier: number, greeted: string[], debt: number;
    let tiles: HearthTile[], placements: HearthPlacement[];
    const dayAt = () => Math.floor((clock.now + 12) / 48);
    const minuteAt = () => ((clock.now + 12) % 48) * 30;
    const key = (a: string, b: string) => [a, b].sort().join('|');
    const dispose = () => { actions.dispose(); goals.dispose(); relationships.dispose(); for (const person of people) person.pool.dispose(); money.dispose(); clock.dispose(); };
    const start = () => {
      clock = clocks.create(ctx, 'common/clock', 'turns');
      money = resources.create(ctx, 'common/money', [{ id: 'money', label: 'Household credits', initial: 180, max: 100000 }]);
      people = household.residents.map((resident, i) => ({ id: resident.id, pool: resources.create(ctx, `common/needs-${resident.id}`, [
        { id: 'energy', label: 'Energy', initial: 75 - i * 6, max: 100 }, { id: 'nourishment', label: 'Nourishment', initial: 70 + i * 5, max: 100 },
        { id: 'comfort', label: 'Comfort', initial: 75 - i * 3, max: 100 }, { id: 'connection', label: 'Connection', initial: 55 + i * 8, max: 100 },
      ]), room: ['bedroom', 'kitchen', 'living room'][i] ?? 'living room', activity: 'At home', autonomy: true, shifts: 0, careerProgress: 0, lastShift: -1 }));
      actions = actionProvider.create(ctx, 'common/actions', money, clock, [
        { id: 'eat', label: 'Prepare a meal', cooldown: 0, spend: { money: 5 } },
        { id: 'host', label: 'Host gathering', cooldown: 0, spend: { money: 30 } },
      ]);
      goals = objectiveProvider.create(ctx, 'common/projects', [
        { id: 'welcome-table', label: 'Welcome Table', target: 1 }, { id: 'repair-circle', label: 'Repair Circle', target: 1 }, { id: 'shared-story', label: 'Shared Story', target: 1 },
      ]);
      furniture = ['cot', 'stove', 'sink'].filter(id => household.objects.some(object => object.id === id));
      tiles = [];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
        const room = rooms[(y >= 2 ? 2 : 0) + (x >= 3 ? 1 : 0)]!;
        tiles.push({ x, y, room, finish: room === 'bathroom' || room === 'kitchen' ? 'tile' : 'oak', original: true });
      }
      placements = furniture.map((object, i) => ({ object, x: [0, 4, 4][i]!, y: [0, 0, 2][i]!, rotation: 0 }));
      const initialPairs = []; for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) initialPairs.push({ a: people[i]!.id, b: people[j]!.id, score: 8 + i * 3 + j * 2 });
      relationships = relationshipProvider.create(ctx, 'common/relationships', { min: -100, max: 100, pairs: initialPairs });
      pairs = new Set(); meals = 0; repairShifts = 0; selected = people[0]!.id; paused = false; events = []; message = 'A new household begins.'; gathering = 'unplanned'; tier = 0; greeted = []; debt = 0;
    };
    start();
    ctx.scope.add(() => dispose(), 'common-simulation');
    const log = (text: string) => { message = text; events.push(`Day ${dayAt() + 1}: ${text}`); if (events.length > 40) events.shift(); };
    const need = (person: Person, id: string, delta: number) => {
      const value = person.pool.get(id), change = Math.max(-value, Math.min(100 - value, delta));
      if (change > 0) person.pool.transact({ gain: { [id]: change } }, 'care');
      if (change < 0) person.pool.transact({ spend: { [id]: -change } }, 'decay');
    };
    const owns = (category: HearthObjectDefinition['category']) => furniture.some(id => household.objects.find(item => item.id === id)?.category === category);
    // The best owned piece in a category determines its care bonus; duplicates do not stack.
    const quality = (category: HearthObjectDefinition['category']) => {
      const cost = Math.max(0, ...furniture.map(id => household.objects.find(item => item.id === id)).filter(item => item?.category === category).map(item => item!.cost));
      return cost >= 100 ? 12 : cost >= 70 ? 8 : 0;
    };
    const projects = () => {
      if (owns('seating') && meals >= 2) goals.record('welcome-table', 1, 'welcome');
      if (owns('work') && repairShifts >= 2) goals.record('repair-circle', 1, 'repair');
      if (pairs.size >= 2 && conversations >= 3) goals.record('shared-story', 1, 'story');
    };
    let conversations = 0;
    const strained = (person: Person) => person.pool.get('energy') < 20 || person.pool.get('comfort') < 20;
    const rank = (person: Person) => 1 + Math.min(2, Math.floor(person.careerProgress / 3));
    const shift = (person: Person, day: number) => {
      person.lastShift = day; person.shifts++; person.room = 'work'; person.activity = 'Completed shift';
      const exhausted = person.pool.get('energy') < 20 || person.pool.get('nourishment') < 20;
      const previousRank = rank(person);
      if (!exhausted) person.careerProgress++;
      const pay = (70 + (rank(person) - 1) * 10 + (owns('work') ? 10 : 0)) * (exhausted ? 0.8 : 1);
      money.transact({ gain: { money: Math.min(pay, 100000 - money.get('money')) } }, 'wages');
      need(person, 'energy', -15); need(person, 'nourishment', -10);
      if (person.id === household.residents[0]?.id) repairShifts++;
      const occupation = household.residents.find(r => r.id === person.id)!.occupation;
      log(`${person.id} completed a ${occupation} shift and earned ${pay} credits.${exhausted ? ' Low energy or nourishment reduced pay and stalled career progress.' : rank(person) > previousRank ? ` Promoted to rank ${rank(person)}!` : ''}`);
    };
    const act = (person: Person, verb: HearthActivity, target: string | undefined, autonomous = false): string | undefined => {
      if (verb === 'sleep' && !owns('sleep')) return 'A bed is needed.';
      if (verb === 'eat' && !owns('cooking')) return 'A cooker is needed.';
      if (verb === 'wash' && !owns('hygiene')) return 'A sink is needed.';
      const other = people.find(p => p.id === target && p !== person);
      if ((verb === 'chat' || verb === 'reconcile') && !other) return 'Choose another resident.';
      if (verb === 'chat' && other && relationships.get(person.id, other.id)! < -20) return 'The relationship needs reconciliation first.';
      if (verb === 'reconcile' && other && (strained(person) || strained(other))) return 'Both residents need at least 20 energy and comfort to reconcile.';
      if (verb === 'work' && person.lastShift === dayAt()) return 'This resident already worked today.';
      if (verb === 'pay-debt' && (debt === 0 || money.get('money') < debt)) return 'There is no debt or not enough money to pay it.';
      if (verb === 'host' && (gathering === 'hosted' || dayAt() < 6 || goals.snapshot().filter(g => g.complete).length < 2)) return 'Hosting requires day 7 and two completed projects.';
      if (verb === 'greet' && (!target || !household.visitors.includes(target) || gathering !== 'hosted' || greeted.includes(target))) return 'Choose an ungreeted guest at the gathering.';
      if (verb === 'eat' || verb === 'host') { const result = actions.execute(verb); if (!result.ok) return result.reason; }
      if (verb === 'sleep') { need(person, 'energy', 30 + quality('sleep')); person.room = 'bedroom'; }
      if (verb === 'eat') { need(person, 'nourishment', 30 + quality('cooking')); person.room = 'kitchen'; meals++; }
      if (verb === 'wash') { need(person, 'comfort', 24 + quality('hygiene')); person.room = 'bathroom'; }
      if (verb === 'leisure') { need(person, 'comfort', 10 + (owns('seating') ? 4 : 0) + (owns('decor') ? 2 : 0)); need(person, 'energy', 5); person.room = 'living room'; }
      if ((verb === 'chat' || verb === 'reconcile') && other) {
        const pair = key(person.id, other.id);
        const conflict = verb === 'chat' && (strained(person) || strained(other));
        const before = relationships.get(person.id, other.id)!;
        relationships.change(person.id, other.id, conflict ? -12 : verb === 'chat' ? 4 : 10);
        const friends = relationships.get(person.id, other.id)! >= 30;
        if (!conflict && before < 30 && friends) log(`${person.id} and ${other.id} became friends: conversations now restore extra connection.`);
        need(person, 'connection', conflict ? 4 : friends ? 20 : 15); need(other, 'connection', conflict ? 4 : friends ? 20 : 15); person.room = other.room = 'living room'; other.activity = conflict ? `Argued with ${person.id}` : `Talking with ${person.id}`;
        if (conflict) log(`${person.id} and ${other.id} argued: low energy or comfort strained their conversation (-12 relationship). Rest and wash before reconciling.`);
        else { pairs.add(pair); conversations++; }
      }
      if (verb === 'work') shift(person, dayAt());
      if (verb === 'pay-debt') { money.transact({ spend: { money: debt } }, 'debt'); debt = 0; }
      if (verb === 'host') { gathering = 'hosted'; person.room = 'yard'; }
      if (verb === 'greet' && target) { greeted.push(target); person.room = 'yard'; tier = greeted.length === 1 ? 1 : 2; if (greeted.length === 2 && debt === 0 && relationships.snapshot().reduce((sum, pair) => sum + pair.score, 0) / relationships.snapshot().length >= 20) tier = 3; }
      person.activity = verb; if (!autonomous && !(verb === 'chat' && other && (strained(person) || strained(other))) && verb !== 'work') log(`${person.id}: ${verb}${target ? ` with ${target}` : ''}.`);
      if (greeted.length === 2 && debt === 0 && relationships.snapshot().reduce((sum, pair) => sum + pair.score, 0) / relationships.snapshot().length >= 20 && tier < 3) { tier = 3; log('The household restored its bonds and completed the gathering.'); }
      projects(); return undefined;
    };
    const advance = (actor: Person, actorMayAct = false) => {
      clock.advance(1); const day = dayAt(), minute = minuteAt();
      for (const p of people) {
        need(p, 'energy', -2); need(p, 'nourishment', -3); need(p, 'comfort', -2); need(p, 'connection', -1);
        const definition = household.residents.find(r => r.id === p.id)!;
        if (p.autonomy && p.lastShift !== day && minute >= definition.shiftStart && minute < definition.shiftStart + 30) shift(p, day);
        else if ((p !== actor || actorMayAct) && p.autonomy) {
          const candidates: [string, HearthActivity][] = [['energy', 'sleep'], ['nourishment', 'eat'], ['comfort', 'wash']];
          const urgent = candidates.find(([id]) => p.pool.get(id) < 35);
          if (urgent) act(p, urgent[1], undefined, true);
          else if (p.pool.get('connection') < 35) {
            const other = people.filter(q => q !== p).sort((a, b) => relationships.get(p.id, b.id)! - relationships.get(p.id, a.id)!)[0];
            if (other) {
              const verb = relationships.get(p.id, other.id)! < -20 ? 'reconcile' : 'chat';
              const reason = act(p, verb, other.id, true);
              if (reason) p.activity = 'Giving others space';
            }
          }
          else p.activity = 'At home';
        }
      }
      if (minute === 0 && day > 0) {
        for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
          const a = people[i]!, b = people[j]!;
          if (strained(a) && strained(b) && (a.pool.get('connection') < 35 || b.pool.get('connection') < 35)) {
            relationships.change(a.id, b.id, -8);
            log(`${a.id} and ${b.id} lost patience overnight (-8 relationship). Care and reconciliation can repair it.`);
          }
        }
        if (debt > 0) { debt += 10; log('An overdue bill added a 10-credit fee.'); }
        if (day % 7 === 6) {
          const due = Math.min(100, money.get('money')); if (due) money.transact({ spend: { money: due } }, 'bill');
          debt += 100 - due; log(due === 100 ? 'The household paid its weekly bill.' : `The household paid ${due} of the 100-credit bill.`);
        }
      }
      projects();
    };
    ctx.services.provide(Hearth, { household, state: () => ({ revision, turn: clock.now, day: dayAt() + 1, minute: minuteAt(), paused, selected, money: money.get('money'), debt, residents: people.map(p => { const d = household.residents.find(r => r.id === p.id)!; return { id: p.id, name: d.name, occupation: d.occupation, shiftStart: d.shiftStart, needs: { energy: p.pool.get('energy'), nourishment: p.pool.get('nourishment'), comfort: p.pool.get('comfort'), connection: p.pool.get('connection') }, room: p.room, activity: p.activity, autonomy: p.autonomy, shifts: p.shifts, careerProgress: p.careerProgress, rank: rank(p) }; }), relationships: relationships.snapshot(), furniture: [...furniture], house: { width: 8, height: 6, tiles: tiles.map(tile => ({ ...tile })), placements: placements.map(item => ({ ...item })) }, projects: goals.snapshot().map(g => ({ id: g.id, value: g.value, target: g.target, complete: g.complete })), visitors: [...greeted], gathering, tier, events: [...events], message }), enqueue: command => queue.enqueue(command) });
    ctx.systems.add({ id: 'common/game.turn', phase: 'control', update() {
      if (ctx.services.tryGet(SessionControl)?.playing === false) { queue.clear(); return; }
      const command = queue.drainOne(); if (!command) return;
      if (command.type === 'restart') { dispose(); conversations = 0; start(); queue.clear(); revision++; return; }
      if (command.type === 'pause') { paused = command.paused; log(paused ? 'Household paused.' : 'Household resumed.'); revision++; return; }
      if (command.type === 'select' || command.type === 'autonomy') { const p = people.find(item => item.id === command.resident); if (!p) log('Unknown resident.'); else if (command.type === 'select') { selected = p.id; log(`Selected ${p.id}.`); } else { p.autonomy = command.enabled; log(`${p.id} autonomy ${p.autonomy ? 'enabled' : 'disabled'}.`); } revision++; return; }
      if (command.type === 'build-floor' || command.type === 'zone-floor' || command.type === 'remove-floor' || command.type === 'finish-floor' || command.type === 'place-furniture') {
        const tile = tiles.find(t => t.x === command.x && t.y === command.y);
        const occupant = placements.find(p => p.x === command.x && p.y === command.y);
        if (command.type === 'build-floor') {
          if (tile) log('This square already has a floor.');
          else if (!tiles.some(t => Math.abs(t.x - command.x) + Math.abs(t.y - command.y) === 1)) log('Build next to an existing floor.');
          else { const result = money.transact({ spend: { money: 15 } }, 'construction'); if (!result.ok) log(result.reason); else { tiles.push({ x: command.x, y: command.y, room: command.room, finish: 'oak', original: false }); log(`Built ${command.room} floor for 15 credits.`); } }
        } else if (command.type === 'zone-floor') {
          if (!tile) log('Build a floor first.');
          else if (tile.room === command.room) log('This floor already belongs to that room.');
          else { tiles = tiles.map(t => t === tile ? { ...t, room: command.room } : t); log(`Assigned floor to ${command.room}.`); }
        } else if (command.type === 'remove-floor') {
          if (!tile || tile.original) log('Only added floor can be removed.');
          else if (occupant) log('Move the furnishing before removing this floor.');
          else { const result = money.transact({ gain: { money: 7 } }, 'demolition'); if (!result.ok) log(result.reason); else { tiles = tiles.filter(t => t !== tile); log('Removed floor; recovered 7 credits.'); } }
        } else if (command.type === 'finish-floor') {
          if (!tile) log('Build a floor first.');
          else if (tile.finish === command.finish) log('This floor already has that finish.');
          else { const result = money.transact({ spend: { money: 3 } }, 'finish'); if (!result.ok) log(result.reason); else { tiles = tiles.map(t => t === tile ? { ...t, finish: command.finish } : t); log(`Applied ${command.finish} flooring for 3 credits.`); } }
        } else if (!furniture.includes(command.object)) log('Buy this furnishing before placing it.');
        else if (!tile) log('Place furnishings on a built floor.');
        else if (occupant && occupant.object !== command.object) log('That square is occupied.');
        else { placements = placements.filter(p => p.object !== command.object); placements.push({ object: command.object, x: command.x, y: command.y, rotation: command.rotation }); log(`Placed ${household.objects.find(o => o.id === command.object)!.name}.`); }
        revision++; return;
      }
      if (paused) { log('Resume the household before taking a turn.'); revision++; return; }
      const actor = people.find(p => p.id === selected)!;
      if (command.type === 'buy' || command.type === 'sell') {
        const object = household.objects.find(item => item.id === command.object);
        if (!object) log('Unknown furnishing.');
        else if (command.type === 'buy' && furniture.includes(object.id)) log('That furnishing is already owned.');
        else if (command.type === 'sell' && !furniture.includes(object.id)) log('That furnishing is not owned.');
        else if (command.type === 'buy' && !tiles.some(t => !placements.some(p => p.x === t.x && p.y === t.y))) log('No free floor space for this furnishing.');
        else { const result = command.type === 'buy' ? money.transact({ spend: { money: object.cost } }, 'furniture') : money.transact({ gain: { money: Math.floor(object.cost / 2) } }, 'sale'); if (!result.ok) log(result.reason); else { if (command.type === 'buy') { furniture.push(object.id); const slot = tiles.find(t => !placements.some(p => p.x === t.x && p.y === t.y))!; placements.push({ object: object.id, x: slot.x, y: slot.y, rotation: 0 }); } else { furniture = furniture.filter(id => id !== object.id); placements = placements.filter(p => p.object !== object.id); } log(`${command.type === 'buy' ? 'Bought' : 'Sold'} ${object.name}.`); projects(); advance(actor); } }
      } else if (command.type === 'act') { const reason = act(actor, command.action, command.target); if (reason) log(reason); else advance(actor, command.action === 'wait'); }
      revision++;
    } });
  },
});
