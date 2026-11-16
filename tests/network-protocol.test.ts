import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeMessage, encodeMessage, MAX_COUNTER, MAX_MESSAGE_BYTES, PROTOCOL_VERSION } from '../src/platform/network-protocol.ts';

const input = { version: PROTOCOL_VERSION, type: 'input', tick: 42, sequence: 9, moveX: -1, moveY: 0.5, yaw: Math.PI, fire: true, use: false };
const player = { id: 'player_1', x: -100, y: 0, z: 12, yaw: -Math.PI, health: 100 };
const snapshot = { version: PROTOCOL_VERSION, type: 'snapshot', tick: 43, acknowledgedSequence: 9, players: [player] };
const welcome = { version: PROTOCOL_VERSION, type: 'welcome', playerId: 'player_1', tick: 0 };
const decode = (value: unknown, direction: 'client' | 'server' = 'client') => decodeMessage(JSON.stringify(value), direction);

test('valid messages round trip and preserve tick, sequence and acknowledgements', () => {
  for (const [message, direction] of [[input, 'client'], [welcome, 'server'], [snapshot, 'server']] as const) {
    const encoded = encodeMessage(message, direction);
    assert.equal(encoded.ok, true);
    if (encoded.ok) assert.deepEqual(decodeMessage(encoded.value, direction), { ok: true, value: message });
  }
  assert.equal(decode({ ...input, tick: MAX_COUNTER, sequence: 0 }).ok, true);
  assert.equal(decode({ ...snapshot, acknowledgedSequence: null, players: [] }, 'server').ok, true);
  // The codec preserves counters; it intentionally does not impose arrival ordering.
  assert.equal(decode({ ...input, sequence: 8 }).ok, true);
});

test('rejects malformed input, unsupported versions, directions and unknown fields', () => {
  assert.deepEqual(decodeMessage('{', 'client'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(decodeMessage(42, 'client'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(decode(null), { ok: false, error: 'invalid-message' });
  assert.deepEqual(decode({ ...input, version: 2 }), { ok: false, error: 'version-mismatch' });
  assert.deepEqual(decode(input, 'server'), { ok: false, error: 'wrong-direction' });
  assert.deepEqual(decode(welcome, 'client'), { ok: false, error: 'wrong-direction' });
  for (const message of [{ ...input, extra: 1 }, { ...input, type: 'other' }, { ...input, fire: 1 }, { ...welcome, playerId: '../x' }]) {
    assert.equal(decode(message, message.type === 'welcome' ? 'server' : 'client').ok, false);
  }
});

test('rejects out-of-range, fractional, non-finite and missing values', () => {
  for (const patch of [
    { tick: -1 }, { tick: MAX_COUNTER + 1 }, { sequence: 0.5 }, { moveX: 1.01 },
    { moveY: -1.01 }, { yaw: Math.PI + 0.01 }, { use: null }, { tick: null },
  ]) assert.equal(decode({ ...input, ...patch }).ok, false);
  assert.equal(decodeMessage(JSON.stringify(input).replace('"tick":42', '"tick":1e400'), 'client').ok, false);
  assert.equal(encodeMessage({ ...input, tick: NaN }, 'client').ok, false);
  assert.equal(encodeMessage({ ...snapshot, acknowledgedSequence: NaN }, 'server').ok, false);
  assert.equal(encodeMessage({ ...input, use: undefined }, 'client').ok, false);
});

test('snapshot player limits, unique IDs, numeric bounds and exact shape', () => {
  for (const players of [
    [player, player], [player, { ...player, id: 'two' }, { ...player, id: 'three' }],
    [{ ...player, id: '' }], [{ ...player, id: 'a'.repeat(33) }], [{ ...player, x: 100001 }],
    [{ ...player, health: -1 }], [{ ...player, health: 10001 }], [{ ...player, extra: true }],
  ]) assert.equal(decode({ ...snapshot, players }, 'server').ok, false);
  assert.equal(decode({ ...snapshot, players: [player, { ...player, id: 'two' }] }, 'server').ok, true);
});

test('enforces the UTF-8 byte limit before parsing and handles serialization failures', () => {
  assert.deepEqual(decodeMessage(' '.repeat(MAX_MESSAGE_BYTES + 1), 'client'), { ok: false, error: 'too-large' });
  assert.deepEqual(decodeMessage('é'.repeat(MAX_MESSAGE_BYTES / 2 + 1), 'client'), { ok: false, error: 'too-large' });
  assert.deepEqual(decodeMessage(' '.repeat(MAX_MESSAGE_BYTES), 'client'), { ok: false, error: 'invalid-json' });
  const circular: { self?: unknown } = {};
  circular.self = circular;
  assert.deepEqual(encodeMessage(circular, 'client'), { ok: false, error: 'invalid-message' });
  assert.deepEqual(encodeMessage({ ...input, extra: 'x'.repeat(MAX_MESSAGE_BYTES) }, 'client'), { ok: false, error: 'too-large' });
});
