# Selectable building-block plugins

This wave adds two small implementations behind public SDK roles. Real game authorities supply their own policies
and can select another implementation through the preset. The kernel, renderer and family service signatures remain
independent of these algorithms.

## Capability and evidence scope

| Plugin | Common rule | Current consumers | Game-owned policy |
|---|---|---|---|
| `mechanics/navigation` | Deterministic unit-edge graph traversal; shortest step counts and canonical first hops | Stonewake pursuit and Signal Break reachability | Terrain/occupancy legality, neighbor ordering, turn/AP spending, sequential pursuit and enemy decisions |
| `mechanics/sequence` | Accept the next ordered key, advance a cursor, repeat finite rounds, terminate once | NEON RUN and Foundry Circuit | Crossing geometry, single/multiple crossings per tick, deadlines, notifications and race outcomes |

Navigation demonstrates reuse across puzzle and tactics. Sequence demonstrates reuse across independent-vehicle and
shooter-backed compositions within racing; other genres are potential applications, not additional tested consumers.
Both plugins install no systems. No new JSON content kind is needed.

## Reuse decisions

- **Navigation:** inspected `puzzle/rules`, `board/tactics`, `core/world`, the public `World` contract and kernel graph
  resolution. The two runtime breadth-first searches share a unit-edge invariant. Shooter navigation instead uses
  eight-connected weighted A*, collision radius and route smoothing; it stays in its family. Static puzzle content
  connectivity also remains a registration-time validator rather than depending on a session query role.
- **Sequence:** inspected `mechanics/objectives`, `recipe/objective-unlocks`, both racing authorities, Ember and survival.
  Objective chains already represent one-pass prerequisites. They do not directly represent repeated ordered rounds
  over the same keys; unrolling every lap can exceed objective limits. Ember retains its existing objective authority.
- **Ownership:** reuse `Scope` and owner-bound `ctx.instantiate`; `createOwnedInstances` composes consumer-local live IDs
  with dual-scope cleanup. Clock and sequence factories use the same lease helper. Pure navigation needs no artificial
  instance identity or disposable query handle.
- **Modifiers:** audited Sky, Ward and Roguelite. Current uses are individual factors, with ordered shooter
  `DamageModifiers` and explicit deadline helpers already available. A reversible multi-owner stack has no concrete
  second consumer in this code, so it was not added to this wave.

## Composition

Merge the relevant fragment into a complete preset; it is not a standalone playable game:

```json
{
  "plugins": ["mechanics/navigation"],
  "roles": { "sdk/mechanic-navigation": "mechanics/navigation" }
}
```

Navigation consumers use `NavigationRole` during activation. The query object is available from registration and owns
no session state, so `requiresRoles` suffices. Caller-ordered graphs give callers explicit tie-break policy.

```json
{
  "plugins": ["mechanics/sequence"],
  "roles": { "sdk/mechanic-sequence": "mechanics/sequence" }
}
```

Sequence consumers use `sequenceMechanic(ctx)` to resolve an owner-bound factory from `SequenceProviders`. Consumers
creating an instance during plugin activation use `roleDependencies`. Foundry's requirement is conditional on selecting
its race mode, preserving controller-only compositions. Both migrated race authorities validate that the selected ID
has a matching factory before committing a new session.

Bundled Stonewake, Signal Break, NEON RUN and Foundry presets include their provider selections. Custom presets using
these authorities need the same selection or a compatible replacement. Existing chamber, board and track formats
and the public `PushPuzzle`, `Tactics` and `Race` service shapes remain unchanged.

## Contracts and examples

- [Navigation API, graph validation and replacement evidence](navigation.md)
- [Sequence API, terminal state and replacement evidence](sequences.md)
- [Owned factory instance leases](owned-instances.md)
- [Capability design/evidence template](reusable-capability-template.md)

## Integrated verification

- `npm run index-reuse`: **62 plugins, 126 public SDK runtime values, 11 recipes**.
- `npm run check`: typecheck, import boundaries, index freshness and **703 passing tests**, zero failures/skips.
- `npm run validate-game -- --bundled`: **23 bundled presets staged successfully**.
- `npm run build`: production build passed.
- `npm run smoke`: **36/37 checks passed**. The frame-budget assertion remains unresolved on this headless SwiftShader
  environment; an isolated unmodified rerun also failed at **104.30 ms/frame** against the existing 16.7 ms threshold.
  All functional, lifecycle and console-error checks passed. See the timing investigation below.
- `node tests/reusable-games-demo/run.mjs`: **10 groups passed**, zero reported browser/network errors; all three
  resource/action/clock/objective games complete and retain stable replay/switching ownership after the clock migration.
- `node tests/experience-demo/run.mjs`: **5 groups passed**, zero reported errors; includes NEON RUN's input-only
  two-lap victory and Signal Break's command-driven victory.
- `node tests/stonewake-demo/run.mjs`: **5 groups passed**, zero reported errors; includes the three-chamber route,
  undo/retry, viewport/camera checks and ownership stability.
- `node tests/genre-demo/run.mjs`: **11 presets passed**, including Foundry Circuit; no reported browser errors.
- Independent read-only sequence/ownership integration review found no blockers; its focused run passed 106 tests.

Initial concurrent browser runs were cut off by the tool's 120-second command limit before completion. Main acceptance
scripts were rerun sequentially with the external timeout removed. The first completed smoke run overlapped the
shared-family browser run; all other browser suites passed. The isolated smoke rerun ruled out overlapping test
browsers as a sufficient explanation for its timing failure. No assertion, timing threshold or lint rule was weakened.

### Remaining smoke timing failure

A separate in-memory instrumented copy of the smoke script retained every assertion and wrapped the existing render
and scheduler calls only during its final performance scene. It measured **36 frames**, a **415.1 ms maximum render
call** (11.98 ms mean), and **0.32 ms mean / 1.9 ms maximum scheduler advancement**. The last rolling timing window
included that render spike and failed at 139.47 ms/frame. The active graph was the default shooter: neither new
provider nor the migrated clock was selected. Fresh default-scene diagnostic samples had much smaller render times.
This localizes the observed stall to rendering; it does not establish its underlying cause or clear performance
acceptance. The ordinary isolated run and diagnostic both remain failures, rather than being counted as passes.

Evidence: `/tmp/opencode/building-block-smoke-isolated.log`, `building-block-smoke-profiled.log`,
`building-block-frame-diagnostic.log` and `building-block-perf-scene-diagnostic.log`. The latest
`.smoke/smoke-report.json` is from the instrumented run. All diagnostic changes were in-memory; repository test and
application timing code remain intact.

Logs use `/tmp/opencode/building-block-*.log`. The production preview at
`https://mail.tailec998.ts.net:8447/` and local port 4173 both served the exact rebuilt `dist/assets/main.js` bytes:
SHA-256 `eaa1116a2afa9ce839e998d9d5f35d100794b218a9384321b2b30cc46606b08c`.
