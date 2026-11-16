import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ember, SessionControl, Scope, MechanicActionCommitted, Reporter } from '../src/sdk/index.ts';
import { loadDefense } from '../src/plugins/ember-game/content.ts';
import { createHeadlessGame } from './helpers/game.ts';
import resources from '../src/plugins/mechanics-resources/manifest.json' with {type:'json'};
import clock from '../src/plugins/mechanics-clock/manifest.json' with {type:'json'};
import actions from '../src/plugins/mechanics-actions/manifest.json' with {type:'json'};
import objectives from '../src/plugins/mechanics-objectives/manifest.json' with {type:'json'};
import kits from '../src/plugins/mechanics-kits/manifest.json' with {type:'json'};
import game from '../src/plugins/ember-game/manifest.json' with {type:'json'};
import pack from '../src/plugins/ember-content/manifest.json' with {type:'json'};
import content from '../src/plugins/ember-content/content.json' with {type:'json'};
const preset = {schema:1,id:'ember/test',name:'Ember',plugins:['mechanics/resources','mechanics/clock','mechanics/actions','mechanics/objectives','mechanics/kits','ember/game','ember/content'],roles:{'sdk/experience':'ember/bastion','sdk/mechanic-resources':'mechanics/resources','sdk/mechanic-clock':'mechanics/clock','sdk/mechanic-actions':'mechanics/actions','sdk/mechanic-objectives':'mechanics/objectives'},options:{defense:'ember/ash-lane'},seed:1};
function setup() {return createHeadlessGame([
 {manifest:resources,load:()=>import('../src/plugins/mechanics-resources/index.ts')}, {manifest:clock,load:()=>import('../src/plugins/mechanics-clock/index.ts')}, {manifest:actions,load:()=>import('../src/plugins/mechanics-actions/index.ts')}, {manifest:objectives,load:()=>import('../src/plugins/mechanics-objectives/index.ts')}, {manifest:kits,load:()=>import('../src/plugins/mechanics-kits/index.ts')}, {manifest:game,load:()=>import('../src/plugins/ember-game/index.ts')}, {manifest:pack,content},
]);}
test('forging, rejection, three actual waves and restart',async()=>{const h=setup();await h.host.apply(preset);const s=h.session().services.get(Ember);const send=(c:Parameters<typeof s.enqueue>[0])=>{assert.equal(s.enqueue(c),true);h.ticks(1);};
 send({type:'build',pad:-1});assert.equal(s.state().scrap,100);send({type:'build',pad:2});send({type:'build',pad:2});assert.equal(s.state().scrap,60);send({type:'build',pad:3});send({type:'build',pad:0});assert.equal(s.state().scrap,20);
 for(let wave=0;wave<3;wave++){send({type:'launch'});for(let i=0;i<2400&&s.state().status==='wave';i++)h.ticks(1);assert.notEqual(s.state().status,'lost');if(wave===0)send({type:'build',pad:0});}
 assert.equal(s.state().status,'won');await h.host.restart();assert.equal(h.session().services.get(Ember).state().scrap,100);assert.equal(s.enqueue({type:'launch'}),false);h.host.stop();});
test('unprotected core is defeated',async()=>{const h=setup();await h.host.apply(preset);const s=h.session().services.get(Ember);s.enqueue({type:'launch'});h.ticks(2400);assert.equal(s.state().status,'lost');assert.equal(s.state().integrity,0);s.enqueue({type:'replay'});h.ticks(1);assert.equal(s.state().scrap,100);assert.equal(s.state().status,'build');h.host.stop();});

test('menu and pause reject ingress and clear queued actions',async()=>{const h=setup();await h.host.apply(preset);const session=h.session(), scope=new Scope('test','test-control');let playing=false;session.services.provide(SessionControl,{get playing(){return playing;}},'test',scope);const s=session.services.get(Ember);assert.equal(s.enqueue({type:'build',pad:2}),false);h.ticks(90);assert.equal(s.state().scrap,100);playing=true;assert.equal(s.enqueue({type:'build',pad:2}),true);playing=false;h.ticks(1);playing=true;h.ticks(1);assert.equal(s.state().scrap,100);scope.dispose();h.host.stop();});


