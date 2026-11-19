import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION, SessionControl } from '@bulkhead/sdk';
import { SaltLedger } from '../contracts/salt-ledger.ts';
import type { SaltCommand } from '../contracts/salt-ledger.ts';
import rules from '../plugins/salt-rpg-game/manifest.json' with { type:'json' };
import pack from '../plugins/salt-rpg-content/manifest.json' with { type:'json' };
import content from '../plugins/salt-rpg-content/content.json' with { type:'json' };
import navigation from '@bulkhead/std/mechanics-navigation/manifest.json' with { type:'json' };
import progression from '@bulkhead/std/mechanics-progression/manifest.json' with { type:'json' };
import objectives from '@bulkhead/std/mechanics-objectives/manifest.json' with { type:'json' };
import inventory from '@bulkhead/std/mechanics-inventory/manifest.json' with { type:'json' };
import relationships from '@bulkhead/std/mechanics-relationships/manifest.json' with { type:'json' };

function fixture(initialPlaying = true) {
  let playing=initialPlaying;
  const host=new PluginHost({sdkVersion:SDK_VERSION, sdkCompat: SDK_COMPAT,phases:PHASES,installHostServices(session,scope) { session.services.provide(SessionControl,{get playing(){return playing;}},'host',scope); }});
  host.setCatalog([{manifest:rules,load:()=>import('../plugins/salt-rpg-game/index.ts')},{manifest:pack,content},{manifest:navigation,load:()=>import('@bulkhead/std/mechanics-navigation/index.ts')},{manifest:progression,load:()=>import('@bulkhead/std/mechanics-progression/index.ts')},{manifest:objectives,load:()=>import('@bulkhead/std/mechanics-objectives/index.ts')},{manifest:inventory,load:()=>import('@bulkhead/std/mechanics-inventory/index.ts')},{manifest:relationships,load:()=>import('@bulkhead/std/mechanics-relationships/index.ts')}]);
  const preset={schema:1,id:'salt/test',name:'Salt test',plugins:['salt/game','salt/content','mechanics/navigation','mechanics/progression','mechanics/objectives','mechanics/inventory','mechanics/relationships'],roles:{'sdk/experience':'salt/ledger','sdk/mechanic-navigation':'mechanics/navigation','sdk/mechanic-progression':'mechanics/progression','sdk/mechanic-objectives':'mechanics/objectives','sdk/mechanic-inventory':'mechanics/inventory','sdk/mechanic-relationships':'mechanics/relationships'},options:{campaign:'salt/tern'},seed:7};
  const service=()=>host.session!.services.get(SaltLedger);
  const send=(command:SaltCommand)=>{assert.equal(service().enqueue(command),true);host.session!.scheduler.runTick();};
  const go=(id:string)=>send({type:'travel',id});
  const perk=()=>{while(service().state().pending) send({type:'perk',id:'iona',target:'force'});};
  const fight=(id:string)=>{
    perk(); send({type:'battle',id}); assert.ok(service().state().battle,`start ${id}`);
    if (id==='engine') { const s=service().state(); assert.equal(s.battle!.enemies[0]!.hp,s.flags.includes('fen-city')?9:12); assert.equal(s.battle!.enemies[1]!.hp,s.flags.includes('fen-families')?2:5); }
    for(let round=0;round<30 && service().state().battle;round++) {
      for(const actor of service().state().battle!.actors) for(let step=0;step<2;step++) {
        const b=service().state().battle; if(!b) break; const a=b.actors.find(x=>x.id===actor.id)!; if(!a.ap||a.hp<=0) break;
        const target=b.enemies[0]!; const range=a.id==='pell'||a.weapon==='longbow'?3:1;
        if(Math.abs(a.x-target.x)+Math.abs(a.y-target.y)<=range) send({type:'ability',id:a.id,target:target.id});
        else {
          const cells=Array.from({length:15},(_,i)=>({x:i%5,y:Math.floor(i/5)})).filter(p=>!b.enemies.some(e=>e.x===p.x&&e.y===p.y)&&!b.actors.some(e=>e.hp>0&&e.x===p.x&&e.y===p.y)).sort((p,q)=>(Math.abs(p.x-target.x)+Math.abs(p.y-target.y))-(Math.abs(q.x-target.x)+Math.abs(q.y-target.y)));
          for(const cell of cells) { const before=service().state().battle!.actors.find(x=>x.id===a.id)!.ap; send({type:'move',id:a.id,target:`${cell.x},${cell.y}`}); if(service().state().battle!.actors.find(x=>x.id===a.id)!.ap<before) break; }
        }
      }
      if(service().state().battle) send({type:'end-turn'});
    }
    assert.ok(service().state().flags.includes(`won-${id}`),`victory ${id}`);
  };
  return {host,preset,service,send,go,perk,fight,setPlaying:(v:boolean)=>{playing=v;}};
}

