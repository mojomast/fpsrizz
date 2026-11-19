// Dev edit-loop acceptance: live reload resumes the running game. Starts `scripts/dev.mjs` itself (no build needed).
// Edits src/app/dev-loop.ts (appends a comment) to trigger a rebuild and always restores it.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launchBrowser } from '../../scripts/smoke-lib.mjs';
import { root } from '../../scripts/tools.mjs';

const port = Number(process.env.DEV_PORT ?? 5199);
const touched = resolve(root, 'src/app/dev-loop.ts');
const original = readFileSync(touched, 'utf8');
const dev = spawn(process.execPath, ['scripts/dev.mjs', '--port', String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
dev.stdout.on('data', (d) => { log += d; });
dev.stderr.on('data', (d) => { log += d; });
const until = async (re, ms = 60000) => {
  const end = Date.now() + ms;
  while (!re.test(log)) { if (Date.now() > end) throw new Error(`dev server did not print ${re}:\n${log}`); await new Promise((r) => setTimeout(r, 100)); }
};
let browser;
try {
  await until(/Dev server: http/);
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?test&preset=core/default&seed=7`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__bulkhead?.state === 'menu', null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__bulkhead.host.active.preset.seed), 7);
  console.log('PASS ?seed overrides the preset seed');
  await page.evaluate(() => window.__bulkhead.play());
  await page.waitForFunction(() => window.__bulkhead.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => { window.__beforeReload = true; });
  const reloaded = page.waitForEvent('load', { timeout: 60000 });
  appendFileSync(touched, `\n// dev-reload-demo ${Date.now()}\n`);
  await reloaded;
  await page.waitForFunction(() => window.__bulkhead?.state === 'playing', null, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__beforeReload), undefined);
  assert.equal(await page.evaluate(() => window.__bulkhead.host.active.preset.id), 'core/default');
  console.log('PASS a source edit reloads the page and resumes the running game');
  assert.deepEqual(errors, []);
  console.log('PASS no page errors');
} finally {
  writeFileSync(touched, original);
  await browser?.close();
  dev.kill('SIGTERM');
}