test('towers use independent shared fire cooldowns and replay releases all handles', async () => {
  const h = setup();
  await h.host.apply(preset);
  const session = h.session(), s = session.services.get(Ember);
  const observer = new Scope('test', 'fire-observer');
  const receipts: { instance: string; at: number }[] = [];
  session.events.on(MechanicActionCommitted, event => {
    if (event.owner === 'ember/game' && event.action === 'fire') receipts.push({ instance: event.instance, at: event.at });
  }, 'test', observer);
  const baseline = session.scope.stats();
  for (let run = 0; run < 3; run++) {
    const first = receipts.length;
    for (const pad of [2, 3]) { assert.equal(s.enqueue({ type: 'build', pad }), true); h.ticks(1); }
    assert.equal(s.enqueue({ type: 'launch' }), true);
    h.ticks(600);
    const fires = receipts.slice(first);
    assert.ok(fires.some(a => a.instance === 'ember/tower/2' && fires.some(b => b.instance === 'ember/tower/3' && b.at === a.at)), 'both towers fire in the same simulation tick');
    for (const id of ['ember/tower/2', 'ember/tower/3']) {
      const times = fires.filter(f => f.instance === id).map(f => f.at);
      assert.ok(times.length >= 2);
      for (let i = 1; i < times.length; i++) assert.ok(times[i]! - times[i - 1]! >= s.config.fireInterval - 1e-9);
    }
    while (s.state().status !== 'won' && s.state().status !== 'lost') {
      if (s.state().status === 'build') s.enqueue({ type: 'launch' });
      h.ticks(1);
    }
    assert.equal(s.enqueue({ type: 'replay' }), true); h.ticks(1);
    assert.equal(s.state().scrap, 100); assert.equal(s.state().integrity, 10);
    assert.deepEqual(session.scope.stats(), baseline);
    s.enqueue({ type: 'launch' }); h.ticks(1);
    assert.equal(s.state().enemies[0]?.id, 1);
    // End this run without towers and replay so each loop starts from identical state.
    h.ticks(2400); assert.equal(s.state().status, 'lost');
    s.enqueue({ type: 'replay' }); h.ticks(1);
    assert.deepEqual(session.scope.stats(), baseline);
  }
  observer.dispose(); h.host.stop();
});

test('authored defense rejects unknown nested keys and freezes its entire configuration', () => {
  const raw = content[1]!.data;
  const issues: { source: string; path: string; message: string }[] = [];
  const config = loadDefense(raw, new Reporter(issues, 'test'))!;
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.pads) && Object.isFrozen(config.pads[0])
    && Object.isFrozen(config.lane) && Object.isFrozen(config.lane[0]) && Object.isFrozen(config.waves) && Object.isFrozen(config.waves[0]));
  const invalid = { ...raw, typo: 1, pads: [{ ...raw.pads![0], typo: 2 }], lane: raw.lane!.map((p, i) => i ? p : { ...p, typo: 4 }), waves: [{ ...raw.waves![0], typo: 3 }] };
  const errors: { source: string; path: string; message: string }[] = [];
  assert.equal(loadDefense(invalid, new Reporter(errors, 'test')), undefined);
  assert.deepEqual(errors.map(e => e.path), ['typo', 'pads[0].typo', 'lane[0].typo', 'waves[0].typo']);
});

test('read model exposes shared action costs, readiness and simulation cooldown', async () => {
  const h = setup();
  await h.host.apply(preset);
  const s = h.session().services.get(Ember);
  const pulse = () => s.state().actions.find(a => a.definition.id === 'pulse')!;
  assert.equal(pulse().definition.spend?.['scrap'], 30);
  assert.equal(pulse().remaining, 0);
  assert.equal(pulse().available, true);
  s.enqueue({ type: 'launch' }); h.ticks(1);
  s.enqueue({ type: 'pulse' }); h.ticks(1);
  assert.equal(s.state().scrap, 78); // Pulse kills the first enemy and earns salvage.
  assert.ok(pulse().remaining > 7.9);
  assert.equal(pulse().available, false);
  h.ticks(481);
  assert.equal(pulse().remaining, 0);
  assert.equal(pulse().available, true);
  h.host.stop();
});
