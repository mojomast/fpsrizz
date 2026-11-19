/**
 * Static binary assets shipped next to the app (files under `public/`, copied to the site root by dev and build).
 *
 * Large generated art used to be inlined into JavaScript as base64 strings. It now lives in content-hashed files
 * (gzip-compressed `public/packs/<plugin>/<name>.<hash>.pack`, written by `scripts/pack-painters.mjs`) that browsers cache
 * independently of code. A plugin module awaits its pack at the top level, so `load()` resolves only once the data
 * is present and synchronous APIs such as `Painter.paint` keep working.
 *
 * In the browser the path resolves against the document (works under a sub-path such as GitHub Pages). Under Node
 * (tests and tooling that import plugin modules) it reads the same file from the repository's `public/` folder.
 */
export interface StaticAssetOptions {
  /** The file is gzip-compressed (art packs are); it is inflated with the platform DecompressionStream. */
  gunzip?: boolean;
}

export async function loadStaticAsset(path: string, options: StaticAssetOptions = {}): Promise<Uint8Array> {
  const bytes = await readStaticAsset(path);
  return options.gunzip ? gunzip(bytes) : bytes;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readStaticAsset(path: string): Promise<Uint8Array> {
  if (path.startsWith('/') || path.includes('..')) throw new Error(`Static asset paths are relative to public/: "${path}"`);
  const g = globalThis as { document?: { baseURI: string }; process?: { versions?: { node?: string } } };
  if (!g.document && g.process?.versions?.node) {
    // Not reached in browsers; the specifier is computed so bundlers leave it alone.
    const fsModule = 'node:fs/promises';
    const fs = (await import(/* @vite-ignore */ fsModule)) as { readFile(url: URL): Promise<Uint8Array> };
    return new Uint8Array(await fs.readFile(new URL(`../../../public/${path}`, import.meta.url)));
  }
  const base = g.document?.baseURI ?? (globalThis as { location?: { href: string } }).location?.href;
  const res = await fetch(base ? new URL(path, base) : path);
  if (!res.ok) throw new Error(`Static asset "${path}" failed to load: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
