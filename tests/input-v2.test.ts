import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInputCore } from '@bulkhead/platform-web/input.ts';
import { bindGamepads } from '@bulkhead/platform-web/gamepad.ts';
import type { GamepadLike } from '@bulkhead/platform-web/gamepad.ts';
import { createInputBindings } from '@bulkhead/platform-web/input-bindings.ts';
import { createProfileStore } from '@bulkhead/platform-web/profile-store.ts';
import type { ProfileStorage } from '@bulkhead/platform-web/profile-store.ts';
import { InputActions, InputAxes, applyDeadzone, prettyKey, readAxis, registerStandardControls } from '@bulkhead/sdk';
import type { InputActionDef, InputAxisDef } from '@bulkhead/sdk';
import type { Scope } from '@bulkhead/kernel/scope.ts';

const MOVE: InputAxisDef = { label: 'Move', x: ['l', 'r'], y: ['f', 'b'], sticks: ['gamepad:left', 'touch:left'] };
const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

function core(axes: Record<string, InputAxisDef> = { move: MOVE }) {
  const c = createInputCore();
  c.setAxes(() => Object.entries(axes));
  return c;
}

function pad(over: { buttons?: Record<number, number>; axes?: number[]; connected?: boolean } = {}): GamepadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => { const v = over.buttons?.[i] ?? 0; return { pressed: v > 0.5, value: v }; });
  return { connected: over.connected ?? true, mapping: 'standard', buttons, axes: over.axes ?? [0, 0, 0, 0] };
}

test('axes: digital composites are normalised, analog sticks use a rescaled radial deadzone, the strongest wins', () => {
  const c = core();
  c.press('f'); c.press('r'); c.beginTick();
  const v = readAxis(c.service.tick, 'move');
  assert.ok(near(v.x, Math.SQRT1_2) && near(v.y, -Math.SQRT1_2), JSON.stringify(v));
  c.release('f'); c.release('r');
  c.setAnalog('gamepad:left', 0.1, 0.05); c.beginTick();
  assert.deepEqual(readAxis(c.service.tick, 'move'), { x: 0, y: 0 }, 'inside the deadzone');
  c.setAnalog('gamepad:left', 0, 0.575); c.beginTick();
  assert.ok(near(readAxis(c.service.tick, 'move').y, 0.5), 'rescaled: (0.575 - 0.15) / 0.85 = 0.5');
  c.press('l'); c.beginTick();
  assert.deepEqual(readAxis(c.service.tick, 'move'), { x: -1, y: 0 }, 'full digital beats a half stick');
  c.release('l'); c.setAnalog('touch:left', 2, 0); c.beginTick();
  assert.ok(near(readAxis(c.service.tick, 'move').x, 1), 'clamped to length 1');
  assert.deepEqual(readAxis(c.service.tick, 'missing'), { x: 0, y: 0 });
  assert.deepEqual(readAxis({ held: () => false, pressed: () => false, released: () => false, lookX: 0, lookY: 0 }, 'move'), { x: 0, y: 0 }, 'adapters without axis()');
  assert.deepEqual(applyDeadzone(0.1, 0), { x: 0, y: 0 });
});

test('analog values are sampled per tick, like edges', () => {
  const c = core();
  c.setAnalog('gamepad:left', 1, 0);
  assert.equal(readAxis(c.service.tick, 'move').x, 0, 'not visible before beginTick');
  c.beginTick();
  assert.equal(readAxis(c.service.tick, 'move').x, 1);
  c.clear();
  assert.equal(readAxis(c.service.tick, 'move').x, 0);
});

test('gamepad: standard buttons route as virtual keys, sticks become analog sources, right stick drives look', () => {
  const c = core();
  let pads: GamepadLike[] = [pad({ buttons: { 0: 1 }, axes: [0.6, 0, 1, 0] })];
  let active = true;
  const g = bindGamepads(c, { actions: () => [{ id: 'jump', keys: ['Space', 'GamepadA'] }, { id: 'fire', keys: ['GamepadRT'] }], isCaptured: () => active, getPads: () => pads, lookPixelsPerTick: 10 });
  g.poll(); c.beginTick();
  const t = c.service.tick;
  assert.equal(t.pressed('jump'), true);
  assert.equal(t.held('jump'), true);
  assert.ok(readAxis(t, 'move').x > 0.5);
  assert.ok(near(t.lookX, 10), `look ${t.lookX}`);
  assert.equal(c.lastDevice, 'gamepad');
  g.poll(); c.beginTick();
  assert.equal(t.pressed('jump'), false, 'edge appears once');
  pads = [pad({ buttons: { 7: 0.8 } })];
  g.poll(); c.beginTick();
  assert.equal(t.released('jump'), true);
  assert.equal(t.pressed('fire'), true, 'analog trigger past the threshold presses');
  active = false;
  g.poll(); c.beginTick();
  assert.equal(t.held('fire'), false, 'losing capture releases held pad buttons');
  active = true;
  pads = [pad({ connected: false, buttons: { 0: 1 } })];
  g.poll(); c.beginTick();
  assert.equal(t.held('jump'), false, 'disconnected pads are ignored');
});

