// Bundles demo.ts, runs it in headless Chrome (software WebGL2), takes screenshots into .smoke/presentation-*.png and
// asserts draw calls, audio hooks and resource cleanup.
const path = require('path'), fs = require('fs');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');

(async () => {
  const { resolveTool } = await import(pathToFileURL(path.join(root, 'scripts/tools.mjs')).href);
  const esbuild = resolveTool('esbuild');
  const { chromium } = resolveTool('playwright');
  const out = path.join(root, '.smoke/presentation-build');
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(__dirname, 'demo.ts')], bundle: true, outfile: path.join(out, 'demo.js'), format: 'iife', target: 'es2022', loader: { '.json': 'json' } });
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><body style="margin:0;background:#000"><script src="demo.js"></script></body>');
  const executablePath = process.env.CHROME_PATH !== undefined ? process.env.CHROME_PATH
    : fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
  const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  let bad = 0;
  const fail = (m) => { console.log('FAIL', m); bad++; };
  const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) bad++; };
  page.on('console', (m) => { console.log('[page]', m.type(), m.text()); if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall due to ReadPixels/.test(m.text()))) bad++; });
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); bad++; });
  await page.goto('file://' + path.join(out, 'index.html'));
  await page.waitForFunction(() => window.__demo, null, { timeout: 15000 });

  fs.mkdirSync(path.join(root, '.smoke'), { recursive: true });
  const shot = async (name) => {
    const url = await page.evaluate(() => window.__demo.shot());
    fs.writeFileSync(path.join(root, `.smoke/presentation-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  };
  const at = (pose, secs = 0.1) => page.evaluate(([p, s]) => { window.__demo.pose(p); window.__demo.advance(s); }, [pose, secs]);
  const PI = Math.PI;

  const baseline = await page.evaluate(() => window.__demo.baseline());
  await page.evaluate(() => window.__demo.apply(true));

  // ---- screenshots
  await at({ x: 3, y: 1.5, z: 9, yaw: -PI / 2, pitch: 0 });
  await shot('overview-a-door-closed');
  await at({ x: 9, y: 1.5, z: 4, yaw: PI / 2 - 0.5, pitch: 0 });
  await shot('room-a-west');
  await at({ x: 6, y: 1.5, z: 9, yaw: -PI / 2 + 0.7, pitch: -0.95 });
  await shot('floor-down');
  await at({ x: 6, y: 1.5, z: 9, yaw: -PI / 2 + 0.7, pitch: 0.95 });
  await shot('ceiling-up');
  await at({ x: 17, y: 1.5, z: 8.5, yaw: 0, pitch: 0 });
  await shot('enemies-grunts');
  await at({ x: 17, y: 1.5, z: 9.5, yaw: PI, pitch: 0 });
  await shot('enemies-spitters');
  await at({ x: 16, y: 1.5, z: 14.6, yaw: PI, pitch: 0 }, 0.4);
  await shot('items');
  await at({ x: 17, y: 1.5, z: 8.5, yaw: PI / 2 - 0.1, pitch: 0 });
  await shot('room-b-west-wall-and-door');
  await at({ x: 16, y: 1.7, z: 12.5, yaw: -3 * PI / 4, pitch: -0.3 });
  await shot('exit-pad');
  await at({ x: 16, y: 1.5, z: 9, yaw: -PI / 2 + 0.15, pitch: 0 });
  await shot('switch-off');
  await at({ x: 3, y: 1.5, z: 9, yaw: -PI / 2, pitch: 0 });
  await shot('door-closed');
  const wasOpen0 = await page.evaluate(() => window.__demo.doorOpenness());
  await page.evaluate(() => window.__demo.pressSwitch());
  await page.evaluate(() => window.__demo.advance(0.15));
  await shot('door-opening');
  const mid = await page.evaluate(() => window.__demo.doorOpenness());
  await page.evaluate(() => window.__demo.advance(0.6));
  await shot('door-open');
  const open1 = await page.evaluate(() => window.__demo.doorOpenness());
  check('door openness animates', wasOpen0 === 0 && mid > 0.1 && mid < 0.9 && open1 === 1, `(0 -> ${mid.toFixed(2)} -> ${open1})`);
  await at({ x: 16, y: 1.5, z: 9, yaw: -PI / 2 + 0.15, pitch: 0 });
  await shot('switch-on');
  // weapon + muzzle flash + impacts
  await at({ x: 15, y: 1.5, z: 11, yaw: 0, pitch: 0 }, 0.5);
  await page.evaluate(() => { window.__demo.impacts(); window.__demo.fire(); window.__demo.advance(1 / 30); });
  await shot('weapon-flash-impacts');
  await page.evaluate(() => window.__demo.advance(0.6));
  await shot('weapon-idle');
  await page.evaluate(() => { window.__demo.fire('demo/launcher'); window.__demo.advance(1 / 30); });
  await shot('weapon-launcher-flash');
  await page.evaluate(() => { window.__demo.advance(0.4); window.__demo.switchWeapon('demo/ricochet'); window.__demo.advance(0.1); });
  await shot('weapon-switching');
  await page.evaluate(() => window.__demo.advance(0.5));
  await shot('weapon-ricochet');

  // ---- draw calls
  await at({ x: 3, y: 1.5, z: 9, yaw: -PI / 2, pitch: 0 }, 0.2);
  const callsA = (await page.evaluate(() => window.__demo.stats())).calls;
  await at({ x: 17, y: 1.5, z: 11, yaw: 0, pitch: 0 }, 0.2);
  const callsB = (await page.evaluate(() => window.__demo.stats())).calls;
  const st = await page.evaluate(() => window.__demo.stats());
  console.log('draw calls: room A view', callsA, ' room B view', callsB, ' stats', JSON.stringify(st));
  check('draw calls reasonable (<= 60)', callsA <= 60 && callsB <= 60);

  // ---- effect pool: 100 impacts never exceed 32 quad geometries
  const geoBefore = (await page.evaluate(() => window.__demo.stats())).geometries;
  const geoStorm = await page.evaluate(() => window.__demo.impactStorm(100));
  check('effect pool bounded (<= +32 geometries)', geoStorm - geoBefore <= 32, `(${geoBefore} -> ${geoStorm})`);

  // ---- audio hooks
  await page.evaluate(() => { window.__demo.pose({ x: 3, y: 1.5, z: 9, yaw: -Math.PI / 2, pitch: 0 }); window.__demo.advance(0.1); window.__demo.audio.clear(); window.__demo.audio.emitAll(); });
  const calls = await page.evaluate(() => window.__demo.audio.calls());
  console.log('audio calls:', JSON.stringify(calls));
  const ids = calls.map((c) => c.id);
  const exp = ['pistol-fire', 'enemy-shoot', 'impact-wall', 'impact-flesh', 'pickup-health', 'door-open', 'door-close', 'switch-on', 'enemy-alert', 'player-hurt', 'enemy-hurt', 'enemy-die', 'player-die', 'weapon-empty'];
  check('audio: expected sequence', JSON.stringify(ids) === JSON.stringify(exp), JSON.stringify(ids));
  const own = calls[0];
  check('audio: own sound flat', own.gain === undefined && own.pan === undefined);
  const near = calls[1];
  check('audio: 3 m ahead full gain centered', near.gain === 1 && Math.abs(near.pan) < 0.01, JSON.stringify(near));
  const mid2 = calls[2];
  check('audio: 16.5 m attenuated', mid2.gain > 0.05 && mid2.gain < 0.4, JSON.stringify(mid2));
  // ---- listener facing +X (yaw -90deg): a sound at +z (south) is on the right-hand side? facing +X, right = +Z
  const flesh = calls[3];
  check('audio: pan sign (source at -z while facing +x = left)', flesh.pan < -0.5, JSON.stringify(flesh));

  // ---- warnings
  const warns = await page.evaluate(() => window.__demo.warnings());
  console.log('host warnings:', JSON.stringify(warns));
  check('exactly one warning per missing key (texture + visual)', warns.length === 2 && warns.some((w) => w.includes('does-not-exist')) && warns.some((w) => w.includes('"nope"')));

  // ---- cleanup
  const afterStop = await page.evaluate(() => window.__demo.stop());
  console.log('baseline', JSON.stringify(baseline), 'after stop', JSON.stringify(afterStop));
  check('stop: roots 0', afterStop.roots === 0);
  check('stop: assets 0', afterStop.assets === 0);
  check('stop: geometries/textures at baseline', afterStop.geometries === baseline.geometries && afterStop.textures === baseline.textures);
  const cycles = [];
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__demo.apply(true));
    await at({ x: 15, y: 1.5, z: 11, yaw: 0, pitch: 0 }, 0.3);
    await page.evaluate(() => { window.__demo.impacts(); window.__demo.fire(); window.__demo.advance(0.2); });
    const live = await page.evaluate(() => window.__demo.stats());
    cycles.push({ live: { g: live.geometries, t: live.textures }, stop: await page.evaluate(() => window.__demo.stop()) });
  }
  console.log('cycles', JSON.stringify(cycles));
  check('5 cycles: no growth while live', cycles.every((c) => c.live.g === cycles[0].live.g && c.live.t === cycles[0].live.t));
  check('5 cycles: back to baseline after every stop', cycles.every((c) => c.stop.roots === 0 && c.stop.assets === 0 && c.stop.geometries === baseline.geometries && c.stop.textures === baseline.textures));

  // ---- headless: no Render service -> activate does nothing
  await page.evaluate(() => window.__demo.apply(false));
  const hs = await page.evaluate(() => { window.__demo.advance(0.2); return window.__demo.stats(); });
  const hst = await page.evaluate(() => window.__demo.stop());
  check('headless: nothing created', hs.geometries === baseline.geometries && hst.roots === 0 && hst.assets === 0);

  await browser.close();
  console.log(bad ? `FAIL: ${bad} problems` : 'OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
