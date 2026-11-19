#!/usr/bin/env node
// P3.2 parity suite: each preset in WEBGPU_PARITY_PRESETS renders the same simulation tick with WebGLRenderer and with
// WebGPURenderer (WebGPU if the browser exposes an adapter, else its WebGL2 backend, plus the forced WebGL2 backend),
// and the pixels must match within a tolerance. Also checks the per-preset gate refuses unlisted presets.
// Usage: node tests/webgpu-demo/run.mjs [preset ...]   (expects dist/ from npm run build)
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const GATE = (await import('../../packages/platform-web/src/render/webgpu-gate.ts')).WEBGPU_PARITY_PRESETS;
const presets = process.argv.slice(2).length ? process.argv.slice(2) : [...GATE];
const TICK = 90;
/** Mean absolute channel difference (0-255) and share of pixels differing by > 48 on any channel. */
const LIMITS = { mean: 4, share: 0.03 };
const out = resolve(root, '.smoke/webgpu');
mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
let failures = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok' : 'not ok'} - ${msg}`); if (!cond) failures++; };

async function capture(preset, renderer) {
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const q = `?test=&touch=0&preset=${preset}${renderer ? `&renderer=${renderer}` : ''}`;
  await page.goto(`${server.url}${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 120000 });
  await page.evaluate(() => window.__bulkhead.play());
  await page.waitForFunction(() => window.__bulkhead.state === 'playing' && window.__bulkhead.host.session?.scheduler.tick > 0, null, { timeout: 120000 });
  const tick = await page.evaluate(async (target) => {
    const dev = await window.__bulkhead.dev();
    const s = dev['sim.pause']({ paused: true });
    if (s.tick < target) dev['sim.step']({ n: target - s.tick });
    return dev['sim.state']().tick;
  }, TICK);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const backend = await page.evaluate(() => window.__bulkhead.renderHost.backend);
  const png = await page.locator('canvas').first().screenshot();
  await page.close();
  return { png, tick, backend, errors };
}

async function diff(a, b) {
  const page = await browser.newPage();
  const r = await page.evaluate(async ([x, y]) => {
    const load = async (b64) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); return img; };
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const px = (img) => { const c = new OffscreenCanvas(w, h); const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const pa = px(ia), pb = px(ib);
    let sum = 0, bad = 0;
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
      sum += (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2])) / 3;
      if (d > 48) bad++;
    }
    return { mean: sum / (w * h), share: bad / (w * h), size: [w, h], sameSize: ia.width === ib.width && ia.height === ib.height };
  }, [a.toString('base64'), b.toString('base64')]);
  await page.close();
  return r;
}

try {
  for (const preset of presets) {
    console.log(`webgpu parity: ${preset}`);
    const gl = await capture(preset, '');
    ok(gl.backend === 'webgl' && !gl.errors.length, `WebGLRenderer baseline (tick ${gl.tick}) ${gl.errors.join('; ')}`);
    writeFileSync(resolve(out, `${preset.replace('/', '_')}-webgl.png`), gl.png);
    for (const mode of ['webgpu', 'webgpu-webgl2']) {
      const gpu = await capture(preset, mode);
      writeFileSync(resolve(out, `${preset.replace('/', '_')}-${mode}.png`), gpu.png);
      ok(gpu.backend.startsWith('webgpu') && !gpu.errors.length, `?renderer=${mode} runs on ${gpu.backend} ${gpu.errors.join('; ')}`);
      ok(gpu.tick === gl.tick, `same simulation tick (${gpu.tick} vs ${gl.tick})`);
      const d = await diff(gl.png, gpu.png);
      ok(d.sameSize && d.mean <= LIMITS.mean && d.share <= LIMITS.share, `${gpu.backend} matches WebGL: mean diff ${d.mean.toFixed(3)} (≤ ${LIMITS.mean}), ${(d.share * 100).toFixed(2)}% pixels off (≤ ${LIMITS.share * 100}%)`);
    }
  }
  // The gate: a preset outside the parity list stays on WebGL unless forced.
  const page = await browser.newPage();
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto(`${server.url}?test=&preset=puzzle/stonewake&renderer=webgpu`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 120000 });
  ok((await page.evaluate(() => window.__bulkhead.renderHost.backend)) === 'webgl' && warnings.some((w) => /gated per preset/.test(w)), 'unlisted preset is refused (stays on WebGL with a warning)');
  await page.close();
} finally {
  await browser.close();
  await server.close?.();
}
console.log(failures ? `webgpu-demo: ${failures} check(s) failed` : 'webgpu-demo: all checks passed');
process.exit(failures ? 1 : 0);
