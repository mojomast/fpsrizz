const path = require('path');
const fs = require('fs');
const assert = require('assert');
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');

const here = __dirname;
const out = path.resolve(here, '../../.smoke');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const res = await esbuild.build({ entryPoints: [path.join(here, 'demo.ts')], bundle: true, write: false, format: 'iife', target: 'es2022' });
  const js = res.outputFiles[0].text;
  const html = `<!doctype html><html><body style="margin:0"><div id="app" style="position:fixed;inset:0"></div><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`;
  fs.writeFileSync(path.join(out, 'shell-demo.html'), html);

  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(out, 'shell-demo.html'));

  const controls = [['W A S D', 'Move'], ['Mouse', 'Look'], ['LMB', 'Fire'], ['Space', 'Jump'], ['Shift', 'Sprint'], ['E', 'Use'], ['R', 'Reload'], ['1-4', 'Weapons'], ['Esc', 'Pause']];
  const startInfo = { presetName: 'Foundry Run', objective: 'Clear the foundry of hostiles and reach the exit hatch.', controls, extensions: ['Pickups', 'Minimap', 'Audio Stingers'] };
  const shot = async (name) => page.screenshot({ path: path.join(out, `shell-${name}.png`) });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const log = () => ev(() => window.__log.slice());
  const clear = () => ev(() => { window.__log.length = 0; });

  await ev((i) => window.__shell.showStart(i), startInfo);
  await shot('start');
  assert.strictEqual(await ev(() => document.activeElement && document.activeElement.textContent), 'Play');
  assert.strictEqual(await ev(() => getComputedStyle(document.querySelector('.bh-hud')).visibility), 'hidden');

  // Enter plays
  await page.keyboard.press('Enter');
  assert.deepStrictEqual(await log(), ['play']); await clear();
  await page.click('text=Play'); assert.deepStrictEqual(await log(), ['play']); await clear();
  await page.click('text=Creator tools'); assert.deepStrictEqual(await log(), ['creator']); await clear();

  // slider
  await page.locator('input[type=range]').first().evaluate((i) => { i.value = '2.5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  let l = await log();
  assert.strictEqual(l.length, 1);
  assert.strictEqual(JSON.parse(l[0].slice(9)).sensitivity, 2.5); await clear();
  await page.selectOption('select', '2');
  l = await log(); assert.strictEqual(JSON.parse(l[0].slice(9)).pixelRatioCap, 2); await clear();
  // setSettings silent
  await ev(() => window.__shell.setSettings({ sensitivity: 0.5, volume: 0.2, pixelRatioCap: 1 }));
  assert.deepStrictEqual(await log(), []);
  assert.strictEqual(await page.locator('input[type=range]').first().inputValue(), '0.5');
  assert.strictEqual(await page.locator('select').inputValue(), '1');
  await ev(() => window.__shell.setSettings({ sensitivity: 1, volume: 0.6, pixelRatioCap: 1.5 }));
  await shot('start');

  await page.setViewportSize({ width: 640, height: 480 });
  await shot('start-640x480');
  const noOverflow = await ev(() => document.documentElement.scrollWidth <= innerWidth);
  assert.ok(noOverflow, 'no horizontal overflow at 640x480');
  await page.setViewportSize({ width: 800, height: 600 });
  await shot('start-800x600');
  await page.setViewportSize({ width: 1280, height: 720 });

  await ev(() => window.__shell.showPause());
  await shot('pause');
  assert.strictEqual(await ev(() => document.activeElement.textContent), 'Resume');
  assert.strictEqual(await ev(() => getComputedStyle(document.querySelector('.bh-hud')).visibility), 'visible');
  for (const [t, n] of [['Resume', 'resume'], ['Restart', 'restart'], ['Main menu', 'menu'], ['Creator tools', 'creator']]) {
    await page.getByRole('button', { name: t, exact: true }).click();
    assert.deepStrictEqual(await log(), [n]); await clear();
  }

  await ev(() => window.__shell.showEnd({ outcome: 'victory', title: 'Sector Cleared', detail: 'The foundry is silent. Extraction inbound.', stats: [['Time', '03:41'], ['Kills', '24 / 24'], ['Accuracy', '63%'], ['Damage taken', '112']] }));
  await shot('end-victory');
  for (const [t, n] of [['Restart', 'restart'], ['Main menu', 'menu']]) {
    await page.getByRole('button', { name: t, exact: true }).click();
    assert.deepStrictEqual(await log(), [n]); await clear();
  }
  await ev(() => window.__shell.showEnd({ outcome: 'defeat', title: 'You Died', detail: 'Overrun in the smelting hall.', stats: [['Time', '01:12'], ['Kills', '7 / 24']] }));
  await shot('end-defeat');

  await ev(() => window.__shell.showError('Plugin failed to load', ['[weapons/shotgun] manifest.requires: unknown dependency "ballistics"', '  at content/plugins/shotgun.json:12', 'Fix the manifest and reload the page.'], true));
  await shot('error');
  await page.getByRole('button', { name: 'Main menu' }).click();
  assert.deepStrictEqual(await log(), ['menu']); await clear();
  await ev(() => window.__shell.showError('Fatal', ['x'], false));
  assert.strictEqual(await page.locator('.bh-screen button').count(), 0);

  await ev(() => window.__shell.showLoading('Compiling shaders and level geometry...'));
  await shot('loading');
  await ev(() => window.__shell.showUnsupported('WebGL2 is not available in this browser. Try a recent Chrome, Firefox or Safari.'));
  await shot('unsupported');
  assert.strictEqual(await page.locator('.bh-screen button').count(), 0);

  await ev(() => { window.__shell.hide(); window.__shell.setHint('Click to capture the mouse — Esc releases it'); });
  await shot('none-hint');
  assert.strictEqual(await ev(() => window.__shell.screen), 'none');

  // dispose
  await ev(() => window.__shell.dispose());
  assert.strictEqual(await ev(() => document.getElementById('app').childElementCount), 0);
  assert.strictEqual(await ev(() => document.querySelectorAll('style[data-bulkhead-shell]').length), 0);
  assert.strictEqual(await ev(() => document.querySelectorAll('style').length), 0);
  assert.deepStrictEqual(errors, []);

  await browser.close();
  console.log('shell-demo: all assertions passed');
})().catch((e) => { console.error(e); process.exit(1); });
