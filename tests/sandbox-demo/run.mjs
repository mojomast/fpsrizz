#!/usr/bin/env node
// Production browser journey for the SDK 3 physics sandbox: node tests/sandbox-demo/run.mjs (after npm run build).
// Proves the Rapier WASM chunk loads lazily, render sync draws the scene, the glTF level and display model load
// (Meshopt-compressed, through std/assets), and keyboard input walks the character.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
let failures = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /failed to load|no sdk\/models/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  try {
    await page.goto(`${server.url}?test=&preset=sandbox/physics`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^play$/i }).click({ timeout: 90000 });
    await page.waitForFunction(() => window.__bulkhead?.host?.session?.services.tryGet({ id: 'sandbox/state' }), null, { timeout: 90000 });
    const hero = () => page.evaluate(() => {
      const s = window.__bulkhead.host.session; const st = s.services.get({ id: 'sandbox/state' });
      const t = s.entities.get(st.hero, { id: 'sdk/transform3d' }); return { x: t.position.x, z: t.position.z, entries: st.padEntries };
    });
    const before = await hero();
    await page.keyboard.down('KeyD'); await page.waitForTimeout(1000); await page.keyboard.up('KeyD');
    await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);
    const after = await hero();
    if (!(after.x > before.x + 2)) throw new Error(`hero did not walk right: ${JSON.stringify({ before, after })}`);
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/assets' }).progress.pending.length === 0, null, { timeout: 30000 });
    const scene = await page.evaluate(() => {
      const s = window.__bulkhead.host.session; const p = s.services.get({ id: 'sdk/assets' }).progress;
      return { physics: s.services.get({ id: 'sdk/physics' }).stats(), engine: s.services.get({ id: 'sdk/physics' }).engine, assets: { total: p.total, loaded: p.loaded, failed: p.failed }, goal: s.services.get({ id: 'sandbox/state' }).goal !== undefined };
    });
    // 17 hand-built bodies + pedestal + 6 from the glTF level (ramp, 3 barrels, lamp, goal trigger).
    if (scene.physics.bodies < 24 || !scene.goal) throw new Error(`expected the sandbox and glTF level bodies, got ${JSON.stringify(scene)}`);
    if (scene.assets.loaded < 2 || scene.assets.failed) throw new Error(`expected the level and display model to load, got ${JSON.stringify(scene.assets)}`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, 'sandbox-physics.png') });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`PASS sandbox: ${scene.engine}, ${scene.physics.bodies} bodies, hero walked ${(after.x - before.x).toFixed(1)} m, pad entries ${after.entries}, ${scene.assets.loaded} assets loaded`);
  } catch (error) {
    failures++; console.error(`FAIL sandbox: ${error.stack ?? error}`);
  } finally { await page.close(); }
} finally { await browser.close(); await server.close(); }
if (failures) process.exitCode = 1;
