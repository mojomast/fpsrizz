/** Unit-edge graph queries. Games supply legal adjacency; selected plugins implement traversal. */
import { defineRole } from '../core.ts';

export interface NavigationNode {
  /** Nonblank, unique identity; coordinates and game meanings belong to the caller. */
  readonly id: string;
  /** Directed, ordered, declared destinations. Repeated edges and self-loops are allowed. */
  readonly neighbors: readonly string[];
}

export interface NavigationVisit {
  readonly node: string;
  /** Minimum number of unit-cost edges from the origin. */
  readonly steps: number;
  /** Canonical shortest route's first hop; the origin itself for its zero-step visit. */
  readonly firstStep: string;
}

export interface NavigationProvider {
  readonly name: string;
  readonly description: string;
  /**
   * Pure synchronous search of a finite graph. Returns origin then FIFO first-discovery order;
   * supplied neighbor order breaks equal-distance ties. Each node appears at most once.
   * maxSteps is an inclusive nonnegative safe integer; omission searches the reachable component.
   * Inputs are borrowed only during this call; results and their records are detached/frozen.
   * Invalid graph shape, IDs, references or origin throw TypeError; invalid depth throws RangeError.
   * All nodes/edges are validated even when outside the requested radius. No state is retained.
   */
  search(nodes: readonly NavigationNode[], origin: string, maxSteps?: number): readonly NavigationVisit[];
}

/** Registration-time pure provider: selection requires no activation ordering or owned instances. */
export const NavigationRole = defineRole<NavigationProvider>('sdk/mechanic-navigation');
