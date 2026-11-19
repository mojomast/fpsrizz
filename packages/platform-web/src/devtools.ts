/**
 * Dev tools core (P2.5/P2.6): one implementation of "inspect and poke the running game" shared by the creator's
 * Inspect tab, the `__bulkhead.dev` handle and the dev-only JSON-RPC bridge (method names match the protocol:
 * world.query, entity.get, entity.set, sim.pause, sim.step, sim.speed, preset.apply, config.set, log.tail, ...).
 * Everything returned is JSON-safe. Never shipped to players: main.ts loads it lazily in dev builds or on demand.
 */
import type { PluginHost } from '@bulkhead/kernel/host.ts';
import type { GamePreset } from '@bulkhead/kernel/manifest.ts';
import type { Json } from '@bulkhead/kernel/validate.ts';
import { mergeJson } from '@bulkhead/sdk';
import type { DebugDrawHost } from './debug-draw.ts';

export type SimMode = 'auto' | 'run' | 'hold';
/** Read by the app's frame loop: auto = normal (sim runs while playing), run = keep simulating with menus open, hold = frozen. */
export interface DevSim { mode: SimMode; speed: number }
export interface DevEnv {
  host: PluginHost;
  sim: DevSim;
  debugDraw?: DebugDrawHost;
  /** Debug-draw physics colliders every frame (read by the app). */
  overlays?: { colliders: boolean };
  applyPreset(preset: unknown): Promise<{ ok: true } | { ok: false; error: unknown }>;
  /** True when a snapshot would capture the whole run (all-SDK-3 presets). */
  snapshotReady(): boolean;
  /** PNG data URL of the game canvas (browser only). */
  screenshot?(): Promise<string>;
  /** Re-simulates a replay file headlessly in-page and compares the final hash. */
  runReplay?(file: unknown): Promise<Json>;
  /** Resume playing after a restage (the app's begin()). */
  resume?(): void;
  /** Synthetic key/button input routed like a real device (bindings included). */
  input?: { press(key: string, down: boolean): void };
}

export interface EntitySummary { id: number; owner: string; name?: string; components: string[] }
export interface QueryArgs { with?: string[]; without?: string[]; owner?: string; name?: string; limit?: number; offset?: number }

/** Converts live component data into bounded JSON (Maps, Sets, typed arrays, cycles, functions, NaN). */
export function jsonSafe(v: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): Json {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v as Json;
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'undefined') return null;
  if (typeof v === 'function') return '[function]';
  if (typeof v !== 'object') return String(v);
  if (seen.has(v)) return '[cycle]';
  if (depth > 8) return '[…]';
  seen.add(v);
  try {
    if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>).slice(0, 256).map((x) => jsonSafe(x, depth + 1, seen));
    if (Array.isArray(v)) return v.slice(0, 500).map((x) => jsonSafe(x, depth + 1, seen));
    if (v instanceof Map) return Object.fromEntries([...v.entries()].slice(0, 500).map(([k, x]) => [String(k), jsonSafe(x, depth + 1, seen)]));
    if (v instanceof Set) return [...v].slice(0, 500).map((x) => jsonSafe(x, depth + 1, seen));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null && !('toJSON' in (v as object))) {
      const name = (proto?.constructor?.name as string | undefined) ?? 'object';
      if (/Object3D|Mesh|Group|Texture|Material|Geometry|Element|Node/.test(name)) return `[${name}]`;
    }
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 200)) out[k] = jsonSafe(x, depth + 1, seen);
    return out;
  } finally { seen.delete(v); }
}

export class DevError extends Error {
  readonly code: number;
  constructor(message: string, code = -32000) { super(message); this.code = code; }
}

export type DevTools = ReturnType<typeof createDevTools>;

