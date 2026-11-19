import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../../../src/kernel/host.ts';
import { ExperienceRole, PHASES, Profile, SDK_VERSION, SessionControl, definePlugin } from '../../../src/sdk/index.ts';
import { Adventure, AdventureActionResolved } from '../contracts/adventure.ts';
import type { ProfileData } from '../../../src/sdk/index.ts';
import rules from '../plugins/story-adventure/manifest.json' with { type: 'json' };
import chapter from '../plugins/story-chapter/manifest.json' with { type: 'json' };
import content from '../plugins/story-chapter/content.json' with { type: 'json' };

function fixture() {
  let stored: ProfileData | null = { values: { other: 42 } };
  let playing = true;
  let broken = false;
  const host = new PluginHost({
    sdkVersion: SDK_VERSION,
    phases: PHASES,
    installHostServices(session, scope) {
      session.services.provide(SessionControl, { get playing() { return playing; } }, 'host', scope);
      session.services.provide(Profile, {
        load: () => broken ? { ok: false, reason: 'unavailable' } : { ok: true, value: stored },
        save: value => {
          if (broken) return { ok: false, reason: 'unavailable' };
          stored = value;
          return { ok: true, value: undefined };
        },
        clear: () => { stored = null; return { ok: true, value: undefined }; },
      }, 'host', scope);
    },
  });
  host.setCatalog([
    { manifest: rules, load: () => import('../plugins/story-adventure/index.ts') },
    { manifest: chapter, content },
    {
      manifest: { schema: 1, id: 'test/other-experience', name: 'Other', version: '1.0.0', kind: 'code', sdk: SDK_VERSION, description: 'Other family' },
      load: async () => ({ default: definePlugin({ register(ctx) {
        ctx.provideRole(ExperienceRole, 'test/other-experience', { name: 'Other', description: 'Other family', pointer: 'locked' });
      } }) }),
    },
  ]);
  const preset = {
    schema: 1, id: 'story/test', name: 'Test', plugins: ['story/adventure', 'story/chapter'],
    roles: { 'sdk/experience': 'story/adventure' }, options: { chapter: 'story/last-light' }, seed: 1,
  };
  const service = () => host.session!.services.get(Adventure);
  const tick = () => host.session!.scheduler.runTick();
  const action = (id: string) => {
    service().enqueue({ type: 'action', id });
    tick();
  };
  return {
    host, preset, service, tick, action,
    setPlaying: (v: boolean) => { playing = v; },
    setStored: (v: ProfileData) => { stored = v; },
    getStored: () => stored,
    setBroken: (v: boolean) => { broken = v; },
  };
}

test('complete independent lighthouse route, reject invalid actions, and preserve state while waiting', async () => {
  const f = fixture();
  await f.host.apply(f.preset);
  const start = f.service().state();
  for (let i = 0; i < 1800; i++) f.tick();
  assert.deepEqual(f.service().state(), start);
  const sounds: string[] = [];
  f.host.session!.events.on(AdventureActionResolved, event => { if (event.sound) sounds.push(event.sound); }, 'test', f.host.session!.scope);
  f.action('light-beacon');
  assert.deepEqual(f.service().state(), start);
  assert.deepEqual(sounds, []);
  f.setPlaying(false);
  assert.equal(f.service().enqueue({ type: 'action', id: 'speak-kind' }), false);
  f.tick();
  assert.deepEqual(f.service().state(), start);
  f.setPlaying(true);
  f.action('speak-kind');
  f.action('workshop-door');
  const before = f.service().state();
  f.action('polish');
  assert.deepEqual(f.service().state(), before);
  const soundsBeforePickup = sounds.length;
  f.service().enqueue({ type: 'action', id: 'take-lens' });
  f.service().enqueue({ type: 'action', id: 'take-lens' });
  f.tick();
  assert.deepEqual(f.service().state().inventory, ['key', 'lens']);
  assert.equal(sounds.length, soundsBeforePickup + 1);
  f.action('take-cloth');
  f.action('read-log');
  f.action('polish');
  assert.deepEqual(f.service().state().inventory, ['key', 'cloth', 'clear-lens']);
  f.action('stairs');
  f.action('raise-shutter');
  assert.equal(f.service().state().flags.includes('shutter'), false);
  f.action('release-catch');
  f.action('raise-shutter');
  f.action('install-lens');
  f.action('light-beacon');
  assert.equal(f.service().state().flags.includes('victory'), true);
  assert.equal(f.service().state().completed, true);
  assert.equal(f.service().state().inventory.includes('clear-lens'), false);
  await f.host.stop();
});