test('bond training validates pairs, spends limited training and resets with the session',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  try {
    const state=()=>f.service().state();
    assert.deepEqual(state().bonds,[]); assert.equal(state().bondTraining,1);
    f.send({type:'bond',id:'iona',target:'pell'}); assert.equal(state().bondTraining,1);
    f.send({type:'recruit',id:'pell'}); assert.deepEqual(state().bonds,[{a:'iona',b:'pell',score:0}]);
    for (const target of ['iona','unknown']) f.send({type:'bond',id:'iona',target});
    assert.equal(state().bondTraining,1);
    assert.equal(f.service().enqueue({type:'bond',id:'iona',target:'pell'}),true); f.setPlaying(false); f.host.session!.scheduler.runTick();
    assert.equal(f.service().enqueue({type:'bond',id:'iona',target:'pell'}),false); f.setPlaying(true); f.host.session!.scheduler.runTick(); assert.equal(state().bondTraining,1);
    f.send({type:'bond',id:'pell',target:'iona'}); assert.equal(state().bonds[0]!.score,1); assert.equal(state().bondTraining,0);
    const detached=state(); (detached.bonds[0] as {score:number}).score=99; assert.equal(state().bonds[0]!.score,1);
    f.send({type:'bond',id:'iona',target:'pell'}); assert.equal(state().bonds[0]!.score,1);
    f.go('old-quay'); f.send({type:'bond',id:'iona',target:'pell'}); assert.equal(state().bondTraining,0);
    f.fight('quay'); assert.equal(state().bondTraining,1);
    f.send({type:'battle',id:'quay'}); assert.equal(state().bondTraining,1);
    f.go('ledger-hall'); f.send({type:'bond',id:'iona',target:'pell'}); assert.equal(state().bonds[0]!.score,2); assert.equal(state().bondTraining,0);
    f.go('flood-market'); f.send({type:'battle',id:'smugglers'});
    f.send({type:'move',id:'iona',target:'1,0'}); f.send({type:'move',id:'pell',target:'1,1'}); f.send({type:'attack',id:'pell',target:'guard'});
    assert.equal(state().battle!.enemies[0]!.hp,2);
    f.send({type:'retry'}); assert.equal(state().bondTraining,0); f.fight('smugglers'); assert.equal(state().bondTraining,1); f.go('ledger-hall');
    f.send({type:'bond',id:'iona',target:'pell'}); assert.equal(state().bonds[0]!.score,2); assert.equal(state().bondTraining,1);
    f.send({type:'reset'}); assert.equal(state().bondTraining,1); assert.deepEqual(state().bonds,[]);
    f.send({type:'recruit',id:'pell'}); assert.equal(state().bonds[0]!.score,0);
    f.send({type:'bond',id:'iona',target:'pell'}); await f.host.restart(); assert.equal(state().bondTraining,1); assert.deepEqual(state().bonds,[]);
  } finally { await f.host.stop(); }
});

test('one-time victories recover bond training only up to its cap',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  try {
    f.send({type:'recruit',id:'pell'}); f.send({type:'equip',id:'pell',target:'longbow'});
    f.go('old-quay'); f.fight('quay'); assert.equal(f.service().state().bondTraining,2);
    f.go('flood-market'); f.fight('smugglers'); assert.equal(f.service().state().bondTraining,3);
    f.go('ledger-hall'); f.go('switchback'); f.go('miners-rest'); f.go('wind-cairn'); f.fight('gale');
    assert.equal(f.service().state().bondTraining,3);
  } finally { await f.host.stop(); }
});

test('trained adjacent allies add bond damage, while separated allies do not',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  try {
    f.send({type:'recruit',id:'pell'}); f.send({type:'bond',id:'iona',target:'pell'}); f.go('old-quay'); f.send({type:'battle',id:'quay'});
    f.send({type:'move',id:'pell',target:'1,1'}); f.send({type:'attack',id:'pell',target:'guard'});
    assert.equal(f.service().state().battle!.enemies[0]!.hp,6);
    f.send({type:'retry'}); f.send({type:'battle',id:'quay'});
    f.send({type:'move',id:'iona',target:'1,0'}); f.send({type:'move',id:'pell',target:'1,1'}); f.send({type:'attack',id:'pell',target:'guard'});
    assert.equal(f.service().state().battle!.enemies[0]!.hp,5);
    f.send({type:'bond',id:'iona',target:'pell'}); assert.equal(f.service().state().bondTraining,0);
  } finally { await f.host.stop(); }
});

