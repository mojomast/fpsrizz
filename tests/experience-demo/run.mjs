// Production browser acceptance. Run npm run build, then node tests/experience-demo/run.mjs.
// The shipped games run without ?test. Only driving is accelerated, using input + real simulation ticks.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const TIMEOUT = 120000;
const out = resolve(root, '.smoke');
const presetPath = (file) => readdirSync(resolve(root, 'games')).map((f) => resolve(root, 'games', f, 'presets', `${file}.json`)).find((p) => existsSync(p));
const preset = (file) => JSON.parse(readFileSync(presetPath(file), 'utf8'));
const shooter = preset('default');
const experiences = [
  { file: 'overhead-racing', preset: preset('overhead-racing'), hud: '.vehicle-hud', service: 'vehicle/race' },
  { file: 'turn-tactics', preset: preset('turn-tactics'), hud: '.tactics-ui', service: 'board/tactics' },
  { file: 'narrative-adventure', preset: preset('narrative-adventure'), hud: '.story-ui', service: 'sdk/adventure' },
];
assert.ok(existsSync(resolve(root, 'dist/index.html')), 'Run npm run build first: dist/index.html is required');
mkdirSync(out, { recursive: true });
const report = { url: '', executable: '', screenshots: [], passed: [], errors: [], ownership: {} };
const server = await startStaticServer(resolve(root, 'dist'));
let browser;
let page;
let current = 'startup';

