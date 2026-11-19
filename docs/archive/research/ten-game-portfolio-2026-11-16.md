# Ten small games: a reusable-mechanics portfolio

Research date: **2026-11-16**. This is a proposal, not a claim that these games or new plugins exist. It is designed as
ten independently finishable browser games, grouped in five pairs so each proposed shared rule has two concrete design
consumers. Names, counts and timings are initial scope targets, not estimates of demonstrated production capacity.

## Recommendation

Build one playable pair at a time, starting with **Switchyard Post / Reef Relay**. Prototype the differentiating decisions
before extracting a shared rule; promote a candidate to a role-selected provider only after both games actually need the
same semantics. Stop at one polished, replayable loop per game. Each game owns its own authority, content and presentation;
shared providers own narrow rules, never a universal game manager.

The architecture already supports this: [docs/guide/reuse.md](../../guide/reuse.md), [the generated index](../../reference/reuse-index.md),
[architecture](../../reference/architecture.md), and [mechanic semantics](../../reference/reusable-mechanics.md). The index labels portability,
not proof. In particular, `puzzle/rules`, `board/tactics`, `story/adventure`, `vehicle/racing`, and `sky/game` are family
authorities, not neutral libraries. A new game can use one through its supported content format when it actually fits;
otherwise it composes public SDK mechanisms, not another plugin's implementation.

### Design principles

- **Differentiation is a decision, not a skin:** each pair changes player verb, risk and success criterion as well as art.
  Start with a brief paper/headless prototype; test if the core decision is interesting before polishing. Rami Ismail
  distinguishes a design prototype from a production vertical slice; use the latter to verify a representative finished
  pipeline rather than to discover whether the basic mechanic works [1].
- **Constrain the first release:** one input scheme, one board/route or a few authored levels, a clear ending, instant
  restart, no online play, procedural content, meta-progression or general save system. Target 5–12 minute sessions.
  A loss should explain why and give the player a meaningful next attempt.
- **Define shared invariants rather than shared genre:** Epic's Game Features documentation recommends limiting
  project-specific dependencies [2]; Bulkhead's own [design/evidence note](../../cookbook/reusable-capability-template.md) requires
  observable contracts and evidence. The pairings below are hypotheses, not proof of reusable behavior.
- **Readability is part of scope:** indicate states by shape/icon and text as well as color [3], show controls and
  objectives in the launcher/HUD, offer keyboard interaction for board games and visible focus. Pause must freeze
  authoritative time. Use semantic sound cues as reinforcement, not the sole source of information.

## Portfolio at a glance

All proposed shared-plugin names below are placeholders, not catalog IDs. The existing IDs are real candidates; each
new game still needs its own content, authority, presentation and preset. Quantities are deliberately small targets.