test('terrain blocks movement, damages occupants and resets on retry',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  try {
    f.go('old-quay'); f.send({type:'battle',id:'quay'});
    const state=()=>f.service().state().battle!;
    assert.deepEqual(state().terrain,[{x:2,y:0,kind:'cover'},{x:2,y:1,kind:'obstacle'},{x:2,y:2,kind:'hazard'}]);
    f.send({type:'move',id:'iona',target:'2,1'}); assert.equal(state().actors[0]!.ap,2);
    f.send({type:'move',id:'iona',target:'1,2'}); f.send({type:'move',id:'iona',target:'2,2'});
    f.send({type:'end-turn'}); assert.equal(state().actors[0]!.hp,11);
    assert.notDeepEqual({x:state().enemies[0]!.x,y:state().enemies[0]!.y},{x:2,y:1});
    f.send({type:'retry'}); f.send({type:'battle',id:'quay'}); assert.equal(state().actors[0]!.hp,12); assert.equal(state().terrain.length,3);
  } finally { await f.host.stop(); }
});

test('cover reduces ranged attacks against the party but not adjacent attacks',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  try {
    f.go('flood-market'); f.send({type:'battle',id:'smugglers'});
    f.send({type:'move',id:'iona',target:'2,0'});
    f.send({type:'end-turn'}); f.send({type:'end-turn'});
    const b=f.service().state().battle!; assert.equal(b.actors[0]!.hp,11);
    f.send({type:'end-turn'}); assert.equal(f.service().state().battle!.actors[0]!.hp,8);
  } finally { await f.host.stop(); }
});

test('starting equipment is initialized once after the launcher permits play', async()=>{
  const f=fixture(false); await f.host.apply(f.preset);
  try {
    f.host.session!.scheduler.runTick(); assert.deepEqual(f.service().state().bag,[]);
    f.setPlaying(true); f.host.session!.scheduler.runTick();
    assert.deepEqual(f.service().state().bag,['salt-blade','guard-coat','longbow']);
    f.host.session!.scheduler.runTick(); assert.equal(f.service().state().bag.length,3);
    f.send({type:'reset'}); assert.equal(f.service().state().bag.length,3);
  } finally { await f.host.stop(); }
});

for (const ending of ['barrier','return','covenant']) test(`complete ${ending} route with evidence and tactical finale`,async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  f.send({type:'recruit',id:'pell'}); f.send({type:'equip',id:'pell',target:'longbow'});
  f.go('reed-ferry'); f.send({type:'recruit',id:'neri'}); f.go('silt-shrine'); f.send({type:'interact',id:'manifest'}); f.go('drowned-archive'); f.send({type:'interact',id:'archive'}); f.go('salt-orchard'); f.send({type:'choice',id:ending==='barrier'?'fen-city':'fen-families'}); f.go('reed-ferry'); f.go('ledger-hall');
  f.go('switchback'); f.go('miners-rest'); f.send({type:'recruit',id:'sable'}); f.go('wind-cairn'); f.send({type:'interact',id:'vent'}); f.go('bell-foundry'); f.send({type:'choice',id:ending==='covenant'?'ridge-workers':'ridge-city'}); f.go('switchback'); f.go('ledger-hall');
  f.go('pilgrim-gate'); f.go('empty-basilica'); f.go('storm-mouth'); f.send({type:'choice',id:'scar-proof'}); f.go('empty-basilica'); f.go('pilgrim-gate'); f.go('ledger-hall'); f.go('breakwater-engine'); f.fight('engine');
  f.send({type:'ending',id:ending}); assert.equal(f.service().state().ending,ending); assert.equal(f.service().state().party.length,4); assert.equal(f.service().state().active.length,3);
  await f.host.restart(); assert.equal(f.service().state().location,'ledger-hall'); assert.equal(f.service().state().ending,''); await f.host.stop();
});

test('rejections, pause and combat route are deterministic and do not spend resources',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  f.setPlaying(false); assert.equal(f.service().enqueue({type:'travel',id:'old-quay'}),false); f.host.session!.scheduler.runTick(); assert.equal(f.service().state().location,'ledger-hall'); f.setPlaying(true);
  f.send({type:'travel',id:'breakwater-engine'}); assert.equal(f.service().state().location,'ledger-hall');
  f.send({type:'recruit',id:'pell'}); f.send({type:'equip',id:'pell',target:'longbow'}); f.go('old-quay'); f.fight('quay');
  f.go('ledger-hall'); f.go('reed-ferry'); f.go('salt-orchard'); f.send({type:'choice',id:'fen-city'}); assert.ok(!f.service().state().flags.includes('seal-fen')); f.fight('fen'); f.send({type:'choice',id:'fen-city'}); f.send({type:'choice',id:'fen-families'}); assert.ok(!f.service().state().flags.includes('fen-families'));
  await f.host.stop();
});

