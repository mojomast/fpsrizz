// Bundles demo.ts and renders it in headless Chrome (software WebGL2); saves .smoke/mini3-demo/shot.png
const tool = (n) => { try { return require('node:module').createRequire(require('node:path').resolve(__dirname, '../../package.json'))(n); } catch { return require(`/opt/npm-tools/node_modules/${n}`); } };
const path = require('path'), fs = require('fs');
const esbuild = tool('esbuild');
const { chromium } = tool('playwright');
(async () => {
  const root = path.resolve(__dirname, '../..');
  const out = path.join(root, '.smoke/mini3-demo');
  fs.mkdirSync(out, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(__dirname, 'demo.ts')], bundle: true, outfile: path.join(out, 'demo.js'), format: 'iife', target: 'es2022' });
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><body style="margin:0;background:#000"><script src="demo.js"></script></body>');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (require('fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  let bad = 0;
  page.on('console', (m) => { console.log('[page]', m.type(), m.text()); if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall/.test(m.text()))) bad++; });
  page.on('pageerror', (e) => { console.log('[pageerror]', e.message); bad++; });
  await page.goto('file://' + path.join(out, 'index.html'));
  await page.waitForFunction(() => window.__result, null, { timeout: 15000 });
  await page.screenshot({ path: path.join(out, 'shot.png') });
  await browser.close();
  console.log(bad ? `FAIL: ${bad} console problems` : 'OK: no console errors');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
