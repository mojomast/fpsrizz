/** Sandbox vocabulary: read-only state the presentation, HUD and tests observe. */
import { defineService } from '../../../src/sdk/index.ts';
import type { EntityId } from '../../../src/sdk/index.ts';

export interface SandboxState {
  readonly hero: EntityId;
  readonly crates: readonly EntityId[];
  readonly pad: EntityId;
  /** Times the hero entered the glowing pad (a physics sensor). */
  readonly padEntries: number;
  readonly onPad: boolean;
}
export const Sandbox = defineService<SandboxState>('sandbox/state');
