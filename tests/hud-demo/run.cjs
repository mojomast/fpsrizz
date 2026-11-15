// Bundles demo.ts, drives the HUD in headless Chrome, asserts behaviour, saves screenshots to .smoke/hud-*.png
const path = require('path'), fs = require('fs');
const esbuild = require('/opt/npm-tools/node_modules/esbuild');
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const out = path.join(root, '.smoke/hud-demo-build');
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(__dirname, 'demo.ts')], bundle: true, outfile: path.join(out, 'demo.js'), format: 'iife', target: 'es2022', loader: { '.json': 'json' } });
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;height:100%;overflow:hidden;background:#000}
body[data-bg=grey]{background:linear-gradient(135deg,#2a2d31,#6b6f75 50%,#3a3d42)}
body[data-bg=bright]{background:linear-gradient(180deg,#fff6d8,#e8e0c8 60%,#ffffff)}
#hud,#overlay{position:fixed;inset:0;pointer-events:none}
</style><body data-bg=grey><div id=hud></div><div id=overlay></div><script src="demo.js"></script>`);
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  let bad = 0;
  const check = (n, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', n, extra); if (!ok) bad++; };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { console.log('[page]', m.type(), m.text()); bad++; } });
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); bad++; });
  await page.goto('file://' + path.join(out, 'index.html'));
  await page.waitForFunction(() => window.__ready);
  const shot = (n) => page.screenshot({ path: path.join(root, '.smoke', `hud-${n}.png`) });
  const txt = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
  const wait = (ms) => page.waitForTimeout(ms);
  fs.mkdirSync(path.join(root, '.smoke'), { recursive: true });
  const ev = (f, ...a) => (a.length === 1 && Array.isArray(a[0]) && (a = a[0]), page.evaluate(([f, a]) => window.__hooks[f](...a), [f, a]));

  // ---- headless-ish: preset without the HUD role leaves nothing
  await ev('start', false);
  check('no HUD -> hud layer empty', await page.evaluate(() => document.getElementById('hud').children.length === 0));
  await ev('stop');

  await ev('start', true);
  await ev('objective', 'Find the red keycard and reach the reactor');
  await ev('status', 'k', 'Kills', '3/12');
  await ev('status', 's', 'Score', '1200');
  await ev('giveWeapons', [['demo/fist', 'demo/pistol', 'demo/shotgun']]);
  await wait(200);
  check('health shows 100', (await txt('.core-hud-health .core-hud-num')) === '100');
  check('weapon name', (await txt('.core-hud-weapon')) === 'Rivet Pistol');
  check('ammo 48', (await txt('.core-hud-ammo .core-hud-num')) === '48');
  check('objective text', (await txt('.core-hud-objtext')) === 'Find the red keycard and reach the reactor');
  const stats = await page.evaluate(() => [...document.querySelectorAll('.core-hud-stat')].map((e) => e.textContent));
  check('status lines in order', JSON.stringify(stats) === '["Kills3/12","Score1200"]', JSON.stringify(stats));
  check('3 weapon slots, sorted', await page.evaluate(() => [...document.querySelectorAll('.core-hud-slot')].map((e) => e.firstChild.textContent).join() === '1,2,3'));
  check('current slot highlighted', await page.evaluate(() => document.querySelector('.core-hud-slot.core-hud-cur b').textContent === '2'));
  check('infinite slot glyph', await page.evaluate(() => document.querySelector('.core-hud-slot i').textContent === '∞'));
  await shot('normal');
  await ev('bg', 'bright'); await wait(100); await shot('normal-bright'); await ev('bg', 'grey');

  // state changes
  await ev('setWeapon', 'demo/fist'); await wait(100);
  check('infinity ammo for crowbar', (await txt('.core-hud-ammo .core-hud-num')) === '∞');
  await ev('setWeapon', 'demo/shotgun'); await wait(100);
  check('shotgun 0 ammo', (await txt('.core-hud-ammo .core-hud-num')) === '0');
  await ev('setAmmo', 'demo/shells', 12); await ev('setWeapon', 'demo/pistol'); await wait(100);
  check('slot ammo for shotgun 12', await page.evaluate(() => [...document.querySelectorAll('.core-hud-slot i')].map((e) => e.textContent).join() === '∞,48,12'));
  await ev('dry'); await wait(100);
  check('dry notice', (await txt('.core-hud-notice')) === 'OUT OF AMMO');
  check('notice visible class', await page.evaluate(() => document.querySelector('.core-hud-notice').classList.contains('core-hud-show')));
  await ev('useFailed'); await wait(50);
  check('locked notice', (await txt('.core-hud-notice')).startsWith('LOCKED'));
  await ev('pickup', ['Shells +8', 12345]); await wait(50);
  check('pickup by other ignored', (await txt('.core-hud-notice')).startsWith('LOCKED'));
  await ev('pickup', ['Armor shard']); await wait(50);
  check('pickup notice', (await txt('.core-hud-notice')) === 'Armor shard');
  await wait(2700);
  check('notice hides after 2.5s', await page.evaluate(() => !document.querySelector('.core-hud-notice').classList.contains('core-hud-show')));
  await ev('notify', ['Door unlocked']); await wait(100);
  check('flow notice', (await txt('.core-hud-notice')) === 'Door unlocked');
  await ev('pause', [true]);
  await ev('notify', ['Door unlocked']); await ev('advance', [2]);
  check('same-text notice re-triggers', await page.evaluate(() => document.querySelector('.core-hud-notice').classList.contains('core-hud-show')));
  await ev('pause', [false]);

  // fire kick
  await ev('fire'); await wait(40);
  check('crosshair kick class', await page.evaluate(() => document.querySelector('.core-hud').classList.contains('core-hud-fire')));
  await wait(300);
  check('crosshair kick ends', await page.evaluate(() => !document.querySelector('.core-hud').classList.contains('core-hud-fire')));

  // damage
  await ev('damageOther', [50]); await wait(50);
  check('damage to others ignored', await page.evaluate(() => getComputedStyle(document.querySelector('.core-hud-vignette')).opacity === '0'));
  await ev('setHealth', [22]);
  await ev('pause', [true]);
  await ev('damage', [30]); await ev('advance', [3]);
  check('vignette flashes', await page.evaluate(() => +document.querySelector('.core-hud-vignette').style.opacity > 0.5));
  await page.evaluate(() => document.querySelectorAll('.core-hud-vignette').forEach(() => 0));
  await shot('damage-low');
  await ev('advance', [40]);
  check('vignette fades', await page.evaluate(() => +document.querySelector('.core-hud-vignette').style.opacity === 0));
  check('health 22 critical', (await txt('.core-hud-health .core-hud-num')) === '22' && await page.evaluate(() => document.querySelector('.core-hud').classList.contains('core-hud-crit')));
  check('low pulse class', await page.evaluate(() => document.querySelector('.core-hud').classList.contains('core-hud-low')));
  await ev('pause', [false]);

  // notice + status screenshot
  await ev('setHealth', [64]);
  await ev('notify', ['Reactor door unlocked']);
  await ev('status', 't', 'Time', '02:41');
  await wait(450);
  await shot('notice');
  await ev('bg', 'bright'); await wait(100); await shot('notice-bright'); await ev('bg', 'grey');

  // dead
  await ev('setHealth', [0, true]); await wait(150);
  check('dead class', await page.evaluate(() => document.querySelector('.core-hud').classList.contains('core-hud-dead')));
  check('ammo hidden when dead', await page.evaluate(() => getComputedStyle(document.querySelector('.core-hud-ammo')).display === 'none'));
  check('crosshair hidden when dead', await page.evaluate(() => getComputedStyle(document.querySelector('.core-hud-cross')).display === 'none'));
  await shot('dead');
  await ev('setHealth', [100]); await wait(100);

  // idle mutations
  await ev('pause', [true]);
  await ev('advance', [300]); // let every timer (notice, fade, kick) expire
  await wait(100);
  const muts = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const mo = new MutationObserver((l) => { n += l.length; });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    window.__hooks.advance(120);
    setTimeout(() => { mo.takeRecords().forEach(() => n++); mo.disconnect(); res(n); }, 50);
  }));
  check('120 idle frames -> 0 DOM mutations', muts === 0, `(${muts})`);
  await ev('pause', [false]);

  // cleanup
  await ev('stop');
  check('stop: hud layer empty', await page.evaluate(() => document.getElementById('hud').children.length === 0));
  check('stop: no style', await page.evaluate(() => document.querySelectorAll('style[data-owner="core/hud"]').length === 0));
  for (let i = 0; i < 5; i++) { await ev('start', true); await wait(30); await ev('stop'); }
  check('5x apply/stop leaves nothing', await page.evaluate(() => document.getElementById('hud').children.length === 0 && document.querySelectorAll('style[data-owner="core/hud"]').length === 0));

  // config: no crosshair
  await ev('start', true, { 'core/hud': { showCrosshair: false } }); await wait(100);
  check('showCrosshair=false hides crosshair', await page.evaluate(() => getComputedStyle(document.querySelector('.core-hud-cross')).display === 'none'));
  await ev('stop');

  // small viewport
  await ev('start', true);
  await ev('objective', 'Find the red keycard and reach the reactor');
  await ev('status', 'k', 'Kills', '3/12'); await ev('notify', ['Reactor door unlocked']);
  await ev('giveWeapons', [['demo/fist', 'demo/pistol', 'demo/shotgun']]);
  await page.setViewportSize({ width: 640, height: 480 }); await wait(500);
  await shot('640x480');
  await page.setViewportSize({ width: 1920, height: 1080 }); await wait(500);
  await shot('1920x1080');
  await ev('stop');

  await browser.close();
  console.log(bad ? `FAIL: ${bad} problems` : 'OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
