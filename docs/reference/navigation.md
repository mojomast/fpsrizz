# Ordered graph navigation

`mechanics/navigation` implements pure, deterministic shortest-step queries over a finite, caller-authored graph.
Stonewake uses canonical first hops for golem pursuit; Signal Break uses shortest distances for movement reachability.
Games define legal neighbors and decide what a successful query means for movement or resource costs.

## Compose it

Add the provider to the preset and select its role:

```json
{
  "plugins": ["mechanics/navigation"],
  "roles": { "sdk/mechanic-navigation": "mechanics/navigation" }
}
```

This is a fragment. Merge it with a complete game's plugin and role selections. The consumer manifest lists
`"sdk/mechanic-navigation"` in `requiresRoles`; it has no concrete dependency on `mechanics/navigation`.
The provider is a registration-time pure object, so it requires neither a `roleDependencies` startup edge nor an
activation callback. During consumer activation, resolve `ctx.role(NavigationRole)!.provider` from `src/sdk/index.ts`.
Staging rejects a missing or invalid selection before replacing an existing session.

The working presets are [Stonewake](../../games/puzzles/presets/stonewake.json) and
[Signal Break](../../games/tactics/presets/turn-tactics.json). No shooter, renderer or platform service is required.

## Public contract

The authoritative declarations are [navigation.ts](../../src/sdk/contracts/navigation.ts):

```ts
interface NavigationNode {
  readonly id: string;
  readonly neighbors: readonly string[];
}
interface NavigationVisit {
  readonly node: string;
  readonly steps: number;
  readonly firstStep: string;
}
interface NavigationProvider {
  readonly name: string;
  readonly description: string;
  search(nodes: readonly NavigationNode[], origin: string, maxSteps?: number): readonly NavigationVisit[];
}
```

`NavigationRole` has ID `sdk/mechanic-navigation`. The shipped provider ID is `mechanics/navigation`.

### Inputs and ordinary outcomes

- Supply a finite array of nodes, each with exactly the two own enumerable fields `id` and `neighbors`.
  IDs are nonblank, unique strings. They are compared exactly: the provider never parses, trims or sorts identities.
- Every directed neighbor reference must name a declared node. Neighbor arrays are ordered. Self-loops and repeated
  edges are valid; they do not produce duplicate visits. Node array order has no effect on traversal order.
- The origin must be declared. An isolated origin produces its single zero-step visit. Unreachable nodes do not appear.
- Every edge costs exactly one step. Optional `maxSteps` is a nonnegative safe integer and is **inclusive**: nodes at
  that distance are returned but not expanded. Zero returns only the origin; omission explores its reachable component.
- Graph shape, IDs, references and origin are validated even in components outside the requested radius. Invalid
  programmer-supplied graph/query data throws `TypeError`; invalid depth throws `RangeError`. There is no partial result
  on rejection. Content loaders retain their existing `Reporter` validation for authored game data.

### Ordering and distances

The result begins with `{ node: origin, steps: 0, firstStep: origin }`. Other records follow FIFO first-discovery order.
Each node appears once with its minimum number of edges from the origin. Equal-distance alternatives retain the first
discovery, using the caller's ordered neighbor lists; the provider does not impose coordinate or lexical tie-breaks.
`firstStep` is the first hop along that canonical shortest route.

For `s -> [north, west]`, `north -> [goal]`, `west -> [goal]`, the visits are `s, north, west, goal`; the goal has
`steps: 2, firstStep: 'north'`. Reversing only the first adjacency changes its first hop to `west`. Reordering the node
array leaves the result unchanged.

### State, ownership and lifecycle

Queries are synchronous and pure. Input arrays are borrowed only during the call and never changed or frozen by the
provider. Returned arrays and records are detached and frozen. Each call owns its scratch graph map, seen set and visit
array; no graph, occupancy, mutable module state or context is cached across calls.

There are no instance IDs, handles, systems, subscriptions, clocks, pause gates or disposal methods. Registration owns
the offered provider. A retained provider function can still query caller-supplied data after a session stops, because
it retains no old session and changes no gameplay state. Actual move commands remain governed by the consumer's pause,
terminal-state, ownership and commit rules. A query result is advisory; the consumer rebuilds legal adjacency at commit.

The default BFS costs O(V + E) including whole-graph validation and uses O(V + E) input/index space. Finite arrays bound
the work; there is no asynchronous search, implicit infinite graph, best-effort budget or partially complete result.

## Real consumers and policy boundary

### Stonewake

[`puzzle-rules/index.ts`](../../games/puzzles/plugins/puzzle-rules/index.ts) resolves the selected provider and passes it explicitly
to `takeTurn` in [`rules.ts`](../../games/puzzles/plugins/puzzle-rules/rules.ts). Each golem query constructs legal cell adjacency
in **north, west, east, south** order, excluding walls, rocks, other golems and the exit tile `E` even when its gate is
open. The querying golem's origin is included. If no visit reaches the player, that golem stays in place.

