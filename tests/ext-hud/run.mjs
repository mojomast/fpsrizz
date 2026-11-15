// Browser verification for the Visor HUD plugin. Run after `node scripts/build.mjs`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { startStaticServer, launchBrowser } from '../../scripts/smoke-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = JSON.parse(readFileSync(resolve(root, 'src/content/presets/default.json'), 'utf8'));
const withVisor = { ...base, plugins: [...base.plugins, 'example/hud'], roles: { ...base.roles, 'sdk/hud': 'example/visor-hud' } };
const bothButCore = { ...base, plugins: [...base.plugins, 'example/hud'] };
const plain = base;

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text() + ' @ ' + m.location().url); });
page.on('response', (r) => { if (r.status() === 404) console.log('404:', r.url()); });
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(server.url + '?test');
  await page.waitForFunction(() => window.__bulkhead && window.__bulkhead.state === 'menu', null, { timeout: 30000 });

  const snap = () => page.evaluate(() => ({
    visor: document.querySelectorAll('.example-visor').length,
    core: document.querySelectorAll('.core-hud').length,
    visorStyle: [...document.querySelectorAll('style[data-owner]')].filter((s) => s.dataset.owner === 'example/hud').length,
    coreStyle: document.querySelectorAll('style[data-owner="core/hud"]').length,
    owners: document.querySelectorAll('style[data-owner]').length,
  }));
  const start = async (preset) => {
    const r = await page.evaluate((p) => window.__bulkhead.applyPreset(p), preset);
    if (!r.ok) throw new Error('applyPreset: ' + JSON.stringify(r));
    await page.evaluate(() => window.__bulkhead.play());
    await page.waitForTimeout(400);
  };
  const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);

  // (1) visor
  await start(withVisor);
  let s = await snap();
  check(s.visor === 1, 'visor root exists');
  check(s.core === 0, 'no core-hud root');
  check(s.coreStyle === 0, 'no core/hud style');
  check(s.visorStyle >= 1, 'visor style present (data-owner example/hud)');
  await page.waitForTimeout(800);
  const hpBefore = await text('.visor-hp');
  await page.evaluate(() => {
    const ses = window.__bulkhead.host.session;
    const id = ses.entities.first({ id: 'sdk/player' });
    const pid = typeof id === 'object' ? id.id ?? id[0] : id;
    ses.entities.get(pid, { id: 'sdk/health' }).hp = 37;
    const inv = ses.entities.get(pid, { id: 'sdk/inventory' });
    const t = Object.keys(inv.ammo)[0];
    if (t) inv.ammo[t] = 12;
  });
  await page.waitForTimeout(300);
  const hpAfter = await text('.visor-hp');
  const ammoAfter = await text('.visor-ammo span');
  check(hpAfter === '37', `health text updates (${hpBefore} -> ${hpAfter})`);
  check(ammoAfter === '12' || ammoAfter === '∞', `ammo text (${ammoAfter})`);
  console.log('weapon:', await text('.visor-weapon'), '| objective:', await text('.visor-objective'), '| heading:', await text('.visor-heading'));
  // compass changes when turning
  const h0 = await text('.visor-heading');
  await page.evaluate(() => {
    const ses = window.__bulkhead.host.session;
    const id = ses.entities.first({ id: 'sdk/player' });
    const pid = typeof id === 'object' ? id.id ?? id[0] : id;
    ses.entities.get(pid, { id: 'sdk/transform' }).yaw += 1;
  });
  await page.waitForTimeout(300);
  const h1 = await text('.visor-heading');
  console.log('heading', h0, '->', h1);
  await page.evaluate(() => {
    const ses = window.__bulkhead.host.session;
    const id = ses.entities.first({ id: 'sdk/player' });
    const pid = typeof id === 'object' ? id.id ?? id[0] : id;
    ses.entities.get(pid, { id: 'sdk/transform' }).yaw -= 1;
    ses.entities.get(pid, { id: 'sdk/health' }).hp = 100;
  });
  // no idle DOM writes
  const mutations = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const mo = new MutationObserver((l) => { n += l.length; });
    mo.observe(document.querySelector('.example-visor'), { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res(n); }, 1500);
  }));
  check(mutations === 0, `no DOM writes when idle (${mutations})`);
  await page.screenshot({ path: resolve(root, '.smoke/ext-hud-visor.png') });
  // damage flash
  await page.evaluate(() => {
    const ses = window.__bulkhead.host.session;
    const id = ses.entities.first({ id: 'sdk/player' });
    const pid = typeof id === 'object' ? id.id ?? id[0] : id;
    ses.entities.get(pid, { id: 'sdk/health' }).hp = 22;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(root, '.smoke/ext-hud-visor-low.png') });

  // (2) default
  await start(plain);
  s = await snap();
  check(s.visor === 0 && s.visorStyle === 0, 'visor root and style gone on default preset');
  check(s.core === 1, 'core-hud root back');
  await page.screenshot({ path: resolve(root, '.smoke/ext-hud-default.png') });

  // (3) switching
  const owners0 = (await snap()).owners;
  let grew = false;
  for (let i = 0; i < 5; i++) {
    await start(withVisor);
    s = await snap();
    check(s.visor + s.core === 1 && s.visor === 1, `switch ${i}: only visor`);
    if (s.owners > owners0 + 1) grew = true;
    await start(plain);
    s = await snap();
    check(s.visor + s.core === 1 && s.core === 1, `switch ${i}: only core`);
    if (s.owners > owners0) grew = true;
  }
  check(!grew, 'style[data-owner] count does not grow');

  // (4) both enabled, role = core
  await start(bothButCore);
  s = await snap();
  check(s.visor === 0 && s.core === 1, 'visor never mounts when role is core/hud');

  check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
} catch (e) {
  failures++;
  console.error('ERROR', e);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
