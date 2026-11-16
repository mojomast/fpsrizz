import test from 'node:test';
import assert from 'node:assert/strict';
import { PluginHost } from '../src/kernel/host.ts';
import { bindDomInput, createInputCore } from '../src/platform/input.ts';
import { ExperienceRole, PHASES, SDK_VERSION, Scope, SessionControl } from '../src/sdk/index.ts';

test('experience is an optional metadata-only role; session ingress service follows its host', async () => {
  let playing = false;
  const host = new PluginHost({
    sdkVersion: SDK_VERSION, phases: PHASES,
    installHostServices(session, scope) {
      session.services.provide(SessionControl, { get playing() { return playing; } }, 'host', scope);
    },
  });
  host.setCatalog([{
    manifest: { schema: 1, id: 'test/experience', name: 'Experience', version: '1.0.0', sdk: '^2.0.0', kind: 'code' },
    load: async () => ({ default: { register(ctx) {
      ctx.provideRole(ExperienceRole, 'test/free', { name: 'Board', description: 'Wait for commands', pointer: 'free', controls: [['Enter', 'Commit']] });
    } } }),
  }]);
  const preset = { schema: 1, id: 'test/board', name: 'Board', plugins: ['test/experience'], roles: { 'sdk/experience': 'test/free' } };
  await host.apply(preset);
  assert.equal(host.session!.services.get(SessionControl).playing, false);
  playing = true;
  assert.equal(host.session!.services.get(SessionControl).playing, true);
  await host.restart();
  assert.equal(host.session!.state, 'running');
  await host.apply({ ...preset, plugins: [], roles: {} });
  assert.equal(host.session!.state, 'running');
  host.stop();
});

test('higher-priority context consumes bindings before lower contexts and legacy input', () => {
  const core = createInputCore();
  const scope = new Scope('test', 'contexts');
  const lower = core.contexts.create({ scope }, { bindings: [{ action: 'drive', keys: ['Space'] }] });
  const higher = core.contexts.create({ scope }, { priority: 10, bindings: [{ action: 'confirm', keys: ['Space'] }] });
  assert.equal(core.pressKey('Space', ['fire']), true);
  core.beginTick();
  assert.equal(higher.tick.pressed('confirm'), true);
  assert.equal(lower.tick.held('drive'), false);
  assert.equal(core.service.tick.held('fire'), false);
  core.beginTick();
  assert.equal(higher.tick.pressed('confirm'), false);
  core.releaseKey('Space');
  core.beginTick();
  assert.equal(higher.tick.released('confirm'), true);
  scope.dispose();
});

test('non-consuming contexts share keys; multiple keys keep an action held until the last release', () => {
  const core = createInputCore();
  const scope = new Scope('test', 'contexts');
  const context = core.contexts.create({ scope }, { consume: false, bindings: [{ action: 'move', keys: ['KeyW', 'ArrowUp'] }] });
  core.pressKey('KeyW', ['legacy']);
  core.pressKey('ArrowUp', ['legacy']);
  core.beginTick();
  assert.equal(context.tick.held('move'), true);
  assert.equal(core.service.tick.pressed('legacy'), true);
  core.releaseKey('KeyW');
  core.beginTick();
  assert.equal(context.tick.released('move'), false);
  assert.equal(core.service.tick.held('legacy'), true);
  core.releaseKey('ArrowUp');
  core.beginTick();
  assert.equal(context.tick.released('move'), true);
  assert.equal(core.service.tick.released('legacy'), true);
  scope.dispose();
});

test('focus/context transitions cancel held state and quarantine physical keys until released', () => {
  const core = createInputCore();
  const scope = new Scope('test', 'contexts');
  core.pressKey('KeyW', ['walk']);
  core.beginTick();
  const overlay = core.contexts.create({ scope }, { exclusive: true, priority: 20, bindings: [{ action: 'choose', keys: ['KeyW'] }] });
  assert.equal(core.service.tick.held('walk'), false);
  assert.equal(core.service.tick.pressed('walk'), false);
  core.pressKey('KeyW', ['walk']);
  core.beginTick();
  assert.equal(overlay.tick.held('choose'), false);
  core.releaseKey('KeyW');
  core.pressKey('KeyW', ['walk']);
  core.beginTick();
  assert.equal(overlay.tick.pressed('choose'), true);
  overlay.setEnabled(false);
  assert.equal(overlay.tick.held('choose'), false);
  core.pressKey('KeyW', ['walk']);
  assert.equal(core.service.tick.held('walk'), false);
  core.releaseKey('KeyW');
  core.pressKey('KeyW', ['walk']);
  assert.equal(core.service.tick.held('walk'), true);
  scope.dispose();
});

