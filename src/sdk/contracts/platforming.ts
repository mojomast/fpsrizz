/** Reusable side-scrolling platform physics. Screen coordinates: +x right, +y down, units are game-defined. */
import { defineRole } from '../core.ts';
import type { SessionContext } from '../core.ts';

export interface PlatformerConfig {
  /** Maximum horizontal speed while grounded. */
  readonly runSpeed: number;
  readonly groundAcceleration: number;
  readonly groundFriction: number;
  readonly airAcceleration: number;
  readonly gravity: number;
  readonly maxFallSpeed: number;
  readonly jumpSpeed: number;
  readonly doubleJumpSpeed: number;
  /** Extra downward acceleration applied when jump is released while rising. */
  readonly jumpCut: number;
  readonly coyoteTime: number;
  readonly jumpBuffer: number;
  readonly dashSpeed: number;
  readonly dashDuration: number;
  readonly dashCooldown: number;
  /** Time after a dash where ordinary horizontal control resumes softly. */
  readonly dashExitFactor: number;
  readonly wallSlideSpeed: number;
  readonly wallJumpX: number;
  readonly wallJumpY: number;
}

export const PLATFORMER_DEFAULTS: PlatformerConfig = Object.freeze({
  runSpeed: 7.4,
  groundAcceleration: 54,
  groundFriction: 44,
  airAcceleration: 32,
  gravity: 34,
  maxFallSpeed: 18,
  jumpSpeed: 13.2,
  doubleJumpSpeed: 11.6,
  jumpCut: 24,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
  dashSpeed: 16.5,
  dashDuration: 0.16,
  dashCooldown: 0.7,
  dashExitFactor: 0.55,
  wallSlideSpeed: 3.4,
  wallJumpX: 8.6,
  wallJumpY: 11.8,
});

/** Mutable physics body. Consumers own it and may persist/interpolate its fields. */
export interface PlatformerBody {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  groundedLast: boolean;
  coyote: number;
  jumpBuffer: number;
  jumpsUsed: number;
  dashTime: number;
  dashCooldown: number;
  dashAvailable: boolean;
  dashing: boolean;
  dashDirection: 1 | -1;
  wallDir: -1 | 0 | 1;
  wallSliding: boolean;
  dropThrough: number;
}

export interface PlatformerInput {
  /** -1 left, 0 neutral, 1 right. */
  readonly moveX: -1 | 0 | 1;
  readonly jumpHeld: boolean;
  readonly jumpPressed: boolean;
  readonly dashPressed: boolean;
  readonly downHeld: boolean;
}

export interface PlatformerAbilities {
  readonly doubleJump: boolean;
  readonly dash: boolean;
  readonly wallJump: boolean;
}

export type PlatformerCollisionKind = 'empty' | 'solid' | 'oneway';
/** Query whether an axis-aligned body overlaps solid/one-way terrain. */
export type PlatformerCollisionQuery = (x: number, y: number, w: number, h: number) => PlatformerCollisionKind;

export interface PlatformerStepResult {
  readonly jumped: boolean;
  readonly doubleJumped: boolean;
  readonly dashed: boolean;
  readonly wallJumped: boolean;
  readonly landed: boolean;
  readonly hitWall: boolean;
  readonly hitCeiling: boolean;
  readonly droppedThrough: boolean;
}

export interface PlatformerHandle {
  readonly config: PlatformerConfig;
  step(body: PlatformerBody, input: PlatformerInput, abilities: PlatformerAbilities, query: PlatformerCollisionQuery, dt: number): PlatformerStepResult;
}

/**
 * Stateless platformer provider. The consumer supplies collision and ability policy; the provider owns jump timing,
 * acceleration, dash and wall interaction. It never reads input or mutates the world by itself.
 */
export interface PlatformerProvider {
  readonly name: string;
  readonly description: string;
  create(config?: Partial<PlatformerConfig>): PlatformerHandle;
}

export const PlatformerRole = defineRole<PlatformerProvider>('sdk/platformer');

export function createPlatformerBody(
  x: number,
  y: number,
  w: number,
  h: number,
  overrides: Partial<PlatformerBody> = {},
): PlatformerBody {
  return {
    x, y, prevX: x, prevY: y, w, h, vx: 0, vy: 0, facing: 1,
    grounded: false, groundedLast: false, coyote: 0, jumpBuffer: 0, jumpsUsed: 0,
    dashTime: 0, dashCooldown: 0, dashAvailable: true, dashing: false, dashDirection: 1,
    wallDir: 0, wallSliding: false, dropThrough: 0, ...overrides,
  };
}

/** Resolve the selected provider. Absence is a composition error, not a silent fallback. */
export function platformerMechanic(ctx: SessionContext): PlatformerProvider {
  const selected = ctx.role(PlatformerRole);
  if (!selected) throw new Error('Select sdk/platformer in the preset');
  return selected.provider;
}
