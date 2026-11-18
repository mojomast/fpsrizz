/**
 * SDK 3 input v2 (P1.5): analog axes, gamepads, touch and rebinding on top of the action model in shooter.ts
 * (`InputActions`, `Input`, `InputContexts`).
 *
 * - Gamepad buttons and touch buttons are virtual key codes ("GamepadA", "TouchA"...) that go into
 *   `InputActionDef.keys` next to keyboard codes, so contexts, consumption and rebinding treat every device alike.
 * - `InputAxes` entries combine digital actions (WASD) with analog sources (sticks); read them with
 *   `readAxis(tick, id)`. Convention: x right = +1, y down/back = +1 (like the Gamepad API and screen space), so
 *   "forward" is y = -1.
 * - `InputBindings` (host service) lists, rebinds and resets action keys; overrides persist in a local profile store.
 */
import { defineRegistry, defineService } from '../core.ts';
import type { RegistryToken } from '../core.ts';
import { InputActions as InputActionsToken } from './shooter.ts';
import type { TickInput } from './shooter.ts';

export type InputDevice = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

/** Standard-mapping gamepad buttons, in Gamepad API index order (https://w3c.github.io/gamepad/#remapping). */
export const GAMEPAD_BUTTONS = [
  'GamepadA', 'GamepadB', 'GamepadX', 'GamepadY', 'GamepadLB', 'GamepadRB', 'GamepadLT', 'GamepadRT',
  'GamepadBack', 'GamepadStart', 'GamepadLS', 'GamepadRS', 'GamepadUp', 'GamepadDown', 'GamepadLeft', 'GamepadRight', 'GamepadHome',
] as const;
/** On-screen touch buttons (shown for actions that list them in `keys`). */
export const TOUCH_BUTTONS = ['TouchA', 'TouchB', 'TouchC', 'TouchD'] as const;

/** Analog sources: gamepad sticks, the two analog triggers (x = LT, y = RT) and the on-screen touch sticks. */
export type AnalogSource = 'gamepad:left' | 'gamepad:right' | 'gamepad:triggers' | 'touch:left' | 'touch:right';

export interface InputAxisDef {
  label: string;
  /** Digital composite: [negative, positive] action ids for x (e.g. [left, right]). */
  x?: readonly [string, string];
  /** Digital composite for y: [negative (up/forward), positive (down/back)]. */
  y?: readonly [string, string];
  /** Analog sources; the strongest (digital included) wins. */
  sticks?: readonly AnalogSource[];
  /** Radial deadzone for analog sources (default 0.15), rescaled so output starts at 0. */
  deadzone?: number;
}
export const InputAxes = defineRegistry<InputAxisDef>('input-axis');

export interface AxisValue { readonly x: number; readonly y: number }
const ZERO: AxisValue = Object.freeze({ x: 0, y: 0 });

/** Axis value for this tick, length <= 1. Zero on adapters without axis support. */
export function readAxis(tick: TickInput, id: string): AxisValue {
  return tick.axis?.(id) ?? ZERO;
}

/** Applies a radial deadzone and clamps the vector to length 1. */
export function applyDeadzone(x: number, y: number, deadzone = 0.15): AxisValue {
  const len = Math.hypot(x, y);
  if (len <= deadzone || len === 0) return ZERO;
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

export interface BindingRow {
  action: string;
  label: string;
  /** Effective keys (override or registry default). */
  keys: readonly string[];
  defaults: readonly string[];
  overridden: boolean;
}
export interface InputBindingsService {
  /** Every action of the active session with its effective keys. */
  list(): BindingRow[];
  /** Replaces an action's keys (persisted). An empty list unbinds it. */
  rebind(action: string, keys: readonly string[]): void;
  /** Drops the override of one action, or of every action. */
  reset(action?: string): void;
  /**
   * Resolves with the next physical key / mouse button / gamepad button pressed (not routed to gameplay), or
   * undefined after `timeoutMs` (default 8000) or Escape.
   */
  capture(options?: { timeoutMs?: number }): Promise<string | undefined>;
  /** Device of the most recent input (for prompts: "Press A" vs "Press Space"). */
  readonly lastDevice: InputDevice;
}
export const InputBindings = defineService<InputBindingsService>('sdk/input-bindings');

const PRETTY: Record<string, string> = {
  Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', WheelUp: 'Wheel up', WheelDown: 'Wheel down',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space',
  GamepadUp: 'D-pad ↑', GamepadDown: 'D-pad ↓', GamepadLeft: 'D-pad ←', GamepadRight: 'D-pad →',
};
/** Human-readable key name for control lists and prompts. */
export function prettyKey(code: string): string {
  if (PRETTY[code]) return PRETTY[code]!;
  if (code.startsWith('Gamepad')) return `Pad ${code.slice(7)}`;
  if (code.startsWith('Touch')) return `Touch ${code.slice(5)}`;
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}

// ---------------------------------------------------------------------------------------------------------------------
// Default maps
// ---------------------------------------------------------------------------------------------------------------------

/** Action and axis ids created by `registerStandardControls(ctx, ns)`. */
export interface StandardControls {
  forward: string; back: string; left: string; right: string; jump: string; interact: string;
  /** Vector axis: WASD / arrows / D-pad / left stick / left touch stick. */
  move: string;
  /** Vector axis: right stick / right touch drag (mouse look stays on lookX/lookY). */
  look: string;
}

/**
 * Registers a keyboard + gamepad + touch default map under namespace `ns` ("mygame" -> "mygame/forward" ...):
 * move (WASD, arrows, D-pad, left stick, touch stick), look (right stick, touch drag), jump (Space, A, TouchA) and
 * interact (E, X, TouchB). Players can rebind every action from the pause menu.
 */
export function registerStandardControls(
  ctx: { register<T>(token: RegistryToken<T>, id: string, value: T): void },
  ns: string,
): StandardControls {
  const id = (n: string): string => `${ns}/${n}`;
  const c: StandardControls = { forward: id('forward'), back: id('back'), left: id('left'), right: id('right'), jump: id('jump'), interact: id('interact'), move: id('move'), look: id('look') };
  ctx.register(InputActionsToken, c.forward, { label: 'Move forward', keys: ['KeyW', 'ArrowUp', 'GamepadUp'] });
  ctx.register(InputActionsToken, c.back, { label: 'Move back', keys: ['KeyS', 'ArrowDown', 'GamepadDown'] });
  ctx.register(InputActionsToken, c.left, { label: 'Move left', keys: ['KeyA', 'ArrowLeft', 'GamepadLeft'] });
  ctx.register(InputActionsToken, c.right, { label: 'Move right', keys: ['KeyD', 'ArrowRight', 'GamepadRight'] });
  ctx.register(InputActionsToken, c.jump, { label: 'Jump', keys: ['Space', 'GamepadA', 'TouchA'] });
  ctx.register(InputActionsToken, c.interact, { label: 'Interact', keys: ['KeyE', 'GamepadX', 'TouchB'] });
  ctx.register(InputAxes, c.move, { label: 'Move', x: [c.left, c.right], y: [c.forward, c.back], sticks: ['gamepad:left', 'touch:left'] });
  ctx.register(InputAxes, c.look, { label: 'Look', sticks: ['gamepad:right', 'touch:right'] });
  return c;
}