Golems move sequentially in board order, so each query sees occupancy after earlier golems moved. Pursuit remains on
every second committed turn. Rejected moves do not spend a turn or trigger pursuit. Push legality, gate weighting,
capture, completion, cue selection and undo stay in the puzzle family. The public `PushPuzzle` service is unchanged.

`puzzle-rules/content.ts` deliberately retains its local static connectivity flood fill: it checks authored objectives
during registration, ignores runtime occupancy, and reports paths through `Reporter`. It is not a session route query
or a promise that a push puzzle is solvable. Runtime provider activation is not introduced into content loading.

### Signal Break

[`board-tactics/index.ts`](../../games/tactics/plugins/board-tactics/index.ts) constructs legal adjacency with the same N/W/E/S order.
Walls, out-of-bounds cells and all living units block destinations; dead units do not. The moving unit's occupied origin
is included in the search and omitted from public reachable results. Cover is an ordinary unit-distance tile.

The search radius is `unit.ap * 3`; the game converts shortest step distance to AP using `Math.ceil(steps / 3)`.
UI reachability, player move commit and enemy movement candidates use that same adapter, with current occupancy at each
call. A failed destination still reports `Destination unreachable.` without moving or spending AP.

Enemy target choice remains Manhattan distance then unit ID. When no shot is legal, one-AP move candidates still sort
by distance to the target, then y, then x. The provider does not replace this policy with shortest-route pursuit.
The public `Tactics` service, attack forecasting and action/cue ordering are unchanged.

### Scope limits

The contract has no coordinates, physics, actor motion, occupancy rules, AP conversion, waypoint smoothing, weighted
edges, heuristics or rendering. `core/world` retains its shooter-specific eight-connected A*, closed-door rules and
swept-radius smoothing. Kernel dependency ordering is a separate graph problem and is not used for gameplay traversal.

## Reuse and evidence record

Discovery used `find-reuse` queries `pathfinding grid route` and `flood fill reachability`, inspected `puzzle/rules`,
`board/tactics`, `core/world`, their SDK declarations, working consumers and tests, and checked the compact reuse index.
The first two families duplicated deterministic unit-edge search; the world provider bundled incompatible collision
and smoothing policies. Existing resource/action providers do not supply this query, and command ingress queues are
not traversal worklists.

A pure SDK helper could remove the loops with less composition overhead. The plugin exposes a useful independently
selectable implementation boundary: the same games can select a different conforming search implementation without
changing game policy or importing that implementation. One production BFS is shipped; no speed advantage or need for
weighted algorithms is claimed.

Evidence is headless and uses normal role selection and real command services:

- [`tests/mechanics-navigation.test.ts`](../../tests/mechanics-navigation.test.ts) runs the public contract against both
  the default and an independent stable-layer test implementation. Hand-derived diamonds and cycles assert exact
  discovery order, first hops, minimum distances, directed edges and inclusive depth. Invalid shape/reference/origin/
  depth cases, frozen detached results, input preservation and retained pure calls after restart/stop are covered.
- [`tests/navigation-consumers.test.ts`](../../tests/navigation-consumers.test.ts) runs both real families with each
  implementation. The replacement cases assert the default is absent from the catalog and active graph. They verify
  exact golem positions/turns/capture/undo, sequential occupancy, open-exit exclusion, rock blockades, AP boundaries,
  current-occupancy commit, dead-unit passage and enemy coordinate tie-breaks. Both authored games complete through
  their existing command tapes: Stonewake takes 35 total turns and Signal Break reaches victory.
- [`tests/helpers/alternate-navigation.ts`](../../tests/helpers/alternate-navigation.ts) uses independent whole-distance
  layers and does not import or delegate to the production implementation. Behavioral expectations are hand-derived,
  rather than merely checking calls or comparing two implementations with no external oracle.
- Existing [`stonewake.test.ts`](../../games/puzzles/tests/stonewake.test.ts), [`turn-tactics.test.ts`](../../games/tactics/tests/turn-tactics.test.ts), and
  [`command-queue-consumers.test.ts`](../../tests/command-queue-consumers.test.ts) retain their assertions with navigation
  added to restricted test catalogs/presets. No claims about browser rendering or performance follow from these tests.

Focused verification:

```bash
node --test tests/mechanics-navigation.test.ts tests/navigation-consumers.test.ts \
  games/puzzles/tests/stonewake.test.ts games/tactics/tests/turn-tactics.test.ts tests/command-queue-consumers.test.ts
npm run typecheck
npm run lint
```

These checks accompany the repository's index freshness, full check, bundled preset validation and browser acceptance
workflow documented in `AGENTS.md`.
