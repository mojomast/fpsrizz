// Usage: node scripts/preview.mjs [--port 4173]   (serves dist/)
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './tools.mjs';
import { startStaticServer } from './static-server.mjs';

const i = process.argv.indexOf('--port');
const port = i > 0 ? Number(process.argv[i + 1]) : 4173;
const dist = resolve(root, 'dist');
if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('preview: dist/ is missing or incomplete. Run "npm run build" first.');
  process.exit(1);
}
try {
  const s = await startStaticServer(dist, port);
  console.log(`Preview: ${s.url}`);
  const stop = () => s.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (e) {
  console.error(`preview: ${e.message}`);
  process.exit(1);
}
