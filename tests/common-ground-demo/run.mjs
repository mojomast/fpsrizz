#!/usr/bin/env node
// Production browser journey: node tests/common-ground-demo/run.mjs
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
      await page.goto(`${server.url}?test=&preset=common/ground`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^play$/i }).click({ timeout: 90000 });
      await page.locator('.cg h1').waitFor({ timeout: 90000 });
      const state = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state());
      // Select by semantic command data; actions are still sent through real button clicks.
      const act = async (payload) => {
        const json = JSON.stringify(payload);
        if (json.includes("'")) throw new Error(`cannot select ${json}`);
        const button = page.locator(`.cg button[data-command='${json}']`);
        if (!(await button.count())) throw new Error(`Missing UI command ${json}`);
        await button.first().click({ timeout: 30000 });
      };
      const before = await state();
      await page.getByRole('button', { name: 'Show a hint', exact: true }).click();
      if (!(await page.locator('.expedition-assist [role=status]').textContent())) throw new Error('Hint was empty');
      if ((await state()).turn !== before.turn) throw new Error('Hint advanced household time');
      await act({ type: 'act', action: 'eat' });
      await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().turn === turn + 1, before.turn);
      const meal = await state();
      if (meal.money !== before.money - 5) throw new Error('Meal cost was not committed');
      await act({ type: 'select', resident: 'sol' });
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().selected === 'sol');
      await act({ type: 'act', action: 'chat', target: 'mira' });
      await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().turn === turn + 1, meal.turn);
      await act({ type: 'pause', paused: true });
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().paused);
      if (!(await page.getByRole('button', { name: /^Wait/ }).isDisabled())) throw new Error('Wait remained enabled while household paused');
      await act({ type: 'pause', paused: false });
      await page.waitForFunction(() => !window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().paused);
      const prior = (await state()).turn;
      await page.getByRole('button', { name: 'Fast', exact: true }).click();
      await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().turn > turn, prior);
      // Turns advancing under Fast must not replace the buttons (they used to be rebuilt every turn, so clicks could
      // land on detached nodes on slow machines).
      const pauseHandle = await page.locator(`.cg button[data-key='{"type":"pause"}']`).elementHandle();
      const turnNow = (await state()).turn;
      await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().turn > turn + 1, turnNow);
      if (!(await pauseHandle.evaluate((el) => el.isConnected))) throw new Error('Pause button was re-created while time advanced');
      await act({ type: 'pause', paused: true });
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().paused);
      const pausedTurn = (await state()).turn;
      await page.waitForTimeout(500);
      if ((await state()).turn !== pausedTurn) throw new Error('Automatic time advanced while paused');
      await act({ type: 'restart' });
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().turn === 0);
      await page.getByRole('button', { name: 'Add floor · 15', exact: true }).click();
      await page.locator('button[data-plot="6,0"]').click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().house.tiles.some(t => t.x === 6 && t.y === 0));
      await page.getByRole('button', { name: 'Finish · 3', exact: true }).click();
      await page.getByRole('button', { name: 'sage', exact: true }).click();
      await page.locator('button[data-plot="6,0"]').click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().house.tiles.some(t => t.x === 6 && t.y === 0 && t.finish === 'sage'));
      await page.getByRole('button', { name: 'Move furniture', exact: true }).click();
      await page.getByRole('button', { name: 'Simple cot', exact: true }).click();
      await page.getByRole('button', { name: 'Rotate · 0°', exact: true }).click();
      await page.locator('button[data-plot="6,0"]').click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'common/hearth' }).state().house.placements.some(p => p.object === 'cot' && p.x === 6 && p.y === 0 && p.rotation === 1));
      const built = await state();
      if (built.money !== 162 || built.turn !== 0) throw new Error('Building cost or timing was wrong');
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`PASS ${label}: household actions, pause, restart, floor, finish and furniture placement`);
    } catch (error) {
      failures++; console.error(`FAIL ${label}: ${error.stack ?? error}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
if (failures) process.exitCode = 1;
