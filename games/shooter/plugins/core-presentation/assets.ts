import type { Painter, SessionContext, ThemeProvider, VisualDef } from '../../../../src/sdk/index.ts';
import { THREE } from '../../../../src/sdk/render.ts';
import type { RenderService } from '../../../../src/sdk/render.ts';
import { parseColor } from './quads.ts';

const MISSING: Painter = {
  width: 16,
  height: 16,
  paint(g) {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#ff00ff' : '#000000';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  },
};

/**
 * Per-session cache of textures and materials resolved through the selected theme.
 * Everything is acquired through the render service, so it is released with the owning plugin's scope.
 */
export class ThemeAssets {
  readonly render: RenderService;
  readonly theme: ThemeProvider;
  private readonly ctx: SessionContext;
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly warned = new Set<string>();

  constructor(ctx: SessionContext, render: RenderService, theme: ThemeProvider) {
    this.ctx = ctx;
    this.render = render;
    this.theme = theme;
  }

  warnOnce(id: string, message: string): void {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    this.ctx.log.warn(message);
  }

  painter(key: string): Painter | undefined {
    return this.theme.textures[key];
  }

  visual(key: string): VisualDef | undefined {
    return this.theme.visuals[key];
  }

  /** Theme texture (nearest filtered); unknown keys give the magenta/black checker and one warning. */
  texture(key: string, repeat: boolean): THREE.Texture {
    const ck = `${key}|${repeat ? 'r' : 'c'}`;
    let t = this.textures.get(ck);
    if (!t) {
      const p = this.theme.textures[key];
      if (!p) this.warnOnce(`tex:${key}`, `theme "${this.theme.name}" has no texture "${key}"; using the checker fallback`);
      t = this.render.texture(this.ctx, p ? `theme:${key}` : 'theme:__missing', p ?? MISSING, { repeat });
      this.textures.set(ck, t);
    }
    return t;
  }

  private cached(key: string, create: () => THREE.Material): THREE.Material {
    let m = this.materials.get(key);
    if (!m) {
      m = this.render.own(this.ctx, create());
      this.materials.set(key, m);
    }
    return m;
  }

  /** Lit tiling surface (walls, floors, ceilings, doors). */
  surface(key: string): THREE.Material {
    return this.cached(`surface|${key}`, () => new THREE.MeshLambertMaterial({ map: this.texture(key, true) }));
  }

  /** Unlit, single-sprite material (switch panels, decals). */
  unlit(key: string, repeat = false): THREE.MeshBasicMaterial {
    return this.cached(`unlit|${key}|${repeat}`, () => new THREE.MeshBasicMaterial({ map: this.texture(key, repeat) })) as THREE.MeshBasicMaterial;
  }

  /** Cutout / fullbright / additive material for a visual, optionally tinted. */
  sprite(def: VisualDef, tint: string): THREE.Material {
    const color = parseColor(tint, 0xffffff);
    return this.cached(`sprite|${def.texture}|${color}|${def.fullbright}|${def.additive}`, () => {
      const map = this.texture(def.texture, false);
      if (def.additive) return new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const params = { map, color, alphaTest: 0.5 };
      return def.fullbright ? new THREE.MeshBasicMaterial(params) : new THREE.MeshLambertMaterial(params);
    });
  }
}
