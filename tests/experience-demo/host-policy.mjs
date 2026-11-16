// Existing host-policy regressions, also run by run.mjs after the shipped experiences.
import assert from 'node:assert/strict';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const server = await startStaticServer(`${root}/dist`);
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console.error: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  await page.goto(server.url);
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu');
  await page.evaluate(() => {
    window.__pointerRequests = 0;
    const canvas = window.__bulkhead.shell.canvas;
    const request = canvas.requestPointerLock.bind(canvas);
    canvas.requestPointerLock = (...args) => { window.__pointerRequests++; return request(...args); };
  });
  for (const pointer of ['free', 'none']) {
    const result = await page.evaluate(async (pointer) => {
      const id = `test/${pointer}`;
      return window.__bulkhead.applyPreset({ schema: 1, id, name: `Policy ${pointer}`, plugins: [id], roles: { 'sdk/experience': id } }, [{
        manifest: { schema: 1, id, name: 'Policy probe', version: '1.0.0', sdk: '^2.0.0', kind: 'code' },
        load: async () => ({ default: {
          register(ctx) {
            ctx.provideRole({ id: 'sdk/experience' }, id, { name: 'Probe', description: 'Browser policy fixture', pointer, controls: [['W', 'Probe action']] });
            ctx.register({ kind: 'input-action' }, 'test/action', { label: 'Probe action', keys: ['KeyW'] });
          },
          activate(ctx) {
            const probe = { actions: 0, clicks: 0 };
            ctx.services.provide({ id: 'test/probe' }, probe);
            const input = ctx.services.get({ id: 'sdk/input' });
            ctx.systems.add({ id: 'test/probe', phase: 'control', update() { if (input.tick.pressed('test/action')) probe.actions++; } });
            const ui = ctx.services.get({ id: 'sdk/ui' });
            const panel = ui.mount(ctx, 'hud', 'input-probe');
            panel.style.cssText = 'position:absolute;top:10px;left:10px;pointer-events:auto';
            const field = document.createElement('input'); field.id = 'input-probe-field'; panel.append(field);
            const button = document.createElement('button'); button.id = 'input-probe-button'; button.textContent = 'Probe'; panel.append(button);
            button.onclick = () => { if (ctx.services.tryGet({ id: 'sdk/session-control' })?.playing === false) return; probe.clicks++; };
            ctx.scope.add(() => { button.onclick = null; }, 'probe-handler');
          },
        } }),
      }]);
    }, pointer);
    assert.equal(result.ok, true);
    assert.equal(await page.getByText('Aim (yaw)', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Probe action', { exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => window.__bulkhead.host.session.scheduler.tick >= 2);
    assert.equal(await page.evaluate(() => window.__pointerRequests), 0);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'test/probe' }).actions === 1);
    await page.locator('#input-probe-field').fill('www`');
    await page.locator('#input-probe-field').press('KeyW');
    await page.locator('#input-probe-field').press('Backquote');
    assert.equal(await page.evaluate(() => window.__bulkhead.creator.isOpen), false);
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'test/probe' }).actions), 1);
    await page.locator('canvas').click({ position: { x: 400, y: 300 } });
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'test/probe' }).actions === 2);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__bulkhead.state === 'paused');
    const tick = await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick);
    await page.evaluate(() => document.querySelector('#input-probe-button').click());
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'test/probe' }).clicks), 0);
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'sdk/session-control' }).playing), false);
    await page.evaluate(() => new Promise((done) => {
      let remaining = 4;
      const frame = () => { if (--remaining === 0) done(); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }));
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.scheduler.tick), tick);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction((tick) => window.__bulkhead.host.session.scheduler.tick > tick, tick);
    await page.locator('#input-probe-button').click();
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'test/probe' }).clicks), 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__bulkhead.state === 'paused');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.locator('#input-probe-button').click();
    await page.keyboard.press('Backquote');
    await page.waitForFunction(() => window.__bulkhead.state === 'paused' && window.__bulkhead.creator.isOpen);
    await page.evaluate(() => window.__bulkhead.creator.close());
    await page.getByRole('button', { name: /restart/i }).click();
    await page.waitForFunction(() => window.__bulkhead.state === 'playing');
    assert.equal(await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'test/probe' }).clicks), 0);
    assert.equal(await page.evaluate(() => window.__pointerRequests), 0);
    console.log(`PASS ${pointer}: play, input, focus, pause, resume, restart, session ingress; no pointer lock and no ?test`);
  }
  assert.deepEqual(errors, [], 'host-policy probe has no browser or network errors');
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
