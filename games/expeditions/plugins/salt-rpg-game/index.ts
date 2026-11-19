import { ExperienceRole, NavigationRole, Items, SessionControl, createCommandQueue, definePlugin, inventoryMechanic, objectiveMechanic, isObject, progressionMechanic, relationshipMechanic } from '@bulkhead/sdk';
import { SaltCampaigns, SaltLedger } from '../../contracts/salt-ledger.ts';
import type { ContentLoadContext } from '@bulkhead/sdk';
import type { SaltActor, SaltCampaign, SaltCommand, SaltEnemy, SaltState } from '../../contracts/salt-ledger.ts';
import { items, quests } from './quests.ts';

function loadCampaign(data: unknown, c: ContentLoadContext): void {
  if (!isObject(data) || typeof data.name !== 'string' || !Array.isArray(data.locations) || !Array.isArray(data.quests) || !Array.isArray(data.endings)) { c.r.error('expected campaign with name, locations, quests and endings'); return; }
  let valid = true;
  const error = (path: string, message: string) => { valid = false; c.r.at(path).error(message); };
  const locations = new Set<string>();
  if (data.locations.length < 1 || data.locations.length > 64) error('locations', 'expected 1–64 locations');
  data.locations.forEach((v: unknown, i: number) => {
    if (!isObject(v) || typeof v.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(v.id) || typeof v.name !== 'string' || typeof v.region !== 'string' || typeof v.description !== 'string' || !Array.isArray(v.exits) || v.exits.some((x: unknown) => typeof x !== 'string')) { error(`locations[${i}]`, 'expected location id, name, region, description and exits'); return; }
    if (locations.has(v.id)) error(`locations[${i}].id`, 'duplicate location');
    locations.add(v.id);
  });
  data.locations.forEach((v: unknown, i: number) => { if (isObject(v) && Array.isArray(v.exits)) for (const x of v.exits) if (!locations.has(x as string)) error(`locations[${i}].exits`, `unknown location ${String(x)}`); });
  if (locations.has('ledger-hall')) {
    const reached = new Set(['ledger-hall']); const pending = ['ledger-hall'];
    while (pending.length) {
      const current = pending.shift();
      const room = data.locations.find((v: unknown) => isObject(v) && v.id === current);
      if (isObject(room) && Array.isArray(room.exits)) for (const next of room.exits) if (typeof next === 'string' && locations.has(next) && !reached.has(next)) { reached.add(next); pending.push(next); }
    }
    for (const id of locations) if (!reached.has(id)) error('locations', `location ${id} is unreachable from ledger-hall`);
  }
  for (const [key, entries] of [['quests', data.quests], ['endings', data.endings]] as const) {
    const ids = new Set<string>();
    if (entries.length > 64) error(key, 'at most 64 entries');
    entries.forEach((v: unknown, i: number) => {
      if (!isObject(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || (key === 'quests' && (typeof v.target !== 'string' || !locations.has(v.target) || typeof v.brief !== 'string')) || (key === 'endings' && typeof v.text !== 'string')) { error(`${key}[${i}]`, 'invalid entry or unknown target'); return; }
      if (ids.has(v.id)) error(`${key}[${i}].id`, 'duplicate id'); ids.add(v.id);
    });
  }
  for (const id of ['ledger-hall','flood-market','old-quay','salt-orchard','bell-foundry','storm-mouth','breakwater-engine','silt-shrine','drowned-archive','wind-cairn','reed-ferry','miners-rest','ossuary-steps','switchback','pilgrim-gate','empty-basilica']) if (!locations.has(id)) error('locations', `required location ${id} missing`);
  for (const id of ['barrier','return','covenant']) if (!data.endings.some((v: unknown) => isObject(v) && v.id === id)) error('endings', `required ending ${id} missing`);
  if (valid) {
    const freeze = (value: unknown): void => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } };
    const copy = structuredClone(data); freeze(copy);
    c.register(SaltCampaigns, c.id, copy as unknown as SaltCampaign);
  }
}

