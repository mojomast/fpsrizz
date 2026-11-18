// Builds assets/levels/sandbox-props.glb: a small test scene for the SDK 3 glTF pipeline (P1.4).
// It stands in for a Blender export: every gameplay property sits in node `extras`, exactly where Blender's glTF
// exporter writes Object custom properties ("Include > Custom Properties"). Run: node assets/levels/build-sandbox-props.mjs
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTool } from '../../scripts/tools.mjs';

const { Document, NodeIO } = resolveTool('@gltf-transform/core');
const here = dirname(fileURLToPath(import.meta.url));
const doc = new Document();
doc.getRoot().getAsset().generator = 'fpsrizz assets/levels/build-sandbox-props.mjs';
const buffer = doc.createBuffer();
const scene = doc.createScene('SandboxProps');

function box(sx, sy, sz) {
  const pos = [], nrm = [], idx = [];
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  for (const [axis, sign] of faces) {
    const base = pos.length / 3;
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0];
      p[axis] = sign; p[u] = a; p[v] = b;
      pos.push((p[0] * sx) / 2, (p[1] * sy) / 2, (p[2] * sz) / 2);
      const n = [0, 0, 0]; n[axis] = sign; nrm.push(...n);
    }
    if (sign > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return { pos, nrm, idx };
}

function cylinder(d, h, seg = 20) {
  const pos = [], nrm = [], idx = [];
  const r = d / 2;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r, -h / 2, s * r, c * r, h / 2, s * r);
    nrm.push(c, 0, s, c, 0, s);
  }
  for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
  for (const [y, ny] of [[h / 2, 1], [-h / 2, -1]]) {
    const centre = pos.length / 3;
    pos.push(0, y, 0); nrm.push(0, ny, 0);
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pos.push(Math.cos(a) * r, y, Math.sin(a) * r); nrm.push(0, ny, 0); }
    for (let i = 0; i < seg; i++) ny > 0 ? idx.push(centre, centre + i + 2, centre + i + 1) : idx.push(centre, centre + i + 1, centre + i + 2);
  }
  return { pos, nrm, idx };
}

const materials = new Map();
function material(name, rgb) {
  if (!materials.has(name)) materials.set(name, doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(0.8).setMetallicFactor(0.05));
  return materials.get(name);
}

function mesh(name, g, mat) {
  const p = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.pos)).setBuffer(buffer);
  const n = doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.nrm)).setBuffer(buffer);
  const i = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(g.idx)).setBuffer(buffer);
  return doc.createMesh(name).addPrimitive(doc.createPrimitive().setAttribute('POSITION', p).setAttribute('NORMAL', n).setIndices(i).setMaterial(mat));
}

function node(name, { at = [0, 0, 0], rot, m, extras, children = [] } = {}) {
  const n = doc.createNode(name).setTranslation(at);
  if (rot) n.setRotation(rot);
  if (m) n.setMesh(m);
  if (extras) n.setExtras(extras);
  for (const c of children) n.addChild(c);
  return n;
}

const rotX = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const wood = material('Wood', [0.55, 0.36, 0.2]);
const metal = material('Metal', [0.45, 0.5, 0.55]);
const glow = material('Glow', [1, 0.85, 0.4]);
const goal = material('Goal', [0.3, 0.9, 0.5]);

scene.addChild(node('Ramp', { at: [-9, 0.7, 6], rot: rotX(-0.28), m: mesh('RampMesh', box(4, 0.4, 6), wood), extras: { body: 'fixed', collider: 'box', friction: 0.9 } }));
const barrel = mesh('BarrelMesh', cylinder(0.8, 1.2), metal);
for (const [i, at] of [[-6, 0.62, -9], [-7, 0.62, -9], [-6.5, 1.85, -9]].entries()) {
  scene.addChild(node(`Barrel.00${i + 1}`, { at, m: barrel, extras: { body: 'dynamic', collider: 'cylinder', density: 0.4 } }));
}
scene.addChild(node('Lamp', {
  at: [-11, 1.5, -11], m: mesh('PostMesh', cylinder(0.2, 3, 10), metal), extras: { collider: 'cylinder' },
  children: [node('Lamp.Bulb', { at: [0, 1.7, 0], m: mesh('BulbMesh', box(0.45, 0.45, 0.45), glow), extras: { 'sandbox/glow': '{"intensity": 2}' } })],
}));
scene.addChild(node('Goal', { at: [-10, 1, -3], m: mesh('GoalMesh', box(2, 2, 2), goal), extras: { collider: 'box', sensor: 1, renderable: false, 'sandbox/goal': '{}' } }));
scene.addChild(node('Spawn', { at: [-8, 0, 0], extras: { components: '{"sandbox/spawn-point": {"facing": 0}}' } }));

const out = resolve(here, 'sandbox-props.glb');
writeFileSync(out, await new NodeIO().writeBinary(doc));
console.log(`wrote ${out}`);
