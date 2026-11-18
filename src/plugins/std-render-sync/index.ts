import { Renderable, Transform3D, definePlugin, worldPose } from '../../sdk/index.ts';
import type { EntityId, SessionContext } from '../../sdk/index.ts';
import { Models, Render, RenderablePrefabs, THREE } from '../../sdk/render.ts';
import type { RenderService } from '../../sdk/render.ts';

interface Built { object: THREE.Object3D; dispose?: () => void; key: string }

const DEFAULT_COLOR = 0xcccccc;
const keyOf = (r: Readonly<Renderable>): string => JSON.stringify([r.shape, r.size, r.color, r.model, r.prefab, r.instanced, r.visible]);

function geometryFor(render: RenderService, ctx: SessionContext, r: Readonly<Renderable>): THREE.BufferGeometry {
  const s = { x: 1, y: 1, z: 1, ...r.size };
  const shape = r.shape ?? 'box';
  return render.shared(ctx, `std/render-sync:geo:${shape}:${s.x},${s.y},${s.z}`, () => {
    switch (shape) {
      case 'sphere': return new THREE.SphereGeometry(s.x / 2, 24, 16);
      case 'cylinder': return new THREE.CylinderGeometry(s.x / 2, s.x / 2, s.y, 24);
      case 'capsule': return new THREE.CapsuleGeometry(s.x / 2, Math.max(0, s.y - s.x), 6, 16);
      case 'plane': { const g = new THREE.PlaneGeometry(s.x, s.z); g.rotateX(-Math.PI / 2); return g; }
      default: return new THREE.BoxGeometry(s.x, s.y, s.z);
    }
  });
}

const materialFor = (render: RenderService, ctx: SessionContext, color: number): THREE.MeshStandardMaterial =>
  render.shared(ctx, `std/render-sync:mat:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 }));

export default definePlugin({
  activate(ctx) {
    const render = ctx.services.tryGet(Render);
    if (!render) return; // headless session: nothing to draw
    const root = render.createRoot(ctx, 'world');
    root.name = 'std/render-sync';
    const visuals = new Map<EntityId, Built>();
    const drawn = ctx.world.query({ with: [Transform3D, Renderable] });
    // Entities created by plugins that activated earlier: queries report no backlog, so draw them on the first frame.
    let initial: EntityId[] | undefined = drawn.ids();
    const warned = new Set<string>();
    const warnOnce = (msg: string): void => { if (!warned.has(msg)) { warned.add(msg); ctx.log.warn(msg); } };

    const build = (e: EntityId, r: Readonly<Renderable>): Built => {
      const key = keyOf(r);
      if (r.prefab) {
        const prefab = ctx.registries.get(RenderablePrefabs, r.prefab);
        if (prefab) {
          const made = ctx.instantiate(RenderablePrefabs, r.prefab, (def, owner) => (renderable: Readonly<Renderable>, entity: EntityId) => def.create(owner, renderable, entity))(r, e);
          return { object: made.object, ...(made.dispose ? { dispose: made.dispose } : {}), key };
        }
        warnOnce(`unknown prefab "${r.prefab}"; drawing a box`);
      }
      if (r.model) {
        const group = new THREE.Group();
        const placeholder = new THREE.Mesh(geometryFor(render, ctx, { shape: 'box', size: { x: 0.5, y: 0.5, z: 0.5 } }), materialFor(render, ctx, 0xff00ff));
        group.add(placeholder);
        const models = ctx.services.tryGet(Models);
        if (models) {
          models.instance(ctx, r.model).then((obj) => {
            if (visuals.get(e)?.object !== group) return; // replaced or removed meanwhile
            group.remove(placeholder);
            group.add(obj);
          }, (err: unknown) => warnOnce(`model "${r.model}" failed to load: ${String(err)}`));
        } else warnOnce('no sdk/models provider (add std/assets); drawing placeholders for Renderable.model');
        return { object: group, key };
      }
      const mesh = new THREE.Mesh(geometryFor(render, ctx, r), materialFor(render, ctx, r.color ?? DEFAULT_COLOR));
      return { object: mesh, key };
    };

    const drop = (e: EntityId): void => {
      const v = visuals.get(e);
      if (!v) return;
      visuals.delete(e);
      v.object.removeFromParent();
      v.dispose?.();
    };
    ctx.scope.add(() => { for (const e of [...visuals.keys()]) drop(e); }, 'render-sync-visuals');

    ctx.systems.addFrame({
      id: 'std/render-sync.frame',
      order: 100,
      update(alpha) {
        const { added: addedNow, removed, changed } = drawn.drain();
        const added = [...addedNow];
        if (initial) { added.unshift(...initial.filter((e) => drawn.has(e) && !added.includes(e))); initial = undefined; }
        for (const e of removed) drop(e);
        for (const e of [...added, ...changed]) {
          const r = ctx.world.get(e, Renderable);
          if (!r) continue;
          const existing = visuals.get(e);
          if (existing && existing.key === keyOf(r)) continue; // only the transform changed
          drop(e);
          const v = build(e, r);
          visuals.set(e, v);
          root.add(v.object);
        }
        drawn.each((e) => {
          const v = visuals.get(e);
          const pose = worldPose(ctx.world, e, alpha);
          if (!v || !pose) return;
          const o = v.object;
          o.position.set(pose.position.x, pose.position.y, pose.position.z);
          o.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
          o.scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
          o.visible = ctx.world.get(e, Renderable)!.visible !== false;
        });
      },
    });
  },
});

