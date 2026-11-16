// Production game-composition canvas acceptance. Run `npm run build` first.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const out = resolve(root, '.smoke'); mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const report = { passed: [], errors: [], screenshots: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`); });
const pass = text => { report.passed.push(text); console.log(`PASS ${text}`); };
const shot = async name => { const file = `composer-${name}.png`; await page.screenshot({ path: resolve(out, file), timeout: 60000 }); report.screenshots.push(file); };
const wait = ms => page.waitForTimeout(ms);
try {
  await page.goto(`${server.url}?test&preset=hollowmere/ascent`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 90000 });
  await page.getByRole('button', { name: /^play$/i }).click();
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'hollowmere/run' }).state().status === 'playing', null, { timeout: 90000 });
  await page.keyboard.press('Backquote'); await wait(250);
  await page.getByRole('tab', { name: 'Canvas' }).click();
  await page.getByRole('button', { name: /Open composition canvas/i }).click();
  await page.waitForFunction(() => document.querySelector('.game-composer')?.classList.contains('open'), null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('.gc-node.plugin').length > 4, null, { timeout: 30000 });
  assert.equal(await page.locator('.gc-node.plugin').count(), 8);
  assert.equal(await page.locator('.gc-node.role').count(), 7);
  assert.equal(await page.locator('.gc-palette-item').count() > 20, true);
  assert.match(await page.locator('.gc-head select').inputValue(), /hollowmere\/ascent/);
  assert.match(await page.locator('.gc-inspector').innerText(), /No validation issues/);
  await shot('canvas');

  await page.locator('.gc-node.role').filter({ hasText: 'sdk/experience' }).click();
  await wait(100);
  assert.match(await page.locator('.gc-inspector').innerText(), /sdk\/experience/);
  assert.equal(await page.locator('.gc-role select').count() > 0, true);
  await shot('role-inspector');

  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await page.waitForFunction(() => /Staged|valid/i.test(document.querySelector('.gc-issue')?.textContent ?? ''), null, { timeout: 90000 });
  assert.match(await page.locator('.gc-issue').last().innerText(), /Staged|valid/i);
  pass('canvas loads the active graph, role metadata and live host staging');

  await page.keyboard.press('Escape'); await wait(150);
  assert.equal(await page.evaluate(() => document.querySelector('.game-composer')?.classList.contains('open')), false);
  assert.equal(await page.evaluate(() => window.__bulkhead.state), 'paused', 'composer closes back to the creator/pause flow');
  pass('composer opens from Creator, exposes role inspector and closes with Escape');
  assert.deepEqual(report.errors, []); pass('no browser console, page or asset-network errors');
} catch (error) {
  console.error(error.stack ?? error); report.errors.push(String(error)); process.exitCode = 1;
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(resolve(out, 'composer-report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}
