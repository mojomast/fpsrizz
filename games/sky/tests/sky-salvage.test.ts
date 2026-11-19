import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import { Scope } from '@bulkhead/kernel/scope.ts';
import { MechanicActionCommitted, MechanicObjectiveChanged, PHASES, SDK_COMPAT, SDK_VERSION, SessionControl } from '@bulkhead/sdk';
import { Sky } from '../contracts/sky.ts';
import resources from '@bulkhead/std/mechanics-resources/manifest.json' with { type: 'json' };
import clock from '@bulkhead/std/mechanics-clock/manifest.json' with { type: 'json' };
import actions from '@bulkhead/std/mechanics-actions/manifest.json' with { type: 'json' };
import objectives from '@bulkhead/std/mechanics-objectives/manifest.json' with { type: 'json' };
import kits from '@bulkhead/std/mechanics-kits/manifest.json' with { type: 'json' };
import game from '../plugins/sky-game/manifest.json' with { type: 'json' };
import pack from '../plugins/sky-content/manifest.json' with { type: 'json' };
import content from '../plugins/sky-content/content.json' with { type: 'json' };
import preset from '../presets/sky-salvage.json' with { type: 'json' };

async function setup(gate = { playing: true }, packContent: unknown = content) {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES, installHostServices(session, scope) { session.services.provide(SessionControl, gate, 'host', scope); } });
  assert.deepEqual(host.setCatalog([
    { manifest: resources, load: () => import('@bulkhead/std/mechanics-resources/index.ts') },
    { manifest: clock, load: () => import('@bulkhead/std/mechanics-clock/index.ts') },
    { manifest: actions, load: () => import('@bulkhead/std/mechanics-actions/index.ts') },
    { manifest: objectives, load: () => import('@bulkhead/std/mechanics-objectives/index.ts') },
    { manifest: kits, load: () => import('@bulkhead/std/mechanics-kits/index.ts') },
    { manifest: game, load: () => import('../plugins/sky-game/index.ts') },
    { manifest: pack, content: packContent },
  ]), []);
  const roles = { ...preset.roles }; const { 'sdk/theme': _theme, ...headlessRoles } = roles;
  await host.apply({ ...preset, plugins: preset.plugins.filter(id => id !== 'sky/presentation' && id !== 'theme/board'), roles: headlessRoles });
  return host;
}

test('courier completes distinct legal deliveries using shared actions and objectives', async () => {
  const host = await setup();
  try {
    const session = host.session!, sky = session.services.get(Sky);
    assert.ok(Object.isFrozen(sky.route)); assert.ok(Object.isFrozen(sky.route.deliveries));
    assert.ok(Object.isFrozen(sky.route.deliveries[0]!.pickup)); assert.ok(Object.isFrozen(sky.kit.actions));
    const committed: string[] = [], progress: number[] = [];
    const scope = new Scope('test', 'sky events');
    session.events.on(MechanicActionCommitted, event => { if (event.owner === 'sky/game') committed.push(event.action); }, 'test', scope);
    session.events.on(MechanicObjectiveChanged, event => { if (event.owner === 'sky/game') progress.push(event.value); }, 'test', scope);
    const tick = () => session.scheduler.runTick();
    const moveTo = (x: number, z: number) => {
      for (let i = 0; i < 500; i++) {
        const s = sky.state(), dx = x - s.x, dz = z - s.z;
        if (Math.hypot(dx, dz) < 0.7) return;
        assert.equal(sky.enqueue({ type: 'move', x: dx / Math.hypot(dx,dz), z: dz / Math.hypot(dx,dz) }), true); tick();
      }
      assert.fail('destination not reached');
    };
    assert.equal(sky.enqueue({ type:'collect' }), true); tick(); assert.equal(sky.state().cargo, null);
    for (let i = 0; i < 3; i++) {
      moveTo((i - 1) * 6, i === 1 ? -5 : -4); sky.enqueue({ type:'collect' }); tick(); assert.equal(sky.state().cargo, i, JSON.stringify(sky.state()));
      moveTo((i - 1) * 6, 5); sky.enqueue({ type:'deliver' }); tick(); assert.equal(sky.state().delivered[i], true);
    }
    assert.equal(sky.state().status, 'won'); assert.deepEqual(progress, [1,2,3]);
    assert.deepEqual(committed, ['collect','deliver','collect','deliver','collect','deliver']);
    sky.enqueue({ type:'restart' }); tick(); assert.equal(sky.state().status, 'playing'); assert.deepEqual(sky.state().delivered, [false,false,false]);
  } finally { host.stop(); }
});

test('bounded ingress, boost cooldown, hazard defeat and restart', async () => {
  const gate = { playing: true }, host = await setup(gate);
  try {
    const session = host.session!, sky = session.services.get(Sky), tick = () => session.scheduler.runTick();
    assert.equal(sky.enqueue({ type:'move', x: NaN, z: 1 }), false);
    assert.equal(sky.enqueue({ type:'move', x: 2, z: 0 }), false);
    gate.playing = false; assert.equal(sky.enqueue({ type:'boost' }), false); tick(); assert.equal(sky.state().time, 0); gate.playing = true;
    assert.equal(sky.enqueue({ type:'boost' }), true); tick(); assert.equal(sky.state().energy, 80);
    sky.enqueue({ type:'boost' }); tick(); assert.equal(sky.state().energy, 80);
    for (let i = 0; i < 2000 && sky.state().status === 'playing'; i++) tick();
    assert.equal(sky.state().status, 'lost'); assert.equal(sky.state().hull, 0);
    for (let i = 0; i < 5; i++) { sky.enqueue({ type:'restart' }); tick(); assert.equal(sky.state().hull, 100); assert.equal(sky.state().energy, 100); assert.equal(sky.state().time, 0); }
  } finally { host.stop(); }
});

test('route content and kit objective mismatch fail staging', async () => {
  const copy = () => structuredClone(content) as unknown as Array<{ kind: string; id: string; data: Record<string, unknown> }>;
  const missing = copy(); missing.pop();
  await assert.rejects(() => setup(undefined, missing));
  const invalid = copy();
  invalid[1]!.data['deliveries'] = [{ id:'duplicate', pickup:{ x: 100, z:0 }, beacon:{ x:0,z:0 } }, { id:'duplicate', pickup:{ x: 0, z:0 }, beacon:{ x:0,z:0 } }];
  await assert.rejects(() => setup(undefined, invalid));
  const mismatch = copy(); mismatch[0]!.data['objectives'] = [{ id:'deliveries', label:'Deliver', target:2 }];
  await assert.rejects(() => setup(undefined, mismatch));
  const extra = copy(); extra[0]!.data['objectives'] = [{ id:'deliveries', label:'Deliver', target:3 }, { id:'other', label:'Other', target:1 }];
  await assert.rejects(() => setup(undefined, extra));
});