const actor = (id: string, name: string): SaltActor => ({ id, name, hp: 12, maxHp: 12, ap: 2, x: 0, y: 0, weapon: 'basic', armor: 'coat', perk: '' });
const initial = (): SaltState => ({ location:'ledger-hall', flags:[], party:[actor('iona','Iona')], active:['iona'], xp:0, level:1, pending:0, bag:[], journal:[], bonds:[], bondTraining:1, battle:null, ending:'', message:'Orr commissions you to recover a shipment at Old Quay. Recruit Pell in the hall before you leave.', revision:0 });
const encounterNames: Record<string, string> = { quay:'Quay collectors', fen:'Orchard collectors', ridge:'Foundry guards', scar:'The Cantor', engine:'Engine custodian', smugglers:'Market smugglers', gale:'Cairn gale', echo:'Basilica echo' };
const encounterAt: Record<string, string> = { quay:'old-quay', fen:'salt-orchard', ridge:'bell-foundry', scar:'storm-mouth', engine:'breakwater-engine', smugglers:'flood-market', gale:'wind-cairn', echo:'empty-basilica' };
const evidenceAt: Record<string, string> = { manifest:'silt-shrine', archive:'drowned-archive', vent:'wind-cairn', warrant:'ossuary-steps' };
const recruitAt: Record<string, string> = { neri:'reed-ferry', pell:'ledger-hall', sable:'miners-rest' };

