import test from 'node:test';
import assert from 'node:assert/strict';
import { MechanicActionCommitted, MechanicObjectiveChanged, Sky, Verdant } from '../src/sdk/index.ts';
import type { VerdantCommand } from '../src/sdk/index.ts';
import resources from '../src/plugins/mechanics-resources/manifest.json' with { type: 'json' };
import clock from '../src/plugins/mechanics-clock/manifest.json' with { type: 'json' };
import actions from '../src/plugins/mechanics-actions/manifest.json' with { type: 'json' };
import objectives from '../src/plugins/mechanics-objectives/manifest.json' with { type: 'json' };
import kits from '../src/plugins/mechanics-kits/manifest.json' with { type: 'json' };
import skyRules from '../src/plugins/sky-game/manifest.json' with { type: 'json' };
import skyPresentation from '../src/plugins/sky-presentation/manifest.json' with { type: 'json' };
import skyPack from '../src/plugins/portfolio-sky-resource/manifest.json' with { type: 'json' };
import skyContent from '../src/plugins/portfolio-sky-resource/content.json' with { type: 'json' };
import skyPreset from '../src/content/presets/portfolio-sky-resource.json' with { type: 'json' };
import verdantRules from '../src/plugins/verdant-game/manifest.json' with { type: 'json' };
import verdantPresentation from '../src/plugins/verdant-presentation/manifest.json' with { type: 'json' };
import verdantPack from '../src/plugins/portfolio-verdant-resource/manifest.json' with { type: 'json' };
import verdantContent from '../src/plugins/portfolio-verdant-resource/content.json' with { type: 'json' };
import verdantPreset from '../src/content/presets/portfolio-verdant-resource.json' with { type: 'json' };
import theme from '../src/plugins/theme-board/manifest.json' with { type: 'json' };
import { createHeadlessGame } from './helpers/game.ts';

function game() {
  return createHeadlessGame([
    { manifest: resources, load: () => import('../src/plugins/mechanics-resources/index.ts') },
    { manifest: clock, load: () => import('../src/plugins/mechanics-clock/index.ts') },
    { manifest: actions, load: () => import('../src/plugins/mechanics-actions/index.ts') },
    { manifest: objectives, load: () => import('../src/plugins/mechanics-objectives/index.ts') },
    { manifest: kits, load: () => import('../src/plugins/mechanics-kits/index.ts') },
    { manifest: skyRules, load: () => import('../src/plugins/sky-game/index.ts') },
    { manifest: skyPresentation, load: () => import('../src/plugins/sky-presentation/index.ts') },
    { manifest: skyPack, content: skyContent },
    { manifest: verdantRules, load: () => import('../src/plugins/verdant-game/index.ts') },
    { manifest: verdantPresentation, load: () => import('../src/plugins/verdant-presentation/index.ts') },
    { manifest: verdantPack, content: verdantContent },
    { manifest: theme, load: () => import('../src/plugins/theme-board/index.ts') },
  ]);
}

test('Crosswind completes four crossed deliveries and rejects delivery at the wrong beacon', async () => {
  const g = game();
  try {
    await g.host.apply(skyPreset);
    const sky = g.session().services.get(Sky), progress: number[] = [], commits: string[] = [];
    g.session().events.on(MechanicObjectiveChanged, e => { if (e.owner === 'sky/game') progress.push(e.value); }, 'test', g.session().scope);
    g.session().events.on(MechanicActionCommitted, e => { if (e.owner === 'sky/game') commits.push(e.action); }, 'test', g.session().scope);
    const move = (x: number, z: number) => {
      for (let i = 0; i < 600; i++) {
        const s = sky.state(), dx = x - s.x, dz = z - s.z, distance = Math.hypot(dx, dz);
        if (distance < 0.7) return;
        assert.equal(s.status, 'playing');
        assert.equal(sky.enqueue({ type: 'move', x: dx / distance, z: dz / distance }), true); g.ticks(1);
      }
      assert.fail('destination not reached');
    };
    assert.equal(sky.route.deliveries.length, 4);
    for (let i = 0; i < sky.route.deliveries.length; i++) {
      const delivery = sky.route.deliveries[i]!;
      move(delivery.pickup.x, delivery.pickup.z);
      sky.enqueue({ type: 'collect' }); g.ticks(1); assert.equal(sky.state().cargo, i);
      if (i === 0) {
        const wrong = sky.route.deliveries[1]!.beacon;
        move(wrong.x, wrong.z); sky.enqueue({ type: 'deliver' }); g.ticks(1);
        assert.equal(sky.state().cargo, 0); assert.deepEqual(progress, []);
      }
      move(delivery.beacon.x, delivery.beacon.z);
      sky.enqueue({ type: 'deliver' }); g.ticks(1); assert.equal(sky.state().delivered[i], true);
    }
    assert.equal(sky.state().status, 'won'); assert.deepEqual(progress, [1, 2, 3, 4]);
    assert.deepEqual(commits, ['collect', 'deliver', 'collect', 'deliver', 'collect', 'deliver', 'collect', 'deliver']);
  } finally { g.host.stop(); }
});

test('Last Rain wins on the final day through harvest, conversion and dry-wind budgeting', async () => {
  const g = game();
  try {
    await g.host.apply(verdantPreset);
    const verdant = g.session().services.get(Verdant), progress: number[] = [];
    g.session().events.on(MechanicObjectiveChanged, e => { if (e.owner === 'verdant/game') progress.push(e.value); }, 'test', g.session().scope);
    const send = (command: VerdantCommand) => { assert.equal(verdant.enqueue(command), true); g.ticks(1); return verdant.state(); };
    const rejected = send({ type: 'act', action: 'restore', station: 'seedbank' });
    assert.equal(rejected.turn, 0); assert.equal(rejected.resources.charge, 0);
    const route: VerdantCommand[] = [
      { type: 'act', action: 'biomass' }, { type: 'act', action: 'convert' },
      { type: 'act', action: 'restore', station: 'seedbank' }, { type: 'act', action: 'water' },
      { type: 'act', action: 'convert' }, { type: 'act', action: 'biomass' },
      { type: 'act', action: 'restore', station: 'aquifer' }, { type: 'act', action: 'water' },
      { type: 'act', action: 'convert' }, { type: 'act', action: 'biomass' },
      { type: 'act', action: 'restore', station: 'glasshouse' },
    ];
    route.forEach((command, i) => assert.equal(send(command).turn, i + 1));
    assert.equal(verdant.state().status, 'won'); assert.equal(verdant.state().turn, 11);
    assert.deepEqual(verdant.state().restored, ['seedbank', 'aquifer', 'glasshouse']);
    assert.deepEqual(progress, [1, 2, 3]);
    send({ type: 'restart' });
    for (let i = 0; i < 11 && verdant.state().status === 'playing'; i++) send({ type: 'act', action: 'wait' });
    assert.equal(verdant.state().status, 'lost');
  } finally { g.host.stop(); }
});
