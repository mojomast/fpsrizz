import { CraftingRecipes, ExperienceRole, Items, SessionControl, clockMechanic, conditionMechanic, craftingMechanic, createCommandQueue, definePlugin, inventoryMechanic, isObject, progressionMechanic, roomMapMechanic, vArray, vString } from '@bulkhead/sdk';
import { Silt, SiltArchives } from '../../contracts/silt-archive.ts';
import type { RoomMapHandle } from '@bulkhead/sdk';
import type { SiltArchiveDefinition, SiltCommand, SiltEnemy } from '../../contracts/silt-archive.ts';
import { loadChamber } from './chambers.ts';
import { assembleDistrict } from './district.ts';
import type { DistrictRoom } from './district.ts';

type Enemy = { id: string; x: number; y: number; health: number; maxHealth: number; kind: SiltEnemy['kind']; phase: SiltEnemy['phase']; target: { x: number; y: number }; threat: { x: number; y: number }[] };
type Room = { definition: DistrictRoom; enemies: Enemy[]; claimed: boolean; pump: boolean };
type District = { rooms: Room[]; map: RoomMapHandle; turns: number; water: number; fragments: number };
const items = {
  'silt/bandage': { name: 'Bandage', description: 'Restore eight health.', stackMax: 9 },
  'silt/air': { name: 'Air supply', description: 'Restore five air.', stackMax: 9 },
  'silt/scrap': { name: 'Archive scrap', description: 'Recovered metal for the pump workbench.', stackMax: 20 },
  'silt/fiber': { name: 'Seal fiber', description: 'Recovered seals for supplies and suits.', stackMax: 20 },
  'silt/cutter': { name: 'Cutter', description: 'Adds two strike damage.', stackMax: 1, slot: 'tool' },
  'silt/conductor': { name: 'Conductor', description: 'Arc attacks deal three additional damage.', stackMax: 1, slot: 'tool' },
  'silt/diving-suit': { name: 'Diving suit', description: 'Prevents air loss on entering flooded tiles.', stackMax: 1, slot: 'suit' },
  'silt/plate-suit': { name: 'Plate suit', description: 'Reduces incoming damage by one.', stackMax: 1, slot: 'suit' },
} as const;
const recipes = {
  'silt/make-bandage': { name: 'Bandage', inputs: [{ item: 'silt/fiber', count: 1 }], output: { item: 'silt/bandage', count: 1 } },
  'silt/make-air': { name: 'Air supply', inputs: [{ item: 'silt/scrap', count: 1 }], output: { item: 'silt/air', count: 1 } },
  'silt/make-cutter': { name: 'Cutter', inputs: [{ item: 'silt/scrap', count: 2 }], output: { item: 'silt/cutter', count: 1 } },
  'silt/make-conductor': { name: 'Conductor', inputs: [{ item: 'silt/scrap', count: 2 }, { item: 'silt/fiber', count: 1 }], output: { item: 'silt/conductor', count: 1 } },
  'silt/make-diving-suit': { name: 'Diving suit', inputs: [{ item: 'silt/fiber', count: 2 }, { item: 'silt/scrap', count: 1 }], output: { item: 'silt/diving-suit', count: 1 } },
  'silt/make-plate-suit': { name: 'Plate suit', inputs: [{ item: 'silt/scrap', count: 3 }, { item: 'silt/fiber', count: 1 }], output: { item: 'silt/plate-suit', count: 1 } },
} as const;

