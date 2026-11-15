import type { SessionContext, VisualAnim } from '../../sdk/index.ts';
import { THREE } from '../../sdk/render.ts';
import type { ThemeAssets } from './assets.ts';
import { animDuration, animFrame, createQuadGeometry, frameGrid, setFrameUv } from './quads.ts';
import type { FrameGrid } from './quads.ts';

const POOL_SIZE = 32;

interface Slot {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  grid: FrameGrid;
  anim: VisualAnim | undefined;
  start: number;
  duration: number;
  active: boolean;
  frame: number;
}

export interface Effects {
  spawn(effect: string, x: number, y: number, z: number, nx: number, nz: number, now: number): void;
  update(time: number, viewYaw: number): void;
}

/** Pool of up to 32 camera-facing quads playing a visual's one-shot animation; the oldest is reused when full. */
export function createEffects(ctx: SessionContext, root: THREE.Group, assets: ThemeAssets): Effects {
  const group = new THREE.Group();
  group.name = 'effects';
  root.add(group);
  const slots: Slot[] = [];

  const acquire = (): Slot => {
    for (const s of slots) if (!s.active) return s;
    if (slots.length < POOL_SIZE) {
      const geo = assets.render.own(ctx, createQuadGeometry(0.5));
      const mesh = new THREE.Mesh(geo, assets.unlit('switch-off'));
      mesh.visible = false;
      group.add(mesh);
      const s: Slot = { mesh, geo, grid: { cols: 1, rows: 1 }, anim: undefined, start: 0, duration: 0, active: false, frame: -1 };
      slots.push(s);
      return s;
    }
    let oldest = slots[0]!;
    for (const s of slots) if (s.start < oldest.start) oldest = s;
    return oldest;
  };

  return {
    spawn(effect, x, y, z, nx, nz, now) {
      if (effect === '') return;
      const def = assets.visual(effect);
      if (!def) return;
      const s = acquire();
      const anim = def.anims['once'] ?? def.anims['idle'];
      s.anim = anim;
      s.grid = frameGrid(def, assets.painter(def.texture));
      s.start = now;
      s.duration = anim && !anim.loop ? animDuration(anim) : 0.3;
      s.active = true;
      s.frame = -1;
      s.mesh.material = assets.sprite(def, '');
      s.mesh.scale.set(def.width, def.height, 1);
      s.mesh.position.set(x + nx * 0.06, y, z + nz * 0.06);
      s.mesh.visible = true;
    },
    update(time, viewYaw) {
      for (const s of slots) {
        if (!s.active) continue;
        const t = time - s.start;
        if (t >= s.duration) {
          s.active = false;
          s.mesh.visible = false;
          continue;
        }
        s.mesh.rotation.y = viewYaw;
        const fr = animFrame(s.anim, t);
        if (fr !== s.frame) {
          s.frame = fr;
          setFrameUv(s.geo, s.grid, fr);
        }
      }
    },
  };
}
