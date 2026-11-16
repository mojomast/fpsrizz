// This fixture exercises the preserved offline mini3 renderer; production uses the Three.js facade.
import * as T from '../../src/platform/render/mini3/legacy.ts';

const W = 640, H = 400;
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new T.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);

function checker(c1: string, c2: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) & 1 ? c1 : c2; g.fillRect(x * 8, y * 8, 8, 8); }
  g.fillStyle = '#f00'; g.fillRect(0, 0, 8, 8); // marks bottom-left after flipY? (top-left of image)
  return c;
}
function nearest(img: HTMLCanvasElement): T.CanvasTexture {
  const t = new T.CanvasTexture(img);
  t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}

const scene = new T.Scene();
scene.background = 0x202838;
scene.fog = new T.Fog(0x202838, 8, 30);
scene.add(new T.AmbientLight(0xffffff, 0.25));

const floorTex = nearest(checker('#bbbbbb', '#666666'));
floorTex.repeat.set(8, 8);
const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const boxTex: T.CanvasTexture[] = [], boxes: T.Mesh[] = [];
const cols = [0xffffff, 0xffaa88, 0x88ccff];
for (let i = 0; i < 3; i++) {
  const t = nearest(checker('#e8e8e8', '#7a5a3a')); boxTex.push(t);
  const m = new T.Mesh(new T.BoxGeometry(1.5, 1.5 + i * 0.5, 1.5), new T.MeshLambertMaterial({ map: t, color: cols[i]! }));
  m.position.set(-3 + i * 3, 0.75 + i * 0.25, -4 - i * 3);
  m.rotation.y = 0.5 * i + 0.3;
  scene.add(m); boxes.push(m);
}

const lightDefs: [number, number, number, number][] = [[0xff3030, -3, 2, -2], [0x30ff30, 0, 2, -6], [0x3060ff, 3, 2, -3]];
for (const [c, x, y, z] of lightDefs) {
  const l = new T.PointLight(c, 1.6, 9); l.position.set(x, y, z); scene.add(l);
}

// alpha-tested cutout quad: circle with a hole drawn into a canvas
const cc = document.createElement('canvas'); cc.width = cc.height = 64;
const cg = cc.getContext('2d')!;
cg.fillStyle = '#ffdd00'; cg.beginPath(); cg.arc(32, 32, 28, 0, 7); cg.fill();
cg.globalCompositeOperation = 'destination-out'; cg.beginPath(); cg.arc(32, 32, 12, 0, 7); cg.fill();
const cutTex = new T.CanvasTexture(cc);
const cutout = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial({ map: cutTex, alphaTest: 0.5, side: T.DoubleSide }));
cutout.position.set(-1, 1.2, -2); cutout.rotation.y = 0.4;
scene.add(cutout);

const glow = new T.Mesh(new T.PlaneGeometry(3, 3), new T.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
glow.position.set(1.5, 1.5, -3); glow.rotation.y = -0.3;
scene.add(glow);

const cam = new T.PerspectiveCamera(60, W / H, 0.1, 100);
cam.position.set(0, 2.2, 3); cam.rotation.x = -0.25;

const gl = canvas.getContext('webgl2')!;
const out: Record<string, unknown> = {};
const snap = () => JSON.parse(JSON.stringify(renderer.info));
renderer.render(scene, cam);
out.before = snap();
out.glError = gl.getError();
console.log('before', JSON.stringify(out.before), 'glError', out.glError);

// dispose one box's geometry + texture, then render again
boxes[2]!.geometry.dispose(); boxTex[2]!.dispose();
out.afterDispose = snap();
console.log('afterDispose', JSON.stringify(out.afterDispose));
renderer.render(scene, cam); // re-uploads (three semantics)
out.afterRerender = snap();
console.log('afterRerender', JSON.stringify(out.afterRerender));
out.glError2 = gl.getError();
console.log('glError2', out.glError2);
(window as unknown as { __result: unknown }).__result = out;
