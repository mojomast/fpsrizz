import type {
  PlatformerAbilities,
  PlatformerBody,
  PlatformerCollisionQuery,
  PlatformerConfig,
  PlatformerHandle,
  PlatformerInput,
  PlatformerStepResult,
} from '../../sdk/index.ts';
import { PLATFORMER_DEFAULTS, PlatformerRole, definePlugin, isObject } from '../../sdk/index.ts';

const CONFIG_LIMITS: Readonly<Record<keyof PlatformerConfig, readonly [number, number]>> = Object.freeze({
  runSpeed: [0.1, 40], groundAcceleration: [1, 400], groundFriction: [1, 400], airAcceleration: [1, 300],
  gravity: [1, 200], maxFallSpeed: [1, 80], jumpSpeed: [1, 60], doubleJumpSpeed: [1, 60], jumpCut: [0, 160],
  coyoteTime: [0, 0.5], jumpBuffer: [0, 0.5], dashSpeed: [1, 80], dashDuration: [0.02, 1], dashCooldown: [0, 10],
  dashExitFactor: [0, 1], wallSlideSpeed: [0, 30], wallJumpX: [0, 40], wallJumpY: [0, 60],
});

function configOf(overrides: Partial<PlatformerConfig> | undefined): PlatformerConfig {
  const result = { ...PLATFORMER_DEFAULTS, ...(overrides ?? {}) };
  for (const [key, [min, max]] of Object.entries(CONFIG_LIMITS) as [keyof PlatformerConfig, readonly [number, number]][]) {
    const value = result[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`Platformer config ${key} must be a finite number from ${min} to ${max}`);
    }
  }
  return Object.freeze(result);
}

const approach = (value: number, target: number, delta: number): number =>
  value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);

type MutableStepResult = { -readonly [K in keyof PlatformerStepResult]: PlatformerStepResult[K] };
function output(): MutableStepResult {
  return { jumped: false, doubleJumped: false, dashed: false, wallJumped: false, landed: false, hitWall: false, hitCeiling: false, droppedThrough: false };
}