test('combat alternatives for every regional seal and reset replace progression',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  f.send({type:'recruit',id:'pell'}); f.send({type:'equip',id:'pell',target:'longbow'});
  f.go('reed-ferry'); f.go('salt-orchard'); f.fight('fen'); f.send({type:'choice',id:'fen-city'}); f.go('reed-ferry'); f.go('ledger-hall');
  f.go('switchback'); f.go('bell-foundry'); f.fight('ridge'); f.send({type:'choice',id:'ridge-city'}); f.go('switchback'); f.go('ledger-hall');
  f.go('pilgrim-gate'); f.go('empty-basilica'); f.go('storm-mouth'); f.fight('scar'); f.send({type:'choice',id:'scar-trial'}); f.go('empty-basilica'); f.go('pilgrim-gate'); f.go('ledger-hall'); f.go('breakwater-engine'); f.fight('engine');
  f.send({type:'ending',id:'covenant'}); assert.equal(f.service().state().ending,'');
  f.send({type:'ending',id:'return'}); assert.equal(f.service().state().ending,'return');
  f.send({type:'reset'}); assert.equal(f.service().state().level,1); assert.equal(f.service().state().pending,0); assert.equal(f.service().state().party.length,1);
  f.go('old-quay'); f.fight('quay'); assert.equal(f.service().state().xp,30);
  await f.host.stop();
});

test('invalid campaign references and duplicate locations fail staging without replacing the session',async()=>{
  const f=fixture(); await f.host.apply(f.preset); f.go('old-quay');
  for (const mutate of [
    (data: typeof content[0]['data']) => { data.locations[0]!.exits.push('missing'); },
    (data: typeof content[0]['data']) => { data.locations[1]!.id=data.locations[0]!.id; },
    (data: typeof content[0]['data']) => { data.endings.pop(); },
  ]) {
    const bad=structuredClone(content); mutate(bad[0]!.data);
    await assert.rejects(f.host.apply(f.preset,[{manifest:pack,content:bad}]));
    assert.equal(f.service().state().location,'old-quay');
  }
  assert.ok(Object.isFrozen(f.service().campaign.locations[0]));
  await f.host.stop();
});

test('all eight journal chains are reachable, ordered, rewarded once and reset on restart',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  const state=()=>f.service().state();
  assert.equal(state().journal.length,8);
  assert.equal(state().journal.filter(q=>q.status==='locked').length,4);
  f.send({type:'interact',id:'market-settlement'});
  assert.equal(state().journal[0]!.stage,0);
  const travel=(destination:string)=>{
    const routes: string[][]=[[state().location]]; const seen=new Set([state().location]);
    while(routes.length) { const route=routes.shift()!; const last=route[route.length-1]!; if(last===destination) { for(const id of route.slice(1)) f.go(id); return; } for(const next of f.service().campaign.locations.find(x=>x.id===last)!.exits) if(next!=='breakwater-engine'&&!seen.has(next)) { seen.add(next); routes.push([...route,next]); } }
    assert.fail(`unreachable ${destination}`);
  };
  for (const id of ['quay-debt','ferry-lanterns','foundry-medicine','pilgrim-bell','orchard-witness','conductor-pact','collector-record','names-vigil']) {
    for(let step=0;step<3;step++) {
      const q=state().journal.find(x=>x.id===id)!; assert.equal(q.status,'active'); assert.equal(q.stage,step);
      travel(q.location); f.send({type:'interact',id:q.action});
      const after=state().journal.find(x=>x.id===id)!; assert.equal(after.stage,step+1);
      const count=state().bag.filter(x=>x===q.reward).length;
      f.send({type:'interact',id:q.action}); assert.equal(state().bag.filter(x=>x===q.reward).length,count);
    }
    const q=state().journal.find(x=>x.id===id)!; assert.equal(q.status,'complete'); assert.equal(state().bag.filter(x=>x===q.reward).length,1);
  }
  for (const [item,slot] of [['hook-spear','weapon'],['reed-bow','weapon'],['vigil-blade','weapon'],['pilgrim-coat','armor'],['conductor-mail','armor']] as const) {
    f.send({type:'equip',id:'iona',target:item}); assert.equal(state().party[0]![slot],item);
  }
  f.send({type:'reset'}); assert.equal(state().journal.filter(q=>q.status==='complete').length,0); assert.ok(!state().bag.includes('vigil-blade'));
  f.send({type:'interact',id:'market-account'}); assert.equal(state().journal[0]!.stage,0);
  f.setPlaying(false); assert.equal(f.service().enqueue({type:'interact',id:'market-account'}),false); assert.equal(f.service().enqueue({type:'use',id:'iona',target:'healing-draught'}),false); f.setPlaying(true);
  await f.host.restart(); assert.equal(state().journal.filter(q=>q.status==='complete').length,0); assert.ok(!state().bag.includes('vigil-blade'));
  await f.host.stop();
});

