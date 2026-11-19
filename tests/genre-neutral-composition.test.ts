import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/app/catalog.ts';
import { PluginHost } from '@bulkhead/kernel/host.ts';
import { PHASES, SDK_COMPAT, SDK_VERSION, defineService } from '@bulkhead/sdk';
import type { SessionContext } from '@bulkhead/sdk';
import board from '../games/tactics/presets/turn-tactics.json' with { type: 'json' };
import puzzle from '../games/puzzles/presets/stonewake.json' with { type: 'json' };

test('genre namespaces do not prohibit neutral reusable plugins in board or puzzle experiences', async () => {
  const ids = ['story/shared-probe', 'adventure/shared-probe', 'board/shared-probe', 'vehicle/shared-probe'];
  const tokens = ids.map(id => defineService<{ ticks: number }>(id));
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  assert.deepEqual(host.setCatalog([...catalog, ...ids.map((id, index) => ({
    manifest: { schema: 1, id, name: 'Neutral mechanic probe', version: '1.0.0', sdk: '^2.0.0', kind: 'code' },
    load: async () => ({ default: { activate(ctx: SessionContext) {
      const state = { ticks: 0 };
      ctx.services.provide(tokens[index]!, state);
      ctx.systems.add({ id: `${id}.update`, phase: 'rules', update() { state.ticks++; } });
    } } }),
  }))]), []);
  try {
    for (const preset of [board, puzzle]) {
      await host.apply({ ...preset, plugins: [...preset.plugins, ...ids] });
      for (let i = 0; i < 5; i++) host.session!.scheduler.runTick();
      for (const token of tokens) assert.equal(host.session!.services.get(token).ticks, 5);
      await host.restart();
      for (const token of tokens) assert.equal(host.session!.services.get(token).ticks, 0);
    }
  } finally { host.stop(); }
});
