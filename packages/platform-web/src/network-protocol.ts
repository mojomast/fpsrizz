/** A transport-independent JSON wire format. Counters do not wrap in version 1. */
export const PROTOCOL_VERSION = 1 as const;
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_COUNTER = 0xffffffff;
export const MAX_PLAYERS = 2;
export const MAX_COORDINATE = 100000;
export const MAX_HEALTH = 10000;

export interface ClientInput {
  version: typeof PROTOCOL_VERSION;
  type: 'input';
  tick: number;
  sequence: number;
  moveX: number;
  moveY: number;
  yaw: number;
  fire: boolean;
  use: boolean;
}

export interface ServerWelcome {
  version: typeof PROTOCOL_VERSION;
  type: 'welcome';
  playerId: string;
  tick: number;
}

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
}

export interface ServerSnapshot {
  version: typeof PROTOCOL_VERSION;
  type: 'snapshot';
  tick: number;
  /** Last processed input sequence for the recipient, or null before any input. */
  acknowledgedSequence: number | null;
  players: PlayerSnapshot[];
}

export type ClientMessage = ClientInput;
export type ServerMessage = ServerWelcome | ServerSnapshot;
export type ProtocolMessage = ClientMessage | ServerMessage;
export type ProtocolError = 'invalid-json' | 'too-large' | 'version-mismatch' | 'invalid-message' | 'wrong-direction';
export type ProtocolResult<T> = { ok: true; value: T } | { ok: false; error: ProtocolError };

type RecordValue = Record<string, unknown>;
const fail = (error: ProtocolError): ProtocolResult<never> => ({ ok: false, error });
const object = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value: RecordValue, expected: string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
};
const counter = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_COUNTER;
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
// IDs are opaque ASCII tokens, not paths, display names, or authentication credentials.
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value);
const angle = (value: unknown): value is number => bounded(value, -Math.PI, Math.PI);
const position = (value: unknown): value is number => bounded(value, -MAX_COORDINATE, MAX_COORDINATE);

function player(value: unknown): value is PlayerSnapshot {
  return object(value) && keys(value, ['id', 'x', 'y', 'z', 'yaw', 'health']) && id(value.id) &&
    position(value.x) && position(value.y) && position(value.z) && angle(value.yaw) && bounded(value.health, 0, MAX_HEALTH);
}

/** Decode untrusted UTF-8 JSON text. Size is measured in UTF-8 bytes, before parsing. */
export function decodeMessage(text: unknown, direction: 'client' | 'server'): ProtocolResult<ProtocolMessage> {
  if (typeof text !== 'string') return fail('invalid-json');
  // UTF-8 is never shorter than the number of UTF-16 code units for these purposes.
  if (text.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) return fail('too-large');
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { return fail('invalid-json'); }
  if (!object(value)) return fail('invalid-message');
  if (value.version !== PROTOCOL_VERSION) return fail('version-mismatch');
  if (value.type === 'input') {
    if (!keys(value, ['version', 'type', 'tick', 'sequence', 'moveX', 'moveY', 'yaw', 'fire', 'use']) ||
      !counter(value.tick) || !counter(value.sequence) || !bounded(value.moveX, -1, 1) || !bounded(value.moveY, -1, 1) ||
      !angle(value.yaw) || typeof value.fire !== 'boolean' || typeof value.use !== 'boolean') return fail('invalid-message');
    if (direction !== 'client') return fail('wrong-direction');
    return { ok: true, value: value as unknown as ClientInput };
  }
  if (value.type === 'welcome') {
    if (!keys(value, ['version', 'type', 'playerId', 'tick']) || !id(value.playerId) || !counter(value.tick)) return fail('invalid-message');
    if (direction !== 'server') return fail('wrong-direction');
    return { ok: true, value: value as unknown as ServerWelcome };
  }
  if (value.type === 'snapshot') {
    if (!keys(value, ['version', 'type', 'tick', 'acknowledgedSequence', 'players']) || !counter(value.tick) ||
      !(value.acknowledgedSequence === null || counter(value.acknowledgedSequence)) || !Array.isArray(value.players) ||
      value.players.length > MAX_PLAYERS || !value.players.every(player) ||
      new Set(value.players.map((p: PlayerSnapshot) => p.id)).size !== value.players.length) return fail('invalid-message');
    if (direction !== 'server') return fail('wrong-direction');
    return { ok: true, value: value as unknown as ServerSnapshot };
  }
  return fail('invalid-message');
}

/** Validate serialized output as well as input; exceptions from serialization become errors. */
export function encodeMessage(value: unknown, direction: 'client' | 'server'): ProtocolResult<string> {
  try {
    const text = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'number' && !Number.isFinite(item) ||
        typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
        throw new TypeError('Value cannot be represented in the protocol');
      }
      return item;
    });
    const result = decodeMessage(text, direction);
    return result.ok ? { ok: true, value: text! } : result;
  } catch {
    return fail('invalid-message');
  }
}
