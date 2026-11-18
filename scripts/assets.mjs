// Model build step (P1.4): optimises the glTF/GLB sources listed in assets/models.json into public/models/ with
// glTF-Transform - dedup, prune, weld, then Meshopt compression (EXT_meshopt_compression + quantisation), and
// optionally WebP textures ("textures": "webp", uses sharp). The runtime (std/assets) decodes Meshopt and KTX2.
// Node extras (Blender custom properties) are preserved.
//
// Usage: npm run assets            rebuild outputs whose source changed
//        npm run assets -- --force rebuild everything
//        npm run assets -- --check verify public/models/index.json matches the sources (no glTF-Transform needed)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { resolveTool, root } from './tools.mjs';

const CONFIG = 'assets/models.json';
const INDEX = 'public/models/index.json';
const PIPELINE = 'dedup+prune+weld+meshopt-medium/v1';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const config = JSON.parse(readFileSync(resolve(root, CONFIG), 'utf8'));
const index = existsSync(resolve(root, INDEX)) ? JSON.parse(readFileSync(resolve(root, INDEX), 'utf8')) : { schema: 1, models: {} };
const args = new Set(process.argv.slice(2));

function stale(m) {
  const rec = index.models[m.out];
  const src = readFileSync(resolve(root, m.src));
  const reasons = [];
  if (!rec) reasons.push('not built');
  else {
    if (rec.src !== m.src) reasons.push('source path changed');
    if (rec.srcSha256 !== sha256(src)) reasons.push('source changed');
    if (rec.pipeline !== PIPELINE || (rec.textures ?? null) !== (m.textures ?? null)) reasons.push('pipeline changed');
    if (!existsSync(resolve(root, m.out))) reasons.push('output missing');
    else if (rec.outSha256 !== sha256(readFileSync(resolve(root, m.out)))) reasons.push('output edited by hand');
  }
  return { src, reasons };
}

if (args.has('--check')) {
  const bad = config.models.map((m) => [m, stale(m).reasons]).filter(([, r]) => r.length);
  const extra = Object.keys(index.models).filter((out) => !config.models.some((m) => m.out === out));
  for (const [m, r] of bad) console.error(`assets: ${m.out} is out of date (${r.join(', ')})`);
  for (const out of extra) console.error(`assets: ${INDEX} lists ${out}, which is not in ${CONFIG}`);
  if (bad.length || extra.length) {
    console.error('Run `npm run assets` and commit public/models/.');
    process.exit(1);
  }
  console.log(`assets OK (${config.models.length} models up to date)`);
  process.exit(0);
}

const { NodeIO } = resolveTool('@gltf-transform/core');
const { ALL_EXTENSIONS } = resolveTool('@gltf-transform/extensions');
const { dedup, prune, weld, meshopt, textureCompress } = resolveTool('@gltf-transform/functions');
const { MeshoptEncoder, MeshoptDecoder } = resolveTool('meshoptimizer');
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

let built = 0;
for (const m of config.models) {
  const { src, reasons } = stale(m);
  if (!reasons.length && !args.has('--force')) continue;
  const doc = await io.readBinary(new Uint8Array(src));
  const steps = [dedup(), prune({ keepExtras: true }), weld()];
  if (m.textures === 'webp') steps.push(textureCompress({ encoder: resolveTool('sharp'), targetFormat: 'webp', resize: [1024, 1024] }));
  steps.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  const out = await io.writeBinary(doc);
  mkdirSync(dirname(resolve(root, m.out)), { recursive: true });
  writeFileSync(resolve(root, m.out), out);
  index.models[m.out] = { src: m.src, srcSha256: sha256(src), outSha256: sha256(out), pipeline: PIPELINE, ...(m.textures ? { textures: m.textures } : {}), bytesIn: src.byteLength, bytesOut: out.byteLength };
  console.log(`${m.out}: ${(src.byteLength / 1024).toFixed(1)} KiB -> ${(out.byteLength / 1024).toFixed(1)} KiB (${reasons.join(', ') || 'forced'})`);
  built++;
}
for (const out of Object.keys(index.models)) if (!config.models.some((m) => m.out === out)) delete index.models[out];
const sorted = Object.fromEntries(Object.entries(index.models).sort(([a], [b]) => (a < b ? -1 : 1)));
mkdirSync(dirname(resolve(root, INDEX)), { recursive: true });
writeFileSync(resolve(root, INDEX), `${JSON.stringify({ schema: 1, pipeline: PIPELINE, models: sorted }, null, 2)}\n`);
console.log(`assets: ${built} built, ${config.models.length - built} up to date`);
