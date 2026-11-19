#!/usr/bin/env node
// Representative player-input journey against the bundled production build.
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../../../scripts/smoke-lib.mjs';
import { root } from '../../../../scripts/tools.mjs';

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
      await page.goto(`${server.url}?test=&preset=salt/ledger`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^play$/i }).click({ timeout: 90000 });
      await page.locator('.salt').waitFor({ timeout: 90000 });
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state().bag.includes('longbow'));
      await page.getByRole('button', { name: 'Show a hint', exact: true }).click();
      await page.locator('.expedition-assist [role=status]').getByText(/active objective/i).waitFor();
      await page.getByRole('button', { name: 'Show another hint', exact: true }).click();
      await page.locator('.expedition-assist [role=status]').getByText(/Destination:/).waitFor();
      await page.getByRole('button', { name: 'Invite Pell' }).click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state().party.some(p => p.id === 'pell'));
      await page.getByRole('button', { name: 'Train Iona & Pell' }).click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state().bonds.some(b => b.a === 'iona' && b.b === 'pell' && b.score === 1));
      await page.getByRole('button', { name: 'Travel: Reed Ferry' }).click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state().location === 'reed-ferry');
      await page.getByRole('button', { name: 'Invite Neri' }).click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state().party.some(p => p.id === 'neri'));
      await page.getByRole('button', { name: 'Offer to repair the ferry lanterns.' }).click();
      await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state().journal.find(q => q.id === 'ferry-lanterns').stage === 1);
      await page.getByRole('button', { name: 'Travel: Silt Shrine' }).click();
      await page.getByRole('button', { name: 'Recover oil from the shrine.' }).click();
      await page.getByRole('button', { name: 'Travel: Reed Ferry' }).click();
      await page.getByRole('button', { name: 'Light the ferry crossing.' }).click();
      await page.waitForFunction(() => { const s = window.__bulkhead.host.session.services.get({ id: 'sdk/salt-ledger' }).state(); return s.journal.find(q => q.id === 'ferry-lanterns').status === 'complete' && s.bag.includes('reed-bow'); });
      await page.getByRole('button', { name: 'Travel: Ledger Hall' }).click();
      await page.getByRole('button', { name: 'Travel: Old Quay' }).click();
      await page.getByRole('button', { name: 'Confront the collectors' }).click();
      await page.getByRole('button', { name: /Blocked obstacle/ }).waitFor();
      if (!await page.getByRole('button', { name: /Blocked obstacle/ }).isDisabled()) throw new Error('Obstacle must be blocked');
      await page.getByRole('button', { name: /Move.*cover/ }).waitFor();
      await page.getByRole('button', { name: /Move.*hazard/ }).waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__bulkhead.state === 'paused');
      await page.getByRole('button', { name: /^resume$/i }).click();
      await page.waitForFunction(() => window.__bulkhead.state === 'playing');
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`PASS ${label}: recruitment, quest reward, tactical terrain and pause/resume`);
    } catch (error) { failures++; console.error(`FAIL ${label}: ${error.stack ?? error}`); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
if (failures) process.exitCode = 1;
