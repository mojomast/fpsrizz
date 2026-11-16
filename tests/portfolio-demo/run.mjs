#!/usr/bin/env node
// Run `npm run build` first, then `node tests/portfolio-demo/run.mjs preset/id ...`.
// Named portfolio presets also exercise one family-specific action; other IDs get generic acceptance.
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const presets = process.argv.slice(2);
if (!presets.length || presets.some(id => !id.trim())) {
  console.error('Usage: node tests/portfolio-demo/run.mjs <preset-id> [preset-id ...]');
  process.exit(1);
}
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}
const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });

const families = {
  'portfolio/atelier-puzzle': 'puzzle', 'portfolio/watch-puzzle': 'puzzle',
  'portfolio/salt-racing': 'racing', 'portfolio/copper-racing': 'racing',
  'portfolio/breach-tactics': 'tactics', 'portfolio/crossfire-tactics': 'tactics',
  'portfolio/sky-resource': 'sky', 'portfolio/verdant-resource': 'verdant',
  'portfolio/quiet-index': 'archive', 'portfolio/night-orchard': 'orchard',
  'portfolio-cards/ash': 'ash-cards', 'portfolio-cards/cloud': 'cloud-cards',
};

// Read authoritative services only; all actions enter through the same controls a player uses.
async function checkAction(page, family) {
  const snapshot = (id, property = false) => page.evaluate(({ id, property }) => {
    const service = window.__bulkhead.host.session.services.get({ id });
    return property ? service.state : service.state();
  }, { id, property });
  const timeout = { timeout: 30000 };
  if (family === 'puzzle') {
    const before = await snapshot('puzzle/push');
    await page.locator('.puzzle-ui [data-direction="east"]').click();
    await page.waitForFunction(before => {
      const s = window.__bulkhead.host.session.services.get({ id: 'puzzle/push' }).state();
      return s.turns === before.turns + 1 && s.player.x === before.player.x + 1 && s.player.y === before.player.y;
    }, before, timeout);
    return 'puzzle: east move advances player and turn';
  }
  if (family === 'racing') {
    const before = await page.evaluate(() => {
      const s = window.__bulkhead.host.session.services.get({ id: 'vehicle/race' });
      return { x: s.x, z: s.z };
    });
    await page.keyboard.down('KeyW');
    try {
      await page.waitForFunction(before => {
        const s = window.__bulkhead.host.session.services.get({ id: 'vehicle/race' });
        return s.status === 'racing' && s.speed > 0.1 && Math.hypot(s.x - before.x, s.z - before.z) > 0.1;
      }, before, timeout);
    } finally { await page.keyboard.up('KeyW'); }
    return 'racing: acceleration changes speed and position';
  }
  if (family === 'tactics') {
    const before = await snapshot('board/tactics', true);
    await page.locator('.tactics-ui [data-action="end"]').click();
    await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'board/tactics' }).state.turn > turn, before.turn, timeout);
    return 'tactics: end turn advances the battle turn';
  }
  if (family === 'sky') {
    const before = await snapshot('sky/salvage');
    await page.keyboard.down('KeyA');
    try {
      await page.waitForFunction(x => window.__bulkhead.host.session.services.get({ id: 'sky/salvage' }).state().x < x - 0.1, before.x, timeout);
    } finally { await page.keyboard.up('KeyA'); }
    return 'sky: left input moves the drone';
  }
  if (family === 'verdant') {
    const before = await snapshot('verdant/relay');
    await page.locator('.verdant-ui [data-action="wait"]').click();
    await page.waitForFunction(turn => window.__bulkhead.host.session.services.get({ id: 'verdant/relay' }).state().turn === turn + 1, before.turn, timeout);
    return 'verdant: wait advances one day';
  }
  if (family === 'archive' || family === 'orchard') {
    const action = family === 'archive' ? 'ask-iva' : 'consult-terminal';
    const flag = family === 'archive' ? 'trust' : 'diagnosis';
    const before = await snapshot('sdk/adventure');
    if (before.flags.includes(flag)) throw new Error(`Adventure flag ${flag} unexpectedly present before action`);
    await page.getByTestId(`story-action-${action}`).click();
    await page.waitForFunction(flag => window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' }).state().flags.includes(flag), flag, timeout);
    return `adventure: ${action} adds ${flag} flag`;
  }
  if (family === 'ash-cards' || family === 'cloud-cards') {
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'portfolio/cards-game' }).state().hand.length === 3, null, timeout);
    const before = await snapshot('portfolio/cards-game');
    const command = family === 'ash-cards' ? 'play:ash-1' : 'survey:sun-1';
    // Focus and activate via keyboard to exercise the table's keyboard navigation.
    const action = page.locator(`.cards-hand button[data-command="${command}"]`);
    await action.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(revision => window.__bulkhead.host.session.services.get({ id: 'portfolio/cards-game' }).state().revision > revision, before.revision, timeout);
    const after = await snapshot('portfolio/cards-game');
    if (after.hand.includes(family === 'ash-cards' ? 'ash-1' : 'sun-1')) throw new Error(`Card action ${command} was not committed`);
    await page.waitForFunction(() => document.querySelector('.cards-hand')?.contains(document.activeElement), null, timeout);
    return `cards: ${command} commits and keyboard focus remains in the hand`;
  }
  throw new Error(`Unknown portfolio family: ${family}`);
}
const server = await startStaticServer(dist);
let browser;
let failures = 0;
try {
  browser = await launchBrowser();
  for (const [index, preset] of presets.entries()) {
    const errors = [];
    // The index avoids collisions between IDs that sanitize to the same filename (or repeat).
    const safe = preset.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'preset';
    const screenshot = resolve(out, `portfolio-${String(index + 1).padStart(2, '0')}-${safe}.png`);
    let context;
    let page;
    try {
      context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
      const activeId = await page.evaluate(() => window.__bulkhead.host.active?.preset.id);
      if (activeId !== preset) throw new Error(`Requested preset ${JSON.stringify(preset)}, but active preset is ${JSON.stringify(activeId)}`);
      await page.getByRole('button', { name: /^play$/i }).click({ timeout: 30000 });
      await page.waitForFunction(() => {
        const b = window.__bulkhead;
        return b?.state === 'playing' && b.host.session?.state === 'running' && !b.host.session.scheduler.paused && b.shell.screen === 'none';
      }, null, { timeout: 90000 });
      const tick = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
      await page.waitForFunction(start => window.__bulkhead?.state === 'playing' && window.__bulkhead.host.session?.state === 'running' && window.__bulkhead.host.session.scheduler.tick >= start + 3, tick, { timeout: 30000 });
      await page.locator('canvas:visible').first().waitFor({ state: 'visible', timeout: 30000 });
      const action = families[preset] ? await checkAction(page, families[preset]) : 'generic activation';
      // Allow several rendered frames and any immediate asset failures to surface before capturing.
      await page.evaluate(() => new Promise(done => { let n = 3; const frame = () => --n ? requestAnimationFrame(frame) : done(); requestAnimationFrame(frame); }));
      await page.screenshot({ path: screenshot, timeout: 60000 });
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`PASS ${preset} — ${action} — ${screenshot}`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${preset} — ${error.stack ?? error}`);
      if (errors.length && !String(error.message).includes(errors.join('\n'))) console.error(errors.join('\n'));
      if (page) {
        try {
          await page.screenshot({ path: screenshot, timeout: 10000 });
          console.error(`Failure screenshot: ${screenshot}`);
        } catch (shotError) {
          console.error(`Failure screenshot could not be captured: ${shotError.message}`);
        }
      }
    } finally {
      if (context) await context.close();
    }
  }
} finally {
  try { if (browser) await browser.close(); } finally { await server.close(); }
}
if (failures) process.exitCode = 1;
