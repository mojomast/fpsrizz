// Production Hollowmere acceptance. Run `npm run build` first, then `node games/hollowmere/tests/hollowmere-demo/run.mjs`.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../../../scripts/smoke-lib.mjs';
import { root } from '../../../../scripts/tools.mjs';

const out = resolve(root, '.smoke'); mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const report = { passed: [], errors: [], screenshots: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`); });
const pass = text => { report.passed.push(text); console.log(`PASS ${text}`); };
const shot = async name => { const file = `hollowmere-${name}.png`; await page.screenshot({ path: resolve(out, file), timeout: 60000 }); report.screenshots.push(file); };
const state = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state());
const gameStatus = value => page.waitForFunction(value => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().status === value, value, { timeout: 30000 });
const frames = () => page.evaluate(() => new Promise(done => { let n = 3; const tick = () => --n ? requestAnimationFrame(tick) : done(); requestAnimationFrame(tick); }));

try {
  await page.goto(`${server.url}?test&preset=hollowmere/ascent`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 90000 });
  await page.getByRole('button', { name: /^play$/i }).click();
  await gameStatus('playing');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().stats.playTime > 1, null, { timeout: 30000 });
  await frames();
  assert.equal(await page.locator('.hollowmere-canvas').count(), 1);
  assert.equal(await page.locator('.hollowmere-ui').count(), 1);
  let s = await state();
  assert.equal(s.roomName, 'Mossgate Threshold');
  assert.equal(s.map.rooms.length, 12);
  assert.equal(s.abilities.filter(a => a.unlocked).map(a => a.id).join(','), 'saber');
  assert.ok(s.inventory.some(item => item.id === 'hollowmere/moss-tonic'));
  await shot('start');

  const x0 = s.player.x;
  await page.keyboard.down('KeyD');
  await page.waitForFunction(x => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().player.x > x + 1.5, x0, { timeout: 8000 });
  await page.keyboard.up('KeyD'); await frames();
  s = await state(); assert.ok(s.player.x > x0 + 1.5, `right movement should advance the body: ${x0} -> ${s.player.x}`);
  const y0 = s.player.y;
  await page.keyboard.down('KeyZ'); await page.waitForTimeout(40); await page.keyboard.up('KeyZ');
  await page.waitForFunction(y => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().player.y < y - .2, y0, { timeout: 5000 });
  s = await state();
  assert.ok(s.player.y < y0 - .3, `jump should lift the body: ${y0} -> ${s.player.y}`);
  pass('Assetrizz canvas, world body, movement and jump run in the production bundle');

  // Approach Brann at x=9 without touching the beacon at x=5.
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 80; i++) { await page.waitForTimeout(20); if ((await state()).player.x > 8.1) break; }
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().dialogue !== null, null, { timeout: 5000 }).catch(() => {});
  s = await state();
  if (!s.dialogue) { await page.keyboard.press('KeyE'); await page.waitForTimeout(200); s = await state(); }
  assert.ok(s.dialogue, JSON.stringify({ x: s.player.x, y: s.player.y, message: s.message }));
  assert.match(s.dialogue?.name ?? '', /Brann/);
  await frames(); await shot('dialogue');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().dialogue === null, null, { timeout: 3000 }).catch(() => {});
  if ((await state()).dialogue) { await page.keyboard.press('KeyE'); await page.waitForTimeout(150); }
  assert.equal((await state()).dialogue, null);
  pass('NPC proximity, portrait dialogue and close interaction work');

  await page.keyboard.press('Escape'); await gameStatus('paused');
  s = await state(); assert.equal(s.status, 'paused');
  assert.equal(await page.evaluate(() => window.__bulkhead.state), 'playing', 'the game-owned journal must not open the host launcher pause');
  await page.locator('.hm-pause.show').waitFor({ timeout: 10000 });
  await shot('journal-map');
  assert.equal(await page.locator('.hm-map-canvas').isVisible(), true);

  await page.keyboard.press('Digit2'); await page.waitForTimeout(120);
  assert.ok(await page.locator('.hm-item').count() >= 2);
  await page.waitForFunction(() => [...document.querySelectorAll('.hm-item img')].every(image => image.complete && image.naturalWidth > 0));
  await shot('journal-inventory');

  await page.keyboard.press('Digit3'); await page.waitForTimeout(120);
  assert.equal(await page.locator('.hm-cap').count(), 5);
  assert.ok(await page.locator('.hm-cap:not(.locked)').count() >= 1);
  await shot('journal-capabilities');

  await page.keyboard.press('Digit4'); await page.waitForTimeout(120);
  assert.ok(await page.locator('.hm-stat').count() >= 6);
  await shot('journal-stats');

  await page.keyboard.press('Digit5'); await page.waitForTimeout(120);
  assert.ok(await page.locator('.hm-option').count() >= 4);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await shot('journal-options');
  await page.keyboard.press('Escape'); await gameStatus('playing');
  pass('game-owned tabbed journal covers map, inventory, capabilities, stats and options and returns to play');

  await page.keyboard.press('KeyM'); await gameStatus('paused');
  assert.equal((await state()).status, 'paused');
  assert.match(await page.locator('.hm-tab.selected').innerText(), /MAP/);
  await page.keyboard.press('Escape'); await gameStatus('playing');
  assert.equal((await state()).status, 'playing');
  await page.setViewportSize({ width: 390, height: 844 }); await frames();
  await page.keyboard.press('KeyM'); await gameStatus('paused'); await page.waitForTimeout(180); await shot('journal-phone');
  await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  await page.setViewportSize({ width: 1280, height: 800 }); await frames();
  pass('map shortcut and phone journal layouts work');
  assert.deepEqual(report.errors, []); pass('no browser console, page or asset-network errors');
} catch (error) {
  console.error(error.stack ?? error); report.errors.push(String(error)); process.exitCode = 1;
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(resolve(out, 'hollowmere-report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}
