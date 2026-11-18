import test from 'node:test';
import assert from 'node:assert/strict';
import { drawScreenEffects } from '../plugins/hollowmere-presentation/effects.ts';
import type { Canvas2D, ScreenEffectView } from '../plugins/hollowmere-presentation/effects.ts';

class MockCanvas implements Canvas2D {
  globalAlpha = 1; fillStyle: string | object = ''; strokeStyle: string | object = ''; lineWidth = 1;
  lineCap: 'butt' | 'round' | 'square' = 'butt'; lineJoin: 'bevel' | 'round' | 'miter' = 'miter';
  font = ''; textAlign: 'left' | 'right' | 'center' | 'start' | 'end' = 'left';
  textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom' = 'alphabetic';
  shadowColor = ''; shadowBlur = 0;
  readonly texts: { text: string; x: number; y: number }[] = [];
  readonly translations: { x: number; y: number }[] = [];
  save(): void {} restore(): void {} beginPath(): void {} moveTo(): void {} lineTo(): void {} arc(): void {}
  fill(): void {} stroke(): void {} fillRect(): void {} translate(x: number, y: number): void { this.translations.push({ x, y }); } scale(): void {}
  fillText(text: string, x: number, y: number): void { this.texts.push({ text, x, y }); }
  strokeText(): void {}
  createRadialGradient(): { addColorStop(): void } { return { addColorStop() {} }; }
}

const effect = (id: string, text: string): ScreenEffectView => ({ id, x: 1, y: 1, kind: 'damage', age: .2, life: .7, text, color: '#ff9a7a' });

test('Hollowmere damage labels render in screen-space with a bounded 11–14px font', () => {
  const canvas = new MockCanvas();
  drawScreenEffects(canvas, [effect('a', '-8')], { width: 1280, height: 800, scale: 50, cameraX: 0, cameraY: 0 }, { showDamage: true });
  const label = canvas.texts.find(entry => entry.text === '-8');
  assert.ok(label);
  const origin = canvas.translations[0];
  assert.ok(origin && origin.x >= 45 && origin.x <= 55, `projected x was ${origin?.x}`);
  assert.ok(origin && origin.y >= 25 && origin.y <= 55, `projected y was ${origin?.y}`);
  assert.match(canvas.font, /(11|12|13|14)px/);
});

test('Hollowmere effect labels are capped and respect the damage toggle', () => {
  const canvas = new MockCanvas();
  const effects = Array.from({ length: 30 }, (_, index) => effect(String(index), `-${index + 1}`));
  drawScreenEffects(canvas, effects, { width: 1280, height: 800, scale: 50, cameraX: 0, cameraY: 0 }, { showDamage: true, maxLabels: 50 });
  assert.ok(canvas.texts.length <= 12, `expected at most 12 labels, got ${canvas.texts.length}`);
  const hidden = new MockCanvas();
  drawScreenEffects(hidden, effects, { width: 1280, height: 800, scale: 50, cameraX: 0, cameraY: 0 }, { showDamage: false });
  assert.equal(hidden.texts.length, 0);
});
