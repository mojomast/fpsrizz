#!/usr/bin/env node
// Perf report (P2.7): plays each preset in scripts/perf-budget.json in headless Chrome for a few seconds and records
// FPS, CPU/GPU frame time, draw calls and per-system timings into .smoke/perf-report.json.
//   node scripts/perf-report.mjs [--enforce] [preset ...]     (after npm run build)
// --enforce exits non-zero when a preset exceeds its budget (the optional CI perf job uses it).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from './smoke-lib.mjs';
import { root } from './tools.mjs';

const args = process.argv.slice(2);
const enforce = args.includes('--enforce');
const budget = JSON.parse(readFileSync(resolve(root, 'scripts/perf-budget.json'), 'utf8'));
const wanted = args.filter((a) => !a.startsWith('--'));
const presets = Object.entries(budget.presets).filter(([id]) => !wanted.length || wanted.includes(id));
const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
const report = { when: new Date().toISOString(), seconds: budget.seconds, results: [] };
let failed = 0;
try {
  for (const [id, limits] of presets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(`${server.url}?test=&perf=&preset=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^play$/i }).click({ timeout: 90000 });
      await page.waitForFunction(() => window.__bulkhead?.state === 'playing' && window.__bulkhead.host.session?.scheduler.tick > 10, null, { timeout: 90000 });
      // Warm up, then reset the scheduler's moving averages by sampling after the window.
      await page.waitForTimeout(budget.seconds * 1000);
      const r = await page.evaluate(async () => {
        const b = window.__bulkhead, s = b.stats, dev = await b.dev();
        return { fps: s.fps, cpuMs: s.frameMs, worstMs: s.worstMs, gpuMs: s.gpuMs ?? null, calls: s.calls, triangles: s.triangles, entities: b.host.session.entities.count(), systems: dev['perf.systems']().systems, gl: (() => { const gl = document.querySelector('canvas').getContext('webgl2'); const d = gl?.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() };
      });
      const slowest = [...r.systems].sort((a, b) => b.ms - a.ms)[0];
      const over = [];
      if (r.cpuMs > limits.maxCpuMs) over.push(`CPU ${r.cpuMs.toFixed(2)} ms > ${limits.maxCpuMs}`);
      if (r.worstMs > limits.maxWorstMs) over.push(`worst ${r.worstMs.toFixed(0)} ms > ${limits.maxWorstMs}`);
      if (slowest && slowest.ms > limits.maxSystemMs) over.push(`${slowest.id} ${slowest.ms.toFixed(3)} ms > ${limits.maxSystemMs}`);
      report.results.push({ preset: id, ...r, limits, over });
      console.log(`${over.length ? 'OVER' : 'ok  '} ${id}: ${r.fps.toFixed(0)} fps, CPU ${r.cpuMs.toFixed(2)} ms, GPU ${r.gpuMs === null ? 'n/a' : `${r.gpuMs.toFixed(2)} ms`}, worst ${r.worstMs.toFixed(0)} ms, ${r.calls} draws, slowest system ${slowest ? `${slowest.id} ${slowest.ms.toFixed(3)} ms` : '-'}${over.length ? ` — ${over.join('; ')}` : ''}`);
      if (over.length) failed++;
    } catch (e) {
      failed++;
      report.results.push({ preset: id, error: String(e.message ?? e) });
      console.log(`FAIL ${id}: ${e.message ?? e}`);
    } finally { await page.close(); }
  }
} finally {
  await browser.close();
  await server.close?.();
}
writeFileSync(resolve(out, 'perf-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`perf report -> .smoke/perf-report.json${enforce && failed ? ` (${failed} over budget)` : ''}`);
if (enforce && failed) process.exit(1);