| Pair / proposed shared rule | Game and identity | Core loop, win / loss and initial scope | Existing reusable candidates |
|---|---|---|---|
| **A. Ordered work queue** | **1. Switchyard Post** — turn-based railway mail dispatcher, cut-paper station map | Assign and dispatch parcels to three platforms; deliver six before 12 accepted turns, lose on missed quota. One 5×5 yard, two parcel types, one bottleneck, 5–8 min. | `mechanics/navigation`, `mechanics/objectives`, `mechanics/clock`, `createCommandQueue` |
| A | **2. Reef Relay** — real-time undersea repair tender, sonar screen | Choose which of three damaged buoys to service; complete six repair tickets before oxygen runs out. A single small sea map, two repair types, 6–8 min. | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives`, `createDeadline` |
| **B. Fixed-slot occupancy** | **3. Lantern Loom** — tranquil constellation-placement puzzle, midnight ink and paper | Place eight star tiles into a 4×4 sky; connect three prescribed constellations before tiles run out. Three authored boards, 5–8 min. | `mechanics/objectives`, `mechanics/sequence` only if an ordered tracing rule is actually used; `createCommandQueue` |
| B | **4. Moss Market** — turn-based tiny garden shop, warm terracotta diorama | Place plant stands in a 4×4 shop; arrange neighboring plant types to fulfill three displayed orders within ten placements. Three authored order sets, 5–10 min. | `mechanics/resources`, `mechanics/actions`, `mechanics/objectives`, `mechanics/clock` |
| **C. Draw/discard pile** | **5. Ash & Ink** — deterministic hand-management duel against a clockwork scribe | Draw a hand, choose one of three glyph actions per turn to break three seals before six turns or ink reaches zero. One 12-card deck, three seal patterns, 5–8 min. | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives` |
| C | **6. Cloud Cartographer** — solo expedition planning, pastel weather charts | Draw forecast cards and allocate them to survey or shelter; chart three islands before the storm meter fills. One 12-card deck, three island choices, 6–10 min. | `mechanics/resources`, `mechanics/clock`, `mechanics/objectives`, `mechanics/room-map` if the route is genuinely a room graph |
| **D. Delayed jobs** | **7. Midnight Kiln** — real-time ceramics micro-factory, glowing clay and shadows | Start bounded firing jobs on two kilns, choose recipes and collect six finished pieces before the shop closes. Two stations, three recipes, 5–8 min. | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives`, `createDeadline` |
| D | **8. Seedship Nursery** — turn-based botanical rescue, seed pods in a starship | Queue germination in two growth pods, then use turns to irrigate and harvest three specimens before water is exhausted. Three specimen types, one compact screen, 6–10 min. | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives`, `createDeadline` |
| **E. Ordered spatial path** | **9. Glass Current** — light-routing puzzle, stained-glass circuitry | Rotate mirrors on a small grid to direct a beam through three receivers; finish three authored boards. Unlimited attempts; reset is the recovery from dead ends, 5–10 min. | `mechanics/objectives`, `createCommandQueue`; `mechanics/navigation` only for a separate unit-edge reachability question |
| E | **10. Signal Gardener** — turn-based irrigation planning, watercolor canals | Lay a continuous channel from reservoir to three beds under a six-segment budget; finish three authored maps, lose a map only when the budget is spent without supply. | `mechanics/resources`, `mechanics/actions`, `mechanics/objectives`, `createCommandQueue` |

The nominal pair is not the only possible composition. Existing resources/actions/objectives span A–E; that is more
valuable than forcing all ten through five new systems. Proposed board dimensions and terminal thresholds need playtesting
and authored validation, including at least one winning route per board and enough slack for the intended challenge.

## Five proposed seams and their evidence

The evidence for the **new** contracts is currently two proposed consumers each, not existing production adoption.
Before implementation run `find-reuse` again in a supported Node environment, inspect each candidate with `--show`, read
the actual SDK declarations, consumers and tests, and write a capability note. Names and suggested surfaces are design
sketches; role/registry names and numeric limits are not committed APIs.

### A. Ordered work queue — conditional `mechanics/work-list`

**Shared rule:** an owned bounded FIFO of uniquely identified pending work records, with explicit enqueue, inspect and
complete/remove by ID. Reject duplicate live IDs and capacity overflow without mutation; freeze detached observations.
Both games assign their own payload and choose when to accept or complete work. The dispatcher decides parcel routing and
turn cost; the tender decides travel, oxygen and repair legality. Do not embed deadlines, rewards, targets, pathfinding or
automatic callbacks in the queue.

**Existing evidence / decision:** `createCommandQueue` ([queue guide](../../reference/command-queues.md)) is bounded semantic
**ingress**, with drain policies; it is not automatically a persistent visible work list. `mechanics/objectives` tracks
monotonic prerequisite counters and receipts, not mutable pending task order. `mechanics/sequence` repeats one fixed
canonical step list, not dynamically admitted work. Reuse those where appropriate; pilot a work-list only if both
prototypes genuinely require persistent arbitrary removal rather than a static array or objectives. Its FIFO ordering
must not force the games to complete work in FIFO order.

**Evidence to earn:** tests for duplicate IDs, overflow, removal of a middle entry, stable order, copied input and stale
handle/pause behavior; run two games with different completion order. Confirm assignment and resource costs cannot leave
an orphan ticket on rejection.

### B. Fixed-slot occupancy — conditional `mechanics/slots`

**Shared rule:** a bounded set of named slots, each empty or containing one unique piece ID; place, move and remove are
atomic within that set. Bounds and duplicate-piece or occupied-slot rejection leave state unchanged; observations are
detached. Geometry, adjacency, rotations, scoring and available pieces remain local. An authored rectangular board may
map coordinates to slot IDs without making the provider a grid engine.

