/**
 * Host implementation of the SDK 3 asset service (packages/sdk/src/contracts/assets.ts). Bytes come from `loadStaticAsset`
 * (fetch in browsers, the repository's public/ folder under Node); entries are reference-counted per owner scope with
 * the kernel AssetStore.
 */
import { AssetStore } from '@bulkhead/kernel/assets.ts';
import type { SessionContext } from '@bulkhead/kernel/host.ts';
import { loadStaticAsset } from '@bulkhead/sdk/static-asset.ts';
import type { AssetProgress, AssetService } from '@bulkhead/sdk/contracts/assets.ts';

interface Entry { promise: Promise<Uint8Array>; bytes?: Uint8Array; json?: { value: unknown } }

export interface AssetServiceOptions {
  /** Replaces the loader (tests, alternative CDNs). */
  load?: (path: string) => Promise<Uint8Array>;
}

export function createAssetService(options: AssetServiceOptions = {}): AssetService {
  const load = options.load ?? ((p: string) => loadStaticAsset(p));
  const store = new AssetStore();
  const live = new Map<string, Entry>();
  const seen = new Set<string>();
  const done = new Set<string>();
  const failed = new Set<string>();
  const pending = new Set<string>();
  /** Bumped when a load fails, so the next request starts a fresh store entry instead of the rejected one. */
  const generation = new Map<string, number>();

  const entry = (ctx: SessionContext, path: string): Entry => {
    if (typeof path !== 'string' || path.startsWith('/') || path.includes('..') || /^[a-z]+:/i.test(path)) throw new Error(`Asset paths are relative to the site root: "${path}"`);
    const gen = generation.get(path) ?? 0;
    return store.acquire(ctx.scope, gen ? `${path}#retry${gen}` : path, () => {
      seen.add(path);
      pending.add(path);
      const e: Entry = { promise: undefined as unknown as Promise<Uint8Array> };
      e.promise = load(path).then((b) => {
        e.bytes = b;
        done.add(path);
        failed.delete(path);
        return b;
      }, (err: unknown) => {
        failed.add(path);
        // A failed entry must not poison later attempts.
        if (live.get(path) === e) live.delete(path);
        generation.set(path, gen + 1);
        throw err instanceof Error ? err : new Error(String(err));
      }).finally(() => pending.delete(path));
      live.set(path, e);
      return e;
    }, (e) => { if (live.get(path) === e) live.delete(path); });
  };
  const decoder = new TextDecoder();

  const progress: AssetProgress = {
    get total() { return seen.size; },
    get loaded() { return done.size; },
    get failed() { return failed.size; },
    get pending() { return [...pending]; },
  };

  return {
    bytes: async (ctx, path) => ctx.guard(entry(ctx, path).promise),
    text: async (ctx, path) => decoder.decode(await ctx.guard(entry(ctx, path).promise)),
    async json<T>(ctx: SessionContext, path: string): Promise<T> {
      const e = entry(ctx, path);
      const b = await ctx.guard(e.promise);
      e.json ??= { value: JSON.parse(decoder.decode(b)) as unknown };
      return e.json.value as T;
    },
    peek: (path) => live.get(path)?.bytes,
    async preload(ctx, paths, onProgress) {
      let n = 0;
      onProgress?.(0, paths.length);
      await Promise.all(paths.map((p) => ctx.guard(entry(ctx, p).promise).then(() => onProgress?.(++n, paths.length))));
    },
    progress,
    report: () => store.report().map((r) => ({ path: r.key.replace(/#retry\d+$/, ''), refs: r.refs, owners: r.owners })),
  };
}

/** Host `beforeActivate` hook: awaits a plugin's `manifest.preload` list through the asset service. */
export function preloadManifestAssets(assets: AssetService): (ctx: SessionContext) => Promise<void> {
  return async (ctx) => {
    const list = ctx.manifest.preload;
    if (!list || list.length === 0) return;
    try {
      await assets.preload(ctx, list);
    } catch (e) {
      throw new Error(`preload failed for ${ctx.pluginId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