test('earned consumables validate targets and spend one item on legal tactical use',async()=>{
  const f=fixture(); await f.host.apply(f.preset);
  f.send({type:'recruit',id:'pell'});
  f.go('reed-ferry'); f.send({type:'interact',id:'ferry-lantern'}); f.go('silt-shrine'); f.send({type:'interact',id:'shrine-oil'}); f.go('reed-ferry'); f.send({type:'interact',id:'ferry-light'});
  f.go('salt-orchard'); f.send({type:'interact',id:'orchard-witness'}); f.go('drowned-archive'); f.send({type:'interact',id:'archive-copy'}); f.go('silt-shrine'); f.go('reed-ferry'); f.send({type:'interact',id:'ferry-witness'});
  f.go('ledger-hall'); f.go('switchback'); f.go('miners-rest'); f.send({type:'interact',id:'rest-patients'}); f.go('wind-cairn'); f.send({type:'interact',id:'cairn-herbs'}); f.go('miners-rest'); f.send({type:'interact',id:'rest-medicine'});
  f.go('switchback'); f.go('ledger-hall'); f.go('flood-market'); f.send({type:'interact',id:'market-account'}); f.go('old-quay'); f.send({type:'interact',id:'quay-tracks'}); f.go('flood-market'); f.send({type:'interact',id:'market-settlement'}); f.go('ledger-hall'); f.go('pilgrim-gate'); f.go('ossuary-steps'); f.send({type:'interact',id:'steps-cache'}); f.go('pilgrim-gate'); f.go('ledger-hall'); f.go('flood-market'); f.send({type:'interact',id:'market-ledger'}); f.go('ledger-hall'); f.send({type:'interact',id:'hall-record'}); f.go('old-quay');
  f.send({type:'battle',id:'quay'});
  f.send({type:'use',id:'iona',target:'salt-bomb:guard'}); assert.ok(f.service().state().bag.includes('salt-bomb'));
  f.send({type:'move',id:'iona',target:'2,0'}); f.send({type:'use',id:'iona',target:'salt-bomb:guard'}); assert.ok(!f.service().state().bag.includes('salt-bomb'));
  f.send({type:'move',id:'pell',target:'1,1'}); f.send({type:'use',id:'pell',target:'brine-tonic:iona'}); assert.ok(!f.service().state().bag.includes('brine-tonic')); assert.equal(f.service().state().battle!.actors.find(x=>x.id==='iona')!.ap,1);
  f.send({type:'end-turn'}); f.send({type:'end-turn'}); f.send({type:'end-turn'}); const before=f.service().state().battle!.actors.find(x=>x.id==='iona')!.hp; assert.ok(before<12);
  f.send({type:'use',id:'iona',target:'healing-draught:iona'}); assert.ok(!f.service().state().bag.includes('healing-draught')); assert.ok(f.service().state().battle!.actors.find(x=>x.id==='iona')!.hp>before);
  f.send({type:'retry'}); await f.host.stop();
});

test('three optional encounters grant distinct one-time supplies and reject repeat victories',async()=>{
  const f=fixture(); await f.host.apply(f.preset); f.send({type:'recruit',id:'pell'}); f.send({type:'equip',id:'pell',target:'longbow'});
  for(const [id,route,item] of [
    ['smugglers',['flood-market'],'healing-draught'],
    ['gale',['ledger-hall','switchback','miners-rest','wind-cairn'],'salt-bomb'],
    ['echo',['miners-rest','switchback','ledger-hall','pilgrim-gate','empty-basilica'],'brine-tonic'],
  ] as const) {
    for(const loc of route) f.go(loc); f.fight(id); assert.equal(f.service().state().bag.filter(x=>x===item).length,1);
    f.send({type:'battle',id}); assert.equal(f.service().state().battle,null); assert.equal(f.service().state().bag.filter(x=>x===item).length,1);
  }
  await f.host.stop();
});