**Existing evidence / decision:** `mechanics/inventory` tracks item stacks and optional equipment slots, not arbitrary
board occupancy ([inventory limits](../../reference/inventory.md)); `mechanics/navigation` searches a caller-supplied graph but
doesn't own occupancy ([navigation](../../reference/navigation.md)). Lantern Loom checks constellation patterns, while Moss Market
checks neighborhood combinations and pays for stands. A simple local fixed array could be cheaper than a provider;
extract only after both games need the same operations and removal/movement semantics.

**Evidence to earn:** occupied target and duplicate-piece rejection, atomic move, full board, stable slot order, two
independent boards and cleanup. Game tests separately assert constellation/adjacency, not provider-owned scoring.

### C. Draw/discard pile — conditional `mechanics/piles`

**Shared rule:** a bounded ordered pile of card instance IDs, explicit draw from top and discard of a held card. The
consumer supplies a deterministic initial ordering; exhaustion rejects with no partial movement. A card instance exists
in exactly one of draw, hand and discard zones; snapshots are detached. No automatic shuffle, reshuffle, card effect,
turn or deckbuilding rule. If shuffle is later required, specify injected seeded RNG and consumption order separately.

**Existing evidence / decision:** stack inventory represents counts rather than a unique ordered draw/hand/discard
partition; sequence tracks a predefined cursor rather than moving cards between zones. Ash & Ink spends ink for glyphs;
Cloud Cartographer chooses between survey and protection. Both use fixed authored deck order initially so fairness and
replay are inspectable. A local array remains preferable until both prototypes prove partition semantics are identical.

**Evidence to earn:** conservation of card IDs across zones, duplicate rejection, exhaustion, exact order, invalid discard,
isolation and restart; hand-derived draw/discard trace and complete winning/losing routes in both games. Test effects and
turn timing in game authorities, not the pile provider.

### D. Delayed jobs — conditional `mechanics/job-slots`

**Shared rule:** independent bounded slots can start a job with an immutable ID and due time on a borrowed explicit
clock; polling observes ready at `now >= due`, and an explicit collect clears a ready job. The game advances time and
decides output, cancellation, retries, ordering and victory. No reservation, automatic output, periodic scheduling or
catch-up callbacks. Midnight Kiln uses simulation seconds; Seedship advances whole turns only after accepted decisions.

**Existing evidence / decision:** `createDeadline` already owns arm/cancel/due over a borrowed clock; per-slot deadlines
may fully satisfy both games. `mechanics/actions` handles eligibility cooldowns, not work completion; `mechanics/crafting`
performs immediate known item transformations, not delayed output. First implement each with deadlines; add a shared job
provider only if repeated slot lifecycle and identity rules justify it. [General-plugin research](general-plugins-2026-11-16.md)
explicitly treats reservations and blocked output as an unproven broader requirement.

**Transaction constraint:** both games should use numeric resource inputs/outputs with provably bounded collection
preconditions, and specify what happens if output capacity is full: retain the ready job, spend nothing, allow retry.
An action and a job start do not become atomic merely because both methods returned success. Prevalidate slot and
resources at the simulation commit point, make the local transition non-failing after validation, and handle synchronous
observer reentry explicitly; if that cannot be guaranteed, design a coordinator rather than claim rollback.

**Evidence to earn:** exact due boundary, large time jump, idle/pause, accepted versus rejected turns, independent slots,
full-output retry and duplicate collect. Run seconds and turns routes and ensure teardown doesn't dispose the borrowed clock.

### E. Ordered spatial path — conditional `mechanics/ordered-walk`

**Shared rule:** a pure query consumes a finite directed graph with at most one outgoing edge per node and returns an
ordered walk from a start, ending at a terminal, missing successor or repeated node. Reject malformed references and
bound work by the finite node count; return detached results and explicit stop reason. The caller constructs the graph
from mirror orientations or canal segments. No ray physics, geometry, placement, scoring, costs or mutation.

**Existing evidence / decision:** `mechanics/navigation` performs shortest unit-edge BFS and canonical first-step
selection, not a deterministic single-successor trace with loop reporting. It remains appropriate for separate reachability
questions. Glass Current builds directed beam states including direction; Signal Gardener builds its channel successors.
The two must agree on stop semantics; if irrigation needs branching networks or the mirror game requires continuous
reflection, keep their algorithms local instead of stretching this contract.

