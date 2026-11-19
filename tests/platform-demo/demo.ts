import * as THREE from '@bulkhead/platform-web/render/mini3/index.ts';
import { createRenderHost } from '@bulkhead/platform-web/render/service.ts';
import { createInputCore, bindDomInput } from '@bulkhead/platform-web/input.ts';
import { Scope } from '@bulkhead/kernel/scope.ts';
import type { SessionContext } from '@bulkhead/kernel/host.ts';

const mk = (id: string): { scope: Scope; ctx: SessionContext } => {
  const scope = new Scope(id, id);
  return { scope, ctx: { scope, pluginId: id } as unknown as SessionContext };
};
const checks: [string, boolean][] = [];
const check = (n: string, ok: boolean): void => { checks.push([n, ok]); };

const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:480px;height:300px;display:block';
document.body.appendChild(canvas);
const host = createRenderHost(canvas, { pixelRatioCap: 1 });
host.resize();
const r = host.service;
const checker = { width: 16, height: 16, paint(g: CanvasRenderingContext2D) {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#e0c040' : '#a02020'; g.fillRect(x * 4, y * 4, 4, 4); }
} };
const a = mk('a');
const b = mk('b');
host.setPixelRatioCap(1);
r.setEnvironment({ background: 0x203050, fog: { color: 0x203050, near: 5, far: 30 } });
r.camera.position.set(2, 2, 4);
r.camera.rotation.set(-0.35, 0.4, 0);

const world = r.createRoot(a.ctx, 'world');
const tex = r.texture(a.ctx, 'checker', checker, { repeat: true });
const boxGeo = r.own(a.ctx, new THREE.BoxGeometry(2, 2, 2));
const boxMat = r.own(a.ctx, new THREE.MeshBasicMaterial({ map: tex }));
world.add(new THREE.Mesh(boxGeo, boxMat));
const tex2 = r.texture(b.ctx, 'checker', checker, { repeat: true });
check('shared texture identity', tex === tex2);
check('assets size 1', host.assets.size === 1);

const view = r.createRoot(b.ctx, 'view');
const quadGeo = r.own(b.ctx, new THREE.PlaneGeometry(0.5, 0.5));
const quadMat = r.own(b.ctx, new THREE.MeshBasicMaterial({ color: 0x40ff40 }));
const quad = new THREE.Mesh(quadGeo, quadMat);
quad.position.set(0.5, -0.3, -1);
view.add(quad);
check('liveRoots 2', host.liveRoots() === 2);
host.render();
const s1 = { ...r.stats };
check('stats populated', s1.calls >= 2 && s1.textures === 1 && s1.geometries === 2);
if (location.hash === '#shot') {
  const loop = (): void => { host.render(); requestAnimationFrame(loop); };
  loop();
  (window as unknown as Record<string, unknown>).__result = [];
  throw new Error('shot-mode-stop');
}

// dispose a: shared texture must stay (b holds it)
a.scope.dispose();
check('after a: root removed', host.liveRoots() === 1);
check('after a: texture alive (b)', host.assets.size === 1 && host.assets.refs('texture:checker:repeat') === 1);
host.render();
const s2 = { ...r.stats };
check('after a: geometries dropped', s2.geometries < s1.geometries);
b.scope.dispose();
check('after b: assets 0', host.assets.size === 0);
check('after b: roots 0', host.liveRoots() === 0);
host.render();
const s3 = { ...r.stats };
check('after b: textures/geometries 0', s3.textures === 0 && s3.geometries === 0);

// input
const core = createInputCore();
let captured = true;
const bind = bindDomInput(core, { target: canvas, actions: () => [{ id: 'fire', keys: ['Space', 'Mouse0'] }, { id: 'next', keys: ['WheelUp'] }], isCaptured: () => captured });
const key = (type: string, code: string): boolean => { const e = new KeyboardEvent(type, { code, cancelable: true, bubbles: true }); window.dispatchEvent(e); return e.defaultPrevented; };
check('space prevented', key('keydown', 'Space'));
core.beginTick();
check('pressed+held', core.service.tick.pressed('fire') && core.service.tick.held('fire'));
window.dispatchEvent(new Event('blur'));
check('blur clears held', !core.service.tick.held('fire'));
captured = false;
key('keydown', 'Space');
check('not captured: ignored', !core.service.tick.held('fire'));
captured = true;
canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
check('mouse0 held', core.service.tick.held('fire'));
window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
check('mouse0 released', !core.service.tick.held('fire'));
canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
core.beginTick();
check('wheel pulse', core.service.tick.pressed('next') && !core.service.tick.held('next'));
bind.dispose();
key('keydown', 'Space');
check('after dispose: no events', !core.service.tick.held('fire'));

(window as unknown as Record<string, unknown>).__result = checks;
