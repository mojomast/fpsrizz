import type { EntityId, SessionContext, VisualDef } from '../../../../src/sdk/index.ts';
import { ThemeRole, Transform, Visual, angleDelta } from '../../../../src/sdk/index.ts';
import { Pickup } from '../../contracts/shooter.ts';
import { ActorRenderers, Render, THREE } from '../../../../src/sdk/render.ts';
import type { ActorFrame, ActorHandle, ActorRenderer } from '../../../../src/sdk/render.ts';
import { ThemeAssets } from './assets.ts';
import { animFrame, createQuadGeometry, frameGrid, setFrameUv } from './quads.ts';
import type { FrameGrid } from './quads.ts';

export const DEFAULT_RENDERER_ID = 'core/billboard';

/** An upright quad that always faces the view plane, bottom edge at the actor's anchor. */
class BillboardHandle implements ActorHandle {
  readonly object: THREE.Mesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly def: VisualDef;
  private readonly grid: FrameGrid;
  private readonly assets: ThemeAssets;
  private readonly release: (g: THREE.BufferGeometry) => void;
  private frame = -1;
  private tint: string;
  private disposed = false;

  constructor(assets: ThemeAssets, def: VisualDef, tint: string, release: (g: THREE.BufferGeometry) => void) {
    this.assets = assets;
    this.def = def;
    this.release = release;
    this.tint = tint;
    this.grid = frameGrid(def, assets.painter(def.texture));
    this.geo = createQuadGeometry(0);
    this.object = new THREE.Mesh(this.geo, assets.sprite(def, tint));
    this.object.name = `actor:${def.texture}`;
    this.object.renderOrder = 0;
  }

  update(f: ActorFrame): void {
    const v = f.visual;
    const o = this.object;
    o.position.set(f.x, f.y, f.z);
    o.rotation.y = f.viewYaw;
    o.scale.set(this.def.width * v.scale, this.def.height * v.scale, 1);
    if (v.tint !== this.tint) {
      this.tint = v.tint;
      o.material = this.assets.sprite(this.def, v.tint);
    }
    const anims = this.def.anims;
    const fr = animFrame(anims[v.state] ?? anims['idle'], f.time - v.stateAt);
    if (fr !== this.frame) {
      this.frame = fr;
      setFrameUv(this.geo, this.grid, fr);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.release(this.geo);
  }
}

/** The built-in renderer registered by this plugin as "core/billboard". */
export const billboardRenderer: ActorRenderer = {
  description: 'Upright camera-facing sprite quad driven by the theme visual and its animations.',
  start(ctx: SessionContext) {
    const render = ctx.services.get(Render);
    const theme = ctx.role(ThemeRole)?.provider;
    if (!theme) throw new Error('core/billboard needs a selected theme');
    const assets = new ThemeAssets(ctx, render, theme);
    const live = new Set<THREE.BufferGeometry>();
    ctx.scope.add(() => {
      for (const g of live) g.dispose();
      live.clear();
    }, 'billboard-geometry');
    const release = (g: THREE.BufferGeometry): void => {
      live.delete(g);
      g.dispose();
    };
    return (_entity: EntityId, visual: Readonly<Visual>): ActorHandle => {
      const def = assets.visual(visual.key);
      if (!def) {
        // The manager already skips unknown keys; stay inert if somebody calls the factory directly.
        const empty = new THREE.Group();
        return { object: empty, update() {}, dispose() { empty.removeFromParent(); } };
      }
      const h = new BillboardHandle(assets, def, visual.tint, release);
      live.add(h.object.geometry);
      return h;
    };
  },
};

interface Rec {
  handle: ActorHandle;
  renderer: string;
  key: string;
  stamp: number;
}

export interface Actors {
  update(alpha: number, time: number, viewYaw: number): void;
}

/** Keeps one ActorHandle per entity that has Transform + Visual. */
export function createActors(ctx: SessionContext, root: THREE.Group, assets: ThemeAssets): Actors {
  const recs = new Map<EntityId, Rec>();
  const actorRoot = new THREE.Group();
  actorRoot.name = 'actors';
  root.add(actorRoot);
  const frame: ActorFrame = { x: 0, y: 0, z: 0, yaw: 0, viewYaw: 0, time: 0, visual: undefined as unknown as Visual };
  let stamp = 0;
  let alpha = 0;

  ctx.scope.add(() => {
    for (const r of recs.values()) r.handle.dispose();
    recs.clear();
    actorRoot.removeFromParent();
  }, 'actors');

  const create = (e: EntityId, v: Readonly<Visual>): Rec | undefined => {
    const rid = v.renderer === '' ? DEFAULT_RENDERER_ID : v.renderer;
    if (rid === DEFAULT_RENDERER_ID && !assets.visual(v.key)) {
      assets.warnOnce(`visual:${v.key}`, `theme "${assets.theme.name}" has no visual "${v.key}"; entities using it are not drawn`);
      return undefined;
    }
    try {
      const factory = ctx.instantiate(ActorRenderers, rid, (def, owner) => def.start(owner));
      const handle = factory(e, v);
      actorRoot.add(handle.object);
      return { handle, renderer: v.renderer, key: v.key, stamp };
    } catch (err) {
      assets.warnOnce(`renderer:${rid}`, `actor renderer "${rid}" failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  const visit = (e: EntityId, v: Visual): void => {
    const t = ctx.world.get(e, Transform);
    if (!t) return;
    let rec = recs.get(e);
    if (rec && (rec.renderer !== v.renderer || rec.key !== v.key)) {
      rec.handle.dispose();
      recs.delete(e);
      rec = undefined;
    }
    if (!rec) {
      rec = create(e, v);
      if (!rec) return;
      recs.set(e, rec);
    }
    rec.stamp = stamp;
    frame.x = t.prevX + (t.x - t.prevX) * alpha;
    frame.z = t.prevZ + (t.z - t.prevZ) * alpha;
    frame.yaw = t.prevYaw + angleDelta(t.prevYaw, t.yaw) * alpha;
    frame.y = v.y;
    if (ctx.world.has(e, Pickup)) frame.y += 0.07 + Math.sin(frame.time * 2.6 + e * 1.7) * 0.06;
    frame.visual = v;
    rec.handle.update(frame);
  };

  return {
    update(a, time, viewYaw) {
      alpha = a;
      stamp++;
      frame.time = time;
      frame.viewYaw = viewYaw;
      ctx.world.each(Visual, visit);
      for (const [e, r] of recs) {
        if (r.stamp !== stamp) {
          r.handle.dispose();
          recs.delete(e);
        }
      }
    },
  };
}
