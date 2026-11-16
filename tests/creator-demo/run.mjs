// Browser verification of the creator/developer panel against the real app bundle.
// Run: node tests/creator-demo/run.mjs   (screenshots -> .smoke/creator-*.png)
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveTool, root } from '../../scripts/tools.mjs';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';

const esbuild = resolveTool('esbuild');
const out = resolve(root, '.smoke');
const buildDir = resolve(out, 'creator-build');
rmSync(buildDir, { recursive: true, force: true });
mkdirSync(resolve(buildDir, 'assets'), { recursive: true });
await esbuild.build({
  entryPoints: [resolve(root, 'src/app/main.ts')],
  outfile: resolve(buildDir, 'assets/main.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  define: { __DEV__: 'false' },
  logLevel: 'warning',
});
copyFileSync(resolve(root, 'index.html'), resolve(buildDir, 'index.html'));

const server = await startStaticServer(buildDir);
let browser;
try {
const url = server.url ?? `http://127.0.0.1:${server.port ?? server.address?.().port}/`;
browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});
await page.addInitScript(() => {
  const live = new Set();
  const si = window.setInterval.bind(window);
  const ci = window.clearInterval.bind(window);
  window.setInterval = (...a) => {
    const id = si(...a);
    live.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    live.delete(id);
    return ci(id);
  };
  window.__liveIntervals = () => live.size;
});

let passed = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  passed++;
  console.log(`  ok - ${msg}`);
};
const shot = (name) => page.screenshot({ path: resolve(out, `creator-${name}.png`) });
const ev = (fn, arg) => page.evaluate(fn, arg);
const panel = '.creator-panel';

async function staleResults() {
  await ev(() => document.querySelectorAll('.creator-panel [data-result]').forEach((e) => (e.dataset.stale = '1')));
}
async function freshResult(timeout = 20000) {
  const h = await page.waitForSelector(`${panel} [data-result]:not([data-stale])`, { timeout });
  return (await h.textContent()) ?? '';
}
const tab = (id) => page.click(`${panel} .creator-tab[data-tab="${id}"]`);
const sessionId = () => ev(() => { const s = window.__bulkhead.host.session; window.__sessions ??= new WeakMap(); if (!window.__sessions.has(s)) { window.__sessN = (window.__sessN ?? 0) + 1; window.__sessions.set(s, window.__sessN); } return window.__sessions.get(s); });
async function pasteImport(text) {
  await tab('content');
  await page.fill(`${panel} textarea[data-fk="import-text"]`, text);
  await staleResults();
  await page.click(`${panel} [data-fk="import-pasted"]`);
  return freshResult();
}

const pack = {
  schema: 1,
  manifest: {
    schema: 1,
    id: 'test/pack',
    name: 'Test Pack',
    version: '1.0.0',
    kind: 'content',
    sdk: '^1.0.0',
    description: 'Creator panel verification pack',
    dependencies: { 'core/combat': '^1.0.0', 'core/content': '^1.0.0' },
  },
  content: [
    { kind: 'weapon', id: 'test/zapper', data: { name: 'Zapper', slot: 9, behavior: 'core/hitscan', params: { damage: 12, range: 40 }, ammoType: 'core/bullets-ammo', cooldown: 0.2, view: 'weapon-pistol', fireSound: 'pistol-fire', recoil: 0.3, flash: '#88ff88' } },
  ],
};