**Evidence to earn:** hand-derived straight path, missing successor, terminal-at-start, cycle and invalid reference;
deterministic order despite input node reorder; separately test mirrors, channel construction and objectives. A loop
cannot hang a tick. No gameplay state, session handle or clock is necessary for a pure query.

## Common implementation and evidence plan

1. **Gate 0: test the fantasy.** Paper or headless prototype both members of pair A with an authored winning route, a
   loss or reset route and one obvious player tradeoff each. Reject or reshape concepts whose decisions feel identical.
2. **Gate 1: first production slice.** One complete game loop per game: menu/control explanation, interaction, feedback,
   ending, restart and one representative level. Playtest before multiplying authored content. Record actual time and
   asset costs; cut scope rather than assuming ten parallel productions are cheap.
3. **Gate 2: extract only demonstrated overlap.** Compare observable behavior and local alternatives; use the capability
   template. Prefer a pure SDK helper where a selectable provider adds no useful substitution. For stateful selectable
   factories, follow existing `createOwnedInstances` lifetime patterns, consumer-scoped live IDs, explicit disposal,
   detached snapshots and selected role/registry matching. `requiresRoles` requires selection; `roleDependencies`
   orders provider owners when activation needs a factory. Include concrete plugins and role selections in each preset.
4. **Gate 3: prove behavior.** Run contract tests against the default and, if claiming substitution, a genuinely
   independent implementation with default absent. Exercise materially different consumers, success and rejection,
   pause, isolation, disposal/restart and deterministic command traces. Test browser controls, feedback and terminal
   routes separately. A snapshot is not a save; implement persistence only with an explicit versioned restore protocol.
5. **Gate 4: release a pair before starting the next.** Add plugin-local `reuse.json`, recipes where warranted, docs and
   regenerated index. Validate complete presets, run `npm run check`, bundled validation and browser build/smoke according
   to `AGENTS.md`. Retain game-local logic if the seam has not earned its abstraction cost.

Every game should own semantic command ingress using scoped `InputContexts` and `SessionControl.playing`, queue commands
for simulation, validate targets before shared action execution, and keep presentation optional/headless. Definitions
are validated through `Reporter`; no cross-plugin imports, mutable module state, DOM in simulation, or gameplay in the
kernel. Use `ctx.rng` only for gameplay randomness, `ctx.time` or explicit mechanic clocks for simulation time, and scoped
render roots/camera leases. Game-specific outcomes are not automatically transactional with resource/actions.

## Research record and limits

Repository evidence: [docs/reference/reuse-index.md](../../reference/reuse-index.md) identifies cross-genre and family candidates;
[mechanics contract](../../../packages/sdk/src/contracts/mechanics.ts), [navigation](../../reference/navigation.md), [sequences](../../reference/sequences.md),
[inventory](../../reference/inventory.md), [crafting](../../reference/crafting.md) and [reusable mechanics](../../reference/reusable-mechanics.md) establish
the stated boundaries. Sky, Ember and Verdant demonstrate shared resource/action/clock/objective composition;
Stonewake and Signal Break exercise navigation; two racing compositions exercise sequence. Existing substitution evidence
is specifically for an independent resource provider, not all mechanics. See the linked docs for named tests and limits.

Discovery attempts: `npm run -s find-reuse -- '<query>' --json --limit 5` for `grid placement adjacency`,
`orders delivery queue`, `deck draw discard shuffle`, and `timed schedule timeline` all failed before producing results:
the available Node is **v20.19.6**, while this repository requires **Node >=22.18** for direct TypeScript loading.
Consequently this report used the checked-in index and source-linked docs; no negative search result is claimed.
No gameplay or new-plugin tests have been run or claimed. This is a documentation-only research change. `npm run check`
was attempted: typecheck passed, but lint stopped on Node 20's unsupported `.ts` extension; index freshness and tests
were therefore not reached.

External sources (accessed 2026-11-16):

1. [Rami Ismail, Prototypes & Vertical Slice](https://ltpf.ramiismail.com/prototypes-and-vertical-slice/) — distinguishes
   discovering a viable design from testing the production pipeline. The portfolio's gates are this report's application.
2. [Epic Games, Game Features and Modular Gameplay](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine) — modular feature dependency guidance, not evidence of Bulkhead compatibility.
3. [W3C, Understanding Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html) — avoid conveying
   information by color alone; this report applies that principle to game HUDs without asserting full WCAG conformance.
