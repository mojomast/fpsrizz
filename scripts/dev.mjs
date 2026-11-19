// Dev server. Usage: node scripts/dev.mjs [--port 5173]; ENTRY env overrides entry.
import { rmSync, mkdirSync, cpSync, existsSync, watch } from 'node:fs';
import { resolve, relative } from 'node:path';
import { resolveTool, root } from './tools.mjs';
import { generate as generateCatalog, pluginRoots } from './gen-catalog.mjs';
import { copyVendorStatic, threeDedupe } from './build-config.mjs';
import { startDevRpcBridge } from './dev-rpc-bridge.mjs';

const esbuild = resolveTool('esbuild');
const entry = resolve(root, process.env.ENTRY ?? 'src/app/main.ts');
const out = resolve(root, '.dev');
const i = process.argv.indexOf('--port');
const port = i > 0 ? Number(process.argv[i + 1]) : 5173;
const host = '127.0.0.1';

if (!existsSync(entry)) {
  console.error(`dev: entry point not found: ${relative(root, entry)}`);
  process.exit(1);
}

function copyStatic() {
  mkdirSync(out, { recursive: true });
  cpSync(resolve(root, 'index.html'), resolve(out, 'index.html'));
  if (existsSync(resolve(root, 'public'))) cpSync(resolve(root, 'public'), out, { recursive: true });
  copyVendorStatic(out);
}

generateCatalog();
rmSync(out, { recursive: true, force: true });
copyStatic();

const ctx = await esbuild.context({
  entryPoints: [entry],
  outfile: resolve(out, 'assets/main.js'),
  bundle: true,
  format: 'esm',
  minify: false,
  sourcemap: 'inline',
  target: 'es2022',
  define: { __DEV__: 'true' },
  plugins: [threeDedupe],
  logLevel: 'info',
});
await ctx.watch();
const server = await ctx.serve({ servedir: out, port, host });
console.log(`Dev server: http://${host}:${server.port}/`);
console.log('Live reload is on: the page reloads after each rebuild and resumes the running game (state kept for SDK 3 presets). Add ?seed=N to pin a seed.');
// P2.6 dev protocol bridge on port + 1 (disable with --no-rpc). Only the dev page's own origin may connect from a browser.
let bridge;
if (!process.argv.includes('--no-rpc')) {
  const origins = new Set([`http://${host}:${server.port}`, `http://localhost:${server.port}`]);
  try {
    bridge = await startDevRpcBridge({ port: server.port + 1, host, allowOrigin: (o) => origins.has(o), log: null });
    console.log(`Dev protocol: JSON-RPC at ${bridge.url}/rpc (agents: npm run mcp for the MCP server; docs/reference/dev-protocol.md)`);
  } catch (e) { console.warn(`dev-rpc bridge not started: ${e.message}`); }
}

let timer;
const watchers = [watch(resolve(root, 'index.html'), () => {
  clearTimeout(timer);
  timer = setTimeout(() => { try { copyStatic(); console.log('index.html copied'); } catch (e) { console.error(e.message); } }, 50);
})];
// New, renamed or removed plugin folders regenerate the catalog; esbuild then rebuilds and the page live-reloads.
let catalogTimer;
for (const dir of pluginRoots()) {
  if (!existsSync(resolve(root, dir))) continue;
  watchers.push(watch(resolve(root, dir), { recursive: true }, (_event, file) => {
    if (file && !/(^|[\\/])(manifest\.json|index\.ts|content\.json)$/.test(String(file)) && String(file).includes('.')) return;
    clearTimeout(catalogTimer);
    catalogTimer = setTimeout(() => {
      try { if (generateCatalog().changed) console.log('plugin catalog regenerated'); } catch (e) { console.error(`gen-catalog: ${e.message}`); }
    }, 100);
  }));
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  watchers.forEach((w) => w.close());
  await bridge?.close();
  await ctx.dispose();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