try {
  browser = await launchBrowser();
  report.url = server.url;
  report.executable = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : browser.browserType().executablePath());
  console.log(`Browser: ${report.executable}\nProduction URL: ${server.url} (no query parameters)`);
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(TIMEOUT);
  page.setDefaultNavigationTimeout(TIMEOUT);
  page.on('pageerror', (error) => report.errors.push(`pageerror [${current}]: ${error.stack ?? error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(`console.error [${current}]: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} [${current}]: ${response.url()}`); });
  page.on('requestfailed', (request) => report.errors.push(`requestfailed [${current}]: ${request.url()} ${request.failure()?.errorText}`));

  const pass = (message) => { report.passed.push(message); console.log(`PASS ${message}`); };
  const waitState = (state) => page.waitForFunction((state) => window.__bulkhead?.state === state, state, { timeout: TIMEOUT });
  const frames = (count = 3) => page.evaluate((count) => new Promise((done) => {
    let remaining = count;
    const frame = () => { if (--remaining === 0) done(); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }), count);
  const waitTicks = async (count) => {
    const tick = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
    await page.waitForFunction(([tick, count]) => window.__bulkhead.host.session.scheduler.tick >= tick + count, [tick, count], { timeout: TIMEOUT });
  };
  const shot = async (name) => {
    const path = resolve(out, `experience-${name}.png`);
    await page.screenshot({ path, timeout: TIMEOUT });
    report.screenshots.push(path);
  };
  const readRace = () => page.evaluate(() => {
    const r = window.__bulkhead.host.session.services.get({ id: 'vehicle/race' });
    return { x: r.x, z: r.z, yaw: r.yaw, speed: r.speed, elapsed: r.elapsed, lap: r.lap, nextGate: r.nextGate, revision: r.revision, status: r.status, drifting: r.drifting };
  });
  const readTactics = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'board/tactics' }).state);
  const readAdventure = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' }).state());

  async function openCreator() {
    // Native controls may still have focus; use the shell's visible Creator button when available.
    const creatorButton = page.getByRole('button', { name: /creator tools/i });
    if (await creatorButton.isVisible()) await creatorButton.click();
    else {
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press('Backquote');
    }
    await page.waitForSelector('.creator-panel:not([hidden])');
    await page.locator('.creator-panel .creator-tab[data-tab="plugins"]').click();
  }

  async function applyFromPicker(p) {
    await openCreator();
    const picker = '.creator-panel select[data-fk="preset-picker"]';
    assert.equal(await page.locator(`${picker} option[value="${p.id}"]`).count(), 1, `${p.id} is shipped in Creator`);
    await page.selectOption(picker, p.id);
    const experience = page.locator('.creator-panel select[data-selector="Experience"]');
    assert.equal(await experience.count(), 1, 'Creator exposes the Experience selector');
    assert.equal(await experience.inputValue(), p.roles['sdk/experience'] ?? '', 'Experience selection follows the preset');
    if (p.roles['sdk/experience']) {
      assert.equal(await experience.locator(`option[value="${p.roles['sdk/experience']}"]`).isDisabled(), false, 'selected experience provider is enabled');
    }
    await page.evaluate(() => document.querySelectorAll('.creator-panel [data-result]').forEach((el) => { el.dataset.stale = '1'; }));
    await page.locator('.creator-panel [data-fk="apply"]').click();
    const result = page.locator('.creator-panel [data-result]:not([data-stale])');
    await result.waitFor();
    assert.match(await result.textContent(), /Applied/, `${p.id} applies successfully`);
    assert.equal(await page.evaluate(() => window.__bulkhead.host.active.preset.id), p.id);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.creator-panel[hidden]', { state: 'attached' });
    await waitState('menu');
    await frames();
  }

  async function assertIndependent(test) {
    const observed = await page.evaluate(({ hud, service }) => {
      const b = window.__bulkhead, s = b.host.session;
      return {
        ownHud: document.querySelectorAll(hud).length,
        shooterHud: document.querySelectorAll('.core-hud').length,
        players: s.entities.count({ id: 'sdk/player' }),
        shooterServices: ['sdk/player', 'sdk/combat', 'sdk/world'].filter((id) => s.services.tryGet({ id }) !== undefined),
        shooterPlugins: b.host.active.preset.plugins.filter((id) => ['core/player', 'core/combat', 'core/world', 'core/hud'].includes(id)),
        hasService: s.services.tryGet({ id: service }) !== undefined,
        pointerLocked: document.pointerLockElement !== null,
        pointerRequests: b.experiencePointerRequests,
        calls: b.renderHost.service.stats.calls,
      };
    }, test);
    assert.equal(observed.ownHud, 1, `${test.file} mounts one dedicated HUD`);
    assert.equal(observed.shooterHud, 0, 'no shooter HUD');
    assert.equal(observed.players, 0, 'no shooter player entity');
    assert.deepEqual(observed.shooterServices, [], 'no shooter services');
    assert.deepEqual(observed.shooterPlugins, [], 'no shooter implementation plugins');
    assert.equal(observed.hasService, true);
    assert.equal(observed.pointerLocked, false);
    assert.equal(observed.pointerRequests, 0, 'free-pointer experience never requests pointer lock');
    if (test.service !== 'sdk/adventure') assert.ok(observed.calls > 0, 'game scene issues render calls');
    await page.locator(test.hud).waitFor({ state: 'visible' });
  }

  async function play(test) {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await waitState('playing');
    await waitTicks(3);
    await assertIndependent(test);
  }

  async function screenshots(test) {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 800, height: 600 }]) {
      await page.setViewportSize(viewport);
      await frames();
      await page.locator(test.hud).waitFor({ state: 'visible' });
      const bounds = await page.locator(test.hud).boundingBox();
      assert.ok(bounds && bounds.width > 0 && bounds.height > 0, 'dedicated HUD remains visible at both viewport sizes');
      await shot(`${test.file}-${viewport.width}x${viewport.height}`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await frames();
  }

  async function pauseResume(read, rejectedSelector) {
    await page.keyboard.press('Escape');
    await waitState('paused');
    const tick = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
    const before = await read();
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'sdk/session-control' }).playing), false);
    if (rejectedSelector) {
      // Deliberately bypass the covering pause sheet to test the HUD's own ingress guard.
      await page.locator(rejectedSelector).evaluate((button) => button.click());
    } else {
      await page.keyboard.press('KeyW');
      await page.keyboard.press('KeyA');
    }
    await frames(4);
    assert.equal(await page.evaluate(() => window.__bulkhead.state), 'paused', 'rejected gameplay input does not leave pause');
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick), tick, 'pause freezes simulation ticks');
    assert.deepEqual(await read(), before, 'paused UI/input cannot mutate gameplay state');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await waitState('playing');
    await page.waitForFunction((tick) => window.__bulkhead.host.session.scheduler.tick > tick, tick, { timeout: TIMEOUT });
  }

  async function resources() {
    await frames();
    return page.evaluate(() => {
      const b = window.__bulkhead;
      return {
        ...b.host.resourceReport(),
        uiRoots: b.ui.mounted,
        sceneRoots: b.renderHost.liveRoots(),
        sharedAssets: b.renderHost.assets.size,
        audioVoices: b.audio.activeVoices,
        hudChildren: b.shell.hudLayer.childElementCount,
        geometries: b.renderHost.service.stats.geometries,
        textures: b.renderHost.service.stats.textures,
        ownedDom: [...document.querySelectorAll('[data-owner]')].map((el) => `${el.tagName}:${el.dataset.owner}`).sort(),
        systemsByOwner: b.host.session.scheduler.describe().map(({ id, owner, phase }) => ({ id, owner, phase })),
        servicesByOwner: b.host.session.services.list().sort((a, b) => a.id.localeCompare(b.id)),
        entitiesByOwner: b.host.session.entities.countsByOwner(),
      };
    });
  }

  async function racing(test) {
    await play(test);
    const start = await readRace();
    await page.keyboard.down('KeyW');
    await page.waitForFunction((x) => window.__bulkhead.host.session.services.get({ id: 'vehicle/race' }).x > x + 1, start.x, { timeout: TIMEOUT });
    await page.keyboard.up('KeyW');
    const accelerated = await readRace();
    assert.ok(accelerated.speed > 3, 'real keyboard accelerates the vehicle');
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'vehicle/race' }).drifting, null, { timeout: TIMEOUT });
    await page.keyboard.up('Space');
    await page.keyboard.down('KeyS');
    await page.waitForFunction((speed) => window.__bulkhead.host.session.services.get({ id: 'vehicle/race' }).speed < speed - 1, accelerated.speed, { timeout: TIMEOUT });
    await page.keyboard.up('KeyS');
    await pauseResume(readRace);
    await screenshots(test);
    await page.keyboard.press('Escape');
    await waitState('paused');
    await page.getByRole('button', { name: /restart/i }).click();
    await waitState('playing');
    assert.equal((await readRace()).revision, 0, 'restart resets checkpoint progression');

    // Same input-only controller as the authored-track headless test. No writes to race state.
    // Running fixed ticks avoids making a two-lap drive depend on SwiftShader render speed.
    const result = await page.evaluate(() => {
      const b = window.__bulkhead, s = b.host.session;
      if (b.state !== 'playing' || s.scheduler.paused) throw new Error('Driving requires a live, unpaused session');
      const race = s.services.get({ id: 'vehicle/race' }), points = race.track.points;
      const gates = [];
      let next = 1, revision = race.revision, ticks = 0;
      const key = (action, on) => on ? b.inputCore.press(action) : b.inputCore.release(action);
      try {
        for (; ticks < 8500 && race.status === 'racing' && !s.scheduler.faulted; ticks++) {
          const point = points[next];
          if (Math.hypot(point.x - race.x, point.z - race.z) < 3.8) next = (next + 1) % points.length;
          const target = points[next];
          const desired = Math.atan2(-(target.x - race.x), -(target.z - race.z));
          const error = Math.atan2(Math.sin(desired - race.yaw), Math.cos(desired - race.yaw));
          key('vehicle/left', error > .09);
          key('vehicle/right', error < -.09);
          key('vehicle/gas', race.speed < (Math.abs(error) > .45 ? 7 : 12));
          key('vehicle/brake', race.speed > (Math.abs(error) > .45 ? 9 : 14));
          s.scheduler.runTick();
          if (race.revision !== revision) { revision = race.revision; gates.push({ revision, lap: race.lap, nextGate: race.nextGate }); }
        }
      } finally {
        for (const action of ['vehicle/left', 'vehicle/right', 'vehicle/gas', 'vehicle/brake']) b.inputCore.release(action);
      }
      return { status: race.status, lap: race.lap, laps: race.track.laps, revision: race.revision, expected: race.track.gates.length * race.track.laps, gates, ticks, elapsed: race.elapsed };
    });
    assert.equal(result.status, 'won', `input-only drive must finish: ${JSON.stringify(result)}`);
    assert.equal(result.lap, result.laps);
    assert.equal(result.revision, result.expected, 'every ordered gate on every lap is crossed');
    assert.deepEqual(result.gates.map((gate) => gate.revision), Array.from({ length: result.expected }, (_, i) => i + 1));
    await waitState('ended');
    await page.getByText('Circuit complete', { exact: true }).waitFor();
    await shot('overhead-racing-victory');
    pass(`overhead-racing: keyboard acceleration/drift/braking, pause/restart, all gates, ${result.laps}-lap input-only victory (${result.ticks} ticks)`);
  }

  async function tactics(test) {
    await play(test);
    const untouched = await readTactics();
    await waitTicks(12);
    assert.deepEqual(await readTactics(), untouched, 'waiting never spends AP or advances a turn');
    await pauseResume(readTactics, '.tactics-actions [data-action="end"]');
    await screenshots(test);

    const cell = (x, y) => page.locator(`.tactics-ui [data-cell="${x},${y}"]`);
    const mode = (name) => page.locator(`.tactics-actions [data-action="${name}"]`).click();
    const command = async (action) => {
      const revision = (await readTactics()).revision;
      await action();
      await page.waitForFunction((revision) => window.__bulkhead.host.session.services.get({ id: 'board/tactics' }).state.revision > revision, revision, { timeout: TIMEOUT });
      await frames(1);
    };
    const unit = async (id) => (await readTactics()).units.find((u) => u.id === id);
    const select = async (id) => { const u = await unit(id); await cell(u.x, u.y).click(); };
    const move = async (id, x, y) => {
      await select(id); await mode('move');
      const before = await unit(id);
      await command(() => cell(x, y).click());
      const after = await unit(id);
      assert.deepEqual([after.x, after.y], [x, y]);
      assert.ok(after.ap < before.ap, 'legal movement spends action points');
    };
    const attack = async (id, target) => {
      await select(id); await mode('attack');
      const enemy = await unit(target), before = await unit(id);
      const forecast = await page.evaluate(([id, target]) => window.__bulkhead.host.session.services.get({ id: 'board/tactics' }).forecast(id, target), [id, target]);
      assert.equal(forecast.legal, true, `${id} has a legal attack on ${target}`);
      await cell(enemy.x, enemy.y).hover();
      await page.waitForFunction((damage) => document.querySelector('[data-testid="tactics-forecast"]')?.textContent.includes(`${damage} damage / 1 AP`), forecast.damage, { timeout: TIMEOUT });
      await command(() => cell(enemy.x, enemy.y).click());
      assert.equal((await unit(target)).hp, Math.max(0, enemy.hp - forecast.damage), 'damage matches visible forecast');
      assert.equal((await unit(id)).ap, before.ap - 1, 'attack spends exactly one AP');
    };

    await mode('move');
    await command(() => cell(3, 1).click());
    assert.match((await readTactics()).message, /unreachable/i);
    assert.deepEqual((await readTactics()).units, untouched.units, 'wall move is rejected without spending AP');
    await mode('attack');
    await command(() => cell(6, 1).click());
    assert.deepEqual((await readTactics()).units, untouched.units, 'blocked attack spends neither AP nor health');

    await move('raven', 1, 3);
    await move('rook', 5, 6);
    await attack('raven', 'sentry');
    await attack('rook', 'sentry');
    assert.equal((await unit('sentry')).hp, 0, 'both squad members combine fire to remove Sentry');
    const beforeEnemy = await readTactics();
    await command(() => page.locator('.tactics-actions [data-action="end"]').click());
    const afterEnemy = await readTactics();
    assert.equal(afterEnemy.turn, beforeEnemy.turn + 1, 'end turn resolves the enemy phase');
    assert.ok(afterEnemy.units.filter((u) => u.team === 'squad').some((u) => u.hp < beforeEnemy.units.find((before) => before.id === u.id).hp), 'enemy retaliates');
    assert.ok(afterEnemy.units.filter((u) => u.team === 'squad' && u.hp > 0).every((u) => u.ap === 2), 'survivors regain AP');
    await attack('rook', 'guard');
    await attack('rook', 'guard');
    assert.equal((await readTactics()).outcome, 'victory');
    await waitState('ended');
    await page.getByText('Signal secured', { exact: true }).waitFor();
    await shot('turn-tactics-victory');
    pass('turn-tactics: wait/pause, rejected moves/attacks, selection, movement/AP, forecast, combined fire, enemy phase, victory');
  }

  async function adventure(test) {
    await play(test);
    const initial = await readAdventure();
    await waitTicks(12);
    assert.deepEqual(await readAdventure(), initial, 'waiting does not advance the story');
    await pauseResume(readAdventure, '[data-testid="story-action-speak-kind"]');
    await screenshots(test);
    const action = async (id, predicate, keyboard = false) => {
      const button = page.getByTestId(`story-action-${id}`);
      if (keyboard) { await button.focus(); await page.keyboard.press('Enter'); } else await button.click();
      await page.waitForFunction(({ id, predicate }) => {
        const service = window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' });
        const state = service.state(), action = service.chapter.actions.find((a) => a.id === id);
        return state.message === action.text && (!predicate || (predicate.room ? state.room === predicate.room : predicate.item ? state.inventory.includes(predicate.item) : state.flags.includes(predicate.flag)));
      }, { id, predicate }, { timeout: TIMEOUT });
      await frames(1);
    };
    const lockedDoor = page.getByTestId('story-action-workshop-door');
    assert.equal(await lockedDoor.getAttribute('aria-disabled'), 'true');
    await lockedDoor.dispatchEvent('click');
    assert.deepEqual(await readAdventure(), initial, 'locked hotspot cannot bypass the item requirement');
    assert.match(await page.getByTestId('story-message').textContent(), /another clue or item/i);
    await action('inspect-sea');
    await action('speak-kind', { item: 'key' }, true);
    assert.ok((await readAdventure()).flags.includes('trusted'), 'dialogue choice records its consequence');
    await action('workshop-door', { room: 'workshop' });
    await action('take-lens', { item: 'lens' });
    await page.getByTestId('story-save').click();
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' }).state().message === 'Adventure saved.', null, { timeout: TIMEOUT });
    const saved = await readAdventure();
    await page.getByTestId('story-reset').click();
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' }).state().room === 'quay', null, { timeout: TIMEOUT });
    await page.getByTestId('story-load').click();
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'sdk/adventure' }).state().message === 'Adventure restored.', null, { timeout: TIMEOUT });
    const restored = await readAdventure();
    for (const key of ['room', 'inventory', 'flags', 'journal']) assert.deepEqual(restored[key], saved[key], `explicit save/load restores ${key}`);
    await action('take-cloth', { item: 'cloth' });
    await action('read-log', { flag: 'clue' });
    await action('polish', { item: 'clear-lens' });
    assert.equal((await readAdventure()).inventory.includes('lens'), false, 'combining consumes the cloudy lens');
    await action('stairs', { room: 'lantern' });
    const beforeShutter = await readAdventure();
    await page.getByTestId('story-action-raise-shutter').dispatchEvent('click');
    assert.deepEqual(await readAdventure(), beforeShutter, 'shutter prerequisite is enforced');
    await action('release-catch', { flag: 'catch' });
    await action('raise-shutter', { flag: 'shutter' });
    await action('install-lens', { flag: 'installed' });
    assert.equal((await readAdventure()).inventory.includes('clear-lens'), false, 'installing consumes the polished lens');
    await action('light-beacon', { flag: 'victory' });
    assert.equal((await readAdventure()).completed, true, 'chapter reports its authored completion condition');
    await page.locator('.story-message.story-win').waitFor();
    await page.getByTestId('story-completion').waitFor({ state: 'visible' });
    assert.match(await page.getByTestId('story-journal').textContent(), /beacon shines again/i);
    await shot('narrative-adventure-victory');
    pass('narrative-adventure: locked hotspots, keyboard dialogue, inventory/clues, save/reset/load, item combination, ordered shutter puzzle, beacon victory');
  }

  await page.goto(server.url);
  await waitState('menu');
  assert.equal(new URL(page.url()).search, '', 'acceptance does not enable ?test');
  await page.evaluate(() => {
    const b = window.__bulkhead, canvas = b.shell.canvas;
    b.experiencePointerRequests = 0;
    const request = canvas.requestPointerLock.bind(canvas);
    canvas.requestPointerLock = (...args) => { b.experiencePointerRequests++; return request(...args); };
  });

  current = 'shooter-baseline';
  await applyFromPicker(shooter);
  const shooterBaseline = await resources();
  report.ownership.shooterBaseline = shooterBaseline;
  assert.equal(await page.locator('.core-hud').count(), 1, 'reference shooter has its HUD');
  assert.equal(await page.evaluate(() => window.__bulkhead.host.session.entities.count({ id: 'sdk/player' })), 1, 'reference shooter has its player');

  for (const [i, run] of [racing, tactics, adventure].entries()) {
    const test = experiences[i];
    current = test.file;
    console.log(`Testing ${test.preset.id}`);
    await applyFromPicker(test.preset);
    report.ownership[test.file] = await resources();
    await run(test);
    await applyFromPicker(shooter);
    assert.deepEqual(await resources(), shooterBaseline, `${test.file} fully releases ownership when returning to shooter`);
  }

  // Compare fresh sessions, not end-of-run state, over two full cross-family cycles.
  for (let cycle = 1; cycle <= 2; cycle++) {
    for (const test of experiences) {
      current = `ownership-${cycle}-${test.file}`;
      await applyFromPicker(test.preset);
      assert.deepEqual(await resources(), report.ownership[test.file], `${test.file} ownership is stable on cycle ${cycle}`);
      await play(test);
      await page.keyboard.press('Escape');
      await waitState('paused');
    }
    await applyFromPicker(shooter);
    assert.deepEqual(await resources(), shooterBaseline, `all ownership counts return to the shooter baseline after cycle ${cycle}`);
  }
  pass('two repeated racing → tactics → adventure → shooter cycles retain exact registration, scope, system, service, entity, DOM, scene and asset ownership counts');
  assert.deepEqual(report.errors, [], 'no console errors, uncaught exceptions, HTTP errors or failed requests');
  pass('production free-pointer games never request pointer lock; no browser/network errors');
} catch (error) {
  console.error(`FAIL ${current}:`, error.stack ?? error);
  if (report.errors.length) console.error(report.errors.join('\n'));
  report.failure = { current, message: error.stack ?? String(error) };
  if (page) {
    const path = resolve(out, `experience-failure-${current}.png`);
    await page.screenshot({ path, timeout: TIMEOUT }).then(() => report.screenshots.push(path)).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, 'experience-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  try { await browser?.close(); } finally { await server.close(); }
}

// Keep the pre-existing isolated host-policy regressions, including native text-field focus behavior.
if (!process.exitCode) await import('./host-policy.mjs');
