// Static server for the visual suite (Playwright webServer): serves .build/visual-dist on VISUAL_PORT.
import { resolve } from 'node:path';
import { startStaticServer } from '../../scripts/static-server.mjs';
const port = Number(process.env.VISUAL_PORT ?? 4319);
const s = await startStaticServer(resolve(import.meta.dirname, '../../.build/visual-dist'), port);
console.log(`visual server on ${s.url ?? `http://127.0.0.1:${port}/`}`);