test('explicit save survives restart, validates content and corruption, and tolerates storage errors', async () => {
  const f = fixture();
  await f.host.apply(f.preset);
  f.action('speak-blame');
  f.action('workshop-door');
  f.action('take-lens');
  f.service().enqueue({ type: 'save' });
  f.tick();
  const saved = f.getStored()!;
  assert.equal(saved.values.other, 42);
  await f.host.restart();
  assert.equal(f.service().state().room, 'quay');
  assert.deepEqual(f.getStored(), saved);
  f.service().enqueue({ type: 'load' });
  f.tick();
  assert.equal(f.service().state().room, 'workshop');
  assert.ok(f.service().state().inventory.includes('lens'));
  const baseline = f.service().state();
  for (const raw of [
    '{',
    JSON.stringify({ schema: 1, chapter: 'other', version: 2, history: [] }),
    JSON.stringify({ schema: 1, chapter: 'story/last-light', version: 2, history: ['light-beacon'] }),
  ]) {
    f.setStored({ values: { 'story/save/story/last-light': raw } });
    f.service().enqueue({ type: 'load' });
    f.tick();
    const now = f.service().state();
    assert.equal(now.room, baseline.room);
    assert.deepEqual(now.inventory, baseline.inventory);
    assert.deepEqual(now.flags, baseline.flags);
  }
  f.setBroken(true);
  f.service().enqueue({ type: 'save' });
  f.tick();
  assert.equal(f.service().state().message, 'Save unavailable.');
  await f.host.stop();
});

test('rejects an incompatible selected experience and bounds command ingress', async () => {
  const f = fixture();
  await assert.rejects(f.host.apply({
    ...f.preset,
    plugins: [...f.preset.plugins, 'test/other-experience'],
    roles: { 'sdk/experience': 'test/other-experience' },
  }), /story\/adventure/);
  await f.host.apply(f.preset);
  for (let i = 0; i < 128; i++) assert.equal(f.service().enqueue({ type: 'action', id: 'inspect-sea' }), true);
  assert.equal(f.service().enqueue({ type: 'action', id: 'inspect-sea' }), false);
  f.tick();
  assert.equal(f.service().enqueue({ type: 'action', id: 'inspect-sea' }), true);
  await f.host.stop();
});

test('chapter staging rejects unknown fields, bad references and oversized content', async () => {
  const f = fixture();
  await f.host.apply(f.preset);
  for (const mutate of [
    (data: Record<string, unknown>) => { data.unknown = true; },
    (data: Record<string, unknown>) => { (data.actions as Record<string, unknown>[])[0]!.require = ['unproduced']; },
    (data: Record<string, unknown>) => { (data.actions as Record<string, unknown>[])[0]!.items = ['missing']; },
    (data: Record<string, unknown>) => { data.intro = 'x'.repeat(1001); },
    (data: Record<string, unknown>) => { data.rooms = Array.from({ length: 65 }, () => ({})); },
  ]) {
    const bad = structuredClone(content) as unknown as { kind: string; id: string; data: Record<string, unknown> }[];
    mutate(bad[0]!.data);
    await assert.rejects(f.host.apply(f.preset, [{ manifest: chapter, content: bad }]));
    assert.equal(f.service().state().room, 'quay');
  }
  await f.host.stop();
});
