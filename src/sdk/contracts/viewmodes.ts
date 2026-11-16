import { defineEvent, defineService } from '../core.ts';

export type ViewMode = 'first-person' | 'isometric';
/**
 * Optional presentation service installed by a camera provider that supports more than one world-view projection.
 * Consumers may read the active mode to hide first-person-only chrome or adapt their UI; they must not assume every
 * camera provider offers it.
 */
export interface ViewModesService {
  readonly mode: ViewMode;
  readonly modes: readonly ViewMode[];
  /** Horizontal camera azimuth in radians for the isometric view. */
  readonly yaw: number;
  /** Rotates the isometric camera azimuth by a finite delta in radians. */
  rotate(delta: number): void;
  /** Ground-plane point under a CSS-pixel position in the input surface, or null when unavailable. */
  pickGround(screenX: number, screenY: number): { readonly x: number; readonly z: number } | null;
  /** Selects a supported mode. Returns false for an unknown or unavailable mode. */
  set(mode: ViewMode): boolean;
  /** Cycles to the next supported mode and returns the selected mode. */
  toggle(): ViewMode;
}
export const ViewModes = defineService<ViewModesService>('sdk/view-modes');
export const ViewModeChanged = defineEvent<{ mode: ViewMode }>('sdk/view-mode-changed');
