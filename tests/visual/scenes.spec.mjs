// P3.3: one golden screenshot per genre template plus a few built-in presets, at a held simulation tick so the
// image is deterministic. Goldens: tests/visual/__screenshots__/<browser>-<platform>/. Update them deliberately with
// `npm run test:visual -- --update-snapshots` and review the diff in the PR.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const presets = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../.build/visual-dist/visual-presets.json'), 'utf8'));
const TICK = 60;
const cases = [
  ...Object.keys(presets).sort().map((t) => ({ name: `template-${t}`, preset: presets[t] })),
  { name: 'preset-sandbox-physics', id: 'sandbox/physics' },
  { name: 'preset-sandbox-navmesh', id: 'sandbox/navmesh' },
  { name: 'preset-core-default', id: 'core/default' },
  { name: 'preset-ember-bastion', id: 'ember/bastion' },
];

for (const c of cases) {
  test(c.name, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./?test=&touch=0${c.id ? `&preset=${c.id}` : ''}`);
    // Fail fast (instead of a 90 s timeout) when the browser has no WebGL2 and the app shows its "Unsupported" alert.
    await page.waitForFunction(() => window.__bulkhead?.state === 'menu' || /needs WebGL2/.test(document.querySelector('[role=alert]')?.textContent ?? ''), null, { timeout: 90_000 });
    const unsupported = await page.evaluate(() => window.__bulkhead?.state !== 'menu');
    expect(unsupported, 'this browser has no WebGL2 here (CI needs xvfb + Mesa for Firefox/WebKit)').toBe(false);
    if (c.preset) {
      const r = await page.evaluate((p) => window.__bulkhead.applyPreset(p), c.preset);
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
    await page.evaluate(() => window.__bulkhead.play());
    await page.waitForFunction(() => window.__bulkhead.state === 'playing' && window.__bulkhead.host.session?.scheduler.tick > 0, null, { timeout: 90_000 });
    const tick = await page.evaluate(async (target) => {
      const dev = await window.__bulkhead.dev();
      const s = dev['sim.pause']({ paused: true });
      if (s.tick < target) dev['sim.step']({ n: target - s.tick });
      return dev['sim.state']().tick;
    }, TICK);
    expect(tick).toBe(TICK);
    await expect(page).toHaveScreenshot(`${c.name}.png`);
    expect(errors).toEqual([]);
  });
}
