import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../src/app/catalog.ts';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import { createFlow } from '@bulkhead/platform-web/flow.ts';
import { createInputCore } from '@bulkhead/platform-web/input.ts';
import { Flow, FlowEnded, Input, PHASES, SDK_COMPAT, SDK_VERSION } from '@bulkhead/sdk';
import shooter from '../games/shooter/presets/default.json' with { type: 'json' };
import racer from '../games/racing/presets/overhead-racing.json' with { type: 'json' };
import tactics from '../games/tactics/presets/turn-tactics.json' with { type: 'json' };
import adventure from '../games/adventure/presets/narrative-adventure.json' with { type: 'json' };
import puzzle from '../games/puzzles/presets/stonewake.json' with { type: 'json' };

const shooterOnly = new Set(['core/player', 'core/world', 'core/combat', 'core/enemies', 'core/content', 'core/hud', 'core/presentation']);

test('independent experience graphs activate headlessly and cleanly switch back to the shooter', async () => {
  const input = createInputCore();
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT,
    phases: PHASES,
    installHostServices(session, scope) {
      session.services.provide(Input, input.service, 'host', scope);
      session.services.provide(Flow, createFlow((r) => session.events.emit(FlowEnded, r), () => session.scheduler.time), 'host', scope);
      session.addBeforeTick(() => input.beginTick(), scope);
      scope.add(() => input.clear(), 'input');
    },
  });
  assert.deepEqual(host.setCatalog(catalog), []);
  try {
    await host.apply(shooter);
    const baseline = host.resourceReport();
    for (const preset of [racer, tactics, adventure, puzzle]) {
      assert.equal(preset.plugins.some((id) => shooterOnly.has(id)), false, `${preset.id} has no forced shooter dependencies`);
      const old = host.session!;
      const session = await host.apply(preset);
      assert.equal(old.scope.disposed, true, 'previous session is disposed');
      assert.equal(session.state, 'running');
      assert.equal(session.entities.count({ id: 'sdk/player' }), 0, 'no hidden shooter player');
      assert.equal(session.services.tryGet({ id: 'sdk/combat' }), undefined);
      assert.equal(session.services.tryGet({ id: 'sdk/world' }), undefined);
      const resources = host.resourceReport();
      const restarted = await host.restart();
      assert.equal(session.scope.disposed, true, 'restart disposes its source session');
      assert.equal(restarted.state, 'running');
      assert.deepEqual(host.resourceReport(), resources, `${preset.id} does not duplicate registrations/systems/resources`);
    }
    await host.apply(shooter);
    assert.deepEqual(host.resourceReport(), baseline, 'returning to the shooter restores its original owned-resource graph');
  } finally {
    host.stop();
  }
  const stopped = host.resourceReport();
  assert.equal(stopped.entities, 0);
  assert.equal(stopped.systems, 0);
  assert.equal(stopped.services, 0);
  assert.equal(stopped.eventHandlers, 0);
  assert.equal(stopped.commandHandlers, 0);
});