export default definePlugin({
  register(ctx) {
    ctx.provideRole(PlatformerRole, 'mechanics/platforming', Object.freeze({
      name: 'AABB side-scroller physics',
      description: 'Coyote/buffered jumps, variable height, double jump, dash, wall slide/jump and axis-separated AABB collision.',
      create(overrides?: Partial<PlatformerConfig>): PlatformerHandle {
        const config = configOf(overrides);
        return Object.freeze({
          config,
          step(body: PlatformerBody, input: PlatformerInput, abilities: PlatformerAbilities, query: PlatformerCollisionQuery, rawDt: number): PlatformerStepResult {
            if (!isObject(body) || !isObject(input) || !isObject(abilities) || typeof query !== 'function') throw new TypeError('Platformer step expects body, input, abilities and a collision query');
            const dt = Math.max(0, Math.min(0.1, Number.isFinite(rawDt) ? rawDt : 0));
            const events = output();
            if (dt === 0) return Object.freeze(events);
            body.prevX = body.x; body.prevY = body.y;
            const wasGrounded = body.grounded;
            body.groundedLast = wasGrounded;
            body.grounded = false;
            body.coyote = Math.max(0, body.coyote - dt);
            body.jumpBuffer = Math.max(0, body.jumpBuffer - dt);
            body.dashCooldown = Math.max(0, body.dashCooldown - dt);
            body.dropThrough = Math.max(0, body.dropThrough - dt);
            body.wallSliding = false;

            // Drop through a one-way platform with down + jump.
            if (input.downHeld && input.jumpPressed && wasGrounded) {
              const below = query(body.x + 0.05, body.y + body.h + 0.02, Math.max(0.01, body.w - 0.1), 0.06);
              if (below === 'oneway') { body.dropThrough = 0.22; body.jumpBuffer = 0; events.droppedThrough = true; }
            }

            if (input.moveX !== 0) body.facing = input.moveX;

            // Dash begins before acceleration so it preserves its burst.
            if (input.dashPressed && abilities.dash && body.dashCooldown <= 0 && body.dashAvailable && !body.dashing) {
              body.dashing = true;
              body.dashTime = config.dashDuration;
              body.dashCooldown = config.dashCooldown;
              body.dashAvailable = false;
              body.dashDirection = body.facing;
              body.vx = body.dashDirection * config.dashSpeed;
              body.vy = 0;
              events.dashed = true;
            }

            if (body.dashing) {
              body.dashTime = Math.max(0, body.dashTime - dt);
              body.vx = body.dashDirection * config.dashSpeed;
              body.vy = 0;
              if (body.dashTime === 0) {
                body.dashing = false;
                body.vx *= config.dashExitFactor;
              }
            } else {
              const target = input.moveX * config.runSpeed;
              const acceleration = wasGrounded
                ? input.moveX === 0 ? config.groundFriction : config.groundAcceleration
                : config.airAcceleration;
              body.vx = approach(body.vx, target, acceleration * dt);
            }

            if (input.jumpPressed && !events.droppedThrough) body.jumpBuffer = config.jumpBuffer;
            if (body.jumpBuffer > 0 && !events.droppedThrough) {
              if (wasGrounded || body.coyote > 0) {
                body.vy = -config.jumpSpeed;
                body.grounded = false;
                body.coyote = 0;
                body.jumpBuffer = 0;
                body.jumpsUsed = 1;
                events.jumped = true;
              } else if (abilities.wallJump && body.wallDir !== 0) {
                body.vx = -body.wallDir * config.wallJumpX;
                body.vy = -config.wallJumpY;
                body.facing = body.wallDir === 1 ? -1 : 1;
                body.wallDir = 0;
                body.jumpBuffer = 0;
                body.jumpsUsed = 1;
                events.wallJumped = true;
              } else if (abilities.doubleJump && body.jumpsUsed < 2) {
                body.vy = -config.doubleJumpSpeed;
                body.jumpBuffer = 0;
                body.jumpsUsed = 2;
                events.doubleJumped = true;
              }
            }

            if (!body.dashing) {
              if (!input.jumpHeld && body.vy < 0) body.vy += config.jumpCut * dt;
              body.vy = Math.min(config.maxFallSpeed, body.vy + config.gravity * dt);
              if (abilities.wallJump && !wasGrounded && body.wallDir !== 0 && input.moveX === body.wallDir && body.vy > 0) {
                body.vy = Math.min(body.vy, config.wallSlideSpeed);
                body.wallSliding = true;
              }
            }

            const moveX = body.vx * dt, moveY = body.vy * dt;
            const steps = Math.max(1, Math.min(12, Math.ceil(Math.max(Math.abs(moveX), Math.abs(moveY)) / 0.2)));
            for (let step = 0; step < steps; step++) {
              const dx = moveX / steps;
              if (dx !== 0) {
                body.x += dx;
                if (query(body.x, body.y, body.w, body.h) === 'solid') {
                  body.x -= dx;
                  body.vx = 0;
                  body.wallDir = dx > 0 ? 1 : -1;
                  events.hitWall = true;
                  if (body.dashing) { body.dashing = false; body.dashTime = 0; }
                }
              }
              const dy = moveY / steps;
              if (dy !== 0) {
                body.y += dy;
                const hit = query(body.x, body.y, body.w, body.h);
                if (hit === 'solid' || (hit === 'oneway' && dy > 0 && body.dropThrough <= 0)) {
                  body.y -= dy;
                  if (dy > 0) {
                    body.grounded = true;
                    if (!wasGrounded) events.landed = true;
                  } else events.hitCeiling = true;
                  body.vy = 0;
                }
              }
            }

            // Probe the ground and walls so coyote time and wall sliding survive exact contact.
            if (!events.landed) {
              const ground = query(body.x + 0.02, body.y + body.h + 0.04, Math.max(0.01, body.w - 0.04), 0.05);
              if (ground === 'solid' || (ground === 'oneway' && body.dropThrough <= 0)) body.grounded = true;
            }
            const wallProbe = (direction: -1 | 1): boolean =>
              query(body.x + (direction === 1 ? body.w : -0.06), body.y + body.h * 0.2, 0.06, body.h * 0.6) === 'solid';
            if (wallProbe(-1)) body.wallDir = -1;
            else if (wallProbe(1)) body.wallDir = 1;
            else if (!events.hitWall) body.wallDir = 0;

            if (body.grounded) {
              body.coyote = config.coyoteTime;
              body.jumpsUsed = 0;
              body.dashAvailable = true;
            }
            body.groundedLast = body.grounded;
            return Object.freeze(events);
          },
        });
      },
    }));
  },
});
