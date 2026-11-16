/**
 * Hollowmere screen-space canvas feedback.
 *
 * This module deliberately has no imports, no DOM lookups and no mutable module state. It draws only with the
 * supplied 2D context, after the caller has restored the world transform. Every coordinate below is therefore a
 * CSS pixel in the visible canvas, never a world unit.
 *
 * The projection matches the presentation plugin's existing world transform:
 *
 *   screenX = (worldX - cameraX) * scale
 *   screenY = (worldY - cameraY) * scale
 *
 * `cameraX`/`cameraY` are the world-space top-left of the view, and `scale` is pixels per world unit. The same
 * values already computed for the world pass can be reused directly.
 */

/** The small canvas surface this module needs. A real `CanvasRenderingContext2D` satisfies it structurally. */
export interface Canvas2D {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  strokeText(text: string, x: number, y: number, maxWidth?: number): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  globalAlpha: number;
  fillStyle: string | object;
  strokeStyle: string | object;
  lineWidth: number;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'bevel' | 'round' | 'miter';
  font: string;
  textAlign: 'left' | 'right' | 'center' | 'start' | 'end';
  textBaseline: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
  shadowColor: string;
  shadowBlur: number;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

/** Compact camera description. All values are in CSS pixels except `cameraX`/`cameraY`, which are world units. */
export interface ScreenProjection {
  readonly width: number;
  readonly height: number;
  /** Pixels per world unit. */
  readonly scale: number;
  /** World-space x that maps to screen x = 0. */
  readonly cameraX: number;
  /** World-space y that maps to screen y = 0. */
  readonly cameraY: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Structurally compatible with the SDK's `MetroEffectView`. */
export type ScreenEffectKind = 'slash' | 'spark' | 'dust' | 'damage' | 'heal' | 'sigil';

export interface ScreenEffectView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: ScreenEffectKind;
  readonly age: number;
  readonly life: number;
  readonly text?: string;
  readonly color?: string;
}

/** Optional player-attack feedback. `x`/`y` are the world-space centre of the slash arc. */
export interface AttackFeedbackView {
  readonly kind: 'side' | 'up' | 'down';
  /** 0 at the start of the swing, 1 when it has finished. */
  readonly progress: number;
  readonly x: number;
  readonly y: number;
  readonly facing?: 1 | -1;
  readonly color?: string;
}

export interface HealthFeedbackView {
  readonly health: number;
  readonly maxHealth: number;
  /** Optional normalised hit pulse (0..1) maintained by the caller and decayed over time. */
  readonly hitFlash?: number;
}

/** Screen-space slash arc. Start/end angle order determines sweep direction. */
export interface SlashArcView {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  /** 0..1; defaults to 1. */
  readonly progress?: number;
  readonly alpha?: number;
  readonly color?: string;
  readonly lineWidth?: number;
  readonly trailSegments?: number;
}

export interface ImpactBurstView {
  readonly x: number;
  readonly y: number;
  /** 0..1 lifetime progress. */
  readonly progress: number;
  readonly color?: string;
  /** Stable seed for deterministic spark angles; use the effect id. */
  readonly seed?: string;
  readonly reducedMotion?: boolean;
  /** Optional particle count, clamped to the primitive's own hard cap. */
  readonly particles?: number;
}

export interface ScreenEffectOptions {
  /** Hide numeric damage labels while keeping heal/sigil/loot text. Defaults to true. */
  readonly showDamage?: boolean;
  /** Reduce label travel/scale, particle spread and slash trail length. */
  readonly reducedMotion?: boolean;
  /** Suppress the full-screen hit flash and freeze the low-health pulse. */
  readonly reduceFlashes?: boolean;
  /** Base label size in pixels; clamped to 11..14. Defaults to 12. */
  readonly labelSize?: number;
  /** Per-frame label cap; never exceeds `SCREEN_EFFECT_LIMITS.labels`. */
  readonly maxLabels?: number;
  /** Per-frame impact cap; never exceeds `SCREEN_EFFECT_LIMITS.impacts`. */
  readonly maxImpacts?: number;
  /** Seconds, used only for the low-health pulse. */
  readonly time?: number;
  /** Fraction of max health below which the vignette starts. Defaults to 0.32. */
  readonly lowHealthThreshold?: number;
  /** Optional player attack feedback drawn above the world effects. */
  readonly attack?: AttackFeedbackView;
  /** Optional low-health and hit feedback. */
  readonly health?: HealthFeedbackView;
}

/**
 * Hard frame-budget caps. Callers may lower these through options, but cannot raise them.
 * The game itself keeps at most 64 effects; `effectScan` also protects against an unexpected large input.
 */
export const SCREEN_EFFECT_LIMITS = Object.freeze({
  labels: 12,
  impacts: 16,
  effectScan: 96,
  particles: 60,
  sparksPerImpact: 5,
  dustPuffs: 3,
  slashTrailSegments: 4,
  maxSlashTrailSegments: 6,
});

/** Label sizes stay inside the requested 11–14 CSS pixel range. */
export const DAMAGE_LABEL_FONT_PX = Object.freeze({ min: 11, max: 14, default: 12 });

/** Keep single-line labels inside a predictable horizontal footprint. */
export const MAX_DAMAGE_LABEL_CHARS = 14;

const TAU = Math.PI * 2;
const OUTLINE_COLOR = 'rgba(8,7,6,0.92)';
const LABEL_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** Default colour vocabulary. An effect's explicit `color` always wins. */
export const EFFECT_COLORS: Readonly<Record<ScreenEffectKind, string>> = Object.freeze({
  damage: '#ff9a7a',
  heal: '#a9e7b7',
  sigil: '#f0d98d',
  spark: '#f2d38b',
  slash: '#f6e3a6',
  dust: '#c9bfa6',
});

/** Project a world-space point into CSS-pixel screen space. */
export function projectWorld(projection: ScreenProjection, worldX: number, worldY: number): ScreenPoint {
  const scale = Number.isFinite(projection.scale) && projection.scale > 0 ? projection.scale : 1;
  const cameraX = Number.isFinite(projection.cameraX) ? projection.cameraX : 0;
  const cameraY = Number.isFinite(projection.cameraY) ? projection.cameraY : 0;
  return { x: (worldX - cameraX) * scale, y: (worldY - cameraY) * scale };
}

/** True when a projected point is inside the viewport, with an optional pixel margin for off-screen bleed. */
export function isOnScreen(projection: ScreenProjection, point: ScreenPoint, margin = 0): boolean {
  const { width, height } = projection;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

/** Resolve an effect colour, falling back to the kind palette. */
export function effectColor(kind: ScreenEffectKind, explicit?: string): string {
  return safeColor(explicit) ?? EFFECT_COLORS[kind];
}

/**
 * Draw floating damage/heal/loot labels in screen space.
 * Returns the number of labels drawn after applying the budget and culling.
 */
export function drawDamageLabels(
  canvas: Canvas2D,
  effects: readonly ScreenEffectView[],
  projection: ScreenProjection,
  options: ScreenEffectOptions = {},
): number {
  if (!hasViewport(projection)) return 0;
  const limit = clampInt(options.maxLabels ?? SCREEN_EFFECT_LIMITS.labels, 0, SCREEN_EFFECT_LIMITS.labels);
  if (limit === 0) return 0;
  const baseSize = clampLabelSize(options.labelSize ?? DAMAGE_LABEL_FONT_PX.default);
  const reducedMotion = options.reducedMotion === true;
  const scan = Math.min(effects.length, SCREEN_EFFECT_LIMITS.effectScan);
  let drawn = 0;

  for (let index = 0; index < scan && drawn < limit; index++) {
    const effect = effects[index];
    if (!effect) continue;
    if (options.showDamage === false && effect.kind === 'damage') continue;
    const text = cleanLabelText(effect.text);
    if (!text) continue;
    const progress = effectProgress(effect);
    if (progress === undefined) continue;
    const point = projectWorld(projection, effect.x, effect.y);
    if (!isOnScreen(projection, point, 48)) continue;

    drawDamageLabel(canvas, effect, point, progress, text, baseSize, reducedMotion);
    drawn++;
  }
  return drawn;
}

/**
 * Draw non-text impact effects (rings, sparks, dust puffs and generic slash entries) in screen space.
 * Text-bearing effects belong to {@link drawDamageLabels}; drawing one array through both functions is intended.
 * Returns the number of effect entries drawn after culling.
 */
export function drawImpactEffects(
  canvas: Canvas2D,
  effects: readonly ScreenEffectView[],
  projection: ScreenProjection,
  options: ScreenEffectOptions = {},
): number {
  if (!hasViewport(projection)) return 0;
  const limit = clampInt(options.maxImpacts ?? SCREEN_EFFECT_LIMITS.impacts, 0, SCREEN_EFFECT_LIMITS.impacts);
  if (limit === 0) return 0;
  const reducedMotion = options.reducedMotion === true;
  const scan = Math.min(effects.length, SCREEN_EFFECT_LIMITS.effectScan);
  let drawn = 0;
  let particleBudget = SCREEN_EFFECT_LIMITS.particles;

  for (let index = 0; index < scan && drawn < limit; index++) {
    const effect = effects[index];
    if (!effect) continue;
    if (cleanLabelText(effect.text)) continue;
    const progress = effectProgress(effect);
    if (progress === undefined) continue;
    const point = projectWorld(projection, effect.x, effect.y);
    if (!isOnScreen(projection, point, 40)) continue;
    const color = effectColor(effect.kind, effect.color);

    if (effect.kind === 'dust') {
      const puffs = Math.min(SCREEN_EFFECT_LIMITS.dustPuffs, particleBudget);
      if (puffs <= 0) continue;
      drawDustPuff(canvas, { x: point.x, y: point.y, progress, color, seed: effect.id, reducedMotion, particles: puffs });
      particleBudget -= puffs;
    } else if (effect.kind === 'spark') {
      const sparks = Math.min(reducedMotion ? 3 : SCREEN_EFFECT_LIMITS.sparksPerImpact, particleBudget);
      if (sparks <= 0) continue;
      drawSparkBurst(canvas, { x: point.x, y: point.y, progress, color, seed: effect.id, reducedMotion, particles: sparks });
      particleBudget -= sparks;
    } else if (effect.kind === 'slash') {
      drawSlashEffect(canvas, effect.id, point, progress, color, projection.scale, reducedMotion);
    } else {
      drawSoftRing(canvas, point, progress, color, reducedMotion);
    }
    drawn++;
  }
  return drawn;
}

/** Low-level screen-space spark ring + radial streaks. Angle selection is deterministic from `seed`. */
export function drawSparkBurst(canvas: Canvas2D, burst: ImpactBurstView): void {
  const progress = clamp(burst.progress, 0, 1);
  const color = effectColor('spark', burst.color);
  const reduced = burst.reducedMotion === true;
  const eased = easeOutCubic(progress);
  const alpha = (1 - progress) ** 1.35;
  if (alpha <= 0.001) return;
  const radius = 4 + (reduced ? 7 : 16) * eased;
  const seed = burst.seed ?? '';
  const count = clampInt(burst.particles ?? (reduced ? 3 : SCREEN_EFFECT_LIMITS.sparksPerImpact), 1, SCREEN_EFFECT_LIMITS.sparksPerImpact);

  canvas.save();
  canvas.lineCap = 'round';
  canvas.strokeStyle = color;

  canvas.globalAlpha = alpha * 0.5;
  canvas.lineWidth = Math.max(0.75, 2.2 * (1 - progress));
  canvas.beginPath();
  canvas.arc(burst.x, burst.y, radius, 0, TAU);
  canvas.stroke();

  canvas.globalAlpha = alpha * 0.95;
  canvas.lineWidth = Math.max(0.75, 1.7 * (1 - progress) + 0.35);
  for (let index = 0; index < count; index++) {
    const angle = hashUnit(seed, index) * TAU;
    const inner = radius * (0.55 + hashUnit(seed, index + 11) * 0.2);
    const length = (reduced ? 4 : 8) * (0.6 + hashUnit(seed, index + 23) * 0.8) * (1 - progress * 0.45);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    canvas.beginPath();
    canvas.moveTo(burst.x + cos * inner, burst.y + sin * inner);
    canvas.lineTo(burst.x + cos * (inner + length), burst.y + sin * (inner + length));
    canvas.stroke();
  }

  canvas.globalAlpha = alpha * 0.8;
  canvas.fillStyle = color;
  canvas.beginPath();
  canvas.arc(burst.x, burst.y, 1.2 + eased * 1.8, 0, TAU);
  canvas.fill();
  canvas.restore();
}

/** Low-level screen-space dust puff: up to three soft circles expanding and drifting upward. */
export function drawDustPuff(canvas: Canvas2D, puff: ImpactBurstView): void {
  const progress = clamp(puff.progress, 0, 1);
  const color = effectColor('dust', puff.color);
  const reduced = puff.reducedMotion === true;
  const alpha = (1 - progress) ** 1.15 * 0.34;
  if (alpha <= 0.001) return;
  const seed = puff.seed ?? '';
  const spread = (reduced ? 8 : 18) * progress;
  const count = clampInt(puff.particles ?? SCREEN_EFFECT_LIMITS.dustPuffs, 1, SCREEN_EFFECT_LIMITS.dustPuffs);

  canvas.save();
  canvas.fillStyle = color;
  for (let index = 0; index < count; index++) {
    const angle = -Math.PI / 2 + (hashUnit(seed, index) - 0.5) * 2.2;
    const distance = spread * (0.35 + hashUnit(seed, index + 7) * 0.65);
    const radius = (2.2 + progress * 3.5) * (0.7 + hashUnit(seed, index + 13) * 0.45);
    canvas.globalAlpha = alpha * (0.45 + hashUnit(seed, index + 19) * 0.55);
    canvas.beginPath();
    canvas.arc(
      puff.x + Math.cos(angle) * distance,
      puff.y + Math.sin(angle) * distance - progress * (reduced ? 1.5 : 4),
      radius,
      0,
      TAU,
    );
    canvas.fill();
  }
  canvas.restore();
}

/** Draw a fading screen-space slash arc. The trail is built from progressively shorter trailing arcs. */
export function drawSlashArc(canvas: Canvas2D, arc: SlashArcView): void {
  const radius = Math.max(0, arc.radius);
  const alpha = clamp(arc.alpha ?? 1, 0, 1);
  const progress = clamp(arc.progress ?? 1, 0, 1);
  const rawSweep = arc.endAngle - arc.startAngle;
  if (radius < 0.5 || alpha <= 0.001 || progress <= 0.001) return;
  if (!Number.isFinite(rawSweep) || Math.abs(rawSweep) < 0.001) return;

  const direction = rawSweep < 0 ? -1 : 1;
  const anticlockwise = direction < 0;
  const magnitude = Math.abs(rawSweep) * progress;
  if (magnitude < 0.001) return;
  const color = safeColor(arc.color) ?? EFFECT_COLORS.slash;
  const width = Math.max(0.5, arc.lineWidth ?? 2.4);
  const segments = clampInt(arc.trailSegments ?? SCREEN_EFFECT_LIMITS.slashTrailSegments, 1, SCREEN_EFFECT_LIMITS.maxSlashTrailSegments);

  canvas.save();
  canvas.strokeStyle = color;
  canvas.lineCap = 'round';
  canvas.lineJoin = 'round';

  // A faint, wider leading edge gives the arc a little glow without a blur pass.
  const headLength = Math.min(magnitude, Math.max(0.25, magnitude * 0.28));
  canvas.globalAlpha = alpha * 0.14;
  canvas.lineWidth = width * 2.6;
  canvas.beginPath();
  canvas.arc(arc.x, arc.y, radius, arc.startAngle + direction * (magnitude - headLength), arc.startAngle + direction * magnitude, anticlockwise);
  canvas.stroke();

  // Older trail segments start later along the sweep, so the leading edge stays brightest.
  for (let index = segments - 1; index >= 0; index--) {
    const lag = index * Math.min(0.16, magnitude / Math.max(2, segments + 1));
    const segmentMagnitude = Math.max(0, magnitude - lag);
    if (segmentMagnitude < 0.01) continue;
    const falloff = 1 - index / (segments + 0.5);
    canvas.globalAlpha = alpha * 0.9 * falloff;
    canvas.lineWidth = Math.max(0.6, width * (0.55 + falloff * 0.45));
    canvas.beginPath();
    canvas.arc(
      arc.x,
      arc.y,
      radius,
      arc.startAngle + direction * lag,
      arc.startAngle + direction * magnitude,
      anticlockwise,
    );
    canvas.stroke();
  }
  canvas.restore();
}

/** Draw optional player attack feedback from world-space attack state. */
export function drawAttackFeedback(
  canvas: Canvas2D,
  attack: AttackFeedbackView,
  projection: ScreenProjection,
  options: ScreenEffectOptions = {},
): void {
  if (!hasViewport(projection)) return;
  const progress = clamp(attack.progress, 0, 1);
  if (progress <= 0.001) return;
  const point = projectWorld(projection, attack.x, attack.y);
  if (!isOnScreen(projection, point, 96)) return;
  const reducedMotion = options.reducedMotion === true;
  const facing = attack.facing ?? 1;
  const baseRadius = clamp(projection.scale * (attack.kind === 'side' ? 1.05 : 0.95), 24, 64);
  const radius = baseRadius * (reducedMotion ? 1 : 1 + progress * 0.18);
  let startAngle = 0;
  let endAngle = 0;

  if (attack.kind === 'side') {
    startAngle = facing === 1 ? -1.25 : Math.PI - 1.25;
    endAngle = facing === 1 ? 1.25 : Math.PI + 1.25;
  } else if (attack.kind === 'up') {
    startAngle = Math.PI + 0.15;
    endAngle = TAU - 0.15;
  } else {
    startAngle = 0.15;
    endAngle = Math.PI - 0.15;
  }

  drawSlashArc(canvas, {
    x: point.x,
    y: point.y,
    radius,
    startAngle,
    endAngle,
    progress,
    alpha: clamp(0.8 - progress * 0.35, 0.18, 0.8),
    color: attack.color,
    lineWidth: clamp(projection.scale * 0.055, 1.5, 4),
    trailSegments: reducedMotion ? 2 : SCREEN_EFFECT_LIMITS.slashTrailSegments,
  });
}

/** Static (or gently pulsing) low-health edge vignette. The pulse is disabled by reduce-flashes/reduced-motion. */
export function drawLowHealthVignette(
  canvas: Canvas2D,
  projection: ScreenProjection,
  feedback: HealthFeedbackView,
  options: ScreenEffectOptions = {},
): void {
  if (!hasViewport(projection)) return;
  const threshold = clamp(options.lowHealthThreshold ?? 0.32, 0.05, 1);
  const ratio = clamp(feedback.health / Math.max(1, feedback.maxHealth), 0, 1);
  if (ratio >= threshold) return;
  const severity = (threshold - ratio) / threshold;
  const still = options.reduceFlashes === true || options.reducedMotion === true;
  const pulse = still ? 1 : 0.84 + Math.sin((options.time ?? 0) * 3.4) * 0.16;
  const alpha = clamp(0.12 + severity * 0.34, 0.12, 0.46) * pulse;
  const width = projection.width;
  const height = projection.height;
  const centreX = width / 2;
  const centreY = height / 2;
  const gradient = canvas.createRadialGradient(
    centreX,
    centreY,
    Math.max(1, Math.min(width, height) * 0.2),
    centreX,
    centreY,
    Math.max(2, Math.max(width, height) * 0.72),
  );
  gradient.addColorStop(0, 'rgba(82,6,8,0)');
  gradient.addColorStop(0.55, `rgba(82,6,8,${(alpha * 0.35).toFixed(3)})`);
  gradient.addColorStop(1, `rgba(126,10,10,${alpha.toFixed(3)})`);

  canvas.save();
  canvas.globalAlpha = 1;
  canvas.fillStyle = gradient;
  canvas.fillRect(0, 0, width, height);
  canvas.restore();
}

/**
 * Subtle hit flash. Normal mode caps the full-screen tint at 14% opacity. Reduce-flashes replaces the flash with
 * a thin, low-opacity red edge bleed so hit feedback survives without a full-screen luminance jump.
 */
export function drawHitFlash(
  canvas: Canvas2D,
  projection: ScreenProjection,
  strength: number,
  options: ScreenEffectOptions = {},
): void {
  if (!hasViewport(projection)) return;
  const intensity = clamp(strength, 0, 1);
  if (intensity <= 0.001) return;
  const width = projection.width;
  const height = projection.height;

  canvas.save();
  if (options.reduceFlashes === true) {
    const alpha = Math.min(0.055, intensity * 0.055);
    const band = Math.max(6, Math.min(width, height) * 0.045);
    canvas.fillStyle = `rgba(160,26,18,${alpha.toFixed(3)})`;
    canvas.fillRect(0, 0, width, band);
    canvas.fillRect(0, height - band, width, band);
    canvas.fillRect(0, 0, band, height);
    canvas.fillRect(width - band, 0, band, height);
  } else {
    const alpha = Math.min(0.14, intensity * 0.14);
    canvas.fillStyle = `rgba(255,92,70,${alpha.toFixed(3)})`;
    canvas.fillRect(0, 0, width, height);
  }
  canvas.restore();
}

/** Convenience wrapper for callers that only need health feedback. */
export function drawHealthFeedback(
  canvas: Canvas2D,
  projection: ScreenProjection,
  feedback: HealthFeedbackView,
  options: ScreenEffectOptions = {},
): void {
  drawLowHealthVignette(canvas, projection, feedback, options);
  drawHitFlash(canvas, projection, feedback.hitFlash ?? 0, options);
}

/**
 * One-call orchestrator for the presentation frame loop.
 *
 * Call this after the world pass has restored its transform. Draw order: low-health vignette, impacts, labels,
 * attack slash, hit flash. All caps and reduced-motion/reduce-flashes behaviour are applied here and in the
 * individual primitives.
 */
export function drawScreenEffects(
  canvas: Canvas2D,
  effects: readonly ScreenEffectView[],
  projection: ScreenProjection,
  options: ScreenEffectOptions = {},
): void {
  if (!hasViewport(projection)) return;
  if (options.health) drawLowHealthVignette(canvas, projection, options.health, options);
  drawImpactEffects(canvas, effects, projection, options);
  drawDamageLabels(canvas, effects, projection, options);
  if (options.attack) drawAttackFeedback(canvas, options.attack, projection, options);
  if (options.health) drawHitFlash(canvas, projection, options.health.hitFlash ?? 0, options);
}

// ---------------------------------------------------------------------------------------------------------------------
// Internal drawing and timing helpers
// ---------------------------------------------------------------------------------------------------------------------

function drawDamageLabel(
  canvas: Canvas2D,
  effect: ScreenEffectView,
  point: ScreenPoint,
  progress: number,
  text: string,
  baseSize: number,
  reducedMotion: boolean,
): void {
  const fadeIn = Math.min(1, progress / 0.08);
  const fadeOut = 1 - smoothstep(0.6, 1, progress);
  const alpha = fadeIn * fadeOut;
  if (alpha <= 0.001) return;
  const rise = (reducedMotion ? 4 : 24) * easeOutCubic(progress);
  const scale = reducedMotion ? 1 : 1 + 0.12 * (1 - Math.min(1, progress * 2.5));
  const fontSize = effect.kind === 'sigil' ? Math.min(DAMAGE_LABEL_FONT_PX.max, baseSize + 1) : baseSize;
  const y = point.y - rise;
  const maxWidth = fontSize * MAX_DAMAGE_LABEL_CHARS * 0.72;

  canvas.save();
  canvas.globalAlpha = alpha;
  canvas.translate(point.x, y);
  canvas.scale(scale, scale);
  canvas.font = `700 ${fontSize}px ${LABEL_FONT}`;
  canvas.textAlign = 'center';
  canvas.textBaseline = 'middle';
  canvas.lineJoin = 'round';
  canvas.lineWidth = 3;
  canvas.strokeStyle = OUTLINE_COLOR;
  canvas.shadowColor = 'rgba(0,0,0,0.7)';
  canvas.shadowBlur = 4;
  canvas.strokeText(text, 0, 0, maxWidth);
  canvas.shadowBlur = 0;
  canvas.fillStyle = effectColor(effect.kind, effect.color);
  canvas.fillText(text, 0, 0, maxWidth);
  canvas.restore();
}

function drawSlashEffect(
  canvas: Canvas2D,
  seed: string,
  point: ScreenPoint,
  progress: number,
  color: string,
  worldScale: number,
  reducedMotion: boolean,
): void {
  const facing = hashUnit(seed, 0) < 0.5 ? -1 : 1;
  const radius = clamp(worldScale * 1.05, 24, 56);
  drawSlashArc(canvas, {
    x: point.x,
    y: point.y,
    radius,
    startAngle: facing === 1 ? -1.2 : Math.PI - 1.2,
    endAngle: facing === 1 ? 1.2 : Math.PI + 1.2,
    progress: easeOutCubic(progress),
    alpha: (1 - progress) * 0.75,
    color,
    lineWidth: clamp(worldScale * 0.055, 1.2, 3.5),
    trailSegments: reducedMotion ? 2 : SCREEN_EFFECT_LIMITS.slashTrailSegments,
  });
}

function drawSoftRing(
  canvas: Canvas2D,
  point: ScreenPoint,
  progress: number,
  color: string,
  reducedMotion: boolean,
): void {
  const alpha = (1 - progress) ** 1.6 * 0.68;
  if (alpha <= 0.001) return;
  const radius = 3 + (reducedMotion ? 7 : 13) * easeOutCubic(progress);
  canvas.save();
  canvas.globalAlpha = alpha;
  canvas.strokeStyle = color;
  canvas.lineWidth = Math.max(0.6, 1.8 * (1 - progress) + 0.35);
  canvas.beginPath();
  canvas.arc(point.x, point.y, radius, 0, TAU);
  canvas.stroke();
  canvas.restore();
}

function effectProgress(effect: ScreenEffectView): number | undefined {
  if (!Number.isFinite(effect.age) || !Number.isFinite(effect.life) || effect.life <= 0) return undefined;
  if (effect.age < 0 || effect.age >= effect.life) return undefined;
  return clamp(effect.age / effect.life, 0, 1);
}

function cleanLabelText(text: string | undefined): string {
  if (!text) return '';
  const normalised = text.replace(/\s+/g, ' ').trim();
  if (!normalised) return '';
  const characters = Array.from(normalised);
  return characters.length > MAX_DAMAGE_LABEL_CHARS
    ? `${characters.slice(0, MAX_DAMAGE_LABEL_CHARS - 1).join('')}…`
    : normalised;
}

function safeColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const colour = value.trim();
  if (!colour || colour.length > 48 || /[\r\n]/.test(colour)) return undefined;
  return colour;
}

function hasViewport(projection: ScreenProjection): boolean {
  return Number.isFinite(projection.width) && Number.isFinite(projection.height)
    && projection.width > 0 && projection.height > 0;
}

function clampLabelSize(value: number): number {
  if (!Number.isFinite(value)) return DAMAGE_LABEL_FONT_PX.default;
  return clamp(Math.round(value), DAMAGE_LABEL_FONT_PX.min, DAMAGE_LABEL_FONT_PX.max);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic 0..1 hash. Used for particle angles, never for gameplay state. */
function hashUnit(seed: string, salt: number): number {
  let hash = 2166136261 ^ Math.imul(salt + 1, 0x9e3779b9);
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}
