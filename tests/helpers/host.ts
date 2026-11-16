import { PluginHost, HostError } from '../../src/kernel/host.ts';
import type { CatalogEntry, PluginModule } from '../../src/kernel/host.ts';
import type { PluginManifest } from '../../src/kernel/manifest.ts';
import { PHASES, SDK_VERSION } from '../../src/sdk/core.ts';

export { PluginHost, HostError, PHASES, SDK_VERSION };

/** Fully-populated, already-parsed manifest (for pure resolver tests). */
export function fullManifest(id: string, over: Partial<PluginManifest> = {}): PluginManifest {
  return { schema: 1, id, name: id, version: '1.0.0', kind: 'code', sdk: `^${SDK_VERSION}`, description: '', dependencies: {}, optionalDependencies: {}, conflicts: [], capabilities: [], requiresRoles: [], config: {}, ...over };
}

export function manifestMap(list: readonly PluginManifest[]): Map<string, PluginManifest> {
  return new Map(list.map((m) => [m.id, m]));
}

/** Raw manifest JSON as a plugin author would write it; `over` may add dependencies, config, kind, ... */
export function rawManifest(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { schema: 1, id, name: id, version: '1.0.0', kind: 'code', sdk: `^${SDK_VERSION}`, ...over };
}

/** In-memory code plugin. */
export function codePlugin(id: string, mod: PluginModule = {}, over: Record<string, unknown> = {}, content?: unknown): CatalogEntry {
  const e: CatalogEntry = { manifest: rawManifest(id, over), load: async () => ({ default: mod }) };
  if (content !== undefined) e.content = content;
  return e;
}

/** In-memory data pack. */
export function contentPack(id: string, content: unknown, over: Record<string, unknown> = {}): CatalogEntry {
  return { manifest: rawManifest(id, { kind: 'content', ...over }), content };
}

export function presetOf(id: string, plugins: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { schema: 1, id, name: id, plugins, ...extra };
}

export function newHost(entries: readonly CatalogEntry[]): PluginHost {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, phases: PHASES });
  const issues = host.setCatalog(entries);
  if (issues.length > 0) throw new Error(`test catalog is invalid: ${issues.map((i) => i.message).join('; ')}`);
  return host;
}

/** Awaits a promise that must reject with a HostError and returns it. */
export async function hostFailure(p: Promise<unknown>): Promise<HostError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HostError) return e;
    throw new Error(`expected a HostError, got: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  }
  throw new Error('expected the promise to reject with a HostError, but it resolved');
}

export async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise continuations and macrotasks run. */
export function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export function zeroReport(): { registrations: number; registrationScope: number; sessionScope: number; entities: number; systems: number; eventHandlers: number; commandHandlers: number; services: number } {
  return { registrations: 0, registrationScope: 0, sessionScope: 0, entities: 0, systems: 0, eventHandlers: 0, commandHandlers: 0, services: 0 };
}

/** Resource report without the per-owner breakdown. */
export function totals(host: PluginHost): ReturnType<typeof zeroReport> {
  const { byOwner: _ignored, ...rest } = host.resourceReport();
  return rest;
}
