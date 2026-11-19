import * as THREE from './mini3/index.ts';
import type { RenderService } from '../../sdk/render.ts';
import type { SessionContext } from '../../kernel/host.ts';
import type { Painter } from '../../sdk/contracts/game.ts';
import { AssetStore } from '../../kernel/assets.ts';
import { createWorldCameraSelection, resizeCamera } from './cameras.ts';

export interface RenderHost {
  service: RenderService;
  assets: AssetStore;
  setPixelRatioCap(n: number): void;
  resize(): void;
  render(): void;
  /** The world camera drawn last frame (audio listener follows it). */
  activeCamera(): THREE.Camera;
  liveRoots(): number;
  /** The world scene (debugging and browser tests only; plugins draw through createRoot). */
  readonly worldScene: THREE.Scene;
  dispose(): void;
}

export function createRenderHost(canvas: HTMLCanvasElement, opts: { pixelRatioCap: number }): RenderHost {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.info.autoReset = false;
  renderer.autoClear = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const worldScene = new THREE.Scene();
  const viewScene = new THREE.Scene();
  viewScene.background = null;
  viewScene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  const viewCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
  camera.rotation.order = viewCamera.rotation.order = 'YXZ';
  const assets = new AssetStore();
  let cap = opts.pixelRatioCap;
  let roots = 0;
  let disposed = false;

  const stats = { calls: 0, triangles: 0, geometries: 0, textures: 0 };
  const cameras = createWorldCameraSelection(camera, () => service.width / service.height);
  const service: RenderService & { width: number; height: number; pixelRatio: number } = {
    renderer,
    camera,
    viewCamera,
    setWorldCamera: (ctx, selected) => cameras.set(ctx, selected),
    width: 1,
    height: 1,
    pixelRatio: 1,
    stats,
    createRoot(ctx: SessionContext, layer: 'world' | 'view'): THREE.Group {
      const g = new THREE.Group();
      g.name = ctx.pluginId;
      (layer === 'world' ? worldScene : viewScene).add(g);
      roots++;
      ctx.scope.add(() => {
        roots--;
        g.removeFromParent();
      }, 'scene-root');
      return g;
    },
    setEnvironment(env) {
      worldScene.background = new THREE.Color(env.background);
      worldScene.fog = env.fog ? new THREE.Fog(env.fog.color, env.fog.near, env.fog.far) : null;
    },
    own<T extends { dispose(): void }>(ctx: SessionContext, resource: T): T {
      ctx.scope.add(() => resource.dispose(), 'gpu-resource');
      return resource;
    },
    shared<T extends { dispose(): void }>(ctx: SessionContext, key: string, create: () => T): T {
      return assets.acquire(ctx.scope, key, create, (v) => v.dispose());
    },
    texture(ctx: SessionContext, key: string, painter: Painter, o?: { repeat?: boolean }): THREE.Texture {
      const repeat = !!o?.repeat;
      return assets.acquire(
        ctx.scope,
        `texture:${key}:${repeat ? 'repeat' : 'clamp'}`,
        () => {
          const c = document.createElement('canvas');
          c.width = painter.width;
          c.height = painter.height;
          const g = c.getContext('2d');
          if (g) painter.paint(g);
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace;
          t.generateMipmaps = false;
          t.magFilter = THREE.NearestFilter;
          t.minFilter = THREE.NearestFilter;
          if (repeat) {
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
          }
          return t;
        },
        (t) => t.dispose(),
      );
    },
  };

  function resize(): void {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const pr = Math.min(globalThis.devicePixelRatio || 1, cap);
    const bw = Math.max(1, Math.floor(w * pr));
    const bh = Math.max(1, Math.floor(h * pr));
    if (canvas.width !== bw || canvas.height !== bh || service.pixelRatio !== pr) {
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
    }
    service.width = w;
    service.height = h;
    service.pixelRatio = pr;
    resizeCamera(camera, w / h);
    resizeCamera(viewCamera, w / h);
    if (cameras.current() !== camera) resizeCamera(cameras.current(), w / h);
  }

  return {
    service,
    assets,
    setPixelRatioCap(n) {
      cap = n;
      resize();
    },
    resize,
    render() {
      if (disposed) return;
      renderer.info.reset();
      renderer.render(worldScene, cameras.current());
      renderer.clearDepth();
      const saved = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.render(viewScene, viewCamera);
      } finally {
        renderer.autoClear = saved;
      }
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.geometries = renderer.info.memory.geometries;
      stats.textures = renderer.info.memory.textures;
    },
    activeCamera: () => cameras.current(),
    liveRoots: () => roots,
    worldScene,
    dispose() {
      if (disposed) return;
      disposed = true;
      cameras.clear();
      worldScene.clear();
      viewScene.clear();
      renderer.dispose();
    },
  };
}
