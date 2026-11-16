// Production acceptance: real HUD/keyboard ingress, accelerated authoritative ticks, no game-state writes.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const out = resolve(root, '.smoke');
mkdirSync(out, { recursive: true });
const report = { passed: [], errors: [], screenshots: [], scenes: {}, ownership: {} };
const games = [
  { id: 'sky/salvage', name: 'sky', service: 'sky/salvage', hud: '.sky-ui', command: '[data-action="boost"]' },
  { id: 'ember/bastion', name: 'ember', service: 'ember/bastion', hud: '.ember-ui', command: '[data-action="launch"]' },
  { id: 'verdant/relay', name: 'verdant', service: 'verdant/relay', hud: '.verdant-ui', command: '[data-action="wait"]' },
];
const server = await startStaticServer(resolve(root, 'dist'));
let browser, page, current = 'startup';
try {
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(120000);
  page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', error => report.errors.push(`${current}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(`${current}: ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  const pass = message => { report.passed.push(message); console.log(`PASS ${message}`); };
  const state = value => page.waitForFunction(value => window.__bulkhead?.state === value, value);
  const frames = (n = 3) => page.evaluate(n => new Promise(done => {
    const next = () => { if (--n <= 0) done(); else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  }), n);
  const snapshot = game => page.evaluate(id => window.__bulkhead.host.session.services.get({ id }).state(), game.service);
  const ticks = n => page.evaluate(n => { for (let i = 0; i < n; i++) window.__bulkhead.host.session.scheduler.runTick(); }, n);
  const shot = async name => {
    const path = resolve(out, `reuse-${name}.png`);
    await frames(); await page.screenshot({ path, timeout: 120000 }); report.screenshots.push(path);
  };
  async function apply(id) {
    const button = page.getByRole('button', { name: /creator tools/i });
    if (await button.isVisible()) await button.click();
    else { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Backquote'); }
    await page.waitForSelector('.creator-panel:not([hidden])');
    await page.locator('.creator-tab[data-tab="plugins"]').click();
    await page.selectOption('[data-fk="preset-picker"]', id);
    await page.locator('[data-fk="apply"]').click();
    await page.waitForFunction(id => window.__bulkhead.host.active.preset.id === id && window.__bulkhead.host.session?.state === 'running', id);
    await page.keyboard.press('Escape'); await state('menu'); await frames();
  }
  async function play() {
    await page.getByRole('button', { name: 'Play', exact: true }).click(); await state('playing'); await frames();
  }
  async function click(selector) { await page.locator(selector).click(); await ticks(1); await frames(2); }
  const resources = () => page.evaluate(() => {
    const b = window.__bulkhead;
    return { ...b.host.resourceReport(), ui: b.ui.mounted, roots: b.renderHost.liveRoots(), assets: b.renderHost.assets.size,
      geometries: b.renderHost.service.stats.geometries, textures: b.renderHost.service.stats.textures };
  });
  const project = (name, key, value) => page.evaluate(({ name, key, value }) => {
    let target;
    window.__reuseRoots[`${name}/presentation`].traverse(object => { if (object.userData[key] === value) target = object; });
    if (!target) throw new Error(`No pickable ${name} ${key}=${value}`);
    const point = target.getWorldPosition(target.position.clone()).project(window.__reuseCameras[`${name}/presentation`]);
    return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2 };
  }, { name, key, value });
  await page.goto(server.url); await state('menu');
  await page.evaluate(() => {
    const b = window.__bulkhead, render = b.renderHost.service;
    window.__reuseRoots = {}; window.__reuseCameras = {}; window.__reusePointerRequests = 0;
    const create = render.createRoot.bind(render), camera = render.setWorldCamera.bind(render);
    render.createRoot = (ctx, layer) => { const value = create(ctx, layer); window.__reuseRoots[ctx.pluginId] = value; return value; };
    render.setWorldCamera = (ctx, value) => { window.__reuseCameras[ctx.pluginId] = value; return camera(ctx, value); };
    const request = b.shell.canvas.requestPointerLock.bind(b.shell.canvas);
    b.shell.canvas.requestPointerLock = (...args) => { window.__reusePointerRequests++; return request(...args); };
  });

  for (const game of games) {
    current = game.name;
    await apply(game.id); await play();
    const scene = await page.evaluate(name => {
      const root = window.__reuseRoots[`${name}/presentation`], meshes = [], lights = [];
      root.traverse(object => { if (object.isMesh) meshes.push(object); if (object.isLight) lights.push(object); });
      return { meshes: meshes.length, lights: lights.length, geometry: [...new Set(meshes.map(mesh => mesh.geometry.type))],
        camera: window.__reuseCameras[`${name}/presentation`].type, ...window.__bulkhead.renderHost.service.stats };
    }, game.name);
    report.scenes[game.name] = scene;
    assert.ok(scene.meshes > 15 && scene.lights >= 2 && scene.triangles > 100, 'lit volumetric 3D scene');
    assert.equal(await page.locator(game.hud).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.__bulkhead.host.active.preset.plugins.filter(id => id.startsWith('mechanics/')).sort()),
      ['mechanics/actions', 'mechanics/clock', 'mechanics/kits', 'mechanics/objectives', 'mechanics/resources']);
    const baseline = await resources(); report.ownership[game.name] = baseline;
    for (const viewport of [{ width: 1280, height: 720 }, { width: 800, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await frames(5);
      assert.equal(await page.evaluate(selector => document.querySelector(selector).scrollWidth > innerWidth, game.hud), false, 'no horizontal HUD overflow');
      if (game.name === 'ember' || game.name === 'verdant') {
        const key = game.name === 'ember' ? 'pad' : 'station';
        const values = game.name === 'ember' ? [0, 1, 2, 3, 4, 5] : ['reed', 'canopy', 'tide'];
        for (const value of values) {
          const p = await project(game.name, key, value);
          assert.ok(p.x > 0 && p.x < viewport.width && p.y > 0 && p.y < viewport.height, `${game.name} ${value} fits ${viewport.width}px scene`);
          assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y) instanceof HTMLCanvasElement, p), true, 'HUD leaves 3D picking targets unobscured');
        }
      }
      if (game.name === 'sky' && viewport.width === 390) {
        const before = await snapshot(game), pad = await page.locator('.sky-ui [data-direction="west"]').boundingBox();
        await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2); await page.mouse.down(); await ticks(12); await page.mouse.up();
        assert.ok((await snapshot(game)).x < before.x - 0.5, 'held on-screen control moves the drone');
      }
      await shot(`${game.name}-${viewport.width}x${viewport.height}`);
    }
    await page.setViewportSize({ width: 1280, height: 720 }); await frames();
    await page.keyboard.press('Escape'); await state('paused');
    const paused = await snapshot(game);
    await page.locator(`${game.hud} button`).first().evaluate(button => button.click()); await frames(4);
    assert.deepEqual(await snapshot(game), paused, 'paused HUD cannot change authoritative state');
    await page.getByRole('button', { name: 'Resume', exact: true }).click(); await state('playing');
    pass(`${game.name}: shared provider graph, lit 3D scene, three viewport sizes and paused ingress`);

    if (game.name === 'sky') {
      await click('.sky-ui [data-action="restart"]');
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.down('KeyA'); await ticks(12); await page.keyboard.up('KeyA');
      assert.ok((await snapshot(game)).x < -0.5, 'real keyboard input moves drone');
      await click('.sky-ui [data-action="restart"]');
      const flight = await page.evaluate(() => {
        document.activeElement?.blur();
        const b = window.__bulkhead, sky = b.host.session.services.get({ id: 'sky/salvage' });
        const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.slice(3).toLowerCase(), bubbles: true, cancelable: true }));
        const fly = (x, z) => {
          for (const [axis, target, positive, negative] of [['x', x, 'KeyD', 'KeyA'], ['z', z, 'KeyS', 'KeyW']]) {
            let guard = 0;
            while (Math.abs(sky.state()[axis] - target) > 0.1 && guard++ < 400) {
              const code = sky.state()[axis] < target ? positive : negative;
              key('keydown', code); b.host.session.scheduler.runTick(); key('keyup', code);
            }
            if (guard >= 400) throw new Error(`Flight could not reach ${axis}=${target}`);
          }
        };
        const interact = () => { key('keydown', 'KeyE'); key('keyup', 'KeyE'); b.host.session.scheduler.runTick(); };
        for (const [x, z] of [[-6, -4], [0, -5], [6, -4]]) { fly(x, z); interact(); fly(x, 5); interact(); }
        return sky.state();
      });
      assert.equal(flight.status, 'won'); assert.deepEqual(flight.delivered, [true, true, true]);
      await shot('sky-won');
      await click('.sky-ui [data-action="restart"]'); assert.equal((await snapshot(game)).status, 'playing');
      pass('sky: keyboard flight recovers and delivers all three crates; replay restores run');
    } else if (game.name === 'ember') {
      const pad = await project('ember', 'pad', 2);
      await page.mouse.click(pad.x, pad.y); await ticks(1); await frames();
      assert.deepEqual((await snapshot(game)).towers, [2], '3D ray-picked pad builds a tower');
      await click('.ember-ui [data-pad="3"]');
      for (let wave = 0; wave < 3; wave++) {
        await click('.ember-ui [data-action="launch"]');
        const result = await page.evaluate(() => {
          const b = window.__bulkhead, game = b.host.session.services.get({ id: 'ember/bastion' });
          let count = 0; while (game.state().status === 'wave' && count++ < 10000) b.host.session.scheduler.runTick();
          if (count >= 10000) throw new Error('Wave did not resolve'); return game.state();
        });
        assert.notEqual(result.status, 'lost');
        if (wave === 0) await click('.ember-ui [data-pad="0"]');
      }
      assert.equal((await snapshot(game)).status, 'won'); await shot('ember-won');
      await click('.ember-ui [data-action="replay"]'); await click('.ember-ui [data-action="launch"]');
      await ticks(3000); assert.equal((await snapshot(game)).status, 'lost'); await shot('ember-lost');
      await click('.ember-ui [data-action="replay"]');
      pass('ember: build choices defend all three waves; unguarded core falls; replay resets');
    } else {
      const before = await snapshot(game); await ticks(1800); assert.deepEqual(await snapshot(game), before, 'idle ticks cannot spend turns');
      const station = await project('verdant', 'station', 'canopy');
      await page.mouse.click(station.x, station.y); await frames();
      assert.equal(await page.locator('.verdant-ui [data-station="canopy"]').evaluate(button => button.classList.contains('selected')), true, '3D terrain picking selects the station');
      assert.deepEqual(await snapshot(game), before, 'station selection does not spend a turn');
      const act = async (action, station) => {
        if (station) await click(`.verdant-ui [data-station="${station}"]`);
        await click(`.verdant-ui [data-action="${action}"]`);
      };
      await act('restore', 'reed'); await act('biomass'); await act('convert'); await act('restore', 'canopy');
      await act('water'); await act('biomass'); await act('convert'); await act('restore', 'tide');
      assert.equal((await snapshot(game)).status, 'won'); assert.equal((await snapshot(game)).turn, 8); await shot('verdant-won');
      await click('.verdant-ui [data-restart]');
      for (let i = 0; i < 15; i++) await click('.verdant-ui [data-action="wait"]');
      assert.equal((await snapshot(game)).status, 'lost'); await shot('verdant-lost');
      await click('.verdant-ui [data-restart]');
      pass('verdant: idle turn-clock stability, eight-day restoration, drought defeat and restart');
    }
    await frames(); assert.deepEqual(await resources(), baseline, 'run replay releases every mechanic handle and visual allocation');
    for (let cycle = 0; cycle < 2; cycle++) {
      await apply('core/default'); assert.equal(await page.locator(game.hud).count(), 0);
      await apply(game.id); await play();
      assert.deepEqual(await resources(), baseline, 'cross-family switching restores exact ownership');
    }
    pass(`${game.name}: replay and two shooter switching cycles have stable ownership`);
  }
  assert.equal(await page.evaluate(() => window.__reusePointerRequests), 0);
  assert.deepEqual(report.errors, []);
  pass('all three experiences complete without pointer lock or browser/network errors');
} catch (error) {
  report.errors.push(`${current}: ${error.stack ?? String(error)}`);
  try { await page?.screenshot({ path: resolve(out, 'reuse-failure.png'), timeout: 120000 }); } catch {}
  throw error;
} finally {
  writeFileSync(resolve(out, 'reusable-games-report.json'), JSON.stringify(report, null, 2));
  try { await browser?.close(); } finally { await server.close(); }
}
