import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node's full type declarations are not installed.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// @ts-ignore -- plain .mjs tooling module without types
import { DEFAULT_MODULES } from '../scripts/pack-painters.mjs';

function walk(dir: string): string[] {
  return (readdirSync(dir) as string[]).flatMap((n: string) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('art packs are named by their content hash and referenced by exactly one module', () => {
  const packs = walk('public/packs').filter((p) => p.endsWith('.pack'));
  assert.ok(packs.length >= (DEFAULT_MODULES as string[]).length);
  const sources = (DEFAULT_MODULES as string[]).map((m) => readFileSync(m, 'utf8') as string).join('\n');
  for (const p of packs) {
    const hash = createHash('sha256').update((readFileSync as unknown as (path: string) => Uint8Array)(p)).digest('hex').slice(0, 16);
    assert.match(p, new RegExp(`\\.${hash}\\.pack$`), `${p} hash`);
    assert.ok(sources.includes(p.slice('public/'.length)), `${p} is not referenced (stale pack?)`);
  }
});

test('packed painter modules load under Node and paint full-size images', async () => {
  const g = globalThis as Record<string, unknown>;
  g['ImageData'] ??= class { data: Uint8ClampedArray; width: number; height: number; constructor(d: Uint8ClampedArray, w: number, h: number) { this.data = d; this.width = w; this.height = h; } };
  let painted = 0;
  for (const rel of DEFAULT_MODULES as string[]) {
    const mod = (await import(`../${rel}`)) as Record<string, Record<string, { width: number; height: number; paint(ctx: unknown): void }>>;
    for (const table of Object.values(mod)) {
      for (const [key, painter] of Object.entries(table)) {
        let out: Uint8ClampedArray | undefined;
        const ctx = { putImageData: (img: { data: Uint8ClampedArray }) => { out = img.data; }, createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) };
        painter.paint(ctx);
        assert.equal(out?.length, painter.width * painter.height * 4, `${rel} ${key}`);
        assert.ok(out!.some((v) => v !== 0), `${rel} ${key} is blank`);
        painted++;
      }
    }
  }
  assert.ok(painted >= 40, `painted ${painted}`);
});

function longestBase64Run(text: string): number {
  let best = 0, run = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const b64 = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 43 || c === 47;
    run = b64 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

test('no plugin source inlines a large base64 blob (keep art in public/packs)', () => {
  const offenders = walk('packages/std/plugins').filter((p) => p.endsWith('.ts')).filter((p) => longestBase64Run(readFileSync(p, 'utf8') as string) > 100_000);
  assert.deepEqual(offenders, []);
});
