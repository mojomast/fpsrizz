#!/usr/bin/env node
// Browser input and lifecycle journey against dist/.
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
let failures = 0;
try {
  for (const [label, viewport] of Object.entries({ desktop: { width: 1280, height: 800 }, narrow: { width: 390, height: 844 } })) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    try {
      await page.goto(`${server.url}?test=&preset=silt/archive`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^play$/i }).click({ timeout: 90000 });
      await page.locator('.silt-board').waitFor({ timeout: 90000 });
      const state = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'silt/archive' }).state());
      await page.waitForFunction(() => { const s = window.__bulkhead.host.session.services.get({ id: 'silt/archive' }).state(); return s.bandages === 3 && s.airSupplies === 2; });
      const before = await state();
      await page.getByRole('button', { name: 'Show a hint', exact: true }).click();
      await page.locator('.expedition-assist [role=status]').getByText(/fragment/i).waitFor();
      if ((await state()).turn !== before.turn) throw new Error('Hint advanced the expedition');
      await page.getByRole('button', { name: 'Move north' }).click();
      await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'silt/archive' }).state().turn === turn + 1, before.turn);
      const moved = await state();
      if (moved.x !== before.x || moved.y !== before.y - 1) throw new Error('North button did not move the explorer');
      await page.locator('.silt button[data-command="extract"]').click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'silt/archive' }).state().status === 'extracted');
      await page.locator('.silt button[data-command="restart"]').click();
      await page.waitForFunction(() => { const s = window.__bulkhead.host.session.services.get({ id: 'silt/archive' }).state(); return s.status === 'playing' && s.turn === 0; });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__bulkhead.state === 'paused');
      await page.getByRole('button', { name: /^resume$/i }).click();
      await page.waitForFunction(() => window.__bulkhead.state === 'playing');
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`PASS ${label}: move, extract, restart and pause/resume`);
    } catch (error) { failures++; console.error(`FAIL ${label}: ${error.stack ?? error}`); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
if (failures) process.exitCode = 1;
