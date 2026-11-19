// Renders every procedural painter onto a contact sheet and smoke-tests the audio service.
const tool = (n) => { try { return require('node:module').createRequire(require('node:path').resolve(__dirname, '../../package.json'))(n); } catch { return require(`/opt/npm-tools/node_modules/${n}`); } };
const path = require('path');
const fs = require('fs');
const esbuild = tool('esbuild');
const { chromium } = tool('playwright');

const root = path.resolve(__dirname, '..', '..');
const entry = path.join(__dirname, 'entry.gen.ts');

(async () => {
  fs.writeFileSync(entry, `
import { textures } from '@bulkhead/std/theme-industrial/art.ts';
import { sounds } from '@bulkhead/std/theme-industrial/sounds.ts';
import { createAudioService } from '@bulkhead/platform-web/audio.ts';
(window as any).__art = { textures, sounds, createAudioService };
`);
  const out = await esbuild.build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', target: 'es2022' });
  fs.rmSync(entry, { force: true });
  const js = out.outputFiles[0].text;

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (require('fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined), args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setContent('<html><body style="margin:0;background:#888"></body></html>');
  await page.addScriptTag({ content: js });

  const audio = await page.evaluate(async () => {
    const { textures, sounds, createAudioService } = window.__art;
    const SCALE = 4;
    const body = document.body;
    body.style.cssText = 'margin:0;padding:8px;font:12px monospace;color:#fff;' +
      'background:repeating-conic-gradient(#8a8a8a 0% 25%, #767676 0% 50%) 0 0/16px 16px;';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;width:1480px';
    body.appendChild(wrap);
    for (const [key, p] of Object.entries(textures)) {
      const tiling = /^(wall|floor|ceiling|door|switch|exit)/.test(key);
      const cv = document.createElement('canvas');
      const reps = tiling ? 2 : 1;
      cv.width = p.width * reps; cv.height = p.height * reps;
      const ctx = cv.getContext('2d');
      for (let y = 0; y < reps; y++) for (let x = 0; x < reps; x++) { ctx.save(); ctx.translate(x * p.width, y * p.height); p.paint(ctx); ctx.restore(); }
      cv.style.cssText = `width:${cv.width * SCALE / (p.width > 128 ? 2 : 1)}px;height:${cv.height * SCALE / (p.width > 128 ? 2 : 1)}px;image-rendering:pixelated;display:block`;
      const cell = document.createElement('div');
      const label = document.createElement('div');
      label.textContent = `${key} ${p.width}x${p.height}${tiling ? ' (2x2)' : ''}`;
      label.style.cssText = 'background:#000a;padding:1px 3px;margin-bottom:2px';
      cell.append(label, cv);
      wrap.appendChild(cell);
    }
    const svc = createAudioService((id) => sounds[id.replace('core/', '')]);
    svc.resume();
    await new Promise((r) => setTimeout(r, 200));
    const errs = [];
    let maxV = 0;
    for (const id of Object.keys(sounds)) {
      try { svc.play('core/' + id); maxV = Math.max(maxV, svc.activeVoices); } catch (e) { errs.push(id + ': ' + e); }
    }
    svc.play('core/nope');
    await new Promise((r) => setTimeout(r, 2500));
    const after = svc.activeVoices;
    svc.stopAll(); svc.dispose();
    return { count: Object.keys(sounds).length, errs, maxV, after };
  });
  console.log('audio:', JSON.stringify(audio));
  fs.mkdirSync(path.join(root, '.smoke'), { recursive: true });
  await page.screenshot({ path: path.join(root, '.smoke', 'art-preview.png'), fullPage: true });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
  if (errors.length || audio.errs.length || audio.after !== 0) process.exit(1);
})();