test('contexts see axes over their own bindings', () => {
  const c = core();
  const scope = { add: () => () => {} } as unknown as Scope;
  const ctxInput = c.contexts.create({ scope }, { bindings: [{ action: 'l', keys: ['KeyA'] }] });
  c.pressKey('KeyA', []); c.beginTick();
  assert.deepEqual(readAxis(ctxInput.tick, 'move'), { x: -1, y: 0 });
  assert.deepEqual(readAxis(c.service.tick, 'move'), { x: 0, y: 0 }, 'consumed by the context');
});

test('capture takes the next key without routing it; Escape, timeouts and clear() cancel', async () => {
  const c = core();
  const p = c.capture(1000);
  assert.equal(c.capturing, true);
  assert.equal(c.offerCapture('KeyK'), true);
  assert.equal(await p, 'KeyK');
  assert.equal(c.offerCapture('KeyK'), false, 'not capturing any more');
  const esc = c.capture(1000);
  c.offerCapture('Escape');
  assert.equal(await esc, undefined);
  assert.equal(await c.capture(5), undefined, 'timeout');
  const cleared = c.capture(1000);
  c.clear();
  assert.equal(await cleared, undefined);
  // Gamepad buttons are captured too (newly pressed only), and never reach gameplay.
  let pads = [pad({ buttons: { 0: 1 } })];
  const g = bindGamepads(c, { actions: () => [{ id: 'jump', keys: ['GamepadA'] }], isCaptured: () => true, getPads: () => pads });
  g.poll();
  const viaPad = c.capture(1000);
  g.poll();
  pads = [pad({ buttons: { 0: 1, 3: 1 } })];
  g.poll();
  assert.equal(await viaPad, 'GamepadY', 'A was already held, Y is the new press');
});

function memoryStorage(): ProfileStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

test('rebinding overrides registry keys, persists in its own profile store and survives a reload', async () => {
  const storage = memoryStorage();
  const registry: { id: string; value: InputActionDef }[] = [{ id: 'g/jump', value: { label: 'Jump', keys: ['Space', 'GamepadA'] } }, { id: 'g/fire', value: { label: 'Fire', keys: ['Mouse0'] } }];
  let changes = 0;
  const c = core();
  const b = createInputBindings({ core: c, store: createProfileStore(storage, 'fpsrizz/input-bindings'), actions: () => registry, onChange: () => changes++ });
  b.rebind('g/jump', ['KeyJ']);
  assert.deepEqual(b.effective().find((a) => a.id === 'g/jump')?.keys, ['KeyJ']);
  assert.deepEqual(b.list().find((r) => r.action === 'g/jump'), { action: 'g/jump', label: 'Jump', keys: ['KeyJ'], defaults: ['Space', 'GamepadA'], overridden: true });
  assert.equal(changes, 1);
  assert.ok(storage.data.has('fpsrizz/input-bindings'));
  const again = createInputBindings({ core: createInputCore(), store: createProfileStore(storage, 'fpsrizz/input-bindings'), actions: () => registry });
  assert.deepEqual(again.effective().find((a) => a.id === 'g/jump')?.keys, ['KeyJ'], 'reloaded');
  assert.throws(() => b.rebind('g/jump', ['Key J']), /invalid key/);
  b.reset('g/jump');
  assert.deepEqual(b.effective().find((a) => a.id === 'g/jump')?.keys, ['Space', 'GamepadA']);
  assert.equal(storage.data.has('fpsrizz/input-bindings'), false, 'no overrides -> store cleared');
  // capture() + rebind is what the pause menu does.
  const pending = b.capture({ timeoutMs: 1000 });
  c.offerCapture('KeyL');
  b.rebind('g/fire', [(await pending)!]);
  assert.deepEqual(b.effective().find((a) => a.id === 'g/fire')?.keys, ['KeyL']);
});

test('registerStandardControls ships a keyboard + gamepad + touch default map', () => {
  const reg = new Map<string, unknown>();
  const c = registerStandardControls({ register: (t, id, v) => { reg.set(`${(t as { kind: string }).kind}:${id}`, v); } }, 'demo');
  assert.equal(c.move, 'demo/move');
  assert.deepEqual((reg.get(`${InputActions.kind}:demo/jump`) as InputActionDef).keys, ['Space', 'GamepadA', 'TouchA']);
  assert.deepEqual((reg.get(`${InputAxes.kind}:demo/move`) as InputAxisDef).sticks, ['gamepad:left', 'touch:left']);
  assert.deepEqual([prettyKey('KeyW'), prettyKey('GamepadA'), prettyKey('TouchB'), prettyKey('Mouse0'), prettyKey('Digit3')], ['W', 'Pad A', 'Touch B', 'Left click', '3']);
});
