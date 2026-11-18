import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../src/kernel/host.ts';
import type { CatalogEntry } from '../src/kernel/host.ts';
import { MechanicResourcesChanged, PHASES, SDK_VERSION, SessionControl } from '../src/sdk/index.ts';
import { Verdant } from '../games/verdant/contracts/verdant.ts';
import { Sky } from '../games/sky/contracts/sky.ts';
import type { VerdantCommand } from '../games/verdant/contracts/verdant.ts';
import type { SkyCommand } from '../games/sky/contracts/sky.ts';
import resources from '../src/plugins/mechanics-resources/manifest.json' with { type: 'json' };
import clock from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import actions from '../src/plugins/mechanics-actions/manifest.json' with { type: 'json' };
import objectives from '../src/plugins/mechanics-objectives/manifest.json' with { type: 'json' };
import kits from '../src/plugins/mechanics-kits/manifest.json' with { type: 'json' };
import skyGame from '../games/sky/plugins/sky-game/manifest.json' with { type: 'json' };
import skyPack from '../games/sky/plugins/sky-content/manifest.json' with { type: 'json' };
import skyContent from '../games/sky/plugins/sky-content/content.json' with { type: 'json' };
import skyPreset from '../games/sky/presets/sky-salvage.json' with { type: 'json' };
import verdantGame from '../games/verdant/plugins/verdant-game/manifest.json' with { type: 'json' };
import verdantPack from '../games/verdant/plugins/verdant-content/manifest.json' with { type: 'json' };
import verdantContent from '../games/verdant/plugins/verdant-content/content.json' with { type: 'json' };
import verdantPreset from '../games/verdant/presets/verdant-relay.json' with { type: 'json' };

async function fixture(family: 'sky' | 'verdant', content: unknown = family === 'sky' ? skyContent : verdantContent, playing = true) {
  const gate = { playing };
  const host = new PluginHost({ sdkVersion: SDK_VERSION, phases: PHASES, installHostServices(session, scope) {
    session.services.provide(SessionControl, gate, 'test', scope);
  } });
  const catalog: CatalogEntry[] = [
    { manifest: resources, load: () => import('../src/plugins/mechanics-resources/index.ts') },
    { manifest: clock, load: () => import('../src/plugins/mechanics-clock/index.ts') },
    { manifest: actions, load: () => import('../src/plugins/mechanics-actions/index.ts') },
    { manifest: objectives, load: () => import('../src/plugins/mechanics-objectives/index.ts') },
    { manifest: kits, load: () => import('../src/plugins/mechanics-kits/index.ts') },
    ...(family === 'sky' ? [
      { manifest: skyGame, load: () => import('../games/sky/plugins/sky-game/index.ts') }, { manifest: skyPack, content },
    ] : [
      { manifest: verdantGame, load: () => import('../games/verdant/plugins/verdant-game/index.ts') }, { manifest: verdantPack, content },
    ]),
  ];
  assert.deepEqual(host.setCatalog(catalog), []);
  const preset = family === 'sky' ? skyPreset : verdantPreset;
  const { 'sdk/theme': _theme, ...roles } = preset.roles;
  try { await host.apply({ ...preset, plugins: catalog.map(entry => (entry.manifest as { id: string }).id), roles }); }
  catch (error) { host.stop(); throw error; }
  return { host, gate, tick() { host.session!.scheduler.runTick(); assert.equal(host.session!.state, 'running'); } };
}

