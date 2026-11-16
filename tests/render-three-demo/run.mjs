// Actual GPU adapter acceptance: color round-trip, layered depth, orthographic resize and scoped disposal.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, resolveTool } from '../../scripts/tools.mjs';
import { launchBrowser, startStaticServer } from '../../scripts/smoke-lib.mjs';

const out = resolve(root, '.smoke/render-three-demo');
await mkdir(out, { recursive: true });
await resolveTool('esbuild').build({ entryPoints: [resolve(root, 'tests/render-three-demo/demo.ts')], bundle: true, outfile: resolve(out, 'demo.js'), format: 'iife', target: 'es2022' });
await writeFile(resolve(out, 'index.html'), '<!doctype html><body style="margin:0"><script src="demo.js"></script>');
const server = await startStaticServer(out);
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(server.url);
  await page.waitForFunction(() => window.__renderChecks, null, { timeout: 30000 });
  const checks = await page.evaluate(() => window.__renderChecks);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (errors.length || checks.some(([, ok]) => !ok)) throw new Error(JSON.stringify({ errors, checks }));
} finally {
  await browser.close();
  server.close();
}
