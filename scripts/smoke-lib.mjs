// Helpers for browser smoke tests.
import { existsSync } from 'node:fs';
import { resolveTool } from './tools.mjs';
export { startStaticServer } from './static-server.mjs';

export const CHROME_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
];

export async function launchBrowser() {
  const { chromium } = resolveTool('playwright');
  const explicitPath = process.env.CHROME_PATH;
  const executablePath = explicitPath !== undefined ? explicitPath :
    existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
  try {
    if (explicitPath === '') throw new Error('CHROME_PATH is empty');
    return await chromium.launch({ executablePath, headless: true, args: CHROME_ARGS });
  } catch (cause) {
    const advice = explicitPath !== undefined
      ? `Check CHROME_PATH (${JSON.stringify(explicitPath)}) points to a working Chrome/Chromium executable.`
      : executablePath
        ? `Check ${executablePath} works, or set CHROME_PATH to another Chrome/Chromium executable.`
        : 'Install Playwright Chromium (npx playwright install chromium), or set CHROME_PATH to a Chrome/Chromium executable.';
    throw new Error(`Browser launch failed. ${advice}`, { cause });
  }
}