// These public-state traces were first run against the timestamp/modulo consumers before extraction.
test('Sky boost preserves advance-before-command and the accumulated-seconds boundary without epsilon', async () => {
  const f = await fixture('sky');
  try {
    const sky = f.host.session!.services.get(Sky);
    const send = (command: SkyCommand) => { assert.equal(sky.enqueue(command), true); f.tick(); };
    send({ type: 'boost' });
    assert.equal(sky.state().time, 1 / 60);
    assert.equal(sky.state().energy, 80);
    assert.equal(sky.state().hull, 80, 'first-tick collision is initially eligible');
    const expiry = 1 / 60 + 1.5;
    send({ type: 'boost' });
    assert.equal(sky.state().energy, 80, 'rejected action must not refresh the effect');
    for (let tick = 3; tick <= 89; tick++) f.tick();
    const trace: { tick: number; time: number; distance: number }[] = [];
    for (const tick of [90, 91, 92]) {
      const x = sky.state().x;
      send({ type: 'move', x: 1, z: 0 });
      trace.push({ tick, time: sky.state().time, distance: sky.state().x - x });
    }
    assert.deepEqual(trace.map(point => point.time), [1.4999999999999996, 1.5166666666666662, 1.5333333333333328]);
    assert.ok(trace[1]!.time < expiry, 'binary accumulation stays just below the nominal 90-step endpoint');
    assert.ok(trace[2]!.time >= expiry);
    assert.ok(Math.abs(trace[0]!.distance - 10 / 60) < 1e-15);
    assert.ok(Math.abs(trace[1]!.distance - 10 / 60) < 1e-15);
    assert.ok(Math.abs(trace[2]!.distance - 5 / 60) < 1e-15);
    assert.ok(sky.state().boostRemaining > 2, 'action cooldown outlasts active boost');
    console.info('Sky boost boundary', JSON.stringify({ expiry, trace }));
  } finally { f.host.stop(); }
});

test('Sky collision immunity expires on the same exact tick; pause freezes it and replay resets ownership', async () => {
  const f = await fixture('sky');
  try {
    const session = f.host.session!, sky = session.services.get(Sky);
    const collisions: { tick: number; time: number; hull: number }[] = [];
    session.events.on(MechanicResourcesChanged, event => {
      if (event.reason === 'storm collision') collisions.push({ tick: session.scheduler.tick + 1, time: sky.state().time, hull: sky.state().hull });
    }, 'test', session.scope);
    f.tick();
    assert.equal(sky.state().hull, 80);
    const before = sky.state();
    assert.equal(sky.enqueue({ type: 'move', x: 1, z: 0 }), true);
    f.gate.playing = false;
    for (let i = 0; i < 120; i++) f.tick();
    assert.equal(sky.enqueue({ type: 'boost' }), false);
    assert.deepEqual(sky.state(), before);
    f.gate.playing = true;
    for (let tick = 2; tick <= 93; tick++) {
      const state = sky.state(), nextHazard = Math.sin((state.time + 1 / 60) * 0.9) * 4;
      assert.equal(sky.enqueue({ type: 'move', x: nextHazard >= state.x ? 1 : -1, z: 0 }), true);
      f.tick();
      assert.equal(sky.state().hull, tick < 92 ? 80 : 60, `flight tick ${tick}`);
    }
    assert.deepEqual(collisions, [
      { tick: 1, time: 1 / 60, hull: 80 }, { tick: 212, time: 1.5333333333333328, hull: 60 },
    ]);
    const owned = session.scope.size();
    for (let i = 0; i < 10; i++) {
      assert.equal(sky.enqueue({ type: 'restart' }), true); f.tick();
      assert.equal(sky.state().time, 0); assert.equal(sky.state().hull, 100);
      assert.equal(session.scope.size(), owned);
      f.tick(); assert.equal(sky.state().hull, 80, 'new flight has no inherited immunity');
    }
    await f.host.restart();
    assert.equal(sky.enqueue({ type: 'boost' }), false, 'retained old service rejects ingress');
    assert.equal(f.host.session!.services.get(Sky).state().time, 0);
    assert.equal(f.host.session!.scope.size(), owned - 1, 'restart also releases the test observer');
  } finally { f.host.stop(); }
});