test('exclusive focus blocks unmapped keys and pointer input; disposal removes ownership', () => {
  const core = createInputCore();
  const scope = new Scope('test', 'overlay');
  const overlay = core.contexts.create({ scope }, { exclusive: true, bindings: [] });
  assert.equal(scope.size(), 1);
  assert.equal(core.pressKey('Space', ['fire']), true);
  core.setPointer(120, 35, true);
  core.addLook(5, 2);
  core.beginTick();
  assert.equal(core.service.tick.held('fire'), false);
  assert.equal(core.service.tick.lookX, 0);
  assert.deepEqual(overlay.tick.pointer, { x: 120, y: 35, inside: true });
  assert.equal(overlay.tick.lookX, 5);
  scope.dispose();
  assert.equal(overlay.enabled, false);
  assert.equal(scope.size(), 0);
  overlay.setEnabled(true);
  assert.equal(overlay.enabled, false);
  core.releaseKey('Space');
  core.pressKey('Space', ['fire']);
  assert.equal(core.service.tick.held('fire'), true);
  const late = core.contexts.create({ scope }, { exclusive: true, bindings: [] });
  assert.equal(late.enabled, false);
});

test('absolute pointer is sampled per tick, persists between ticks, and clears with input', () => {
  const core = createInputCore();
  core.setPointer(10, 20, true);
  assert.equal(core.service.tick.pointer!.inside, false);
  core.beginTick();
  assert.deepEqual(core.service.tick.pointer, { x: 10, y: 20, inside: true });
  core.beginTick();
  assert.equal(core.service.tick.pointer!.x, 10);
  core.clear();
  assert.equal(core.service.tick.pointer!.inside, false);
});

test('DOM form focus and handled events do not leak; key release, rebinding and disposal remain safe', () => {
  const original = new Map(['window', 'document', 'Element'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class FakeElement extends EventTarget {
    ui = false;
    closest() { return this.ui ? this : null; }
    getBoundingClientRect() { return { left: 10, top: 20, width: 200, height: 100 }; }
  }
  const win = new EventTarget();
  const target = new FakeElement();
  const field = new FakeElement(); field.ui = true;
  const doc = Object.assign(new EventTarget(), { activeElement: null as FakeElement | null, visibilityState: 'visible', pointerLockElement: null });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  const event = (type: string, props: Record<string, unknown> = {}) => Object.assign(new Event(type, { cancelable: true }), props);
  const core = createInputCore();
  const binding = bindDomInput(core, { target: target as unknown as HTMLElement, actions: () => [{ id: 'move', keys: ['KeyW'] }], isCaptured: () => true });
  try {
    win.dispatchEvent(event('keydown', { code: 'KeyW' }));
    assert.equal(core.service.tick.held('move'), true);
    doc.activeElement = field;
    const focus = event('focusin'); Object.defineProperty(focus, 'target', { value: field });
    doc.dispatchEvent(focus);
    assert.equal(core.service.tick.held('move'), false);
    const typing = event('keydown', { code: 'KeyW' });
    win.dispatchEvent(typing);
    assert.equal(typing.defaultPrevented, false);
    assert.equal(core.service.tick.held('move'), false);
    doc.activeElement = null;
    win.dispatchEvent(event('keydown', { code: 'KeyW', repeat: true }));
    assert.equal(core.service.tick.held('move'), false);
    const handled = event('keydown', { code: 'KeyW' }); handled.preventDefault();
    win.dispatchEvent(handled);
    assert.equal(core.service.tick.held('move'), false);
    win.dispatchEvent(event('keyup', { code: 'KeyW' }));
    win.dispatchEvent(event('keydown', { code: 'KeyW' }));
    assert.equal(core.service.tick.held('move'), true);
    binding.refresh();
    assert.equal(core.service.tick.held('move'), false);
    win.dispatchEvent(event('mousemove', { clientX: 60, clientY: 45, movementX: 0, movementY: 0 }));
    core.beginTick();
    assert.deepEqual(core.service.tick.pointer, { x: 50, y: 25, inside: true });
    binding.dispose();
    win.dispatchEvent(event('keydown', { code: 'KeyW' }));
    assert.equal(core.service.tick.held('move'), false);
  } finally {
    binding.dispose();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
