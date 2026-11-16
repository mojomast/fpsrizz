import type { VisualAnim, VisualDef } from '../../sdk/index.ts';
import { ThemeRole, definePlugin } from '../../sdk/index.ts';
import { textures } from './art.ts';
import { sounds } from './sounds.ts';
import { assetrizzTextures } from './generated.ts';
import { weaponTextures } from './weapons.ts';
import { fantasyTextures } from './fantasy-generated.ts';
import { weaponTextures as fantasyWeapons } from './fantasy-weapons.ts';
import { cinderSurfaces } from './cinder.ts';
import { weaponTextures as cinderWeapons } from './cinder-weapons.ts';

const anim = (frames: number[], fps: number, loop: boolean): VisualAnim => ({ frames, fps, loop });

/** Four-frame enemy strip: 0 idle, 1 walk-a, 2 attack, 3 hurt (64x64 frames). */
function enemy(width: number, height: number): VisualDef {
  return {
    texture: '',
    frameW: 64,
    frameH: 64,
    width,
    height,
    fullbright: false,
    additive: false,
    anims: {
      idle: anim([0], 1, true),
      walk: anim([1, 0], 6, true),
      attack: anim([2], 1, false),
      hurt: anim([3], 1, false),
    },
  };
}

const corpse = (frame: number, size: number): VisualDef => ({
  texture: 'enemy-corpse',
  frameW: 64,
  frameH: 64,
  width: size,
  height: size,
  fullbright: false,
  additive: false,
  anims: { idle: anim([frame], 1, true) },
});

const pickup = (texture: string): VisualDef => ({
  texture,
  frameW: 32,
  frameH: 32,
  width: 0.6,
  height: 0.6,
  fullbright: false,
  additive: false,
  anims: { idle: anim([0], 1, true) },
});

const projectile = (texture: string): VisualDef => ({
  texture,
  frameW: 32,
  frameH: 32,
  width: 0.5,
  height: 0.5,
  fullbright: true,
  additive: true,
  anims: { idle: anim([0], 1, true), fly: anim([0], 1, true) },
});

const burst = (texture: string, size: number): VisualDef => ({
  texture,
  frameW: 32,
  frameH: 32,
  width: size,
  height: size,
  fullbright: true,
  additive: false,
  anims: { idle: anim([3], 1, false), once: anim([0, 1, 2, 3], 16, false) },
});

const visuals: Record<string, VisualDef> = {
  'enemy-grunt': { ...enemy(2.2, 2.2), texture: 'enemy-grunt' },
  'enemy-spitter': { ...enemy(2.3, 2.3), texture: 'enemy-spitter' },
  'enemy-spider': { ...enemy(1.9, 1.8), texture: 'enemy-spider' },
  'enemy-skeleton': { ...enemy(2.1, 2.3), texture: 'enemy-skeleton' },
  'enemy-ghost': { ...enemy(2.0, 2.2), texture: 'enemy-ghost' },
  'enemy-golem': { ...enemy(2.4, 2.6), texture: 'enemy-golem' },
  'enemy-bat': { ...enemy(1.7, 1.2), texture: 'enemy-bat' },
  'npc-smith': { ...enemy(2.0, 2.2), texture: 'npc-smith', anims: { idle: anim([0], 1, true), walk: anim([1, 0], 3, true) } },
  'npc-cartographer': { ...enemy(2.0, 2.2), texture: 'npc-cartographer', anims: { idle: anim([0], 1, true), walk: anim([1, 0], 3, true) } },
  'player-knight': { ...enemy(1.7, 2.3), texture: 'player-knight', anims: { idle: anim([0], 1, true), walk: anim([1, 0], 4, true), attack: anim([2], 1, false), hurt: anim([3], 1, false) } },
  'player-mage': { ...enemy(1.7, 2.3), texture: 'player-mage', anims: { idle: anim([0], 1, true), walk: anim([1, 0], 4, true), attack: anim([2], 1, false), hurt: anim([3], 1, false) } },
  'player-rogue': { ...enemy(1.7, 2.3), texture: 'player-rogue', anims: { idle: anim([0], 1, true), walk: anim([1, 0], 4, true), attack: anim([2], 1, false), hurt: anim([3], 1, false) } },
  'enemy-grunt-corpse': corpse(0, 2.2),
  'enemy-spitter-corpse': corpse(1, 2.3),
  'pickup-health': pickup('pickup-health'),
  'pickup-bullets': pickup('pickup-bullets'),
  'pickup-cells': pickup('pickup-cells'),
  'fx-plasma': projectile('fx-plasma'),
  'fx-fireball': projectile('fx-fireball'),
  'fx-ricochet': projectile('fx-ricochet'),
  'fx-spark': burst('fx-spark', 0.6),
  'fx-blood': burst('fx-blood', 0.6),
  'fx-muzzle': {
    texture: 'fx-muzzle',
    frameW: 64,
    frameH: 64,
    width: 0.8,
    height: 0.8,
    fullbright: true,
    additive: true,
    anims: { idle: anim([0], 1, true) },
  },
};

export default definePlugin({
  register(ctx) {
    ctx.provideRole(ThemeRole, 'theme/assetrizz', { name: 'Assetrizz Dark Sci-Fi', textures: { ...textures, ...assetrizzTextures, ...weaponTextures }, sounds, visuals });
    ctx.provideRole(ThemeRole, 'theme/assetrizz-fantasy', { name: 'Assetrizz Fantasy', textures: { ...textures, ...fantasyTextures, ...fantasyWeapons }, sounds, visuals });
    ctx.provideRole(ThemeRole, 'theme/assetrizz-cinder', { name: 'Assetrizz Cinder Vault', textures: { ...textures, ...fantasyTextures, ...fantasyWeapons, ...cinderWeapons, ...cinderSurfaces }, sounds, visuals });
    ctx.provideRole(ThemeRole, 'theme/assetrizz-hollowmere', { name: 'Assetrizz Hollowmere', textures: { ...textures, ...fantasyTextures, ...fantasyWeapons }, sounds, visuals });
  },
});
