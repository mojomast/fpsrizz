// Production, input-driven acceptance for the 3D puzzle. Run after npm run build.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });
const report = { passed: [], errors: [], screenshots: [], scene: {} };
const server = await startStaticServer(resolve(root, 'dist'));
let browser, page;
const routes = [
  ['north', 'east', 'east', 'north', 'north', 'east', 'east', 'east'],
  ['north', 'east', 'east', 'north', 'north', 'east', 'east', 'east', 'east'],
  ['north', 'north', 'south', 'south', 'west', 'south', 'east', 'east', 'east', 'east', 'north', 'north', 'east', 'east', 'north', 'north', 'north', 'east'],
];
try {
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  const pass = text => { report.passed.push(text); console.log(`PASS ${text}`); };
  const snapshot = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'puzzle/push' }).state());
  const state = value => page.waitForFunction(value => window.__bulkhead?.state === value, value);
  const frames = (n = 5) => page.evaluate(n => new Promise(done => {
    const next = () => { if (--n <= 0) done(); else requestAnimationFrame(next); }; requestAnimationFrame(next);
  }), n);
  const shot = async name => { const path = resolve(out, `stonewake-${name}.png`); await page.screenshot({ path, timeout: 120000 }); report.screenshots.push(path); };
  const changed = async (action) => {
    const before = await snapshot();
    await action();
    await page.waitForFunction(revision => window.__bulkhead.host.session.services.get({ id: 'puzzle/push' }).revision > revision, before.revision);
    await frames(2);
    return snapshot();
  };
  const apply = async (id) => {
    const button = page.getByRole('button', { name: /creator tools/i });
    if (await button.isVisible()) await button.click();
    else await page.keyboard.press('Backquote');
    await page.waitForSelector('.creator-panel:not([hidden])');
    await page.locator('.creator-tab[data-tab="plugins"]').click();
    await page.selectOption('[data-fk="preset-picker"]', id);
    await page.locator('[data-fk="apply"]').click();
    await page.waitForFunction(id => window.__bulkhead.host.active.preset.id === id && window.__bulkhead.host.session?.state === 'running', id);
    await page.keyboard.press('Escape'); await state('menu'); await frames();
  };
  await page.goto(server.url);
  await state('menu');
  // Observe real scene objects/camera without exposing a new production API or mutating game state.
  await page.evaluate(() => {
    const r = window.__bulkhead.renderHost.service;
    const create = r.createRoot.bind(r), select = r.setWorldCamera.bind(r);
    r.createRoot = (ctx, layer) => { const root = create(ctx, layer); if (ctx.pluginId === 'puzzle/presentation') window.__puzzleRoot = root; return root; };
    r.setWorldCamera = (ctx, camera) => { select(ctx, camera); if (ctx.pluginId === 'puzzle/presentation') window.__puzzleCamera = camera; };
    window.__puzzlePointerRequests = 0;
    const canvas = window.__bulkhead.shell.canvas, lock = canvas.requestPointerLock.bind(canvas);
    canvas.requestPointerLock = (...args) => { window.__puzzlePointerRequests++; return lock(...args); };
  });
  await apply('puzzle/stonewake');
  await page.getByRole('button', { name: 'Play', exact: true }).click(); await state('playing'); await frames();
  const initial = await snapshot();
  report.scene = await page.evaluate(() => {
    const meshes = [], lights = [];
    window.__puzzleRoot.traverse(o => { if (o.isMesh) meshes.push(o); if (o.isLight) lights.push(o); });
    return { meshes: meshes.length, lights: lights.length, geometryKinds: [...new Set(meshes.map(m => m.geometry.type))], camera: window.__puzzleCamera.type, ...window.__bulkhead.renderHost.service.stats };
  });
  assert.ok(report.scene.meshes > 100 && report.scene.lights >= 3);
  assert.ok(report.scene.geometryKinds.includes('DodecahedronGeometry') && report.scene.geometryKinds.includes('BoxGeometry'));
  assert.ok(report.scene.triangles > 1000 && report.scene.calls > 100);
  assert.equal(await page.locator('.puzzle-ui').count(), 1);
  await frames(6); assert.deepEqual(await snapshot(), initial, 'idle render frames do not spend turns');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); await frames(5);
    assert.equal(await page.getByRole('button', { name: 'Move north', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => document.querySelector('.puzzle-ui').scrollWidth > innerWidth), false);
    await shot(`${viewport.width}x${viewport.height}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await frames();
  const beforeOrbit = await page.evaluate(() => window.__puzzleCamera.position.toArray());
  await page.getByRole('button', { name: 'Rotate camera right', exact: true }).click(); await frames(15);
  assert.notDeepEqual(await page.evaluate(() => window.__puzzleCamera.position.toArray()), beforeOrbit);
  assert.deepEqual(await snapshot(), initial);
  await shot('orbit');
  await page.keyboard.press('KeyQ'); await frames(20);
  pass('real lit 3D geometry, orbit camera, idle-state stability, desktop/tablet/phone framing');

  const north = await page.evaluate(() => {
    const s = window.__bulkhead.host.session.services.get({ id: 'puzzle/push' }).state();
    let tile;
    window.__puzzleRoot.traverse(o => { if (o.userData.cell?.x === s.player.x && o.userData.cell?.y === s.player.y - 1) tile = o; });
    const p = tile.getWorldPosition(tile.position.clone()).project(window.__puzzleCamera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  });
  const moved = await changed(() => page.mouse.click(north.x, north.y));
  assert.equal(moved.player.y, initial.player.y - 1, 'ray-picked adjacent floor moves explorer');
  await changed(() => page.keyboard.press('KeyD'));
  const weighted = await changed(() => page.keyboard.press('KeyD'));
  assert.deepEqual(weighted.rocks[0], { x: 5, y: 3 });
  assert.equal(weighted.pushes, 2);
  const undone = await changed(() => page.keyboard.press('KeyZ'));
  assert.equal(undone.turns, 2); assert.deepEqual(undone.rocks[0], { x: 4, y: 3 });
  await changed(() => page.locator('.puzzle-actions [data-command="restart"]').click());
  await page.keyboard.press('Escape'); await state('paused');
  const paused = await snapshot();
  await page.locator('[data-direction="north"]').evaluate(button => button.click()); await frames(4);
  assert.deepEqual(await snapshot(), paused);
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await state('playing');
  pass('3D ray picking, keyboard pushing, undo, restart, pause ingress guard');

  const resources = () => page.evaluate(() => {
    const b = window.__bulkhead;
    return { ...b.host.resourceReport(), ui: b.ui.mounted, roots: b.renderHost.liveRoots(), assets: b.renderHost.assets.size,
      geometries: b.renderHost.service.stats.geometries, textures: b.renderHost.service.stats.textures };
  });
  const baseline = await resources();
  for (let i = 0; i < routes.length; i++) {
    if (i === 1) {
      for (let n = 0; n < 30 && (await snapshot()).status === 'playing'; n++) await changed(() => page.locator('.puzzle-actions [data-command="wait"]').click());
      assert.equal((await snapshot()).status, 'caught');
      await shot('caught');
      await changed(() => page.locator('.puzzle-result [data-command="undo"]').click());
      assert.equal((await snapshot()).status, 'playing');
      await changed(() => page.locator('.puzzle-actions [data-command="restart"]').click());
      pass('golem pursuit reaches defeat; undo restores a playable previous turn');
    }
    await shot(`chamber-${i + 1}`);
    for (const direction of routes[i]) {
      const before = await snapshot();
      const after = await changed(() => page.locator(`[data-direction="${direction}"]`).click());
      assert.equal(after.turns, before.turns + 1, `chamber ${i + 1}: ${direction} spends one legal step`);
      assert.notEqual(after.status, 'caught');
    }
    assert.equal((await snapshot()).status, 'cleared');
    await shot(`cleared-${i + 1}`);
    assert.equal((await resources()).geometries, baseline.geometries, 'chamber transitions reuse owned geometries');
    if (i < routes.length - 1) await changed(() => page.getByRole('button', { name: 'Next chamber →', exact: true }).click());
  }
  assert.equal((await snapshot()).totalTurns + (await snapshot()).turns, 35);
  await changed(() => page.getByRole('button', { name: 'Play again', exact: true }).click());
  assert.equal((await snapshot()).chamber, 0); assert.equal((await snapshot()).totalTurns, 0);
  pass('all three authored chambers completed through UI, then full campaign replay');
  for (let i = 0; i < 2; i++) {
    await apply('core/default');
    assert.equal(await page.locator('.puzzle-ui').count(), 0);
    await apply('puzzle/stonewake');
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await state('playing'); await frames();
    assert.deepEqual(await resources(), baseline, 'switching restores exact owned resources');
  }
  assert.equal(await page.evaluate(() => window.__puzzlePointerRequests), 0);
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  assert.deepEqual(report.errors, []);
  pass('two shooter ↔ Stonewake cycles preserve ownership; no pointer lock or browser/network errors');
} catch (error) {
  report.errors.push(error.stack ?? String(error));
  try { await page?.screenshot({ path: resolve(out, 'stonewake-failure.png'), timeout: 120000 }); } catch {}
  throw error;
} finally {
  writeFileSync(resolve(out, 'stonewake-report.json'), JSON.stringify(report, null, 2));
  try { await browser?.close(); } finally { await server.close(); }
}
