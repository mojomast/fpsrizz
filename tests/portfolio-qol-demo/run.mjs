#!/usr/bin/env node
// Run against an existing dist/: node tests/portfolio-qol-demo/run.mjs [preset-id ...]
// Each selected preset runs at desktop and narrow widths. Set PORTFOLIO_SCREENSHOTS=1
// to save screenshots in .smoke/. Service access is read-only; inputs use the UI.
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const families = {
  'portfolio/atelier-puzzle': 'puzzle', 'portfolio/watch-puzzle': 'puzzle',
  'portfolio/salt-racing': 'racing', 'portfolio/copper-racing': 'racing',
  'portfolio/breach-tactics': 'tactics', 'portfolio/crossfire-tactics': 'tactics',
  'portfolio/quiet-index': 'archive', 'portfolio/night-orchard': 'orchard',
  'portfolio/sky-resource': 'sky', 'portfolio/verdant-resource': 'verdant',
  'portfolio-cards/ash': 'ash', 'portfolio-cards/cloud': 'cloud',
};
const presets = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(families);
const unknown = presets.filter(id => !families[id]);
if (unknown.length) throw new Error(`Unknown portfolio presets: ${unknown.join(', ')}`);
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error('dist/index.html is missing; provide an existing build.');
const out = resolve(root, '.smoke');
const shots = process.env.PORTFOLIO_SCREENSHOTS === '1';
if (shots) mkdirSync(out, { recursive: true });
const timeout = { timeout: 30000 };

async function state(page, id, property = false) {
  return page.evaluate(({ id, property }) => {
    const service = window.__bulkhead.host.session.services.get({ id });
    return property ? service.state : service.state();
  }, { id, property });
}

// Compare stable, gameplay-relevant starting values across a shell restart. Real-time
// racing/flight are checked by a second movement action instead of timing-sensitive positions.
async function restartBaseline(page, family) {
  if (family === 'puzzle') {
    const s = await state(page, 'puzzle/push');
    return { turns: s.turns, player: s.player };
  }
  if (family === 'tactics') return { turn: (await state(page, 'board/tactics', true)).turn };
  if (family === 'verdant') return { turn: (await state(page, 'verdant/relay')).turn };
  if (family === 'archive' || family === 'orchard') return { flags: (await state(page, 'sdk/adventure')).flags };
  if (family === 'ash' || family === 'cloud') {
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'portfolio/cards-game' }).state().hand.length === 3, null, timeout);
    return { hand: (await state(page, 'portfolio/cards-game')).hand };
  }
  return null;
}

// Verify both the control and its authoritative effect, without invoking game commands directly.
async function action(page, family) {
  if (family === 'puzzle') {
    const before = await state(page, 'puzzle/push');
    const button = page.locator('.puzzle-ui [data-direction="east"]');
    await button.click(timeout);
    await page.waitForFunction(b => {
      const s = window.__bulkhead.host.session.services.get({ id: 'puzzle/push' }).state();
      return s.turns === b.turns + 1 && s.player.x === b.player.x + 1 && s.player.y === b.player.y;
    }, before, timeout);
    return 'east button moves player and advances turn';
  }
  if (family === 'racing') {
    const before = await page.evaluate(() => {
      const s = window.__bulkhead.host.session.services.get({ id: 'vehicle/race' });
      return { x: s.x, z: s.z };
    });
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(b => {
        const s = window.__bulkhead.host.session.services.get({ id: 'vehicle/race' });
        return s.status === 'racing' && s.speed > 0.1 && Math.hypot(s.x - b.x, s.z - b.z) > 0.1;
      }, before, timeout);
    } finally { await page.keyboard.up('KeyW'); }
    return 'accelerator changes speed and position';
  }
  if (family === 'tactics') {
    const before = await state(page, 'board/tactics', true);
    await page.locator('.tactics-ui [data-action="end"]').click(timeout);
    await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'board/tactics' }).state.turn > turn, before.turn, timeout);
    return 'end-turn button advances battle';
  }
  if (family === 'sky') {
    const before = await state(page, 'sky/salvage');
    await page.keyboard.down('KeyA');
    try {
      await page.waitForFunction(x => window.__bulkhead.host.session.services.get({ id: 'sky/salvage' }).state().x < x - 0.1, before.x, timeout);
    } finally { await page.keyboard.up('KeyA'); }
    return 'left input moves drone';
  }
  if (family === 'verdant') {
    const before = await state(page, 'verdant/relay');
    await page.locator('.verdant-ui [data-action="wait"]').click(timeout);
    await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'verdant/relay' }).state().turn === turn + 1, before.turn, timeout);
    return 'wait button advances day';
  }
  if (family === 'archive' || family === 'orchard') {
    const command = family === 'archive' ? 'ask-iva' : 'consult-terminal';
    const flag = family === 'archive' ? 'trust' : 'diagnosis';
    const before = await state(page, 'sdk/adventure');
    if (before.flags.includes(flag)) throw new Error(`${flag} already set before story action`);
    await page.getByTestId(`story-action-${command}`).click(timeout);
    await page.waitForFunction(flag => window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' }).state().flags.includes(flag), flag, timeout);
    return `${command} adds ${flag}`;
  }
  const command = family === 'ash' ? 'play:ash-1' : 'survey:sun-1';
  const card = family === 'ash' ? 'ash-1' : 'sun-1';
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'portfolio/cards-game' }).state().hand.length === 3, null, timeout);
  const before = await state(page, 'portfolio/cards-game');
  if (!before.hand.includes(card)) throw new Error(`Initial card ${card} missing`);
  const button = page.locator(`.cards-hand button[data-command="${command}"]`);
  await button.focus(timeout);
  await page.keyboard.press('Enter');
  await page.waitForFunction(({ revision, card }) => {
    const s = window.__bulkhead.host.session.services.get({ id: 'portfolio/cards-game' }).state();
    return s.revision > revision && !s.hand.includes(card);
  }, { revision: before.revision, card }, timeout);
  await page.waitForFunction(() => document.querySelector('.cards-hand')?.contains(document.activeElement), null, timeout);
  return `${command} commits with keyboard focus retained`;
}