export function createDevTools(env: DevEnv) {
  const host = env.host;
  const session = () => {
    const s = host.session;
    if (!s || s.disposed) throw new DevError('no session is running');
    return s;
  };
  const nameOf = (comps: Record<string, unknown>): string | undefined => {
    const info = comps['sdk/scene-node'] as { name?: unknown } | undefined;
    return typeof info?.name === 'string' ? info.name : undefined;
  };
  const preset = (): GamePreset => {
    const p = host.active?.preset;
    if (!p) throw new DevError('no preset is active');
    return structuredClone(p);
  };
  /** Applies a preset; with keepState, re-applies the pre-restart snapshot (same preset id and plugin set only). */
  const apply = async (next: unknown, keepState: boolean): Promise<Json> => {
    const s = host.session;
    const snap = keepState && s && env.snapshotReady() ? host.snapshot() : undefined;
    const wasTick = s?.scheduler.tick ?? 0;
    const r = await env.applyPreset(next);
    if (!r.ok) throw new DevError(r.error instanceof Error ? r.error.message : String(r.error), -32602);
    let kept = false, reason: string | undefined;
    if (snap) {
      try { host.restore(snap); kept = true; } catch (e) { reason = e instanceof Error ? e.message : String(e); }
    } else if (keepState) reason = 'state is only kept for all-SDK-3 presets (snapshot not complete)';
    if (keepState) env.resume?.();
    return { ok: true, kept, tick: kept ? wasTick : 0, ...(reason ? { reason } : {}) };
  };

  const simState = (): Json => {
    const s = host.session;
    return { running: !!s && !s.disposed, preset: host.active?.preset.id ?? null, tick: s?.scheduler.tick ?? 0, time: s?.scheduler.time ?? 0, mode: env.sim.mode, speed: env.sim.speed, paused: s?.scheduler.paused ?? true, faulted: s?.scheduler.faulted ?? false };
  };

  return {
    'world.query'(a: QueryArgs = {}): Json {
      const s = session();
      const all: EntitySummary[] = [];
      for (const id of s.entities.ids()) {
        const e = s.entities.inspect(id)!;
        const comps = Object.keys(e.components);
        if (a.with && !a.with.every((c) => comps.includes(c))) continue;
        if (a.without && a.without.some((c) => comps.includes(c))) continue;
        if (a.owner && e.owner !== a.owner) continue;
        const name = nameOf(e.components);
        if (a.name && !(name ?? '').toLowerCase().includes(a.name.toLowerCase())) continue;
        all.push({ id, owner: e.owner, ...(name ? { name } : {}), components: comps.sort() });
      }
      const off = Math.max(0, a.offset ?? 0), lim = Math.min(Math.max(1, a.limit ?? 200), 5000);
      return { total: all.length, entities: all.slice(off, off + lim) as unknown as Json };
    },
    'entity.get'(a: { id: number; components?: string[] }): Json {
      const e = session().entities.inspect(a.id);
      if (!e) throw new DevError(`entity ${a.id} is not alive`, -32602);
      const comps: Record<string, Json> = {};
      for (const [k, v] of Object.entries(e.components)) if (!a.components || a.components.includes(k)) comps[k] = jsonSafe(v);
      return { id: e.id, owner: e.owner, components: comps };
    },
    /** Replaces (or with merge: deep-merges into) one component; `value: null` removes it. Marks it changed for queries. */
    'entity.set'(a: { id: number; component: string; value: Json; merge?: boolean }): Json {
      const w = session().entities;
      if (!w.isAlive(a.id)) throw new DevError(`entity ${a.id} is not alive`, -32602);
      if (typeof a.component !== 'string' || !a.component.includes('/')) throw new DevError('component must be a component id like "sdk/transform3d"', -32602);
      const token = { id: a.component };
      if (a.value === null) { w.remove(a.id, token); return { ok: true, removed: true }; }
      const cur = w.get(a.id, token);
      const next = a.merge && cur !== undefined ? mergeJson(jsonSafe(cur), a.value) : structuredClone(a.value);
      // Mutate in place when possible so systems holding a reference see the edit.
      if (cur && typeof cur === 'object' && next && typeof next === 'object' && !Array.isArray(cur) && !Array.isArray(next)) {
        for (const k of Object.keys(cur)) if (!(k in next)) delete (cur as Record<string, unknown>)[k];
        Object.assign(cur, next);
        w.markChanged(a.id, token);
      } else w.add(a.id, token, next);
      return { ok: true };
    },
    'sim.state': (): Json => simState(),
    /** paused: true holds the simulation, false lets it run even with menus/panels open, omitted toggles. */
    'sim.pause'(a: { paused?: boolean } = {}): Json {
      const hold = a.paused ?? env.sim.mode !== 'hold';
      env.sim.mode = hold ? 'hold' : 'run';
      return simState();
    },
    'sim.resume'(): Json { env.sim.mode = 'auto'; return simState(); },
    /** Runs n ticks now (default 1, max 6000) and leaves the simulation held. */
    'sim.step'(a: { n?: number } = {}): Json {
      const s = session(), n = Math.min(6000, Math.max(1, Math.floor(a.n ?? 1)));
      env.sim.mode = 'hold';
      for (let i = 0; i < n && !s.scheduler.faulted; i++) s.scheduler.runTick();
      s.scheduler.runFrame(0, 0);
      return simState();
    },
    'sim.speed'(a: { speed: number }): Json {
      if (!(typeof a.speed === 'number' && a.speed >= 0 && a.speed <= 16)) throw new DevError('speed must be between 0 and 16', -32602);
      env.sim.speed = a.speed;
      if (host.session) host.session.scheduler.timeScale = a.speed;
      return simState();
    },
    'input.press'(a: { key: string; down?: boolean }): Json {
      if (!env.input) throw new DevError('input.press is not available here');
      if (typeof a.key !== 'string' || !/^[A-Za-z0-9]{1,32}$/.test(a.key)) throw new DevError('key must be a key code like "KeyW", "Space" or "Mouse0"', -32602);
      env.input.press(a.key, a.down ?? true);
      return { ok: true };
    },
    'preset.get'(): Json { return preset() as unknown as Json; },
    async 'preset.apply'(a: { preset: unknown; keepState?: boolean }): Promise<Json> { return apply(a.preset, a.keepState ?? false); },
    /** Live tweak: changes one plugin config value and restarts with state kept when possible. */
    async 'config.set'(a: { plugin: string; key: string; value: Json; keepState?: boolean }): Promise<Json> {
      const p = preset();
      const m = host.active?.manifests.get(a.plugin);
      if (!m || !(host.session?.order ?? p.plugins).includes(a.plugin)) throw new DevError(`plugin ${a.plugin} is not active`, -32602);
      if (!(a.key in m.config)) throw new DevError(`${a.plugin} has no config field "${a.key}" (fields: ${Object.keys(m.config).join(', ') || 'none'})`, -32602);
      const c = (p.config[a.plugin] ??= {});
      if (a.value === null) delete c[a.key]; else c[a.key] = a.value;
      if (!Object.keys(c).length) delete p.config[a.plugin];
      return apply(p, a.keepState ?? true);
    },
    'config.describe'(): Json {
      const a = host.active;
      if (!a) return [];
      const active = new Set(host.session?.order ?? a.preset.plugins);
      return [...a.manifests.values()].filter((m) => active.has(m.id) && Object.keys(m.config).length).map((m) => ({
        plugin: m.id, name: m.name, fields: m.config as unknown as Json, values: (a.preset.config[m.id] ?? {}) as Json,
      }));
    },
    'log.tail'(a: { n?: number } = {}): Json {
      return host.log.slice(-Math.min(500, Math.max(1, a.n ?? 50))) as unknown as Json;
    },
    /** Per-system average milliseconds (P2.7), JSON-exportable. */
    'perf.systems'(): Json {
      const s = host.session;
      return { tick: s?.scheduler.tick ?? 0, systems: (s?.scheduler.describe() ?? []).map((d) => ({ ...d, ms: Math.round(d.ms * 1e4) / 1e4 })) };
    },
    'draw.set'(a: { enabled?: boolean; colliders?: boolean }): Json {
      if (env.debugDraw && a.enabled !== undefined) { env.debugDraw.enabled = a.enabled; if (!a.enabled) env.debugDraw.clear(); }
      if (env.overlays && a.colliders !== undefined) env.overlays.colliders = a.colliders;
      return { enabled: env.debugDraw?.enabled ?? false, colliders: env.overlays?.colliders ?? false };
    },
    async screenshot(): Promise<Json> {
      if (!env.screenshot) throw new DevError('screenshots need the browser app');
      return { dataUrl: await env.screenshot() };
    },
    async 'replay.run'(a: { file: unknown }): Promise<Json> {
      if (!env.runReplay) throw new DevError('replay.run is not available here');
      return env.runReplay(a.file);
    },
  };
}