export default definePlugin({
  register(ctx) {
    for (const [id, item] of Object.entries(items)) ctx.register(Items, id, { ...item, icon: 'silt/item', rarity: 'common' });
    for (const [id, recipe] of Object.entries(recipes)) ctx.register(CraftingRecipes, id, { ...recipe, description: `Make ${recipe.name} at a cleared pump.` });
    ctx.provideRole(ExperienceRole, 'silt/archive', { name: 'The Silt Archive', description: 'Explore flooded archive districts and choose when to extract.', pointer: 'free', controls: [['Move', 'Move cardinally'], ['Attack', 'Strike a telegraphed enemy'], ['Lift', 'Descend or extract']] });
    ctx.contentKind('silt-archive', { description: 'Three districts of validated archive chambers.', load(data, c) {
      if (!isObject(data)) { c.r.error('expected an archive object'); return; }
      for (const key of Object.keys(data)) if (!['name', 'districts'].includes(key)) c.r.at(key).error('unknown property');
      const name = vString(data.name, c.r.at('name'), { nonEmpty: true, max: 80 });
      const raw = vArray(data.districts, c.r.at('districts'), { min: 3, max: 3 });
      const districts: SiltArchiveDefinition['districts'][number][] = [];
      raw?.forEach((value, i) => {
        const r = c.r.at('districts').at(i);
        if (!isObject(value)) { r.error('expected district'); return; }
        for (const key of Object.keys(value)) if (!['name', 'chambers'].includes(key)) r.at(key).error('unknown property');
        const districtName = vString(value.name, r.at('name'), { nonEmpty: true, max: 80 });
        const chambers = vArray(value.chambers, r.at('chambers'), { min: 1, max: 64 })?.map((chamber, j) => loadChamber(chamber, r.at('chambers').at(j))).filter(x => x !== undefined) ?? [];
        chambers.forEach((chamber, j) => {
          if (chamber.rows[0]?.[4] !== 'D' || chamber.rows[8]?.[4] !== 'D' || chamber.rows[4]?.[0] !== 'D' || chamber.rows[4]?.[8] !== 'D' || chamber.rows[4]?.[4] !== '.' || chamber.rows[3]?.[4] !== '.') r.at('chambers').at(j).error('assembly requires four doors and dry center and spawn floor');
          const seen = new Set<string>(), todo: [number, number][] = [[4, 0]];
          for (let k = 0; k < todo.length; k++) { const [x, y] = todo[k]!; const cell = chamber.rows[y]?.[x], key = `${x},${y}`; if (seen.has(key) || (cell !== '.' && cell !== 'D')) continue; seen.add(key); todo.push([x+1,y], [x-1,y], [x,y+1], [x,y-1]); }
          if (!seen.has('4,4') || !seen.has('4,3')) r.at('chambers').at(j).error('center and spawn must be connected to the dry door network');
        });
        if (districtName && chambers.length) districts.push({ name: districtName, chambers });
      });
      if (!c.r.failed && name && districts.length === 3) c.register(SiltArchives, c.id, { name, districts });
    } });
    ctx.addValidator(v => {
      if (!v.registries.get(SiltArchives, String(v.preset.options['archive']))) v.reporter('preset', 'options.archive').error('select an installed silt-archive');
      if (v.selectedRole(ExperienceRole) !== 'silt/archive') v.reporter('preset', 'roles.sdk/experience').error('select silt/archive');
    });
  },
  activate(ctx) {
    const archive = ctx.registries.require(SiltArchives, String(ctx.preset.options['archive']));
    const maps = roomMapMechanic(ctx);
    const clocks = clockMechanic(ctx), conditionsProvider = conditionMechanic(ctx);
    let clock = clocks.create(ctx, 'silt/turns', 'turns');
    let conditions = conditionsProvider.create(ctx, 'silt/conditions', clock);
    const inventories = inventoryMechanic(ctx), levels = progressionMechanic(ctx), crafting = craftingMechanic(ctx);
    let bag = inventories.create(ctx, 'silt/bag', { capacity: 8, equipmentSlots: ['tool', 'suit'] });
    let progression = levels.create(ctx, 'silt/levels', { startLevel: 1, baseXp: 3, growth: 0, maxLevel: 100 });
    let districts: District[] = [];
    let depth = 0, roomId = 'room-0', x = 4, y = 4, turn = 0, health = 24, maxHealth = 24, air = 8, maxAir = 8, charge = 0, damage = 3, discoveries = 0;
    let status: 'playing' | 'victory' | 'extracted' | 'dead' = 'playing', register = false, braced = false, starterPending = false, message = 'Find both fragments and reach the lift.';
    const queue = createCommandQueue<SiltCommand>(ctx, { capacity: 32, normalize(command) {
      if (!isObject(command) || typeof command.type !== 'string') return undefined;
      if (command.type === 'move' && typeof command.dx === 'number' && typeof command.dy === 'number' && Number.isInteger(command.dx) && Number.isInteger(command.dy) && Math.abs(command.dx) + Math.abs(command.dy) === 1) return { type: 'move', dx: command.dx, dy: command.dy };
      if (command.type === 'attack' && typeof command.enemy === 'string' && (command.style === undefined || ['strike', 'heavy', 'arc'].includes(String(command.style)))) return { type: 'attack', enemy: command.enemy, ...(command.style ? { style: command.style as 'strike' | 'heavy' | 'arc' } : {}) };
      if (command.type === 'use' && (command.item === 'bandage' || command.item === 'air')) return { type: 'use', item: command.item };
      if (command.type === 'upgrade' && (command.upgrade === 'health' || command.upgrade === 'air' || command.upgrade === 'damage')) return { type: 'upgrade', upgrade: command.upgrade };
      if ((command.type === 'equip' || command.type === 'drop') && typeof command.item === 'string' && Object.hasOwn(items, command.item)) return { type: command.type, item: command.item };
      if (command.type === 'unequip' && (command.slot === 'tool' || command.slot === 'suit')) return { type: 'unequip', slot: command.slot };
      if (command.type === 'craft' && typeof command.recipe === 'string' && Object.hasOwn(recipes, command.recipe)) return { type: 'craft', recipe: command.recipe };
      if (['wait', 'interact', 'extract', 'descend', 'restart', 'brace'].includes(command.type)) return { type: command.type as 'wait' | 'interact' | 'extract' | 'descend' | 'restart' | 'brace' };
      return undefined;
    } });
    const current = () => districts[depth]!;
    const room = () => current().rooms.find(r => r.definition.id === roomId)!;
    const seedSupplies = () => {
      if (!starterPending || ctx.services.tryGet(SessionControl)?.playing === false) return;
      if (bag.add('silt/bandage', 3).ok && bag.add('silt/air', 2).ok) starterPending = false;
    };
    const reset = () => {
      for (const d of districts) d.map.dispose();
      conditions.dispose(); clock.dispose();
      clock = clocks.create(ctx, 'silt/turns', 'turns');
      conditions = conditionsProvider.create(ctx, 'silt/conditions', clock);
      bag.dispose(); progression.dispose();
      bag = inventories.create(ctx, 'silt/bag', { capacity: 8, equipmentSlots: ['tool', 'suit'] });
      progression = levels.create(ctx, 'silt/levels', { startLevel: 1, baseXp: 3, growth: 0, maxLevel: 100 });
      starterPending = true; seedSupplies();
      districts = archive.districts.map((definition, i) => {
        const layout = assembleDistrict(definition.chambers, () => ctx.rng.next());
        const map = maps.create(ctx, `silt/map-${i}`, { id: `silt/district-${i}`, name: definition.name, start: 'room-0', rooms: layout.map(r => ({ id: r.id, name: r.id, region: definition.name, map: { x: r.x, y: r.y, w: 1, h: 1 } })), links: layout.flatMap(r => r.neighbors.map(to => ({ from: r.id, to }))) });
        return { map, turns: 0, water: 0, fragments: 0, rooms: layout.map(r => {
          const index = Number(r.id.slice(5));
          const kind: SiltEnemy['kind'] = r.purpose === 'boss' ? (['warden', 'bellkeeper', 'heart'] as const)[i]! : (['rush', 'spitter', 'armored', 'drainer'] as const)[(index + i) % 4]!;
          const hp = r.purpose === 'boss' ? 9 + i * 3 : 4 + i;
          const enemies: Enemy[] = r.purpose === 'boss' || r.purpose === 'passage' || r.purpose === 'optional' ? [{ id: `${r.id}-enemy`, x: 4, y: 3, health: hp, maxHealth: hp, kind, phase: 'approach', target: { x: 4, y: 3 }, threat: [] }] : [];
          return { definition: r, claimed: false, pump: false, enemies };
        }) };
      });
      depth = 0; roomId = 'room-0'; x = 4; y = 4; turn = 0; health = maxHealth = 24; air = maxAir = 8; charge = 0; damage = 3; discoveries = 0; status = 'playing'; register = braced = false; message = 'Find both fragments and reach the lift.';
    };
    reset();
    const hurt = (amount: number) => { amount = Math.max(1, amount - (bag.equipment()['suit'] === 'silt/plate-suit' ? 1 : 0)); health -= braced ? Math.ceil(amount / 2) : amount; braced = false; if (health <= 0) { health = 0; status = 'dead'; message = 'The archive claimed the expedition.'; } };
    const spendAir = (amount: number) => { const short = Math.max(0, amount - air); air = Math.max(0, air - amount); if (short) hurt(short * 2); };
    const award = () => { progression.grant(1); };
    const observe = () => {
      const d = current(), r = room(), map = d.map.state();
      const workbench = r.definition.purpose === 'passage' && r.pump && !r.enemies.length;
      return { status, message, conditions: conditions.snapshot(), district: depth, districtName: archive.districts[depth]!.name, turn, water: d.water, room: roomId, purpose: r.definition.purpose, x, y, rows: [...r.definition.template.rows], rooms: d.rooms.filter(a => map.revealed.includes(a.definition.id)).map(a => ({ id: a.definition.id, x: a.definition.x, y: a.definition.y, purpose: map.visited.includes(a.definition.id) ? a.definition.purpose : 'unknown', neighbors: [...a.definition.neighbors], visited: map.visited.includes(a.definition.id), revealed: true })), enemies: r.enemies.map(e => ({ ...e, target: { ...e.target }, threat: e.threat.map(cell => ({ ...cell })), intent: e.phase === 'windup' ? `${e.kind} threatens ${e.threat.map(p => `${p.x},${p.y}`).join(' ')}${e.kind === 'spitter' ? ' (exposes on hit; brace clears exposure)' : ''}` : `${e.kind}: ${e.phase}` } satisfies SiltEnemy)), health, maxHealth, air, maxAir, charge, fragments: d.fragments, register, bandages: bag.count('silt/bandage'), airSupplies: bag.count('silt/air'), damage, pendingUpgrades: progression.pending, discoveries,
        inventory: { capacity: bag.definition.capacity, slots: bag.slots(), equipment: bag.equipment() }, workbench,
        progression: { level: progression.level, xp: progression.xp, xpToNext: progression.xpToNext, totalXp: progression.totalXp },
        recipes: Object.entries(recipes).map(([id, recipe]) => { const check = crafting.preview(bag, id); return { id, name: recipe.name, inputs: recipe.inputs.map(i => ({ ...i })), output: { ...recipe.output }, available: workbench && check.ok, reason: workbench ? check.reason : 'Requires a cleared pump' }; }) };
    };
    ctx.services.provide(Silt, { state: observe, enqueue: command => queue.enqueue(command) });
    ctx.systems.add({ id: 'silt/game.commands', phase: 'control', update() {
      seedSupplies();
      const cmd = queue.drainOne(); if (!cmd) return;
      if (cmd.type === 'restart') { reset(); queue.clear(); return; }
      if (status !== 'playing') return;
      if (cmd.type === 'upgrade') { if (!progression.consumeLevel().ok) return; if (cmd.upgrade === 'health') { maxHealth += 4; health += 4; } else if (cmd.upgrade === 'air') { maxAir += 3; air += 3; } else damage++; return; }
      if (progression.pending) { message = 'Choose an upgrade first.'; return; }
      const d = current(), r = room(); let transition = false;
      if (cmd.type === 'equip' || cmd.type === 'unequip' || cmd.type === 'drop') { const result = cmd.type === 'equip' ? bag.equip(cmd.item) : cmd.type === 'unequip' ? bag.unequip(cmd.slot) : bag.remove(cmd.item, 1); if (!result.ok) message = result.reason; return; }
      if (cmd.type === 'craft') { if (r.definition.purpose !== 'passage' || !r.pump || r.enemies.length) { message = 'Requires a cleared pump.'; return; } const result = crafting.craft(bag, cmd.recipe); message = result.ok ? 'Crafted at the pump.' : result.reason; return; }
      if (cmd.type === 'extract') { if (r.definition.purpose !== 'entry' && !(r.definition.purpose === 'lift' && d.fragments === 2)) return; status = register ? 'victory' : 'extracted'; message = register ? 'The Heart Register is safe.' : 'Expedition extracted.'; queue.clear(); return; }
      if (cmd.type === 'descend') { if (r.definition.purpose !== 'lift' || d.fragments !== 2 || depth === 2) return; depth++; roomId = 'room-0'; x = y = 4; message = 'A deeper district awaits.'; return; }
      if (cmd.type === 'move') {
        const nx = x + cmd.dx, ny = y + cmd.dy, cell = r.definition.template.rows[ny]?.[nx];
        if (!cell || cell === '#' || r.enemies.some(e => e.x === nx && e.y === ny)) return;
        if (cell === 'D') {
          const next = d.rooms.find(a => r.definition.neighbors.includes(a.definition.id) && a.definition.x === r.definition.x + cmd.dx && a.definition.y === r.definition.y + cmd.dy);
          if (!next) return;
          roomId = next.definition.id; x = cmd.dx === 1 ? 1 : cmd.dx === -1 ? 7 : 4; y = cmd.dy === 1 ? 1 : cmd.dy === -1 ? 7 : 4; d.map.enter(roomId); transition = true;
          for (const enemy of next.enemies) { enemy.target = { x: enemy.x, y: enemy.y }; enemy.phase = 'approach'; enemy.threat = []; }
        } else { x = nx; y = ny; if (cell === '~' && d.water >= 1 && bag.equipment()['suit'] !== 'silt/diving-suit') spendAir(1); }
      } else if (cmd.type === 'attack') {
        const enemy = r.enemies.find(e => e.id === cmd.enemy); if (!enemy) return;
        const distance = Math.abs(enemy.x - x) + Math.abs(enemy.y - y), style = cmd.style ?? 'strike';
        if (style === 'arc' ? !((enemy.x === x || enemy.y === y) && distance <= 3 && charge >= 3) : distance !== 1 || (style === 'heavy' && charge < 2)) return;
        if (style === 'arc') { const dx = Math.sign(enemy.x - x), dy = Math.sign(enemy.y - y); for (let n = 1; n < distance; n++) if (r.definition.template.rows[y + dy * n]?.[x + dx * n] === '#') return; }
        if (style === 'arc') charge -= 3; else if (style === 'heavy') charge -= 2;
        const armor = (enemy.kind === 'armored' || enemy.kind === 'warden') && enemy.phase !== 'recovery' && style === 'strike' ? 1 : 0;
        const tool = bag.equipment()['tool'];
        enemy.health -= Math.max(1, damage + (style === 'heavy' ? 3 : style === 'arc' ? 1 : 0) + (tool === 'silt/cutter' ? 2 : tool === 'silt/conductor' && style === 'arc' ? 3 : 0) - armor); charge = Math.min(6, charge + 1);
        if (enemy.health <= 0) { r.enemies.splice(r.enemies.indexOf(enemy), 1); award(); if (!bag.add('silt/scrap', 1).ok) message = 'Bag full; scrap left behind.'; if (r.definition.purpose === 'boss') { d.fragments++; if (depth === 2) register = true; } }
      } else if (cmd.type === 'interact') {
        if (r.definition.purpose === 'fragment' && !r.claimed) { r.claimed = true; d.fragments++; award(); }
        else if (r.definition.purpose === 'optional' && !r.claimed && !r.enemies.length) { if (!bag.add('silt/fiber', 2).ok) { message = 'Bag full; supplies remain here.'; return; } r.claimed = true; discoveries++; bag.add('silt/bandage', 1); bag.add('silt/air', 1); award(); }
        else if (r.definition.purpose === 'passage' && !r.pump && !r.enemies.length) { r.pump = true; d.water = Math.max(0, d.water - 2); if (!bag.add('silt/fiber', 2).ok) message = 'Bag full; pump fiber left behind.'; }
        else return;
      } else if (cmd.type === 'use') { if (cmd.item === 'bandage') { if (health === maxHealth || !bag.remove('silt/bandage', 1).ok) return; health = Math.min(maxHealth, health + 8); } else { if (air === maxAir || !bag.remove('silt/air', 1).ok) return; air = Math.min(maxAir, air + 5); } }
      else if (cmd.type === 'brace') { if (!charge) return; charge--; braced = true; conditions.remove('player', 'exposed'); message = 'Brace clears exposure and halves the next hit.'; }
      turn++; d.turns++;
      clock.advance(1);
      if (status !== 'playing') return;
      if (!transition) for (const enemy of r.enemies) {
        if (enemy.phase === 'windup') {
          if (enemy.threat.some(p => p.x === x && p.y === y)) {
            const exposed = conditions.has('player', 'exposed'), wasBraced = braced;
            hurt(2 + depth + (enemy.kind === 'warden' ? 1 : 0) + (exposed ? 1 : 0));
            if (enemy.kind === 'spitter' && !wasBraced) { conditions.apply('player', 'exposed', 5); message = 'Exposed for 5 turns: incoming hits deal +1 damage. Brace clears it.'; }
            if ((enemy.kind === 'drainer' || enemy.kind === 'heart') && air > 0) air--;
          }
          enemy.phase = 'recovery'; enemy.threat = [];
          if (status !== 'playing') return;
          continue;
        }
        if (enemy.phase === 'recovery') { enemy.phase = 'approach'; continue; }
        const dist = Math.abs(enemy.x - x) + Math.abs(enemy.y - y);
        const ranged = enemy.kind === 'spitter' || enemy.kind === 'bellkeeper' || enemy.kind === 'heart';
        const aligned = enemy.x === x || enemy.y === y;
        const dx = Math.sign(x - enemy.x), dy = Math.sign(y - enemy.y);
        let clear = aligned;
        if (clear) for (let n = 1; n < dist; n++) if (r.definition.template.rows[enemy.y + dy * n]?.[enemy.x + dx * n] === '#') clear = false;
        if (dist === 1 || (ranged && dist <= 3 && clear)) {
          enemy.target = { x, y }; enemy.threat = [{ x, y }];
          if (enemy.kind === 'bellkeeper' || enemy.kind === 'heart') {
            for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const cell = r.definition.template.rows[y + oy]?.[x + ox];
              if (cell && cell !== '#' && cell !== 'D') enemy.threat.push({ x: x + ox, y: y + oy });
            }
          }
          enemy.phase = 'windup';
        } else {
          for (let step = 0; step < (enemy.kind === 'rush' ? 2 : 1); step++) {
            const candidates = [[Math.sign(x - enemy.x), 0], [0, Math.sign(y - enemy.y)]];
            for (const [mx, my] of candidates) { const nx = enemy.x + mx!, ny = enemy.y + my!, cell = r.definition.template.rows[ny]?.[nx]; if ((mx || my) && cell && cell !== '#' && cell !== 'D' && !(nx === x && ny === y) && !r.enemies.some(e => e !== enemy && e.x === nx && e.y === ny)) { enemy.x = nx; enemy.y = ny; break; } }
          }
        }
      }
      if (d.turns % 8 === 0) d.water = Math.min(4, d.water + 1);
      if (d.water === 4 && room().definition.template.rows[y]?.[x] === '~') spendAir(1);
    } });
  },
});
