// Production Cinder acceptance: npm run build, then node tests/cinder-demo/run.mjs.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const out = resolve(root, '.smoke'); mkdirSync(out, { recursive: true });
const server = await startStaticServer(resolve(root, 'dist'));
const browser = await launchBrowser();
const report = { passed: [], errors: [], screenshots: [] };
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`); });
const pass = text => { report.passed.push(text); console.log(`PASS ${text}`); };
const shot = async name => { const file = `cinder-${name}.png`; await page.screenshot({ path: resolve(out, file), timeout: 60000 }); report.screenshots.push(file); };
const phase = value => page.waitForFunction(value => window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state().phase === value, value, { timeout: 90000 });
const state = () => page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state());
const frames = () => page.evaluate(() => new Promise(done => { let n = 3; const frame = () => --n ? requestAnimationFrame(frame) : done(); requestAnimationFrame(frame); }));
const kill = kind => page.evaluate(kind => {
  const s = window.__bulkhead.host.session, player = s.entities.first({ id: 'sdk/player' });
  const combat = s.services.get({ id: 'sdk/combat' });
  const ids = [];
  s.entities.each({ id: 'sdk/enemy' }, (id, enemy) => {
    if (s.entities.get(id, { id: 'sdk/health' })?.dead) return;
    if (kind === 'boss' ? /warden|keeper/.test(enemy.def) : !/warden|keeper/.test(enemy.def)) ids.push(id);
  });
  for (const id of ids.slice(0, kind === 'boss' ? 1 : 3)) combat.damage({ target: id, source: player, amount: 100000, kind: 'test', x: 0, z: 0 });
  s.scheduler.runTick();
}, kind);
const descend = () => page.evaluate(() => {
  const s = window.__bulkhead.host.session, game = s.services.get({ id: 'cinder/run' });
  const depth = game.state().depth;
  const exit = s.services.get({ id: 'sdk/world' }).desc.triggers.find(t => t.tags.includes('dungeon-exit') && t.tags.includes(`dungeon-depth-${depth}`));
  const p = s.entities.first({ id: 'sdk/player' }), t = s.entities.get(p, { id: 'sdk/transform' });
  t.x = t.prevX = exit.x; t.z = t.prevZ = exit.z;
  s.scheduler.runTick(); s.scheduler.runTick();
  return game.state();
});
try {
  await page.goto(`${server.url}?test&preset=cinder/vault`);
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 90000 });
  await page.getByRole('button', { name: /^play$/i }).click();
  await phase('playing'); await frames();
  const map = await page.evaluate(() => { const w = window.__bulkhead.host.session.services.get({ id: 'sdk/world' }).desc; return { width: w.width, height: w.height, rooms: w.spawns.filter(s => s.tags.includes('dungeon-room')).length }; });
  assert.deepEqual(map, { width: 94, height: 30, rooms: 24 });
  let s = await state();
  assert.equal(s.depth, 1); assert.equal(s.depths, 3); assert.equal(s.level, 1); assert.equal(s.phase, 'playing');
  assert.equal(s.offers.length, 0); assert.equal(s.boss?.role, 'warden');
  assert.equal(await page.locator('.cinder-boon-tray').isVisible(), false);
  await shot('dungeon-start');
  await page.setViewportSize({ width: 390, height: 844 }); await frames(); await shot('dungeon-start-phone');
  await page.setViewportSize({ width: 1280, height: 800 }); await frames();
  // The normal controller and weapon pipeline still run while the level-up tray is open.
  const moved = await page.evaluate(() => {
    const s = window.__bulkhead.host.session, p = s.entities.first({ id: 'sdk/player' });
    const before = s.entities.get(p, { id: 'sdk/transform' }).z;
    window.__bulkhead.inputCore.press('core/move-forward');
    for (let i = 0; i < 15; i++) s.scheduler.runTick();
    window.__bulkhead.inputCore.release('core/move-forward');
    return { before, after: s.entities.get(p, { id: 'sdk/transform' }).z };
  });
  assert.notEqual(moved.before, moved.after);
  const fired = await page.evaluate(() => {
    const s = window.__bulkhead.host.session, p = s.entities.first({ id: 'sdk/player' });
    const inv = s.entities.get(p, { id: 'sdk/inventory' }), runtime = s.entities.get(p, { id: 'sdk/weapon-runtime' });
    const before = runtime.loaded[inv.current];
    window.__bulkhead.inputCore.press('core/fire'); s.scheduler.runTick(); window.__bulkhead.inputCore.release('core/fire');
    return { before, after: runtime.loaded[inv.current] };
  });
  assert.equal(fired.after, fired.before - 1);
  pass('three-wing generated dungeon starts in live play; controller, firing and responsive HUD work');
  await kill('regular');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state().offers.length > 0);
  await frames();
  s = await state();
  assert.equal(s.phase, 'playing'); assert.ok(s.level >= 2); assert.ok(s.remaining > 0);
  assert.equal(s.offers.length, 3);
  await page.waitForFunction(() => [...document.querySelectorAll('.cinder-boon img')].every(i => i.complete && i.naturalWidth > 0));
  await shot('level-up');
  await page.setViewportSize({ width: 390, height: 844 }); await frames(); await shot('level-up-phone');
  const boxes = await page.locator('.cinder-boon').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
  assert.ok(boxes.every(b => b.right <= 390 && b.bottom <= 844 && b.left >= 0 && b.top >= 0));
  await page.setViewportSize({ width: 1280, height: 800 }); await frames();
  const beforeChoice = s;
  const chosen = beforeChoice.offers[0];
  await page.keyboard.press('Digit7');
  await page.waitForFunction(epoch => {
    const s = window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state();
    return s.offers.length === 0 || s.offer !== epoch;
  }, beforeChoice.offer);
  await frames();
  s = await state();
  assert.equal(s.phase, 'playing');
  if (chosen.kind === 'weapon') assert.ok(s.arsenal.some(w => w.id === chosen.id));
  else assert.ok(s.boons.some(b => b.id === chosen.id));
  assert.equal(await page.locator('.cinder-boon-tray').isVisible(), s.offers.length > 0);
  pass('level-up happens inside the live floor; boon tray is keyboard-selectable and does not enter a camp/draft screen');
  await kill('boss');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state().portal);
  await frames();
  s = await state(); assert.equal(s.boss, null); assert.equal(s.target?.kind, 'exit');
  s = await descend();
  assert.equal(s.depth, 2); assert.equal(s.depthTitle, 'The Hollow Court'); assert.equal(s.portal, false); assert.ok(s.remaining >= 8);
  await frames(); await shot('depth-two');
  await page.setViewportSize({ width: 390, height: 844 }); await frames(); await shot('depth-two-phone');
  await page.setViewportSize({ width: 1280, height: 800 }); await frames();
  pass('warden clear opens the descent; stepping on it populates the second large depth without a loading menu');
  await kill('boss');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state().portal);
  s = await descend();
  assert.equal(s.depth, 3); assert.equal(s.depthTitle, 'The Cinder Sanctum');
  await kill('boss');
  await page.waitForFunction(() => window.__bulkhead.host.session.services.get({ id: 'cinder/run' }).state().phase === 'victory', null, { timeout: 90000 });
  await page.waitForFunction(() => window.__bulkhead.state === 'ended', null, { timeout: 90000 }); await frames(); await shot('victory');
  const result = await page.evaluate(() => window.__bulkhead.host.session.services.get({ id: 'sdk/flow' }).result);
  assert.equal(result?.outcome, 'victory');
  pass('all three depths and the Cinder Keeper complete the run; level and depth stats reach the victory screen');
  await page.getByRole('button', { name: /^restart$/i }).click(); await phase('playing'); await frames();
  s = await state();
  assert.equal(s.depth, 1); assert.equal(s.level, 1); assert.equal(s.boons.length, 0);
  assert.deepEqual(s.arsenal.map(w => w.id), ['cinder/thornwake', 'cinder/cinderkey']);
  assert.equal(await page.locator('.cinder-ui').count(), 1);
  pass('restart resets the run, level, boons and arsenal while keeping one owned HUD');
  assert.deepEqual(report.errors, []); pass('no browser console, page or asset-network errors');
} catch (error) {
  console.error(error.stack ?? error); report.errors.push(String(error)); process.exitCode = 1;
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(resolve(out, 'cinder-report.json'), JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
}
