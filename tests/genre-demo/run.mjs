// Browser acceptance for the shipped genre presets. Run npm run build first, then:
// node tests/genre-demo/run.mjs (screenshots in .smoke/genre-*.png).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const cases = [
  { id: 'example/time-trial', map: 'core/arena', mode: 'example/time-trial', objective: /override/i, status: /Time left.*Overrides.*Hostiles down/s },
  { id: 'example/arena-score', map: 'core/arena', mode: 'example/arena', objective: /Eliminate.*enemies/i, status: /Score.*Kills.*Time left/s },
  { id: 'example/observatory', map: 'example/silent-observatory', mode: 'core/objective', objective: /override/i, status: /Hostiles down/ },
  { id: 'example/blackout', map: 'example/blackout-ward', mode: 'core/objective', objective: /override/i, status: /Hostiles down/ },
  { id: 'example/holdout-game', map: 'core/arena', mode: 'example/holdout', objective: /exit zone/i, status: /Hold.*Score.*Hostiles/s },
  { id: 'example/key-dungeon-game', map: 'example/key-dungeon', mode: 'example/escape', objective: /exit/i, status: /(?:)/ },
  { id: 'example/silent-relay-game', map: 'example/silent-relay', mode: 'core/objective', objective: /override/i, status: /Hostiles down/ },
  { id: 'example/gauntlet-game', map: 'core/arena', mode: 'example/roguelite', objective: /encounters/i, status: /Encounter.*Hostiles remaining.*Upgrades/s },
  { id: 'example/foundry-race', map: 'example/foundry-circuit', mode: 'example/race', objective: /checkpoint/i, status: /Checkpoints.*Time remaining/s, race: true },
  { id: 'example/salvage-game', map: 'example/salvage-run', mode: 'example/extraction', objective: /loot/i, status: /Loot carried.*Time remaining/s },
  { id: 'example/relay-tactical', map: 'example/relay-station', mode: 'core/objective', objective: /override/i, status: /Hostiles down/ },
];
const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  let current = 'startup';
  const shot = () => page.screenshot({ path: resolve(out, `genre-${current.replace('example/', '')}.png`), timeout: 60000 });
  const waitTicks = async (n) => {
    const start = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
    await page.waitForFunction(([start, n]) => window.__bulkhead.host.session.scheduler.tick >= start + n, [start, n], { timeout: 90000 });
  };
  const player = () => page.evaluate(() => {
    const s = window.__bulkhead.host.session;
    const e = s.entities.first({ id: 'sdk/player' });
    const t = s.entities.get(e, { id: 'sdk/transform' });
    const inv = s.entities.get(e, { id: 'sdk/inventory' });
    return { x: t.x, z: t.z, ammo: { ...inv.ammo }, current: inv.current };
  });
  try {
    await page.goto(`${server.url}?test`, { timeout: 60000 });
    await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 90000 });
    for (const test of cases) {
      current = test.id;
      console.log(`Testing ${test.id}`);
      await page.keyboard.press('Backquote');
      await page.waitForSelector('.creator-panel:not([hidden])');
      const picker = '.creator-panel select[data-fk="preset-picker"]';
      assert.equal(await page.locator(`${picker} option[value="${test.id}"]`).count(), 1, 'preset is shipped in the picker');
      await page.selectOption(picker, test.id);
      await page.evaluate(() => document.querySelectorAll('.creator-panel [data-result]').forEach((e) => { e.dataset.stale = '1'; }));
      await page.click('.creator-panel [data-fk="apply"]');
      const result = await page.waitForSelector('.creator-panel [data-result]:not([data-stale])', { timeout: 90000 });
      assert.match(await result.textContent(), /Applied/, 'preset applies successfully');
      const active = await page.evaluate(() => ({ id: window.__bulkhead.host.active.preset.id, mode: window.__bulkhead.host.active.preset.roles['sdk/mode'] }));
      assert.deepEqual(active, { id: test.id, mode: test.mode });
      await page.keyboard.press('Escape');
      await page.waitForSelector('.creator-panel[hidden]', { state: 'attached' });
      await page.getByRole('button', { name: /^play$/i }).click();
      await page.waitForFunction(() => window.__bulkhead.state === 'playing', null, { timeout: 90000 });
      await waitTicks(3);
      await page.waitForFunction(() => document.querySelector('.core-hud-objtext')?.textContent, null, { timeout: 90000 });
      const observed = await page.evaluate(() => {
        const b = window.__bulkhead;
        const s = b.host.session;
        return { map: s.services.get({ id: 'sdk/world' }).desc.id, objective: document.querySelector('.core-hud-objtext')?.textContent, status: document.querySelector('.core-hud-stats')?.textContent, hud: document.querySelectorAll('.core-hud').length, calls: b.renderHost.service.stats.calls };
      });
      assert.equal(observed.map, test.map);
      assert.equal(observed.hud, 1);
      assert.match(observed.objective, test.objective);
      assert.match(observed.status, test.status);
      assert.ok(observed.calls > 0, 'world has render calls');
      await shot();
      const before = await player();
      await page.keyboard.down('KeyW');
      await waitTicks(8);
      await page.keyboard.up('KeyW');
      const moved = await player();
      assert.ok(Math.hypot(moved.x - before.x, moved.z - before.z) > 0.05, 'W moves the player');
      if (!test.race) {
      await page.mouse.move(480, 270);
      await page.mouse.down();
      await waitTicks(3);
      await page.mouse.up();
      await waitTicks(2);
      const fired = await player();
      assert.ok(Object.keys(moved.ammo).some((key) => fired.ammo[key] < moved.ammo[key]), `mouse fire consumes ammo: ${JSON.stringify({ moved, fired })}`);
      }
      assert.equal(await page.evaluate(() => window.__bulkhead.state), 'playing', 'run remains in progress');
      console.log(`  PASS map=${observed.map} mode=${test.mode}; HUD, movement${test.race ? '' : ', firing'}, screenshot`);
    }
    assert.deepEqual(errors, [], 'no browser console errors, uncaught exceptions, or HTTP failures');
    console.log(`PASS no browser errors; ${cases.length} presets exercised`);
  } catch (error) {
    console.error(`FAIL ${current}:`, error.stack ?? error);
    if (errors.length) console.error(errors.join('\n'));
    await page.screenshot({ path: resolve(out, `genre-failure-${current.replace('example/', '')}.png`), timeout: 60000 }).catch(() => {});
    process.exitCode = 1;
  }
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