export default definePlugin({
  register(ctx) {
    for (const [id, item] of Object.entries(items)) ctx.register(Items, `salt/${id}`, { ...item, icon:`salt/${id}`, rarity:'common' });
    ctx.provideRole(ExperienceRole, 'salt/ledger', { name:'The Salt Ledger', description:'Party-led tactical RPG', pointer:'free', controls:[['Tab / Enter','Choose actions'],['Tactical board','Move and attack using buttons']] });
    ctx.contentKind('salt-campaign', { description:'Salt Ledger authored campaign', load:loadCampaign });
    ctx.addValidator(v => {
      if (typeof v.preset.options.campaign !== 'string' || !v.registries.has(SaltCampaigns, v.preset.options.campaign)) v.reporter('salt/game','options.campaign').error('select an enabled Salt campaign');
      if (v.selectedRole(ExperienceRole) !== 'salt/ledger') v.reporter('salt/game','roles.sdk/experience').error('select salt/ledger as the experience');
    });
  },
  activate(ctx) {
    const campaign = ctx.registries.require(SaltCampaigns, ctx.preset.options.campaign as string);
    const navigation = ctx.role(NavigationRole)!.provider;
    let state = initial();
    const provider = progressionMechanic(ctx);
    const newProgression = () => provider.create(ctx, 'salt/levels', { startLevel:1, baseXp:40, growth:20, maxLevel:8 });
    let progression = newProgression();
    const inventoryProvider = inventoryMechanic(ctx);
    const objectiveProvider = objectiveMechanic(ctx);
    const relationshipProvider = relationshipMechanic(ctx);
    const newRelationships = () => relationshipProvider.create(ctx, 'salt/bonds', {min:0,max:2,pairs:[{a:'iona',b:'pell',score:0},{a:'iona',b:'neri',score:0},{a:'iona',b:'sable',score:0},{a:'pell',b:'neri',score:0},{a:'pell',b:'sable',score:0},{a:'neri',b:'sable',score:0}]});
    let relationships = newRelationships();
    const syncBonds = () => { const members=new Set(state.party.map(p=>p.id)); state.bonds=relationships.snapshot().filter(p=>members.has(p.a) && members.has(p.b)); };
    const definitions = quests.flatMap(q => q.stages.map((stage, i) => ({ id:stage[0], label:stage[2], target:1, requires: i ? [q.stages[i-1]![0]] : q.requires ? [quests.find(x => x.id === q.requires)!.stages[2][0]] : [] })));
    const newObjectives = () => objectiveProvider.create(ctx, 'salt/journal', definitions);
    const newBag = () => inventoryProvider.create(ctx, 'salt/bag', {capacity:64,equipmentSlots:[]});
    let objectives = newObjectives();
    let bag = newBag();
    let starterPending = true;
    const syncBag = () => { state.bag=bag.slots().flatMap(s=>Array.from({length:s.count},()=>s.item.slice(5))); };
    const seedBag = () => {
      if (!starterPending || ctx.services.tryGet(SessionControl)?.playing === false) return;
      for (const id of ['salt-blade','guard-coat','longbow']) bag.add(`salt/${id}`,1);
      starterPending = false; syncBag(); state.revision++;
    };
    const syncJournal = () => {
      const progress=objectives.snapshot();
      state.journal=quests.map(q=>{ const stages=q.stages.map(s=>progress.find(p=>p.id===s[0])!); const current=stages.findIndex(s=>!s.complete); const i=current<0?q.stages.length-1:current; const stage=q.stages[i]!; return { id:q.id,title:q.title,status:current<0?'complete':stages[i]!.unlocked?'active':'locked',stage:current<0?q.stages.length:current,stages:q.stages.length,instruction:current<0?'Completed':stage[2],location:stage[1],action:stage[0],reward:q.reward }; });
    };
    syncBag(); syncJournal(); seedBag();
    const syncProgression = () => { state.xp=progression.xp; state.level=progression.level; state.pending=progression.pending; };
    const queue = createCommandQueue<SaltCommand>(ctx, { capacity:128, normalize(value) {
      if (!isObject(value) || typeof value.type !== 'string') return undefined;
      if (['end-turn','retry','reset'].includes(value.type) && Object.keys(value).length === 1) return { type:value.type } as SaltCommand;
      if (!['travel','interact','choice','recruit','party','equip','use','perk','battle','move','attack','ability','ending','bond'].includes(value.type) || typeof value.id !== 'string' || value.id.length > 64 || (value.target !== undefined && (typeof value.target !== 'string' || value.target.length > 64)) || Object.keys(value).some(k => !['type','id','target'].includes(k))) return undefined;
      return { type:value.type, id:value.id, ...(typeof value.target === 'string' ? { target:value.target } : {}) } as SaltCommand;
    } });
    const has = (flag: string) => state.flags.includes(flag);
    const flag = (id: string) => { if (!has(id)) state.flags.push(id); };
    const reward = (xp: number) => { progression.grant(xp); syncProgression(); };
    const distance = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
    const finishBattle = () => {
      const battle = state.battle!;
      state.party = state.party.map(p => battle.actors.find(a => a.id === p.id) ?? p);
      flag(`won-${battle.id}`); state.battle = null; reward(30); state.bondTraining=Math.min(3,state.bondTraining+1);
      const loot: Record<string,string>={smugglers:'healing-draught',gale:'salt-bomb',echo:'brine-tonic'};
      const item=loot[battle.id]; if (item) { if (!bag.add(`salt/${item}`,1).ok) throw new Error('Salt encounter reward inventory capacity exceeded'); syncBag(); }
      state.message = `Victory at ${encounterNames[battle.id]}. The party earns 30 experience and recovers one bond training (maximum 3).${item?` Found ${items[item]!.name}.`:''}`;
    };
    const run = (command: SaltCommand): string | undefined => {
      if (command.type === 'reset') { progression.dispose(); objectives.dispose(); bag.dispose(); relationships.dispose(); progression=newProgression(); objectives=newObjectives(); bag=newBag(); relationships=newRelationships(); state = initial(); starterPending=true; syncBag(); syncJournal(); syncBonds(); seedBag(); return 'A new ledger opens.'; }
      if (state.ending) return;
      if (command.type === 'retry') { if (!state.battle) return; state.battle = null; for (const p of state.party) p.hp = p.maxHp; return 'The party withdraws and recovers. Begin the encounter again.'; }
      const b = state.battle;
      if (command.type === 'end-turn') {
        if (!b) return;
        const on = (unit: {x:number;y:number}, kind: 'cover' | 'hazard') => b.terrain.some(t=>t.kind===kind && t.x===unit.x && t.y===unit.y);
        for (const e of b.enemies) {
          const living = b.actors.filter(a => a.hp > 0).sort((a,z) => distance(e,a)-distance(e,z) || a.id.localeCompare(z.id));
          const target = living[0]; if (!target) break;
          if (distance(e,target) <= e.range) target.hp = Math.max(0, target.hp - Math.max(1,e.damage - (target.armor === 'conductor-mail' ? 2 : ['guard-coat','pilgrim-coat'].includes(target.armor) ? 1 : 0) - (distance(e,target)>1 && on(target,'cover') ? 1 : 0)));
          else {
            const candidates = [[e.x-1,e.y],[e.x,e.y-1],[e.x,e.y+1],[e.x+1,e.y]].filter(([x,y]) => x !== undefined && y !== undefined && x>=0 && x<5 && y>=0 && y<3 && !b.terrain.some(t=>t.kind==='obstacle' && t.x===x && t.y===y) && ![...b.actors.filter(a=>a.hp>0),...b.enemies].some(u=>u!==e && u.x===x && u.y===y));
            candidates.sort((a,z) => (Math.abs(a[0]!-target.x)+Math.abs(a[1]!-target.y))-(Math.abs(z[0]!-target.x)+Math.abs(z[1]!-target.y)));
            const next = candidates[0]; if (next) { e.x=next[0]!; e.y=next[1]!; }
          }
        }
        for (const unit of [...b.actors, ...b.enemies]) if (unit.hp>0 && on(unit,'hazard')) unit.hp=Math.max(0,unit.hp-1);
        b.enemies=b.enemies.filter(e=>e.hp>0);
        if (b.actors.every(a=>a.hp<=0)) { state.battle=null; for (const p of state.party) p.hp=p.maxHp; return 'Defeat. The party retreats safely; the encounter can be attempted again.'; }
        if (!b.enemies.length) { finishBattle(); return state.message; }
        b.round++; for (const a of b.actors) a.ap = a.hp > 0 ? 2 : 0; return `Round ${b.round}. Enemies attack the nearest party member in range, otherwise advance one cell.`;
      }
      if (!('id' in command)) return;
      if (b) {
        if (command.type === 'use') {
          const a=b.actors.find(x=>x.id===command.id && x.hp>0 && x.ap>0); if (!a || !command.target) return;
          const [item,target] = command.target.split(':'); if (!item || !target || bag.count(`salt/${item}`)<1) return;
          if (item==='healing-draught') { const t=b.actors.find(x=>x.id===target && x.hp>0 && x.hp<x.maxHp && distance(a,x)<=2); if (!t) return; if (!bag.remove(`salt/${item}`,1).ok) return; t.hp=Math.min(t.maxHp,t.hp+6); a.ap--; }
          else if (item==='brine-tonic') { const t=b.actors.find(x=>x.id===target && x.hp>0 && x.ap<2 && distance(a,x)<=2); if (!t || t===a) return; if (!bag.remove(`salt/${item}`,1).ok) return; a.ap--; t.ap++; }
          else if (item==='salt-bomb') { const e=b.enemies.find(x=>x.id===target && distance(a,x)<=3); if (!e) return; if (!bag.remove(`salt/${item}`,1).ok) return; a.ap--; e.hp-=5; if (e.hp<=0) b.enemies=b.enemies.filter(x=>x!==e); if (!b.enemies.length) { syncBag(); finishBattle(); return state.message; } }
          else return;
          syncBag(); return `${a.name} uses ${item}.`;
        }
        if (!['move','attack','ability'].includes(command.type)) return;
        const a = b.actors.find(x=>x.id===command.id); if (!a || a.hp<=0 || a.ap<1) return;
        if (command.type === 'move') {
          const match = /^(\d),(\d)$/.exec(command.target ?? ''); if (!match) return;
          const blocked = (x: number, y: number) => b.terrain.some(t=>t.kind==='obstacle' && t.x===x && t.y===y) || [...b.actors.filter(u=>u.hp>0),...b.enemies].some(u=>u!==a && u.x===x && u.y===y);
          const x=Number(match[1]), y=Number(match[2]); if (x>=5 || y>=3 || blocked(x,y)) return;
          const nodes = Array.from({length:15},(_,i)=>({ id:`${i%5},${Math.floor(i/5)}`, neighbors: [[i%5-1,Math.floor(i/5)],[i%5+1,Math.floor(i/5)],[i%5,Math.floor(i/5)-1],[i%5,Math.floor(i/5)+1]].filter(([nx,ny])=>nx!>=0 && nx!<5 && ny!>=0 && ny!<3 && !blocked(nx!,ny!)).map(([nx,ny])=>`${nx},${ny}`) }));
          if (!navigation.search(nodes,`${a.x},${a.y}`,3).some(v=>v.node===`${x},${y}`)) return;
          a.x=x; a.y=y; a.ap--; return `${a.name} moves.`;
        }
        if (command.type === 'ability' && a.id === 'sable') { const t=b.actors.find(x=>x.id===command.target && x.hp>0 && distance(a,x)<=2 && x.hp<x.maxHp); if (!t) return; t.hp=Math.min(t.maxHp,t.hp+4); a.ap--; return `Sable heals ${t.name}.`; }
        const e=b.enemies.find(x=>x.id===command.target); if (!e) return;
        const range = a.id==='pell' || ['longbow','reed-bow'].includes(a.weapon) ? 3 : a.weapon==='hook-spear' ? 2 : 1;
        if (distance(a,e)>range) return;
        const bondBonus = Math.max(0,...b.actors.filter(ally=>ally!==a && ally.hp>0 && distance(a,ally)===1).map(ally=>relationships.get(a.id,ally.id) ?? 0));
        const damage = Math.max(1,(command.type==='ability' ? 3 : 2) + (a.weapon==='vigil-blade' ? 2 : a.weapon==='salt-blade' ? 1 : 0) + a.perk.split(',').filter(p=>p==='force').length + bondBonus - (distance(a,e)>1 && b.terrain.some(t=>t.kind==='cover' && t.x===e.x && t.y===e.y) ? 1 : 0));
        e.hp -= damage; a.ap--; if (e.hp<=0) b.enemies=b.enemies.filter(x=>x!==e);
        if (!b.enemies.length) { finishBattle(); return state.message; }
        return `${a.name} hits ${e.name} for ${damage}.`;
      }
      if (command.type === 'travel') {
        const loc=campaign.locations.find(x=>x.id===state.location);
        if (!loc?.exits.includes(command.id) || (command.id==='breakwater-engine' && !['fen','ridge','scar'].every(x=>has(`seal-${x}`)))) return;
        state.location=command.id; return `Travelled to ${campaign.locations.find(x=>x.id===command.id)?.name}.`;
      }
      if (command.type === 'recruit') {
        if (recruitAt[command.id]!==state.location || state.party.some(p=>p.id===command.id)) return;
        const names: Record<string,string>={neri:'Neri',pell:'Pell',sable:'Sable'}; state.party.push(actor(command.id,names[command.id]!)); if (state.active.length<3) state.active.push(command.id); syncBonds(); return `${names[command.id]} joins the party. Up to three may enter battle.`;
      }
      if (command.type === 'bond') {
        const partner=command.target; if (state.location!=='ledger-hall' || !partner || !state.bondTraining || !state.party.some(p=>p.id===command.id) || !state.party.some(p=>p.id===partner)) return;
        const score=relationships.get(command.id,partner); if (score===undefined || score>=2 || !relationships.change(command.id,partner,1).ok) return;
        state.bondTraining--; syncBonds(); return `The pair trains together: bond ${score+1}/2. Adjacent allies add their bond to attack damage.`;
      }
      if (command.type === 'party') { if (command.id==='iona' || !state.party.some(p=>p.id===command.id)) return; if (state.active.includes(command.id)) state.active=state.active.filter(x=>x!==command.id); else { if (state.active.length>=3) return; state.active.push(command.id); } return 'Party formation updated.'; }
      if (command.type === 'equip') {
        const p=state.party.find(x=>x.id===command.id); const item=command.target; if (!p || !item || !state.bag.includes(item)) return;
        const slot = items[item]?.slot; if (!slot) return;
        if (!bag.remove(`salt/${item}`,1).ok) return; const old=p[slot]; if (!bag.add(`salt/${old}`,1).ok) { bag.add(`salt/${item}`,1); return; } p[slot]=item; syncBag(); return `${p.name} equips ${item}.`;
      }
      if (command.type === 'use') { const p=state.party.find(x=>x.id===command.id); if (!p || command.target!=='healing-draught' || p.hp<=0 || p.hp>=p.maxHp || !bag.remove('salt/healing-draught',1).ok) return; p.hp=Math.min(p.maxHp,p.hp+6); syncBag(); return `${p.name} uses a healing draught.`; }
      if (command.type === 'perk') { const p=state.party.find(x=>x.id===command.id); if (!p || !state.pending || !['force','vigor'].includes(command.target ?? '') || !progression.consumeLevel().ok) return; p.perk=[p.perk,command.target].filter(Boolean).join(','); if (command.target==='vigor') { p.maxHp+=4; p.hp+=4; } syncProgression(); return `${p.name} learns ${command.target}.`; }
      if (command.type === 'interact') {
        const q=quests.find(q=>q.stages.some(s=>s[0]===command.id));
        if (q) { const stage=q.stages.find(s=>s[0]===command.id)!; if (stage[1]!==state.location || !objectives.record(stage[0],1,stage[0]).ok) return; const complete=stage[0]===q.stages[2][0]; if (complete) { if (!bag.add(`salt/${q.reward}`,1).ok) throw new Error('Salt quest reward inventory capacity exceeded'); syncBag(); flag(`quest-${q.id}`); } syncJournal(); return complete?`${q.title} complete. Received ${items[q.reward]!.name}.`:stage[2]; }
        if (evidenceAt[command.id]!==state.location || has(command.id)) return; flag(command.id); reward(15); return `Recorded ${command.id} as evidence. The party earns 15 experience.`;
      }
      if (command.type === 'battle') {
        if (encounterAt[command.id]!==state.location || has(`won-${command.id}`) || state.pending || (command.id==='engine' && !['fen','ridge','scar'].every(x=>has(`seal-${x}`)))) return;
        const actors=state.party.filter(p=>state.active.includes(p.id)).map((p,i)=>({...p, hp:p.maxHp, ap:2,x:0,y:i}));
        const enemies: SaltEnemy[]=[{id:'guard',name:encounterNames[command.id]!,hp:command.id==='engine'?12:8,x:4,y:1,damage:command.id==='engine'?3:2,range:1}];
        if (command.id!=='quay') enemies.push({id:'ranged',name:'Harpooner',hp:5,x:4,y:2,damage:1,range:3});
        if (command.id==='smugglers') { enemies[0]!.hp=6; enemies[1]!.name='Crossbow smuggler'; enemies[1]!.damage=2; }
        if (command.id==='gale') { enemies[0]!.name='Windbound'; enemies[0]!.range=2; enemies[1]!.name='Gale wisp'; enemies[1]!.range=2; }
        if (command.id==='echo') { enemies[0]!.name='Salt echo'; enemies[0]!.hp=10; enemies[1]!.name='Mourning shade'; enemies[1]!.hp=7; }
        if (command.id==='engine' && has('fen-city')) enemies[0]!.hp-=3;
        if (command.id==='engine' && has('fen-families')) enemies[1]!.hp-=3;
        state.battle={id:command.id,round:1,actors,enemies,terrain:[{x:2,y:0,kind:'cover'},{x:2,y:1,kind:'obstacle'},{x:2,y:2,kind:'hazard'}]}; return `${encounterNames[command.id]}: 2 AP each. Cover reduces ranged damage; hazards hurt occupants after enemy turns; obstacles block movement.`;
      }
      if (command.type === 'choice') {
        if (command.id==='fen-families' || command.id==='fen-city') { if (state.location!=='salt-orchard' || has('seal-fen') || !(has('manifest') || has('won-fen'))) return; flag(command.id); flag('seal-fen'); reward(25); return command.id==='fen-families'?'Names return to the ferry families. Their allies will weaken the custodian’s harpooner.':'Names go to Tern, weakening the engine custodian at the finale.'; }
        if (command.id==='ridge-workers' || command.id==='ridge-city') { if (state.location!=='bell-foundry' || has('seal-ridge') || !(has('vent') || has('won-ridge'))) return; flag(command.id); flag('seal-ridge'); reward(25); return command.id==='ridge-workers'?'Workers control the wind conductors; the shared covenant remains possible.':'Orr receives civic control of the conductors.'; }
        if (command.id==='scar-proof' || command.id==='scar-trial') { if (state.location!=='storm-mouth' || has('seal-scar') || (command.id==='scar-proof'?!has('archive'):!has('won-scar'))) return; flag(command.id); flag('seal-scar'); reward(25); return command.id==='scar-proof'?'The Cantor accepts the archive testimony.':'The Cantor yields after the trial.'; }
      }
      if (command.type === 'ending') { const ending=campaign.endings.find(x=>x.id===command.id); if (!ending || state.location!=='breakwater-engine' || !has('won-engine') || state.ending || (command.id==='covenant' && !(has('archive') && has('ridge-workers')))) return; state.ending=command.id; return `${ending.title}: ${ending.text}`; }
      return;
    };
    ctx.services.provide(SaltLedger, { campaign, state:()=>structuredClone(state), enqueue:queue.enqueue });
    ctx.systems.add({ id:'salt/game.commands', phase:'rules', update() { seedBag(); for (const command of queue.drainBatch()) { const message=run(command); if (message) { state.message=message; state.revision++; } else { state.message='That action is unavailable here, or its requirements are not met.'; state.revision++; } } } });
  },
});
