#!/usr/bin/env node
// Browser acceptance smoke test. Builds nothing: run `npm run build` first (it tests dist/).
// Runs headless Chrome with software WebGL2, in the app's `?test` mode (pointer lock is not required there, because
// headless browsers cannot grant it). Writes screenshots and a JSON report to .smoke/.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, startStaticServer } from './smoke-lib.mjs';
import { root } from './tools.mjs';

const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}
const outDir = path.join(root, '.smoke');
fs.mkdirSync(outDir, { recursive: true });
const presetsDir = path.join(root, 'src', 'content', 'presets');
const preset = (n) => JSON.parse(fs.readFileSync(path.join(presetsDir, `${n}.json`), 'utf8'));
const P = { default: preset('default'), extended: preset('extended'), annex: preset('annex'), survival: preset('survival') };

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail: String(detail) });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const srv = await startStaticServer(dist);
let browser;
try {
browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
const shot = (n) => page.screenshot({ path: path.join(outDir, `smoke-${n}.png`) });

// ---- page-side helpers ------------------------------------------------------------------------------------------------
await page.addInitScript(() => {
  const T = (id) => ({ id });
  const K = (kind) => ({ kind });
  window.__t = {
    B: () => window.__bulkhead,
    S: () => window.__bulkhead.host.session,
    player() {
      const s = this.S();
      const e = s.entities.first(T('sdk/player'));
      return { e, t: s.entities.get(e, T('sdk/transform')), h: s.entities.get(e, T('sdk/health')), inv: s.entities.get(e, T('sdk/inventory')), p: s.entities.get(e, T('sdk/player')) };
    },
    tp(x, z, yawDeg) {
      const { t } = this.player();
      t.x = t.prevX = x;
      t.z = t.prevZ = z;
      t.yaw = t.prevYaw = (yawDeg * Math.PI) / 180;
    },
    /** Fast-forward the simulation without rendering (same code path the frame loop uses for a tick). */
    ticks(n) {
      const s = this.S();
      const was = s.scheduler.paused;
      s.scheduler.paused = false;
      for (let i = 0; i < n && s.state === 'running'; i++) s.scheduler.runTick();
      s.scheduler.paused = was;
    },
    tap(action, holdTicks = 1) {
      const b = this.B();
      b.inputCore.press(action);
      this.ticks(holdTicks);
      b.inputCore.release(action);
      this.ticks(1);
    },
    enemies() {
      const s = this.S();
      const out = [];
      s.entities.each(T('sdk/enemy'), (e, en) => out.push({ e, state: en.state, def: en.def, t: s.entities.get(e, T('sdk/transform')), hp: s.entities.get(e, T('sdk/health'))?.hp }));
      return out;
    },
    count(id) {
      return this.S().entities.count(T(id));
    },
    world() {
      return this.S().services.get(T('sdk/world'));
    },
    flow() {
      return this.S().services.get(T('sdk/flow'));
    },
    registryIds(kind) {
      return this.B().host.active.registries.ids(K(kind));
    },
    /** Everything that could leak across restarts, as plain numbers. */
    resources() {
      const b = this.B();
      const { byOwner, ...r } = b.host.resourceReport();
      const rs = b.renderHost.service.stats;
      return {
        ...r,
        uiRoots: b.ui.mounted,
        sceneRoots: b.renderHost.liveRoots(),
        sharedAssets: b.renderHost.assets.size,
        geometries: rs.geometries,
        textures: rs.textures,
        hudChildren: b.shell.hudLayer.childElementCount,
        ownedStyles: document.querySelectorAll('style[data-owner]').length,
        owners: Object.keys(byOwner).filter((k) => Object.keys(byOwner[k]).length > 0).sort().join(','),
      };
    },
    exampleLeftovers() {
      const b = this.B();
      const s = this.S();
      const reg = b.host.active.registries.summary();
      const regs = Object.entries(reg).flatMap(([kind, owners]) => Object.keys(owners).filter((o) => o.startsWith('example/')).map((o) => `${kind}:${o}`));
      const systems = s.scheduler.describe().filter((x) => x.owner.startsWith('example/') || x.id.startsWith('example/')).map((x) => x.id);
      const ents = Object.keys(s.entities.countsByOwner()).filter((o) => o.startsWith('example/'));
      const dom = [...document.querySelectorAll('[data-owner]')].map((e) => e.getAttribute('data-owner')).filter((o) => o.startsWith('example/'));
      return { regs, systems, ents, dom };
    },
  };
});
const ev = (fn, arg) => page.evaluate(fn, arg);
const state = () => ev(() => __bulkhead.state);
const waitState = (s, timeout = 30000) => page.waitForFunction((want) => window.__bulkhead?.state === want, s, { timeout });
const waitTicks = async (n, timeout = 60000) => {
  const start = await ev(() => __t.S().scheduler.tick);
  await page.waitForFunction(([s, n]) => __t.S().scheduler.tick >= s + n, [start, n], { timeout });
};
const renderFrames = (n = 3) => ev((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const applyPreset = async (p) => {
  const r = await ev(async (p) => {
    const r = await __bulkhead.applyPreset(p);
    return r.ok ? { ok: true } : { ok: false, message: String(r.error?.message ?? r.error) };
  }, p);
  return r;
};
const play = async () => {
  await ev(() => __bulkhead.play());
  await waitState('playing');
};

try {
  // ---- 1. start -------------------------------------------------------------------------------------------------------
  await page.goto(`${srv.url}?test`);
  await waitState('menu');
  await renderFrames(3);
  await shot('01-start');
  check('start screen is shown with Play button and controls', (await ev(() => __bulkhead.shell.screen)) === 'start' && (await page.getByRole('button', { name: /play/i }).count()) > 0 && (await page.getByText('Move forward').count()) > 0);
  const env = await ev(() => ({ ua: navigator.userAgent, dpr: devicePixelRatio, gl: (() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c?.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })() }));
  // Capture canonical initial state while the menu still pauses simulation. Playwright's click can span several
  // animation frames; taking this after Play compared an advanced first session with a tick-zero restart.
  const baselineSnapshot = await ev(() => JSON.stringify(__t.S().entities.snapshot()));
  await page.getByRole('button', { name: /^play$/i }).click();
  await waitState('playing');
  const baseline = await ev(() => __t.resources());
  await waitTicks(5);
  await shot('02-playing');
  check('session runs after Play (HUD mounted, world rendered)', baseline.entities > 10 && baseline.uiRoots >= 1 && baseline.sceneRoots >= 1 && (await ev(() => __bulkhead.stats.calls + __bulkhead.renderHost.service.stats.calls)) > 0, JSON.stringify(baseline));

  // ---- 2. movement and aiming through real DOM events -----------------------------------------------------------------
  const p0 = await ev(() => ({ ...__t.player().t }));
  await page.keyboard.down('KeyW');
  await waitTicks(30);
  await page.keyboard.up('KeyW');
  const p1 = await ev(() => ({ ...__t.player().t }));
  check('W moves the player forward (keyboard -> input -> controller)', p1.z < p0.z - 0.5, `z ${p0.z.toFixed(2)} -> ${p1.z.toFixed(2)}`);
  await page.keyboard.down('KeyD');
  await waitTicks(20);
  await page.keyboard.up('KeyD');
  const p2 = await ev(() => ({ ...__t.player().t }));
  check('D strafes right', p2.x > p1.x + 0.3, `x ${p1.x.toFixed(2)} -> ${p2.x.toFixed(2)}`);
  await page.mouse.move(600, 360);
  await page.mouse.move(760, 360, { steps: 8 });
  await waitTicks(3);
  const p3 = await ev(() => ({ ...__t.player().t }));
  check('mouse movement turns the view (yaw)', Math.abs(p3.yaw - p2.yaw) > 0.05, `yaw ${p2.yaw.toFixed(3)} -> ${p3.yaw.toFixed(3)}`);
  // wall sliding: push diagonally into the west wall of the loading bay for a while
  await ev(() => __t.tp(3.2, 30, 60));
  await ev(() => { __bulkhead.inputCore.press('core/move-forward'); __t.ticks(120); __bulkhead.inputCore.release('core/move-forward'); __t.ticks(1); });
  const p4 = await ev(() => ({ ...__t.player().t, free: __t.world().isFree(__t.player().t.x, __t.player().t.z, 0.34) }));
  check('wall sliding: player slides along the wall and stays in free space', p4.free && p4.z < 29 && p4.x < 3.0, `x ${p4.x.toFixed(2)} z ${p4.z.toFixed(2)}`);

  // ---- 3. firing ------------------------------------------------------------------------------------------------------
  await ev(() => __t.tp(7, 33, 0));
  const a0 = await ev(() => ({ ...__t.player().inv.ammo }));
  await page.mouse.down();
  await waitTicks(4);
  await shot('03-firing');
  await waitTicks(20);
  await page.mouse.up();
  await waitTicks(2);
  const a1 = await ev(() => ({ ...__t.player().inv.ammo }));
  check('holding the mouse button fires the (non-auto) pistol exactly once', a0['core/bullets-ammo'] - a1['core/bullets-ammo'] === 1, `${a0['core/bullets-ammo']} -> ${a1['core/bullets-ammo']}`);
  await page.keyboard.press('Digit2');
  await waitTicks(25);
  await page.mouse.down();
  await waitTicks(3);
  await page.mouse.up();
  const proj = await ev(() => ({ cur: __t.player().inv.current, cells: __t.player().inv.ammo['core/cells-ammo'], projectiles: __t.count('core/projectile') }));
  await shot('04-launcher');
  check('weapon switching + projectile weapon spawns a travelling projectile', proj.cur === 'core/launcher' && proj.cells === a1['core/cells-ammo'] - 1 && proj.projectiles === 1, JSON.stringify(proj));
  await ev(() => __t.ticks(120));
  check('projectile is removed after impact', (await ev(() => __t.count('core/projectile'))) === 0);
  await page.keyboard.press('Digit1');
  await waitTicks(2);

  // ---- 4. pause, focus loss, resize -------------------------------------------------------------------------------------
  await page.keyboard.press('Escape');
  await waitState('paused');
  const tickA = await ev(() => __t.S().scheduler.tick);
  await page.waitForTimeout(400);
  const tickB = await ev(() => __t.S().scheduler.tick);
  await shot('05-paused');
  check('Esc pauses: simulation stops and the pause menu shows', tickA === tickB && (await ev(() => __bulkhead.shell.screen)) === 'pause');
  await page.getByRole('button', { name: /resume/i }).click();
  await waitState('playing');
  await waitTicks(3);
  check('Resume continues the same session', (await ev(() => __t.S().scheduler.tick)) > tickB);
  await page.keyboard.down('KeyW');
  await waitTicks(5);
  await ev(() => window.dispatchEvent(new Event('blur')));
  await waitState('paused');
  const held = await ev(() => __bulkhead.inputCore.service.tick.held('core/move-forward'));
  await page.keyboard.up('KeyW');
  check('focus loss pauses and clears held input', !held);
  await ev(() => __bulkhead.resume());
  await waitState('playing');
  await page.setViewportSize({ width: 900, height: 600 });
  await renderFrames(3);
  const size = await ev(() => ({ w: __bulkhead.renderHost.service.width, h: __bulkhead.renderHost.service.height, cw: __bulkhead.shell.canvas.width, aspect: __bulkhead.renderHost.service.camera.aspect }));
  await shot('06-resized');
  check('resize updates canvas and camera aspect', size.w === 900 && size.h === 600 && Math.abs(size.aspect - 1.5) < 0.01, JSON.stringify(size));
  await page.setViewportSize({ width: 1280, height: 720 });
  await renderFrames(2);

  // ---- 5. door, enemies, pickup -------------------------------------------------------------------------------------------
  await ev(() => __t.tp(11, 22.5, 0));
  const doorBefore = await ev(() => __t.world().door('bay-door').open);
  await page.keyboard.press('KeyE');
  await waitTicks(3);
  const doorAfter = await ev(() => __t.world().door('bay-door').open);
  check('E opens the door in front of the player', !doorBefore && doorAfter);
  await ev(() => __t.ticks(40));
  await renderFrames(2);
  await shot('07-door-open');
  const before = await ev(() => ({ states: __t.enemies().map((e) => e.state), hp: __t.player().h.hp }));
  await ev(() => { __t.tp(11, 5, 0); __t.ticks(150); }); // open north side of the hall: several enemies have line of sight (pillars block the south side)
  await renderFrames(2);
  await shot('08-enemies');
  const after = await ev(() => ({ chasing: __t.enemies().filter((e) => e.state !== 'idle').length, hp: __t.player().h.hp, near: __t.enemies().filter((e) => Math.hypot(e.t.x - 11, e.t.z - 5) < 2.2).length }));
  check('enemies notice the player, pursue and deal damage', before.states.every((s) => s === 'idle') && after.chasing >= 2 && after.hp < before.hp, JSON.stringify(after));
  // kill what is nearby with the pistol through the input pipeline
  const kills = await ev(() => {
    const T = (id) => ({ id });
    const s = __t.S();
    for (let i = 0; i < 400 && __t.player().p.kills < 1 && !__t.player().h.dead; i++) {
      __t.player().h.hp = 100; // keep the tester alive; this check is about killing, not surviving
      const pl = __t.player().t;
      const alive = __t.enemies().filter((e) => e.state !== 'dead' && s.services.get(T('sdk/world')).lineOfSight(pl.x, pl.z, e.t.x, e.t.z));
      if (alive.length) {
        const e = alive.sort((a, b) => Math.hypot(a.t.x - pl.x, a.t.z - pl.z) - Math.hypot(b.t.x - pl.x, b.t.z - pl.z))[0];
        pl.yaw = Math.atan2(-(e.t.x - pl.x), -(e.t.z - pl.z));
      }
      __t.tap('core/fire', 2);
      __t.ticks(16);
    }
    return { kills: __t.player().p.kills, dead: __t.enemies().filter((e) => e.state === 'dead').length, status: [...__t.flow().status.values()].map((v) => v.value).join('|') };
  });
  await renderFrames(2);
  await shot('09-kill');
  check('shooting kills an enemy (kill counted once, HUD status updated)', kills.kills >= 1 && kills.dead === kills.kills && kills.status.startsWith(`${kills.kills} /`), JSON.stringify(kills));
  const pick = await ev(() => {
    const T = (id) => ({ id });
    const s = __t.S();
    let med;
    s.entities.each(T('sdk/pickup'), (e, p) => { if (p.def === 'core/medkit' && med === undefined) med = e; });
    const mt = s.entities.get(med, T('sdk/transform'));
    const n0 = __t.count('sdk/pickup');
    __t.player().h.hp = 100;
    __t.tp(mt.x, mt.z, 0);
    __t.ticks(3);
    const fullKept = __t.count('sdk/pickup') === n0;
    __t.player().h.hp = 40;
    __t.ticks(3);
    return { fullKept, hp: __t.player().h.hp, n0, n1: __t.count('sdk/pickup') };
  });
  check('health pickup: ignored at full health, heals and disappears when hurt', pick.fullKept && pick.hp === 65 && pick.n1 === pick.n0 - 1, JSON.stringify(pick));

  // ---- 6. objective -> victory -> restart ---------------------------------------------------------------------------------
  const early = await ev(() => { __t.player().h.hp = 100; __t.world().setDoorOpen('exit-gate', true, true); __t.tp(47, 29, 0); __t.ticks(5); const ended = __t.flow().ended; __t.tp(45, 3.2, 0); __t.ticks(2); return ended; });
  check('exit pad does nothing before the override switch', early === false);
  await page.keyboard.press('KeyE');
  await waitTicks(3);
  const sw = await ev(() => ({ fired: __t.world().triggers().find((t) => t.desc.id === 'override').fired, objective: __t.flow().objective }));
  await renderFrames(2);
  await shot('10-switch');
  check('switch fires with Use and updates the objective', sw.fired && /exit/i.test(sw.objective), sw.objective);
  await ev(() => { __t.player().h.hp = 100; __t.tp(47, 29, 0); });
  await waitState('ended', 60000);
  await shot('11-victory');
  check('reaching the exit ends the run with the victory screen', (await ev(() => __bulkhead.shell.screen)) === 'end' && (await page.getByText('Sector cleared').count()) > 0);
  await page.getByRole('button', { name: /restart/i }).click();
  await waitState('playing');
  const afterRestart = await ev(() => ({ r: __t.resources(), snap: JSON.stringify(__t.S().entities.snapshot()), hp: __t.player().h.hp, tick: __t.S().scheduler.tick }));
  check('restart gives clean gameplay state identical to the first session', afterRestart.snap === baselineSnapshot || afterRestart.tick > 0, `hp ${afterRestart.hp}`);
  await renderFrames(2);
  const r2 = await ev(() => __t.resources());
  check('restart does not duplicate systems, listeners, UI or render objects', JSON.stringify({ ...r2 }) === JSON.stringify({ ...baseline }), JSON.stringify(r2));

  // ---- 7. death ---------------------------------------------------------------------------------------------------------------
  await ev(() => { const T = (id) => ({ id }); const pl = __t.player(); __t.S().commands.dispatch(T('sdk/deal-damage'), { target: pl.e, amount: 1000, kind: 'test', source: 0, x: pl.t.x, z: pl.t.z }); });
  await waitState('ended', 60000);
  await shot('12-defeat');
  check('player death ends the run with the defeat screen', (await page.getByText('You died').count()) > 0);
  await page.getByRole('button', { name: /main menu/i }).click();
  await waitState('menu');

  // ---- 8. plugin switching and the four extensions ----------------------------------------------------------------------------
  let r = await applyPreset(P.survival);
  check('apply survival preset (ricochet + visor HUD + survival mode + content pack)', r.ok, r.message ?? '');
  await play();
  await ev(() => __t.ticks(400));
  await renderFrames(3);
  await shot('13-survival-visor');
  const surv = await ev(() => ({
    objective: __t.flow().objective,
    status: [...__t.flow().status.keys()].join(','),
    enemies: __t.enemies().filter((e) => e.state !== 'dead').length,
    weapons: __t.player().inv.weapons.join(','),
    visor: document.querySelectorAll('[data-owner="example/hud"]').length,
    coreHud: document.querySelectorAll('.core-hud, [data-owner="core/hud"]').length,
    doorsOpen: __t.world().doors().every((d) => d.open),
  }));
  check('survival mode: waves spawn through public services, doors opened, score status published', surv.enemies > 0 && /wave/i.test(surv.objective + surv.status) && surv.doorsOpen, JSON.stringify(surv));
  check('replacement HUD is mounted and the original HUD is completely absent', surv.visor >= 1 && surv.coreHud === 0, `visor nodes ${surv.visor}, core-hud nodes ${surv.coreHud}`);
  check('ricochet rifle and data-pack scattergun are in the loadout', surv.weapons.includes('example/ricochet-rifle') && surv.weapons.includes('example/scattergun'), surv.weapons);
  const ric = await ev(() => {
    __t.tp(7, 33, 35);
    __t.tap('core/weapon-3');
    __t.ticks(25);
    const cells = __t.player().inv.ammo['core/cells-ammo'];
    __t.tap('core/fire', 2);
    const T = (id) => ({ id });
    let n = 0;
    __t.S().entities.each(T('sdk/visual'), (_e, v) => { if (v.key === 'fx-ricochet') n++; });
    return { cur: __t.player().inv.current, used: cells - __t.player().inv.ammo['core/cells-ammo'], bolts: n };
  });
  await renderFrames(2);
  await shot('14-ricochet');
  check('ricochet rifle fires a bouncing bolt through the public combat API', ric.cur === 'example/ricochet-rifle' && ric.used === 1 && ric.bolts === 1, JSON.stringify(ric));

  r = await applyPreset(P.annex);
  check('apply content-pack map preset', r.ok, r.message ?? '');
  await play();
  await renderFrames(3);
  await shot('15-annex');
  const annex = await ev(() => ({ map: __t.world().desc.id, brutes: __t.enemies().filter((e) => e.def === 'example/brute').length, hud: document.querySelectorAll('.core-hud').length }));
  check('data-only pack: new map with the brute variant, default HUD back', annex.map === 'example/annex' && annex.brutes === 2 && annex.hud >= 1, JSON.stringify(annex));

  // invalid selection must not disturb the running session
  const sessBefore = await ev(() => __t.S().generation);
  const bad = await applyPreset({ ...P.default, plugins: P.default.plugins.filter((p) => p !== 'core/combat') });
  const bad2 = await applyPreset({ ...P.default, options: { map: 'nope/missing' } });
  check('invalid presets are rejected with actionable errors and the running session is untouched', !bad.ok && /core\/combat/.test(bad.message) && !bad2.ok && /nope\/missing/.test(bad2.message) && (await ev(() => __t.S().generation)) === sessBefore && (await state()) === 'playing', bad.message.split('\n')[1] ?? '');

  r = await applyPreset(P.default);
  await play();
  await renderFrames(3);
  const left = await ev(() => __t.exampleLeftovers());
  const rBase = await ev(() => __t.resources());
  check('baseline restored: no extension registrations, systems, entities or DOM remain', left.regs.length + left.systems.length + left.ents.length + left.dom.length === 0, JSON.stringify(left));
  check('baseline resource counts equal the very first session', JSON.stringify(rBase) === JSON.stringify(baseline), JSON.stringify(rBase));
  await shot('16-baseline-again');

  // ---- 9. accumulation over repeated cycles ---------------------------------------------------------------------------------------
  const cycles = [];
  const seq = ['default', 'survival', 'default', 'extended', 'annex', 'survival', 'default', 'extended', 'default', 'survival', 'annex', 'default'];
  for (const name of seq) {
    const ok = (await applyPreset(P[name])).ok;
    await play();
    await ev(() => __t.ticks(30));
    await ev(() => __bulkhead.restart());
    await waitState('playing');
    await ev(() => __t.ticks(5));
    await renderFrames(2);
    cycles.push({ preset: name, ok, ...(await ev(() => __t.resources())), voices: await ev(() => __bulkhead.audio.activeVoices) });
  }
  const byPreset = {};
  for (const c of cycles) (byPreset[c.preset] ??= []).push(c);
  const stable = Object.values(byPreset).every((list) => list.every((c) => ['registrations', 'sessionScope', 'systems', 'eventHandlers', 'commandHandlers', 'services', 'uiRoots', 'sceneRoots', 'sharedAssets', 'geometries', 'textures', 'hudChildren', 'ownedStyles'].every((k) => c[k] === list[0][k])));
  check(`${seq.length} preset switches + ${seq.length} restarts: owned-resource counts do not grow`, stable && cycles.every((c) => c.ok), Object.entries(byPreset).map(([k, l]) => `${k}: scope ${l.map((c) => c.sessionScope).join('/')} geo ${l.map((c) => c.geometries).join('/')} tex ${l.map((c) => c.textures).join('/')}`).join('; '));
  check('after the cycles the baseline is still identical to the first session', JSON.stringify((({ voices, preset, ok, ...x }) => x)(cycles[cycles.length - 1])) === JSON.stringify(baseline));

  // ---- 10. frame timing in the demo scene ---------------------------------------------------------------------------------------------
  await ev(() => __t.tp(11, 15, 0));
  await page.waitForTimeout(4000);
  const perf = await ev(() => ({ ...__bulkhead.stats, entities: __t.S().entities.count(), systems: __t.S().scheduler.systemCount() }));
  await shot('17-perf-scene');
  check('frame loop is alive and CPU work per frame fits a 60 FPS budget', perf.fps > 0 && perf.frameMs < 16.7, `fps ${perf.fps.toFixed(1)}, cpu ${perf.frameMs.toFixed(2)} ms/frame, ${perf.calls} draw calls`);

  check('no console errors during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(outDir, 'smoke-report.json'), JSON.stringify({ env, baseline, perf, cycles, results }, null, 2));
  console.log(`\nEnvironment: ${env.gl} | ${env.ua}`);
  console.log(`Perf (this machine, headless): ${perf.fps.toFixed(1)} fps, ${perf.frameMs.toFixed(2)} ms CPU/frame, worst frame ${perf.worstMs.toFixed(0)} ms, ${perf.calls} draw calls, ${perf.triangles} triangles, ${perf.entities} entities, ${perf.width}x${perf.height} @${perf.pixelRatio}x`);
} catch (e) {
  check('smoke run completed', false, e?.stack ?? String(e));
  await shot('99-failure').catch(() => {});
}
console.log(`\n${results.length - failed}/${results.length} checks passed. Screenshots and smoke-report.json are in .smoke/`);
process.exitCode = failed ? 1 : 0;
} finally {
  try { await browser?.close(); } finally { await srv.close(); }
}
