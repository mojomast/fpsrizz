#!/usr/bin/env node
// Production browser journey for the P2.5 inspector: node tests/inspector-demo/run.mjs (after npm run build).
// Opens creator tools > Inspect on the SDK 3 physics sandbox and checks the lazy chunk loads, time controls hold and
// step the simulation, the entity list filters, a component edit lands in the live world, debug draw / colliders
// draw an overlay, a config tweak keeps the run state, and the dev-tools handle screenshots the view.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; console.log(`  ok - ${m}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const panel = '.creator-panel';
  const tick = () => ev(() => window.__bulkhead.host.session.scheduler.tick);

  await page.goto(`${server.url}?test=&preset=sandbox/physics`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^play$/i }).click({ timeout: 90000 });
  await page.waitForFunction(() => window.__bulkhead?.host?.session?.services.tryGet({ id: 'sandbox/state' }), null, { timeout: 90000 });
  await page.waitForFunction(() => window.__bulkhead.host.session.scheduler.tick > 30, null, { timeout: 30000 });

  await page.keyboard.press('Backquote');
  await page.click(`${panel} .creator-tab[data-tab="inspect"]`);
  await page.waitForSelector(`${panel} [data-inspector]`, { timeout: 20000 });
  ok(true, 'Inspect tab loads its chunk');

  await page.click(`${panel} [data-act="hold"]`);
  const t0 = await tick();
  await page.waitForTimeout(300);
  ok((await tick()) === t0, 'Hold freezes the simulation');
  await page.click(`${panel} [data-act="step"]`);
  ok((await tick()) === t0 + 1, 'Step 1 runs exactly one tick');

  const hero = await ev(() => window.__bulkhead.host.session.services.get({ id: 'sandbox/state' }).hero);
  await page.fill(`${panel} input[data-fk="insp-filter"]`, 'character');
  await page.waitForTimeout(400);
  const rows = await ev(() => [...document.querySelectorAll('.creator-panel tr[data-entity]')].map((r) => Number(r.dataset.entity)));
  ok(rows.includes(hero), `filter finds the hero (${rows.length} rows)`);
  await page.click(`${panel} tr[data-entity="${hero}"]`);
  const ta = `${panel} textarea[data-component="sdk/transform3d"]`;
  await page.waitForSelector(ta);
  const cur = JSON.parse(await page.inputValue(ta));
  cur.position.y += 3;
  await page.fill(ta, JSON.stringify(cur));
  await page.click(`${panel} [data-apply="sdk/transform3d"]`);
  const y = await ev((id) => window.__bulkhead.host.session.entities.get(id, { id: 'sdk/transform3d' }).position.y, hero);
  ok(Math.abs(y - cur.position.y) < 1e-6, 'component edit lands in the live world');

  await page.check(`${panel} input[data-fk="insp-enabled"]`);
  await page.check(`${panel} input[data-fk="insp-colliders"]`);
  await page.click(`${panel} [data-act="step"]`);
  await page.waitForTimeout(200);
  const drawn = await ev(() => { const c = document.querySelector('canvas.debug-draw-overlay'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok(drawn > 100, `collider overlay draws (${drawn} px)`);
  await page.screenshot({ path: resolve(out, 'inspector.png') });

  const dev = async (method, params = {}) => ev(async ([m, p]) => (await window.__bulkhead.dev())[m](p), [method, params]);
  const shot = await dev('screenshot');
  ok(/^data:image\/png;base64,/.test(shot.dataUrl) && shot.dataUrl.length > 5000, 'screenshot returns a PNG');
  const q = await dev('world.query', { with: ['sdk/rigid-body'] });
  ok(q.total > 0, `world.query finds ${q.total} bodies`);
  const before = await tick();
  const cfg = await dev('config.describe');
  if (cfg.length) {
    const p = cfg[0], [key, f] = Object.entries(p.fields)[0];
    const value = f.type === 'number' ? Math.min(f.max ?? 100, (p.values[key] ?? f.default) + 1) : f.type === 'boolean' ? !(p.values[key] ?? f.default) : (p.values[key] ?? f.default);
    const r = await dev('config.set', { plugin: p.plugin, key, value });
    ok(r.kept && (await tick()) === before, `config tweak ${p.plugin}.${key} restarts with state kept`);
  } else console.log('  (no config fields in this preset; tweak path covered by tests/devtools.test.ts)');
  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log(`inspector-demo: ${passed} checks passed`);
} finally {
  await browser.close();
  await server.close?.();
}
