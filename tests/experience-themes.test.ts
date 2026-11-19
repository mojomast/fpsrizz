import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definePlugin, ThemeRole } from '@bulkhead/sdk';
import type { CatalogEntry, Painter, SessionContext } from '@bulkhead/sdk';
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import arcade from '@bulkhead/std/theme-arcade/manifest.json' with { type: 'json' };
import board from '@bulkhead/std/theme-board/manifest.json' with { type: 'json' };
import story from '@bulkhead/std/theme-story/manifest.json' with { type: 'json' };
import { textures as arcadeTextures } from '@bulkhead/std/theme-arcade/generated.ts';
import { textures as boardTextures } from '@bulkhead/std/theme-board/generated.ts';
import { textures as storyTextures } from '@bulkhead/std/theme-story/generated.ts';

// Independent golden checksums of the checked-in PNGs' decoded RGBA bytes.
const checksums: Record<string, number> = {
  'race-backdrop': 0x58cb6c53, 'race-marker': 0x1bd78c11, 'race-vehicle-badge': 0x7e320368,
  'track-surface': 0xa3183a06, 'tactics-cover': 0xd9774041, 'tactics-enemy': 0x497ac312,
  'tactics-ground': 0x2ce0ccfb, 'tactics-unit': 0x1ca01acb, 'story-key': 0x34be4959,
  'story-lens': 0x37a0b397, 'story-portrait': 0x14524853, 'story-room': 0xafe65fb8,
};

function pixels(painter: Painter): Uint8ClampedArray {
  let result: Uint8ClampedArray | undefined;
  painter.paint({
    createImageData(width: number, height: number) {
      assert.equal(width, painter.width);
      assert.equal(height, painter.height);
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData(image: ImageData, x: number, y: number) {
      assert.equal(x, 0);
      assert.equal(y, 0);
      result = image.data;
    },
  } as unknown as CanvasRenderingContext2D);
  assert.ok(result, 'Painter synchronously produces pixels without DOM, ImageData global or network');
  return result;
}

test('palette/RLE painters reproduce the curated PNG pixel checksums and opaque tile backing', () => {
  const textures = { ...arcadeTextures, ...boardTextures, ...storyTextures };
  assert.equal(Object.keys(textures).length, 12);
  for (const [key, painter] of Object.entries(textures)) {
    const data = pixels(painter);
    let hash = 2166136261;
    for (const byte of data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    assert.equal(hash, checksums[key], key);
    assert.deepEqual(pixels(painter), data, `${key} is repeatable`);
    if (key === 'track-surface' || key === 'tactics-ground' || key === 'story-room') {
      for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255, `${key} opacity`);
    }
  }
});

test('three themes select and restart independently with all required game sound/texture keys', async () => {
  let captured: SessionContext | undefined;
  const probe: CatalogEntry = {
    manifest: { schema: 1, id: 'test/theme-probe', name: 'Theme probe', version: '1.0.0', kind: 'code', sdk: '^2.0.0' },
    load: async () => ({ default: definePlugin({ activate(ctx) { captured = ctx; } }) }),
  };
  const game = createHeadlessGame([
    probe,
    { manifest: arcade, load: () => import('@bulkhead/std/theme-arcade/index.ts') },
    { manifest: board, load: () => import('@bulkhead/std/theme-board/index.ts') },
    { manifest: story, load: () => import('@bulkhead/std/theme-story/index.ts') },
  ]);
  const packs = [
    ['arcade', ['track-surface', 'race-marker', 'race-vehicle'], ['race-checkpoint', 'race-finish', 'race-skid', 'race-engine']],
    ['board', ['tactics-unit', 'tactics-enemy', 'tactics-cover', 'tactics-ground'], ['tactics-select', 'tactics-move', 'tactics-attack', 'tactics-victory']],
    ['story', ['story-room', 'story-portrait', 'story-key', 'story-lens'], ['story-inspect', 'story-take', 'story-reveal', 'story-victory']],
  ] as const;
  try {
    for (const [name, textureKeys, soundKeys] of packs) {
      await game.host.apply(headlessPreset({ plugins: [`theme/${name}`, 'test/theme-probe'], roles: { 'sdk/theme': `theme/${name}` }, options: {} }));
      for (let restart = 0; restart < 2; restart++) {
        const role = captured!.role(ThemeRole)!;
        assert.equal(role.id, `theme/${name}`);
        for (const key of textureKeys) assert.ok(role.provider.textures[key], key);
        for (const key of soundKeys) {
          const sound = role.provider.sounds[key]!;
          assert.ok(sound.duration > 0 && sound.duration <= 1.5, key);
          assert.ok(sound.gain > 0 && sound.gain <= 1, key);
          assert.ok(sound.layers.length > 0, key);
          for (const layer of sound.layers) {
            assert.ok((layer.delay ?? 0) + (layer.duration ?? sound.duration) <= sound.duration + 1e-9, key);
            assert.ok(layer.gain.every(value => value >= 0 && value <= 1), key);
          }
        }
        if (restart === 0) await game.host.restart();
      }
    }
  } finally {
    game.host.stop();
  }
});
