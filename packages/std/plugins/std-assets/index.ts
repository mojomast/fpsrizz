/**
 * std/assets: the `sdk/models` service (packages/sdk/src/render.ts). Bytes come from the host asset service (`sdk/assets`), so
 * manifest preloads, progress and refcounting are shared with everything else; parsing uses the official Three.js
 * GLTFLoader with the Meshopt decoder and the KTX2 (Basis Universal) transcoder from `vendor/basis/`.
 *
 * `instance(ctx, "models/x.glb")` clones the whole default scene; `instance(ctx, "models/x.glb#3")` clones only glTF
 * node 3 (without its child nodes - those are separate entities when the scene was spawned with spawnGltfScene).
 * Geometry, materials and textures are shared between instances and disposed with the last owning scope.
 */
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Assets, definePlugin, isMeshCarrier } from '@bulkhead/sdk';
import type { GltfJson } from '@bulkhead/sdk';
import type { SessionContext } from '@bulkhead/sdk';
import { Models, Render, THREE } from '@bulkhead/sdk/render.ts';
import type { ModelService } from '@bulkhead/sdk/render.ts';

/** Where the build copies three/examples/jsm/libs/basis (scripts/build.mjs, scripts/dev.mjs). */
export const BASIS_TRANSCODER_PATH = 'vendor/basis/';

interface Loaded {
  scene: THREE.Object3D;
  /** glTF node index -> object. */
  nodes: Map<number, THREE.Object3D>;
  /** Objects of glTF nodes that are separate entities (everything except mesh carriers). */
  separate: Set<THREE.Object3D>;
  skinned: boolean;
}
interface Entry { promise: Promise<Loaded>; dispose(): void }

function disposeTree(root: THREE.Object3D): void {
  const done = new Set<{ dispose(): void }>();
  const drop = (r: { dispose(): void } | null | undefined): void => {
    if (r && !done.has(r)) { done.add(r); r.dispose(); }
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) drop(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) drop(v);
      drop(mat);
    }
  });
}

function baseDir(path: string): string {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const base = (globalThis as { document?: { baseURI: string } }).document?.baseURI;
  return base ? new URL(dir, base).href : dir;
}

/** A copy of one glTF node without its child nodes that are separate entities (primitives and mesh carriers stay). */
function cloneNode(node: THREE.Object3D, nodeObjects: ReadonlySet<THREE.Object3D>): THREE.Object3D {
  const copy = node.clone(false);
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.set(1, 1, 1);
  for (const child of node.children) if (!nodeObjects.has(child)) copy.add(child.clone(true));
  return copy;
}

export default definePlugin({
  activate(ctx) {
    const assets = ctx.services.get(Assets);
    const render = ctx.services.tryGet(Render);
    let ktx2: KTX2Loader | undefined;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const ktx2Loader = (): KTX2Loader | undefined => {
      if (ktx2 || !render?.renderer) return ktx2;
      ktx2 = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH);
      ktx2.detectSupport(render.renderer as never);
      loader.setKTX2Loader(ktx2);
      return ktx2;
    };
    ctx.scope.add(() => ktx2?.dispose(), 'ktx2-workers');

    const load = async (owner: SessionContext, path: string): Promise<Loaded> => {
      const bytes = await assets.bytes(owner, path);
      ktx2Loader();
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const gltf: GLTF = await loader.parseAsync(buffer, baseDir(path));
      const nodes = new Map<number, THREE.Object3D>();
      let skinned = false;
      const scene = gltf.scene as unknown as THREE.Object3D;
      scene.traverse((o) => {
        const a = gltf.parser.associations.get(o as never);
        if (a?.nodes !== undefined && !nodes.has(a.nodes)) nodes.set(a.nodes, o);
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true;
      });
      const json = gltf.parser.json as GltfJson;
      const separate = new Set([...nodes].filter(([i]) => !isMeshCarrier(json, i)).map(([, o]) => o));
      return { scene, nodes, separate, skinned };
    };

    const entry = (owner: SessionContext, path: string): Entry => {
      if (!render) {
        // Headless (tests): no GPU resources to share, but keep the same API.
        const promise = load(owner, path);
        return { promise, dispose() {} };
      }
      return render.shared(owner, `std/assets:gltf:${path}`, () => {
        const promise = load(owner, path);
        promise.catch(() => {});
        return { promise, dispose() { promise.then((l) => disposeTree(l.scene), () => {}); } };
      });
    };

    const models: ModelService = {
      async instance(owner, url) {
        const hash = url.indexOf('#');
        const path = hash < 0 ? url : url.slice(0, hash);
        const frag = hash < 0 ? undefined : url.slice(hash + 1);
        const loaded = await owner.guard(entry(owner, path).promise);
        if (frag === undefined || frag === '') return loaded.skinned ? (cloneSkinned(loaded.scene as never) as unknown as THREE.Object3D) : loaded.scene.clone(true);
        const node = /^\d+$/.test(frag) ? loaded.nodes.get(Number(frag)) : loaded.scene.getObjectByName(frag);
        if (!node) throw new Error(`"${path}" has no node "${frag}"`);
        return cloneNode(node, loaded.separate);
      },
    };
    ctx.services.provide(Models, models);
  },
});
