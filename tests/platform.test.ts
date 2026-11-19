import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputCore } from '../src/platform/input.ts';
import { createFlow } from '../src/platform/flow.ts';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../src/platform/storage.ts';
import type { FlowResult } from '../src/sdk/contracts/game.ts';

test('input: edge appears in exactly one of three back-to-back ticks; held persists', () => {
  const c = createInputCore();
  const t = c.service.tick;
  c.press('fire');
  const seen: boolean[] = [];
  const held: boolean[] = [];
  for (let i = 0; i < 3; i++) {
    c.beginTick();
    seen.push(t.pressed('fire'));
    held.push(t.held('fire'));
  }
  assert.deepEqual(seen, [true, false, false]);
  assert.deepEqual(held, [true, true, true]);
  c.release('fire');
  const rel: boolean[] = [];
  for (let i = 0; i < 3; i++) {
    c.beginTick();
    rel.push(t.released('fire'));
  }
  assert.deepEqual(rel, [true, false, false]);
  assert.equal(t.held('fire'), false);
});

test('input: press+release between ticks is observed', () => {
  const c = createInputCore();
  c.press('jump');
  c.release('jump');
  c.beginTick();
  assert.equal(c.service.tick.pressed('jump'), true);
  assert.equal(c.service.tick.released('jump'), true);
  assert.equal(c.service.tick.held('jump'), false);
  c.beginTick();
  assert.equal(c.service.tick.pressed('jump'), false);
  assert.equal(c.service.tick.released('jump'), false);
});

test('input: auto-repeat does not create new edges', () => {
  const c = createInputCore();
  c.press('a');
  c.beginTick();
  assert.equal(c.service.tick.pressed('a'), true);
  c.press('a');
  c.press('a');
  c.beginTick();
  assert.equal(c.service.tick.pressed('a'), false);
  assert.equal(c.service.tick.held('a'), true);
});

test('input: release of a non-held action is ignored', () => {
  const c = createInputCore();
  c.release('x');
  c.beginTick();
  assert.equal(c.service.tick.released('x'), false);
});

test('input: clear wipes held state without release edges', () => {
  const c = createInputCore();
  c.press('a');
  c.beginTick();
  c.addLook(3, 4);
  c.clear();
  c.beginTick();
  assert.equal(c.service.tick.held('a'), false);
  assert.equal(c.service.tick.released('a'), false);
  assert.equal(c.service.tick.pressed('a'), false);
  assert.equal(c.service.tick.lookX, 0);
  c.press('a');
  c.clear();
  c.beginTick();
  assert.equal(c.service.tick.pressed('a'), false);
});

test('input: look delta consumed once', () => {
  const c = createInputCore();
  c.addLook(2, 3);
  c.addLook(1, -1);
  c.beginTick();
  assert.equal(c.service.tick.lookX, 3);
  assert.equal(c.service.tick.lookY, 2);
  c.beginTick();
  assert.equal(c.service.tick.lookX, 0);
  assert.equal(c.service.tick.lookY, 0);
});

const res: FlowResult = { outcome: 'victory', title: 't', detail: 'd', stats: [] };

test('flow: end takes effect once', () => {
  const ended: FlowResult[] = [];
  const f = createFlow((r) => ended.push(r), () => 5);
  assert.equal(f.ended, false);
  f.end(res);
  const rev = f.revision;
  f.end({ ...res, outcome: 'defeat' });
  assert.equal(ended.length, 1);
  assert.equal(f.result?.outcome, 'victory');
  assert.equal(f.ended, true);
  assert.equal(f.revision, rev);
});

test('flow: revision bumps on changes; notice time', () => {
  let now = 10;
  const f = createFlow(() => {}, () => now);
  const r0 = f.revision;
  f.setObjective('go');
  assert.ok(f.revision > r0);
  const r1 = f.revision;
  f.setObjective('go');
  assert.equal(f.revision, r1);
  f.setStatus('s', 'Score', '1');
  assert.ok(f.revision > r1);
  assert.equal(f.status.get('s')?.value, '1');
  const r2 = f.revision;
  now = 42;
  f.notify('hi');
  assert.ok(f.revision > r2);
  assert.equal(f.notice.at, 42);
  assert.equal(f.notice.text, 'hi');
});

test('sanitizeSettings', () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings('x'), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({ schema: 2, volume: 0.1 }), DEFAULT_SETTINGS);
  const s = sanitizeSettings({ schema: 1, sensitivity: 99, volume: -3, pixelRatioCap: 1.4 });
  assert.equal(s.sensitivity, 3);
  assert.equal(s.volume, 0);
  assert.equal(s.pixelRatioCap, 1.5);
  const t = sanitizeSettings({ schema: 1, sensitivity: 'a', volume: NaN, pixelRatioCap: 9 });
  assert.equal(t.sensitivity, 1);
  assert.equal(t.volume, 0.6);
  assert.equal(t.pixelRatioCap, 2);
  assert.deepEqual(sanitizeSettings({ schema: 1, sensitivity: 0.5, volume: 0.3, pixelRatioCap: 1 }), { schema: 1, sensitivity: 0.5, volume: 0.3, musicVolume: DEFAULT_SETTINGS.musicVolume, effectsVolume: DEFAULT_SETTINGS.effectsVolume, pixelRatioCap: 1 }, 'settings saved before the audio buses take the bus defaults');
  assert.deepEqual(sanitizeSettings({ schema: 1, sensitivity: 0.5, volume: 0.3, musicVolume: 2, effectsVolume: 0.25, pixelRatioCap: 1 }), { schema: 1, sensitivity: 0.5, volume: 0.3, musicVolume: 1, effectsVolume: 0.25, pixelRatioCap: 1 });
});
