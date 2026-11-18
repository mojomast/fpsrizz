import { THREE } from '../../src/sdk/render.ts';
import { createRenderHost } from '../../src/platform/render/service.ts';
import { PluginHost } from '../../src/kernel/host.ts';
import type { SessionContext } from '../../src/kernel/host.ts';
import { SDK_COMPAT, SDK_VERSION } from '../../src/sdk/index.ts';

async function run(): Promise<[string, boolean][]> {
  const checks: [string, boolean][] = [];
  const check = (name: string, ok: boolean): void => { checks.push([name, ok]); };
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:320px;height:200px;display:block';
  document.body.append(canvas);
  const host = createRenderHost(canvas, { pixelRatioCap: 1 });
  host.resize();
  const render = host.service;
  const contexts = new Map<string, SessionContext>();
  const session = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: [] });
  session.setCatalog(['test/world', 'test/view'].map(id => ({
    manifest: { schema: 1, id, name: id, version: '1.0.0', kind: 'code', sdk: `^${SDK_VERSION}` },
    load: async () => ({ default: { activate(ctx: SessionContext) { contexts.set(id, ctx); } } }),
  })));
  await session.apply({ schema: 1, id: 'test/render', name: 'Render', plugins: ['test/world', 'test/view'] });
  const worldCtx = contexts.get('test/world')!;
  const viewCtx = contexts.get('test/view')!;
  const world = render.createRoot(worldCtx, 'world');
  const view = render.createRoot(viewCtx, 'view');
  const ortho = new THREE.OrthographicCamera(-2, 2, 1, -1, 0.1, 100);
  ortho.position.z = 5;
  render.setWorldCamera(worldCtx, ortho);
  render.setEnvironment({ background: 0x203040, fog: null });
  const texture = render.texture(worldCtx, 'gray', { width: 2, height: 2, paint(g) {
    g.fillStyle = '#808080'; g.fillRect(0, 0, 2, 2);
  } });
  const shared = render.texture(viewCtx, 'gray', { width: 2, height: 2, paint() { throw new Error('not shared'); } });
  check('shared texture identity and sRGB annotation', texture === shared && texture.colorSpace === THREE.SRGBColorSpace);
  const geometry = render.own(worldCtx, new THREE.PlaneGeometry(2, 2));
  const material = render.own(worldCtx, new THREE.MeshBasicMaterial({ map: texture }));
  const panel = new THREE.Mesh(geometry, material);
  world.add(panel);
  const gl = canvas.getContext('webgl2')!;
  const pixel = (x: number, y: number): number[] => {
    const bytes = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return [...bytes];
  };
  host.render();
  const gray = pixel(160, 100);
  check('sRGB painter round trip (128)', gray.slice(0, 3).every(v => Math.abs(v - 128) <= 1));
  check('orthographic camera actually draws world', pixel(10, 100)[0] === 32);
  const overlay = new THREE.Mesh(
    render.own(viewCtx, new THREE.PlaneGeometry(0.3, 0.3)),
    render.own(viewCtx, new THREE.MeshBasicMaterial({ color: 0x00ff00 })),
  );
  overlay.position.z = -1;
  view.add(overlay);
  // Put world geometry very close to the orthographic near plane: without clearDepth the overlay fails depth testing.
  panel.position.z = 4.8;
  host.render();
  check('view layer clears depth without clearing world color', pixel(160, 100)[1] === 255 && pixel(10, 100)[0] === 32);
  check('stats combine both layers', render.stats.calls === 2 && render.stats.triangles === 4);
  canvas.style.width = '200px'; canvas.style.height = '320px';
  host.resize();
  check('portrait resize preserves orthographic vertical span', ortho.top === 1 && ortho.bottom === -1 && Math.abs(ortho.right - ortho.left - 1.25) < 1e-10);
  check('legacy camera stays perspective with YXZ rotation', render.camera.isPerspectiveCamera && render.camera.rotation.order === 'YXZ');
  worldCtx.scope.dispose();
  host.render();
  check('world disposal releases geometry and retains shared texture', render.stats.geometries === 1 && host.assets.size === 1);
  viewCtx.scope.dispose();
  host.render();
  check('all scopes release roots and GPU resources', host.liveRoots() === 0 && host.assets.size === 0 && render.stats.geometries === 0 && render.stats.textures === 0);
  check('no WebGL errors', gl.getError() === gl.NO_ERROR);
  session.stop();
  host.dispose();
  host.dispose();
  return checks;
}

void run().then(checks => { (window as unknown as { __renderChecks: [string, boolean][] }).__renderChecks = checks; });
