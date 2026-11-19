import test from 'node:test';
import assert from 'node:assert/strict';
import { MechanicActionCommitted, MechanicObjectiveChanged, SessionControl } from '@bulkhead/sdk';
import { Verdant } from '../contracts/verdant.ts';
import type { VerdantCommand } from '../contracts/verdant.ts';
import preset from '../presets/verdant-relay.json' with { type:'json' };
import resources from '@bulkhead/std/mechanics-resources/manifest.json' with { type:'json' };
import clock from '@bulkhead/std/mechanics-clock/manifest.json' with { type:'json' };
import actions from '@bulkhead/std/mechanics-actions/manifest.json' with { type:'json' };
import objectives from '@bulkhead/std/mechanics-objectives/manifest.json' with { type:'json' };
import kits from '@bulkhead/std/mechanics-kits/manifest.json' with { type:'json' };
import rules from '../plugins/verdant-game/manifest.json' with { type:'json' };
import presentation from '../plugins/verdant-presentation/manifest.json' with { type:'json' };
import pack from '../plugins/verdant-content/manifest.json' with { type:'json' };
import content from '../plugins/verdant-content/content.json' with { type:'json' };
import theme from '@bulkhead/std/theme-board/manifest.json' with { type:'json' };
import { createHeadlessGame } from '../../../tests/helpers/game.ts';

async function game(data = content) {
  const g = createHeadlessGame([
    { manifest:resources, load:() => import('@bulkhead/std/mechanics-resources/index.ts') },
    { manifest:clock, load:() => import('@bulkhead/std/mechanics-clock/index.ts') },
    { manifest:actions, load:() => import('@bulkhead/std/mechanics-actions/index.ts') },
    { manifest:objectives, load:() => import('@bulkhead/std/mechanics-objectives/index.ts') },
    { manifest:kits, load:() => import('@bulkhead/std/mechanics-kits/index.ts') },
    { manifest:rules, load:() => import('../plugins/verdant-game/index.ts') },
    { manifest:presentation, load:() => import('../plugins/verdant-presentation/index.ts') },
    { manifest:pack, content: data }, { manifest:theme, load:() => import('@bulkhead/std/theme-board/index.ts') },
  ]);
  await g.host.apply(preset);
  const service = () => g.session().services.get(Verdant);
  const send = (command: VerdantCommand) => { assert.equal(service().enqueue(command), true); g.ticks(1); return service().state(); };
  return { ...g, service, send };
}

test('three distinct relays win through shared action and objective providers', async () => {
  const g = await game();
  try {
    const committed: string[] = [], receipts: number[] = [];
    assert.equal(g.service().actionDefinitions.find(action => action.id === 'water')?.gain?.water, 3);
    assert.equal(g.service().actionDefinitions.find(action => action.id === 'water')?.cooldown, 2);
    g.session().events.on(MechanicActionCommitted, e => { if (e.owner === 'verdant/game') committed.push(e.action); }, 'test', g.session().scope);
    g.session().events.on(MechanicObjectiveChanged, e => { if (e.owner === 'verdant/game') receipts.push(e.value); }, 'test', g.session().scope);
    const route: VerdantCommand[] = [
      { type:'act', action:'restore', station:'reed' }, { type:'act', action:'biomass' }, { type:'act', action:'convert' },
      { type:'act', action:'restore', station:'canopy' }, { type:'act', action:'water' }, { type:'act', action:'biomass' },
      { type:'act', action:'convert' }, { type:'act', action:'restore', station:'tide' },
    ];
    route.forEach((c, i) => assert.equal(g.send(c).turn, i + 1));
    assert.equal(g.service().state().status, 'won'); assert.deepEqual(receipts, [1, 2, 3]); assert.equal(committed.length, 8);
    assert.deepEqual(g.service().state().restored, ['reed', 'canopy', 'tide']);
    assert.equal(g.send({ type:'restart' }).turn, 0);
    await g.host.restart(); assert.equal(g.service().state().turn, 0); assert.deepEqual(g.service().state().restored, []);
  } finally { g.host.stop(); }
});

test('staging rejects a kit with an additional objective that could prevent victory', async () => {
  const modified = structuredClone(content);
  modified[0]!.data.objectives!.push({ id: 'hidden', label: 'Unreachable', target: 1 });
  await assert.rejects(() => game(modified), /exactly one unlocked relays objective/);
});

test('cooldown boundary, invalid targets, overflow and duplicate restoration never consume a turn or resources', async () => {
  const g = await game();
  try {
    g.send({ type:'act', action:'water' });
    const before = g.service().state(); assert.equal(before.cooldowns.water, 1);
    const rejected = g.send({ type:'act', action:'water' }); assert.equal(rejected.turn, before.turn); assert.deepEqual(rejected.resources, before.resources);
    g.send({ type:'act', action:'wait' }); assert.equal(g.service().state().cooldowns.water, 0);
    assert.equal(g.send({ type:'act', action:'water' }).turn, 3);
    g.send({ type:'act', action:'restore', station:'reed' });
    const prior = g.service().state(); const duplicate = g.send({ type:'act', action:'restore', station:'reed' });
    assert.equal(duplicate.turn, prior.turn); assert.deepEqual(duplicate.resources, prior.resources);
    assert.equal(g.service().enqueue({ type:'act', action:'restore', station:'missing' }), false);
    g.send({ type:'restart' });
    for (const action of ['water','wait','water','wait','water','wait'] as const) g.send({ type:'act', action });
    const full = g.service().state(); assert.equal(full.resources.water, 11);
    const overflow = g.send({ type:'act', action:'water' }); assert.equal(overflow.turn, full.turn); assert.deepEqual(overflow.resources, full.resources);
  } finally { g.host.stop(); }
});

test('idle ticks, malformed and paused ingress, loss and restart', async () => {
  const g = await game();
  try {
    const start = g.service().state(); g.ticks(1800); assert.deepEqual(g.service().state(), start);
    for (const x of [null, [], {}, { type:'act', action:'hack' }, { type:'act', action:'restore', station:7 }]) assert.equal(g.service().enqueue(x as VerdantCommand), false);
    const control = { playing:true }; g.session().services.provide(SessionControl, control, 'test', g.session().scope);
    assert.equal(g.service().enqueue({ type:'act', action:'wait' }), true); control.playing = false; g.ticks(1);
    assert.equal(g.service().enqueue({ type:'act', action:'wait' }), false); control.playing = true; g.ticks(1); assert.deepEqual(g.service().state(), start);
    for (let i = 0; i < 32; i++) assert.equal(g.service().enqueue({ type:'act', action:'wait' }), true);
    assert.equal(g.service().enqueue({ type:'act', action:'wait' }), false);
    control.playing = false; g.ticks(1); control.playing = true;
    for (let i = 0; i < 15; i++) g.send({ type:'act', action:'wait' });
    assert.equal(g.service().state().status, 'lost'); assert.equal(g.service().state().turn, 15);
    assert.equal(g.send({ type:'restart' }).status, 'playing'); assert.equal(g.service().state().turn, 0);
  } finally { g.host.stop(); }
});
