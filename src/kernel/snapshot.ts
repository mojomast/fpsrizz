/**
 * Run snapshots (SDK 3, P1.7): a plain-JSON image of a running session - tick, per-plugin RNG positions, every
 * entity with its components, and each plugin's own state from its `ctx.persist()` hook. `PluginHost.snapshot()` /
 * `restore()` produce and apply them; `hashSnapshot` gives a stable fingerprint for replay assertions.
 */
import type { EntityId } from './ecs.ts';
import type { Json } from './validate.ts';

export const SNAPSHOT_FORMAT = 'fpsrizz-snapshot';
export const SNAPSHOT_SCHEMA = 1;

export interface SnapshotEntity { id: EntityId; owner: string; components: Record<string, unknown> }
export interface RunSnapshot {
  format: typeof SNAPSHOT_FORMAT;
  schema: number;
  /** SDK version of the host that wrote it. */
  sdk: string;
  preset: { id: string; seed: number };
  /** Active plugins and their versions (restore requires the same set; versions feed plugin migrations). */
  plugins: Record<string, string>;
  tick: number;
  nextEntityId: EntityId;
  /** Gameplay RNG stream position per plugin. */
  rng: Record<string, number>;
  entities: SnapshotEntity[];
  /** Plugin-owned state from ctx.persist() hooks. */
  state: Record<string, Json>;
}

/** Plugin state hook. `load` runs after entities, tick and RNG are restored, in activation order. */
export interface PersistHook {
  save(): Json;
  /** `fromVersion` is the plugin version that wrote the data (migrate when it differs from yours). */
  load(state: Json, fromVersion: string): void;
}

/** Snapshot schema migrations: index n upgrades schema n to n + 1. */
const MIGRATIONS: ((s: Record<string, unknown>) => Record<string, unknown>)[] = [];

/** Validates the envelope and upgrades older schemas. Throws with an actionable message. */
export function migrateSnapshot(raw: unknown): RunSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error('not a snapshot (expected an object)');
  let s = raw as Record<string, unknown>;
  if (s.format !== SNAPSHOT_FORMAT) throw new Error(`not a snapshot (format "${String(s.format)}")`);
  if (typeof s.schema !== 'number' || s.schema < 1) throw new Error('snapshot has no schema version');
  if (s.schema > SNAPSHOT_SCHEMA) throw new Error(`snapshot schema ${s.schema} is newer than this build (${SNAPSHOT_SCHEMA})`);
  while ((s.schema as number) < SNAPSHOT_SCHEMA) s = { ...MIGRATIONS[(s.schema as number) - 1]!(s), schema: (s.schema as number) + 1 };
  for (const k of ['preset', 'plugins', 'rng', 'state'] as const) if (!s[k] || typeof s[k] !== 'object') throw new Error(`snapshot is missing "${k}"`);
  if (!Array.isArray(s.entities)) throw new Error('snapshot is missing "entities"');
  if (typeof s.tick !== 'number' || typeof s.nextEntityId !== 'number') throw new Error('snapshot is missing "tick" / "nextEntityId"');
  return s as unknown as RunSnapshot;
}

/** JSON with sorted object keys (stable across engines and insertion order). */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? 'null' : JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (ArrayBuffer.isView(v)) return stableStringify(Array.from(v as unknown as ArrayLike<number>));
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit hex hash of a string. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Fingerprint of the simulation state: tick + entities (+ RNG positions). Plugin `state` is excluded by default
 * because it may hold engine blobs (Rapier snapshots) whose bytes are not part of the observable game state.
 */
export function hashSnapshot(s: RunSnapshot, opts: { includeState?: boolean } = {}): string {
  return fnv1a(stableStringify({ tick: s.tick, rng: s.rng, entities: s.entities, ...(opts.includeState ? { state: s.state } : {}) }));
}

/** Base64 helpers for binary engine state inside JSON snapshots (browser and Node). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
