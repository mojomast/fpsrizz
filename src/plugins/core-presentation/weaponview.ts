import type { SessionContext, ViewState, WeaponDef } from '../../sdk/index.ts';
import { Health, Inventory, Player, Weapons, yawDirX, yawDirZ } from '../../sdk/index.ts';
import { THREE } from '../../sdk/render.ts';
import type { ThemeAssets } from './assets.ts';
import { createQuadGeometry, parseColor } from './quads.ts';

/** Half of the view camera's vertical extent at depth 1 (fov 50). */
const HALF_H = Math.tan((25 * Math.PI) / 180);
const DEPTH = 1;
const SIZE = 0.62; // sprite quad side, in view units (screen height = 2 * HALF_H)
const BOTTOM = -HALF_H - 0.02;
const SWITCH_TIME = 0.25;
const RECOIL_TIME = 0.15;
const FLASH_TIME = 0.05;

export interface WeaponView {
  update(view: ViewState | undefined, time: number, frameDt: number): void;
}

/** Where the barrel ends in a sprite: top-most opaque rows, as a fraction of the sprite (u from left, v from top). */
function findMuzzle(assets: ThemeAssets, key: string): { u: number; v: number } {
  const p = assets.painter(key);
  if (!p) return { u: 0.55, v: 0.2 };
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return { u: 0.55, v: 0.2 };
  p.paint(g);
  const d = g.getImageData(0, 0, p.width, p.height).data;
  for (let y = 0; y < p.height; y++) {
    let sum = 0;
    let n = 0;
    for (let x = 0; x < p.width; x++) {
      if (d[(y * p.width + x) * 4 + 3]! > 128) {
        sum += x;
        n++;
      }
    }
    if (n > 0) return { u: (sum / n + 0.5) / p.width, v: y / p.height };
  }
  return { u: 0.5, v: 0.2 };
}

export function createWeaponView(ctx: SessionContext, assets: ThemeAssets, worldRoot: THREE.Group): WeaponView {
  const render = assets.render;
  const root = render.createRoot(ctx, 'view');
  const geo = render.own(ctx, createQuadGeometry(0));
  const gun = new THREE.Mesh(geo, assets.unlit('switch-off'));
  gun.name = 'weapon';
  gun.visible = false;
  gun.scale.set(SIZE, SIZE, 1);
  root.add(gun);

  const flashMat = render.own(ctx, new THREE.MeshBasicMaterial({
    map: assets.texture('fx-muzzle', false), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
  }));
  const flash = new THREE.Mesh(render.own(ctx, createQuadGeometry(0.5)), flashMat);
  flash.name = 'muzzle-flash';
  flash.visible = false;
  flash.renderOrder = 1;
  root.add(flash);

  const flashLight = new THREE.PointLight(0xffffff, 2.2, 9);
  flashLight.visible = false;
  worldRoot.add(flashLight);

  const gunMats = new Map<string, THREE.Material>();
  const muzzles = new Map<string, { u: number; v: number }>();
  let shown: string | null = null;
  let shownTex = '';
  let phase = 0;
  let speed = 0;
  let flashColor = '';

  const gunMaterial = (tex: string): THREE.Material => {
    let m = gunMats.get(tex);
    if (!m) {
      m = render.own(ctx, new THREE.MeshBasicMaterial({ map: assets.texture(tex, false), alphaTest: 0.5 }));
      gunMats.set(tex, m);
    }
    return m;
  };

  const hide = (): void => {
    gun.visible = false;
    flash.visible = false;
    flashLight.visible = false;
  };

  return {
    update(view, time, frameDt) {
      if (!view || view.entity === 0) return hide();
      const inv = ctx.world.get(view.entity, Inventory);
      const hp = ctx.world.get(view.entity, Health);
      if (!inv || inv.current === null || (hp && hp.dead)) return hide();
      const player = ctx.world.get(view.entity, Player);

      // Weapon swap: lower the old one, swap art at the midpoint, raise the new one.
      const sinceSwitch = time - inv.switchedAt;
      if (inv.current !== shown && (shown === null || sinceSwitch >= SWITCH_TIME / 2)) {
        const def = ctx.registries.get(Weapons, inv.current);
        shown = inv.current;
        shownTex = def ? def.view : '';
        if (def && !muzzles.has(def.view)) muzzles.set(def.view, findMuzzle(assets, def.view));
      }
      const def: WeaponDef | undefined = shown === null ? undefined : ctx.registries.get(Weapons, shown);
      if (!def || shownTex === '') return hide();

      // Motion
      const target = player ? Math.max(0, Math.min(1, player.speed)) : 0;
      speed += (target - speed) * Math.min(1, frameDt * 10);
      phase += frameDt * (6 + 4 * speed);
      const x = Math.sin(phase) * 0.03 * speed + Math.sin(time * 0.9) * 0.003;
      let y = BOTTOM - Math.abs(Math.sin(phase)) * 0.028 * speed + Math.sin(time * 1.7) * 0.004;
      let kick = 0;
      const sinceFire = time - inv.lastFiredAt;
      if (sinceFire >= 0 && sinceFire < RECOIL_TIME) {
        const k = 1 - sinceFire / RECOIL_TIME;
        kick = k * k * def.recoil;
        y += kick * 0.06;
      }
      if (sinceSwitch >= 0 && sinceSwitch < SWITCH_TIME) {
        const h = SWITCH_TIME / 2;
        const f = sinceSwitch < h ? sinceSwitch / h : 1 - (sinceSwitch - h) / h;
        y -= f * f * (SIZE + 0.1);
      }
      const s = SIZE * (1 + kick * 0.1);
      gun.scale.set(s, s, 1);
      gun.position.set(x, y, -DEPTH);
      gun.material = gunMaterial(shownTex);
      gun.visible = true;

      // Muzzle flash
      const on = sinceFire >= 0 && sinceFire < FLASH_TIME;
      flash.visible = on;
      flashLight.visible = on;
      if (on) {
        if (def.flash !== flashColor) {
          flashColor = def.flash;
          flashMat.color = parseColor(def.flash, 0xffd070);
          flashLight.color = parseColor(def.flash, 0xffd070);
        }
        const m = muzzles.get(shownTex) ?? { u: 0.55, v: 0.2 };
        const size = 0.34 + 0.12 * (sinceFire / FLASH_TIME);
        flash.scale.set(size, size, 1);
        flash.position.set(x + (m.u - 0.5) * s, y + (1 - m.v) * s + 0.01, -DEPTH + 0.01);
        flash.rotation.z = (Math.floor(time * 60) % 4) * 1.3;
        flashLight.position.set(view.x + yawDirX(view.yaw) * 0.7, view.y - 0.1, view.z + yawDirZ(view.yaw) * 0.7);
      }
    },
  };
}