try {
  await page.goto(`${url}?test`);
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 60000 });
  const baseIntervals = await ev(() => window.__liveIntervals());

  console.log('open + plugin table');
  await page.keyboard.press('Backquote');
  await page.waitForSelector(`${panel}:not([hidden])`);
  ok(await ev(() => window.__bulkhead.creator.isOpen), 'Backquote opens the panel');
  ok((await ev(() => window.__liveIntervals())) === baseIntervals, 'no interval while the Plugins tab is shown');
  await page.waitForFunction(() => document.querySelector('.creator-panel select[data-selector="HUD"]')?.options.length > 2, null, { timeout: 30000 });
  const rows = await ev(() => [...document.querySelectorAll('.creator-panel tr[data-plugin]')].map((r) => ({ id: r.dataset.plugin, badge: r.querySelector('.creator-badge').textContent, checked: r.querySelector('input').checked, origin: r.children[4].textContent, kind: r.children[3].textContent })));
  const status = await ev(() => window.__bulkhead.host.catalogStatus().map((s) => ({ id: s.id, active: s.active })));
  ok(rows.length === status.length && rows.length >= 13, `table lists all ${status.length} installed plugins`);
  ok(status.every((s) => rows.find((r) => r.id === s.id)?.badge === (s.active ? 'active' : 'inactive')), 'active / inactive badges match host.active');
  ok(rows.every((r) => r.checked === (r.badge === 'active')), 'draft ticks start equal to the active preset');
  ok(rows.find((r) => r.id === 'core/content')?.kind === 'content' && rows.find((r) => r.id === 'core/combat')?.kind === 'code', 'kind column distinguishes code and content');
  ok(rows.every((r) => r.origin === 'built-in'), 'origin column shows built-in');
  await shot('plugins');

  console.log('dependency safety');
  await page.click(`${panel} tr[data-plugin="core/combat"] input`);
  await page.waitForSelector(`${panel} [data-refusal]`);
  const refusal = await ev(() => document.querySelector('.creator-panel [data-refusal]').textContent);
  ok(/core\/enemies/.test(refusal) && /core\/content/.test(refusal), `refusal names dependents (${refusal.trim().slice(0, 80)}…)`);
  ok(await ev(() => document.querySelector('.creator-panel tr[data-plugin="core/combat"] input').checked), 'core/combat stays ticked after refusal');
  await shot('refusal');
  await page.click(`${panel} [data-fk="disable-too:core/combat"]`);
  const after = await ev(() => Object.fromEntries([...document.querySelectorAll('.creator-panel tr[data-plugin]')].map((r) => [r.dataset.plugin, r.querySelector('input').checked])));
  ok(!after['core/combat'] && !after['core/enemies'] && !after['core/content'] && after['core/world'], 'Disable these too unticks the dependents and the plugin');
  await page.click(`${panel} tr[data-plugin="example/ricochet"] input`);
  await page.waitForSelector(`${panel} [data-fk="enable-required:example/ricochet"]`);
  await shot('required');
  await page.click(`${panel} [data-fk="enable-required:example/ricochet"]`);
  const after2 = await ev(() => Object.fromEntries([...document.querySelectorAll('.creator-panel tr[data-plugin]')].map((r) => [r.dataset.plugin, r.querySelector('input').checked])));
  ok(after2['core/combat'] && after2['core/content'] && after2['example/ricochet'], 'Enable required plugins ticks the missing dependencies');
  await page.click(`${panel} [data-fk="reset"]`);
  ok(await ev(() => !document.querySelector('.creator-panel tr[data-plugin="example/ricochet"] input').checked), 'Reset draft restores the active selection');

  console.log('selectors');
  const hud = await ev(() => [...document.querySelectorAll('.creator-panel select[data-selector="HUD"] option')].map((o) => ({ v: o.value, d: o.disabled, t: o.textContent })));
  const visor = hud.find((o) => o.v === 'example/visor-hud');
  ok(visor?.d === true && /enable example\/hud/.test(visor.t), `HUD option "${visor?.t}" is disabled while its plugin is unticked`);
  ok(hud.some((o) => o.v === '' && o.t === '(none)') && hud.find((o) => o.v === 'core/hud')?.d === false, 'HUD offers (none) and the enabled provider');
  const maps = await ev(() => [...document.querySelectorAll('.creator-panel select[data-selector="Map"] option')].map((o) => ({ v: o.value, d: o.disabled })));
  ok(maps.some((m) => m.v === 'core/arena' && !m.d), 'Map selector lists core/arena');
  await page.click(`${panel} tr[data-plugin="example/hud"] input`);
  ok(await ev(() => !document.querySelector('.creator-panel select[data-selector="HUD"] option[value="example/visor-hud"]').disabled), 'ticking the owner enables its HUD option');
  await page.selectOption(`${panel} select[data-selector="HUD"]`, 'example/visor-hud');
  ok(await ev(() => document.querySelector('.creator-panel select[data-selector="HUD"]').value) === 'example/visor-hud', 'alternative HUD can be selected');
  await page.click(`${panel} [data-fk="reset"]`);

  console.log('validate broken draft');
  const s0 = await sessionId();
  await page.selectOption(`${panel} select[data-selector="Game mode"]`, '');
  await staleResults();
  await page.click(`${panel} [data-fk="validate"]`);
  const vtext = await freshResult();
  ok(/sdk\/mode/.test(vtext) && /not valid/i.test(vtext), 'Validate lists issues for the cleared sdk/mode role');
  ok(/running game was not changed/i.test(vtext), 'result states that the running game was not changed');
  ok((await sessionId()) === s0, 'host.session is the same object after Validate');
  await shot('validate-broken');
  await page.click(`${panel} [data-fk="reset"]`);
  await staleResults();
  await page.click(`${panel} [data-fk="validate"]`);
  ok(/Selection is valid/.test(await freshResult()), 'Validate reports "Selection is valid" for the active selection');
  ok((await sessionId()) === s0, 'session still unchanged after a valid Validate');

  console.log('config + apply');
  await ev(() => {
    const i = document.querySelector('.creator-panel input[data-fk="cfg:core/player:moveSpeed"]');
    i.value = '7';
    i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  ok(await ev(() => document.querySelector('.creator-panel input[data-fk="cfg:core/player:moveSpeed"]').value) === '7', 'config input holds the edited value');
  await shot('config');
  await staleResults();
  await page.click(`${panel} [data-fk="apply"]`);
  ok(/Applied/.test(await freshResult()), 'Apply & restart succeeds');
  ok((await ev(() => window.__bulkhead.host.active.preset.config['core/player']?.moveSpeed)) === 7, 'host.active.preset.config reflects moveSpeed = 7');
  ok((await sessionId()) !== s0, 'a new session was started');
  ok((await ev(() => document.querySelector('.creator-panel input[data-fk="cfg:core/player:moveSpeed"]').value)) === '7', 'panel refreshed from host.active');
  await shot('applied');

  console.log('import / export');
  const s1 = await sessionId();
  const r1 = await pasteImport(JSON.stringify(pack));
  ok(/Imported content pack "test\/pack"/.test(r1), 'valid pack imports');
  ok(await ev(() => Object.values(window.__bulkhead.host.active.registries.summary()).some((o) => (o['test/pack'] ?? 0) >= 1)), 'registry holds the imported weapon (owner test/pack)');
  await shot('import-ok');
  await tab('plugins');
  const prow = await ev(() => { const r = document.querySelector('.creator-panel tr[data-plugin="test/pack"]'); return r && { origin: r.children[4].textContent, badge: r.querySelector('.creator-badge').textContent, checked: r.querySelector('input').checked }; });
  ok(prow?.origin === 'imported' && prow.badge === 'active' && prow.checked, 'imported pack shows as imported / active / ticked');
  ok(await ev(() => !!document.querySelector('.creator-panel select[data-selector="Map"]')), 'selectors still render after the import');

  await tab('content');
  await page.click(`${panel} [data-fk="export-pack:test/pack"]`);
  const exported = JSON.parse(await ev(() => document.querySelector('.creator-panel textarea[data-fk="export-text"]').value));
  assert.deepEqual(exported, pack);
  ok(true, 'exported pack deep-equals the imported one');
  await shot('export');
  const exportedText = JSON.stringify(exported);
  const s2 = await sessionId();
  const r2 = await pasteImport(exportedText);
  ok(/Imported content pack "test\/pack"/.test(r2) && /replaced/.test(r2), 'round trip: re-importing the exported text replaces the pack without errors');
  ok((await ev(() => window.__bulkhead.host.catalogStatus().filter((s) => s.id === 'test/pack').length)) === 1, 'still exactly one test/pack installed');

  const s3 = await sessionId();
  const broken = structuredClone(pack);
  broken.content[0].data.behavior = 'core/does-not-exist';
  const r3 = await pasteImport(JSON.stringify(broken));
  ok(/Import failed/.test(r3) && /core\/does-not-exist/.test(r3) && /test\/pack/.test(r3), 'broken behaviour id fails with an issue list');
  ok(/running game was not changed/i.test(r3), 'failure states the running game was not changed');
  ok((await sessionId()) === s3, 'session object unchanged after the failed import');
  ok(await ev(() => Object.values(window.__bulkhead.host.active.registries.summary()).some((o) => (o['test/pack'] ?? 0) >= 1)), 'previous pack content still active after the failed import');
  await shot('import-failed');

  const rej = async (text, re, label) => {
    const t = await pasteImport(text);
    ok(re.test(t) && /Import rejected|Import failed/.test(t), label);
    ok((await sessionId()) === s3, `  (session unchanged)`);
    return t;
  };
  await rej('{ not json', /Not valid JSON/, 'invalid JSON is rejected with a syntax message');
  await rej(JSON.stringify({ ...pack, manifest: { ...pack.manifest, kind: 'code' } }), /only "content" packs/, 'a pack with kind "code" is rejected');
  await rej(JSON.stringify({ ...pack, schema: 2 }), /Unsupported content pack schema/, 'a pack with the wrong schema is rejected');
  await rej(JSON.stringify({ hello: 'world' }), /Unrecognised JSON/, 'unrecognised shape is rejected');
  await rej(JSON.stringify({ ...pack, manifest: { ...pack.manifest, id: 'core/combat' } }), /installed code plugin/, 'a pack cannot replace a code plugin id');
  const bp = await rej(JSON.stringify({ schema: 1, id: 'test/bad', name: 'Bad', plugins: ['no/such-plugin'], roles: {}, options: {}, config: {}, seed: 1 }), /no\/such-plugin/, 'a preset with an unknown plugin is rejected with the issue');
  ok(/graph/.test(bp), '  (stage shown)');
  await shot('rejected');
  // oversized file
  await tab('content');
  await staleResults();
  await page.setInputFiles(`${panel} input[type=file]`, { name: 'big.json', mimeType: 'application/json', buffer: Buffer.from(`{"x":"${'a'.repeat(1100 * 1024)}"}`) });
  ok(/limit is 1 MB/.test(await page.textContent(`${panel} [data-result]`)), 'a file over 1 MB is rejected');
  // valid file import
  const filePack = structuredClone(pack);
  filePack.manifest.id = 'test/file-pack';
  filePack.manifest.name = 'File Pack';
  filePack.content[0].id = 'test/file-zapper';
  filePack.content[0].data.slot = 8;
  await staleResults();
  await page.setInputFiles(`${panel} input[type=file]`, { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(filePack)) });
  ok(/Imported content pack "test\/file-pack"/.test(await freshResult()), 'file input imports a pack');
  // preset import
  const preset = await (async () => { await page.click(`${panel} [data-fk="export-preset"]`); return JSON.parse(await ev(() => document.querySelector('.creator-panel textarea[data-fk="export-text"]').value)); })();
  ok(preset.schema === 1 && preset.id === (await ev(() => window.__bulkhead.host.active.preset.id)), 'Export active preset returns the preset JSON');
  const r4 = await pasteImport(JSON.stringify(preset));
  ok(/Imported preset/.test(r4), 'a preset imports through api.apply');

  console.log('debug');
  const before = await ev(() => window.__liveIntervals());
  await tab('debug');
  ok((await ev(() => window.__liveIntervals())) === before + 1, 'opening the Debug tab starts exactly one interval');
  await ev(() => window.__bulkhead.play());
  await page.waitForFunction(() => window.__bulkhead.state === 'playing');
  const readKv = (label) => ev((l) => { const li = [...document.querySelectorAll('.creator-panel .creator-kv li')].find((x) => x.querySelector('.k').textContent === l); return li?.querySelector('.v').textContent; }, label);
  await page.waitForTimeout(700);
  const t1 = Number(await readKv('Tick'));
  await page.waitForTimeout(900);
  const t2 = Number(await readKv('Tick'));
  ok(t2 > t1 && t1 >= 0, `tick counter advances while playing (${t1} -> ${t2})`);
  ok(Number(await readKv('Entities')) > 0 && Number(await readKv('Systems')) > 0, `entities (${await readKv('Entities')}) and systems (${await readKv('Systems')}) are non-zero`);
  ok((await ev(() => document.querySelectorAll('.creator-panel .creator-scrolltable tbody tr').length)) > 10, 'debug tables are populated');
  ok(Number(await readKv('FPS')) > 0, `FPS ${await readKv('FPS')}`);
  await shot('debug');
  await ev(() => { const b = document.querySelector('.creator-panel .creator-body'); b.scrollTop = b.scrollHeight; });
  await shot('debug-bottom');
  // typing a backquote in a field must not toggle the panel
  await tab('content');
  await page.click(`${panel} textarea[data-fk="import-text"]`);
  await page.keyboard.type('`x');
  ok(await ev(() => window.__bulkhead.creator.isOpen), 'typing a backquote in a text field does not close the panel');
  await tab('debug');
  await page.keyboard.press('Escape');
  await page.waitForSelector(`${panel}[hidden]`, { state: 'attached' });
  ok(!(await ev(() => window.__bulkhead.creator.isOpen)), 'Escape closes the panel');
  ok((await ev(() => window.__liveIntervals())) === before, 'closing the panel clears its interval');
  await page.waitForTimeout(300);
  await page.keyboard.press('Backquote');
  await page.waitForSelector(`${panel}:not([hidden])`);
  ok((await ev(() => window.__liveIntervals())) === before + 1, 'reopening on the Debug tab restarts exactly one interval');
  await tab('plugins');
  ok((await ev(() => window.__liveIntervals())) === before, 'leaving the Debug tab stops the interval');
  await ev(() => window.__bulkhead.creator.dispose());
  ok(!(await ev(() => !!document.querySelector('.creator-panel'))) && !(await ev(() => !!document.querySelector('style[data-creator-style]'))), 'dispose removes the panel and its style');

  const noise = errors.filter((e) => !/Failed to load resource/.test(e));
  ok(noise.length === 0, `no console errors (${errors.length} total, ${errors.length - noise.length} resource 404s ignored)`);
  if (noise.length) console.log(noise.join('\n'));
  console.log(`\n${passed} checks passed`);
} catch (e) {
  console.error('FAILED:', e?.message ?? e);
  if (errors.length) console.error(errors.join('\n'));
  await shot('failure').catch(() => {});
  process.exitCode = 1;
}
} finally {
  try { await browser?.close(); } finally { await server.close(); }
}
