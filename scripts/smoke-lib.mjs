// Helpers for browser smoke tests.
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
  return chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: CHROME_ARGS,
  });
}