async function playing(page) {
  await page.waitForFunction(() => {
    const b = window.__bulkhead;
    return b?.state === 'playing' && b.host.session?.state === 'running' && !b.host.session.scheduler.paused && b.shell.screen === 'none';
  }, null, { timeout: 90000 });
}
async function pause(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__bulkhead?.state === 'paused' && window.__bulkhead.shell.screen === 'pause' && window.__bulkhead.host.session.scheduler.paused, null, timeout);
  const tick = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
  await page.waitForTimeout(250);
  const stopped = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
  if (tick !== stopped) throw new Error(`Scheduler advanced while paused (${tick} -> ${stopped})`);
}

const server = await startStaticServer(dist);
let browser;
let failures = 0;
try {
  browser = await launchBrowser();
  for (const preset of presets) for (const [size, viewport] of Object.entries({ desktop: { width: 1280, height: 800 }, narrow: { width: 390, height: 844 } })) {
    const errors = [];
    let context, page;
    const label = `${preset} ${size}`;
    const screenshot = resolve(out, `portfolio-qol-${preset.replace(/[^a-zA-Z0-9_-]/g, '-')}-${size}.png`);
    try {
      context = await browser.newContext({ viewport });
      page = await context.newPage();
      page.on('pageerror', error => errors.push(`page error: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
      page.on('requestfailed', request => errors.push(`request failed: ${request.url()} — ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
      const url = new URL(server.url);
      url.searchParams.set('test', '');
      url.searchParams.set('preset', preset);
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 90000 });
      const active = await page.evaluate(() => window.__bulkhead.host.active?.preset.id);
      if (active !== preset) throw new Error(`Expected preset ${preset}, got ${active}`);
      await page.getByRole('button', { name: /^play$/i }).click(timeout);
      await playing(page);
      const baseline = await restartBaseline(page, families[preset]);
      const result = await action(page, families[preset]);
      if (['puzzle', 'ash', 'cloud'].includes(families[preset])) {
        const assist = page.locator('.portfolio-assist');
        const hint = assist.locator('[role="status"]');
        if (await hint.textContent()) throw new Error('Hint appeared without a request');
        await assist.getByRole('button', { name: 'Show a hint' }).click(timeout);
        if (!(await hint.textContent())?.trim()) throw new Error('Hint request did not reveal guidance');
      }
      await pause(page);
      await page.getByRole('button', { name: /^resume$/i }).click(timeout);
      await playing(page);
      const tick = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
      await page.waitForFunction(t => window.__bulkhead.host.session.scheduler.tick > t, tick, timeout);
      await pause(page);
      await page.getByRole('button', { name: 'Restart', exact: true }).click(timeout);
      await playing(page);
      const restarted = await restartBaseline(page, families[preset]);
      if (JSON.stringify(restarted) !== JSON.stringify(baseline)) throw new Error(`Restart did not restore initial state: ${JSON.stringify(baseline)} -> ${JSON.stringify(restarted)}`);
      await action(page, families[preset]);
      // Give rendering and asynchronous asset requests time to surface immediate failures.
      await page.evaluate(() => new Promise(done => { let n = 3; const frame = () => --n ? requestAnimationFrame(frame) : done(); requestAnimationFrame(frame); }));
      if (shots) await page.screenshot({ path: screenshot, timeout: 60000 });
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`PASS ${label} — ${result}; pause/resume and restart/action`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${label} — ${error.stack ?? error}`);
      if (errors.length && !String(error.message).includes(errors.join('\n'))) console.error(errors.join('\n'));
      if (shots && page) {
        try { await page.screenshot({ path: screenshot, timeout: 10000 }); console.error(`Screenshot: ${screenshot}`); }
        catch (shotError) { console.error(`Screenshot failed: ${shotError.message}`); }
      }
    } finally { if (context) await context.close(); }
  }
} finally {
  try { if (browser) await browser.close(); } finally { await server.close(); }
}
if (failures) process.exitCode = 1;
