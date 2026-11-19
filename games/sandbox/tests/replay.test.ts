import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSnapshot } from '../../../src/kernel/snapshot.ts';
import { assertReplay, playReplay, recordRun } from '../../../tests/helpers/replay.ts';
import type { RunSpec } from '../../../tests/helpers/replay.ts';
import { Sandbox } from '../contracts/sandbox.ts';
import preset from '../presets/physics-sandbox.json' with { type: 'json' };

// Headless: no render-sync / presentation (they only draw). The simulation is the same.
const spec: RunSpec = { preset: { ...preset, plugins: ['std/transform', 'std/assets', 'std/physics-rapier', 'sandbox/game'] }, plugins: ['src/plugins/std-transform', 'src/plugins/std-assets', 'src/plugins/std-physics-rapier', 'games/sandbox/plugins/sandbox-game'] };

/** Walk onto the pad, jump, then barge into the crate stack. */
const script = (run: Parameters<Parameters<typeof recordRun>[1]>[0]): void => {
  run.input.pressKey('KeyD', ['sandbox/right']); run.ticks(60); run.input.releaseKey('KeyD');
  run.input.press('sandbox/forward'); run.ticks(24); run.input.press('sandbox/jump'); run.ticks(2); run.input.release('sandbox/jump');
  run.ticks(20); run.input.release('sandbox/forward');
  run.input.setAnalog('gamepad:left', -0.9, -0.6); run.ticks(70); run.input.setAnalog('gamepad:left', 0, 0); run.ticks(30);
};

test('sandbox: a recorded run replays to the same final state', async () => {
  const file = await recordRun(spec, script);
  assert.equal(file.ticks, 206);
  assert.ok(file.events.length >= 8);
  const replayed = await playReplay(spec, JSON.parse(JSON.stringify(file)), true);
  assert.equal(replayed.hash, file.hash);
  const s = replayed.run.session.services.get(Sandbox);
  assert.equal(s.padEntries, 1, 'the replay walked over the pad');
  replayed.run.stop();
});

test('sandbox: the committed walk-to-pad.replay.json still reproduces', async () => {
  await assertReplay(spec, 'games/sandbox/tests/walk-to-pad.replay.json');
});

test('sandbox: quicksave, keep playing, quickload - the run continues exactly as if never interrupted', async () => {
  const file = await recordRun(spec, script);
  // Tick 180: every recorded input has been fed and nothing is held.
  const { run } = await playReplay(spec, { ...file, ticks: 180 }, true);
  const save = JSON.parse(JSON.stringify(run.snapshot()));
  run.input.press('sandbox/jump'); run.input.press('sandbox/left'); run.ticks(40);
  assert.notEqual(run.hash(), file.hash);
  run.input.clear();
  run.host.restore(save);
  assert.equal(run.session.scheduler.tick, 180);
  run.ticks(file.ticks - 180);
  assert.equal(run.hash(), file.hash);
  assert.equal(hashSnapshot(run.snapshot()), file.hash);
  run.stop();
});