test('Verdant dry-wind uses successful turns: before/at/after, explicit rearm, idle, rejection and pause', async () => {
  const f = await fixture('verdant', undefined, false);
  try {
    const session = f.host.session!, verdant = session.services.get(Verdant);
    const send = (command: VerdantCommand) => { assert.equal(verdant.enqueue(command), true); f.tick(); return verdant.state(); };
    const drains: number[] = [];
    session.events.on(MechanicResourcesChanged, event => { if (event.reason === 'dry-wind') drains.push(verdant.state().turn); }, 'test', session.scope);
    const initial = verdant.state();
    for (let i = 0; i < 60; i++) f.tick();
    assert.deepEqual(verdant.state(), initial);
    f.gate.playing = true;
    send({ type: 'act', action: 'water' });
    const rejected = send({ type: 'act', action: 'water' });
    assert.equal(rejected.turn, 1); assert.equal(rejected.resources.water, 7);
    send({ type: 'act', action: 'wait' });
    assert.equal(verdant.state().forecast, 'Dry wind tomorrow · −1 water');
    assert.equal(verdant.enqueue({ type: 'act', action: 'wait' }), true);
    f.gate.playing = false; f.tick();
    assert.equal(verdant.enqueue({ type: 'act', action: 'wait' }), false);
    f.gate.playing = true; f.tick();
    assert.equal(verdant.state().turn, 2, 'observed pause clears queued work');
    const third = send({ type: 'act', action: 'wait' });
    assert.equal(third.turn, 3); assert.equal(third.resources.water, 6); assert.deepEqual(drains, [3]);
    assert.equal(third.forecast, 'Calm · no water drain');
    for (let day = 4; day <= 6; day++) send({ type: 'act', action: 'wait' });
    assert.equal(verdant.state().resources.water, 5); assert.deepEqual(drains, [3, 6]);
    const owned = session.scope.size();
    for (let i = 0; i < 10; i++) {
      send({ type: 'restart' });
      assert.equal(verdant.state().turn, 0); assert.equal(session.scope.size(), owned);
      send({ type: 'act', action: 'wait' }); send({ type: 'act', action: 'wait' });
      assert.equal(verdant.state().resources.water, 4);
      send({ type: 'act', action: 'wait' }); assert.equal(verdant.state().resources.water, 3);
    }
    await f.host.restart();
    assert.equal(verdant.enqueue({ type: 'act', action: 'wait' }), false);
    assert.equal(f.host.session!.services.get(Verdant).state().turn, 0);
    assert.equal(f.host.session!.scope.size(), owned - 1, 'restart also releases the test observer');
  } finally { f.host.stop(); }
});

for (const outcome of ['victory', 'dry-wind', 'season'] as const) test(`Verdant final-day precedence: ${outcome}`, async () => {
  const content = structuredClone(verdantContent);
  content[1]!.data.days = 3;
  for (const resource of content[0]!.data.resources!) {
    resource.initial = resource.id === 'water' ? (outcome === 'victory' ? 3 : outcome === 'dry-wind' ? 0 : 1) : 6;
  }
  const f = await fixture('verdant', content, false);
  try {
    // Both initial apply and a host restart happen at the paused launcher in the browser.
    for (let run = 0; run < 2; run++) {
      if (run) { f.gate.playing = false; await f.host.restart(); }
      const session = f.host.session!, verdant = session.services.get(Verdant), drains: string[] = [];
      const initial = verdant.state(); f.tick(); assert.deepEqual(verdant.state(), initial);
      f.gate.playing = true;
      session.events.on(MechanicResourcesChanged, event => { if (event.reason === 'dry-wind') drains.push(event.reason); }, 'test', session.scope);
      for (const station of ['reed', 'canopy', 'tide']) {
        assert.equal(verdant.enqueue(outcome === 'victory' ? { type: 'act', action: 'restore', station } : { type: 'act', action: 'wait' }), true);
        f.tick();
      }
      const state = verdant.state();
      assert.equal(state.turn, 3); assert.equal(state.resources.water, 0);
      assert.equal(state.status, outcome === 'victory' ? 'won' : 'lost');
      assert.match(state.message, outcome === 'victory' ? /relays sing/ : outcome === 'dry-wind' ? /Dry winds/ : /season ended/);
      assert.equal(drains.length, outcome === 'season' ? 1 : 0, 'victory skips drain; successful final-day drain precedes season loss');
      for (let i = 0; i < 10; i++) f.tick();
      assert.deepEqual(verdant.state(), state);
    }
  } finally { f.host.stop(); }
});
