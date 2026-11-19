// P3.3 visual regression + cross-browser config. Run through `npm run test:visual` (scripts/visual.mjs builds first).
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.VISUAL_PORT ?? 4319);
const chrome = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
// Software WebGL2 everywhere so goldens do not depend on a GPU (same flags as scripts/smoke-lib.mjs).
const chromeArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: '../../.build/visual-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}-{platform}/{arg}{ext}',
  timeout: 120_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: '../../.build/visual-report', open: 'never' }]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.25, animations: 'disabled', caret: 'hide' } },
  use: { baseURL: `http://127.0.0.1:${PORT}/`, viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 },
  webServer: { command: 'node tests/visual/serve.mjs', cwd: '../..', url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: !process.env.CI, env: { VISUAL_PORT: String(PORT) } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 600 }, launchOptions: { executablePath: chrome, args: chromeArgs } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 960, height: 600 }, launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true } } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 960, height: 600 } } },
  ],
});
