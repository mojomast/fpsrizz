# Reusable cross-genre mechanics: research and implementation guidance

Research/access date: **2026-11-16**. Scope: primary engine documentation and its application to Bulkhead. Engine documentation versions below identify the material consulted, **not a claim about the latest engine release**. Undated living pages are identified as such; access date is not publication date. Recommendations and acceptance tests are this report's synthesis, rather than claims that every cited engine implements them identically.

## Executive finding and present baseline

Reuse should be demonstrated by the **same mechanic implementation running in independently composed games**, with replaceable consumers and presentation. Sharing a host, renderer, SDK barrel or naming convention alone does not demonstrate shared gameplay mechanics.

The supplied architecture already provides valuable foundations: import isolation, typed SDK contracts, staged content validation, scoped session services, deterministic fixed ticks, separate simulation/presentation, and independent `Race`, `Tactics`, `Adventure` and `PushPuzzle` families. **That modular architecture still lacks shared mechanic plugins across those families until those plugins and their consumers are implemented and verified.** This report does not claim completion of that work or of the requested three new games. Baseline statements refer to the supplied `AGENTS.md` and `docs/reference/architecture.md`, not to changes being made concurrently elsewhere.

## Evidence and transferable principles

### 1. Small mechanic contracts, with genre-specific orchestration

Epic's Game Features documentation emphasizes standalone features, opt-in components, avoiding accidental feature dependencies and minimizing interaction with project-specific Actor subclasses [1]. Lyra's GAS overview explicitly describes mechanic-neutral attributes, abilities and effects that specialize into health, ammunition or other rules [2]. Bevy assembles application capabilities through plugins and can omit rendering for headless execution [4].

For Bulkhead, retain family services as orchestration/read-model boundaries, while extracting small reusable semantics into SDK contracts and separately activated providers. Candidate seams include bounded resources, action costs/cooldowns, inventory transactions, objective progress and status effects. Do not introduce one `Game`/`Mechanics` service that owns racing, boards, dialogue, physics and combat together. Shared geometry, targeting and movement should only be extracted when their semantics genuinely agree; a grid move and continuous vehicle steering need not share a solver.

Each proposed extraction needs at least two concrete consumers. Prefer one narrow resource/action provider used by two different families over many nominally generic APIs used once. Keep gameplay in plugins, expose cooperation through `src/sdk/index.ts`, and preserve the existing prohibition on cross-plugin imports.

### 2. Definitions, session instances and presentation have different owners

Unity's data-container guide separates shared definitions from per-element unique data and illustrates substituting externally loaded JSON without changing consumers [7]. Lyra distinguishes ability-set assets from actor-specific ability-system state, and tracks granted handles for later removal [2].

Recommended Bulkhead split:

| Layer | Examples | Ownership and mutation |
|---|---|---|
| Validated definition | resource bounds, action cost, duration domain, item metadata, objective target | Registration/content lifetime; treated as immutable after validation |
| Runtime instance | current energy, remaining turns, inventory stacks, objective counters, action revision | Per session and explicit instance/actor; changed only through its mechanic authority |
| Presentation | HUD labels, meshes, interpolation, particles, sound | Optional scoped consumers of snapshots and committed events |

Do not mutate a registered definition to store a current cooldown or inventory. Return readonly snapshots or copies so consumers cannot bypass invariants. Persistence is a deliberate serialization of runtime state with schema/definition references, not retention of a previous session's closures. A missing renderer or HUD must not alter mechanic results.

### 3. Inject dependencies and own instances explicitly

Godot recommends focused scenes, dependency injection from the owning context, and ancestor-mediated relationships rather than environmental node-path assumptions [3]. This is composition guidance, not a requirement to adopt Godot's scene tree or call its nodes an ECS. Lyra's bookkeeping of grants and revocations likewise makes acquisition/removal explicit [2].

In Bulkhead, resolve required typed services in activation/factory setup; declare provider dependencies in manifests and list them in presets. Browser services remain optional where the existing headless conventions require it. Keep state inside `activate` or factory-start closures, and own subscriptions/systems/resources through `ctx`. Lazy registry factories execute in their registering owner's context: pass consumer instance identity explicitly rather than assuming that factory context is the requesting actor or game.

A session-wide provider can manage multiple mechanic instances, but one service token must not imply one global inventory, cooldown clock or objective set. Use explicit instance handles/IDs and actor ownership; define destruction, reset and invalid-handle behavior. Two inventories or two games in separate hosts must not affect one another even when their local item/entity IDs coincide. Avoid silently overwriting an exclusive service with a second provider; choose a provider or validate the conflict.

### 4. Preview and commit actions transactionally

Lyra exposes activation checks, `CheckCost`/`ApplyCost`, and commitment of cost and cooldown [2]. Those are useful precedents for an explicit action lifecycle. **They are not evidence that GAS supplies an arbitrary database-style transaction across all gameplay subsystems.** The following atomicity requirement is a Bulkhead design recommendation.

An action that spends energy, moves an actor and advances an objective must either commit its complete allowed outcome or leave authoritative state unchanged. A practical small implementation is:

1. Read a snapshot and produce a side-effect-free availability result/plan with a typed rejection reason.
2. At the authoritative ingress, check session-playing state, ownership, targets, bounds, resources and state revision again. A successful UI preview is not authorization to spend later.
3. Prepare the complete next state without publishing events or invoking arbitrary extension callbacks. Validate every participating mutation before the first write.
4. Apply synchronously under one mechanic authority (or a deliberately specified coordinator), increment revision, then publish typed committed facts. Rejected actions consume no cost, cooldown or turn unless an explicit game rule says an attempted action itself costs a turn.

Prefer making the small commit path non-failing after validation to promising rollback around arbitrary plugin code. If multiple providers must participate, define prepare/commit participation and failure semantics explicitly; do not call a collection of independently mutating service methods and call it atomic. Do not await between validation and commit without reservation/revision handling. Decide whether duplicate command IDs are rejected or idempotently replayed if an ingress can retry.

Bulkhead's existing **host staging transaction is different**: staging failure preserves the old session, but activation failure after graph commit does not restore it. Likewise, deferred events and entity-store flushes are scheduling semantics, not action rollback. Outside a tick, events currently deliver immediately, so do not emit intermediate action facts from UI commands.

### 5. Make time domains explicit

Bevy documents separate real, virtual, fixed and custom clocks [5]. This supports distinguishing clock intent rather than assuming all durations are elapsed wall seconds. Turn-clock behavior below is a repository-specific recommendation, not a claim about Bevy's turn system.

Bulkhead already has 60 Hz fixed simulation and interpolated frame presentation. Shared definitions should discriminate durations such as `{ domain: 'simulation', ticks: 120 }` and `{ domain: 'turn', turns: 2 }`, rather than one ambiguous numeric `duration`. A turn provider advances only on the defined accepted turn boundary; merely receiving browser frames or waiting at a menu must not expire turn effects. Define whether a boundary means actor turn, team turn or round, and whether application consumes the current boundary. Use separate instances if two encounters progress independently.

Realtime cooldowns derive from `ctx.time`/simulation ticks, respecting the host's pause and dropped-backlog policy. UI-only animation may use the existing presentation clock; it must not authorize or advance gameplay. Turn-based effects should not be approximated by multiplying turns by 60. Reject invalid domains, fractional turn counts where unsupported, negative durations and non-finite numbers during content validation.

### 6. Typed facts supplement explicit commands; they do not remove coupling

Godot distinguishes past-tense signals responding to behavior from method calls initiating behavior [3]. Unity's channel guide demonstrates typed payloads, listener cleanup and listener inspection, while recommending smaller specialized event groups [6]. Its globally accessible asset channels are a Unity pattern, not an instruction to add process-global mutable buses to Bulkhead.

Use commands/service methods for requests requiring a result or one authority; emit events such as `ResourceChanged` or `ActionCommitted` after success. Include instance/actor IDs, action/definition identity and sufficient result data to avoid listeners guessing which actor changed. Keep payloads stable and immutable. A typed event still creates a semantic dependency on its schema and delivery ordering; document authority and ordering, and inspect listeners when debugging. Avoid opaque string channels, hidden mutation in presentation listeners and event chains that collectively implement an undocumented transaction. Scope all subscriptions to the owning `ctx`.

## Concrete implementation and verification recommendations

1. **Extract one proven overlap first.** Inventory existing family-local resource, objective and action logic; select a small mechanism with common invariants. Add an SDK contract, a provider plugin, content definitions/validation where needed, and adapters in at least two families. Keep family-specific targeting and win rules with the family. Use explicit result unions rather than throwing for an ordinary rejected action.
2. **Give the three new games distinct compositions.** Each needs its own preset, content, rules and presentation as appropriate, and a dependency table identifying actual shared providers. Include both turn-based and realtime consumers to exercise time domains. Do not claim cross-genre reuse merely because three new presets select the same family monolith. Exact game names/designs belong to implementation planning.
3. **Validate the complete selected graph before activation.** Through the existing `Reporter`, report content paths and remedies for unresolved resource/item/action IDs, duplicate definitions, invalid bounds/costs/durations, unsupported combinations, missing required providers and conflicting exclusive selections. Cross-reference validation must use the chosen definitions/providers, not whichever globally installed pack happens to contain an ID. Preserve the old running session on staging failure.
4. **Update public documentation when implementation lands.** Follow `docs/guide/plugins.md`, `docs/reference/content-format.md`, `docs/reference/architecture.md` system tables, `docs/reference/spec.md`, game guides and preset/controls documentation as applicable. An incompatible contract needs the repository's SDK-version treatment. This research proposes no lint exemption or gameplay addition to `src/kernel`.

### Acceptance matrix: evidence of genuine reuse

These are proposed meaningful implementation tests, not tests added by this research document:

| Test | Required evidence |
|---|---|
| Cross-family overlap | Two independently staged families invoke the **same provider implementation** for a shared action/resource rule; neither imports the other's plugin or requires shooter plugins |
| Provider substitution | Replace the provider with a second conforming implementation/test double and run the same consumer contract scenarios; consumer source is unchanged |
| Content substitution | Swap one compatible content pack; behavior follows its validated definitions without changes to consumer code |
| Instance/session isolation | Two live instances with overlapping local IDs remain independent; restart reconstructs session state; dispose/reapply leaves no stale subscription effects |
| Atomic rejection | Invalid target, insufficient cost, stale preview and replayed request yield the specified result with no partial spend, movement, cooldown, objective event or unintended turn advance |
| Clock separation | Waiting many frames changes realtime state only as intended and leaves turn effects unchanged; accepted turns advance the specified turn clock exactly once; paused/invalid actions follow explicit policy |
| Presentation substitution | The same seed and accepted action sequence yield identical authoritative snapshots headlessly and with presentation; replacing HUD/theme does not change mechanics |
| Validation/substitution failure | A malformed or incompatible pack is rejected with an actionable path; the previously running session remains usable |

Use `tests/helpers/game.ts`, `node:test` and `node:assert/strict` for headless contract/integration scenarios. After implementation run `npm run check` and bundled staging validation; browser-exercised changes additionally require build/smoke, with creator-specific checks when applicable. Passing import lint alone proves neither semantics nor instance ownership.

## Primary sources and version/access record

All sources below were searched and fetched on **2026-11-16**. Dates are not inferred from copyright footers or search-result freshness. Versioned references are chosen reproducible documentation targets, not latest-version assertions.

1. **Epic Games — [Game Features and Modular Gameplay](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine?application_version=5.6).** Unreal Engine **5.6** documentation selection; no page publication date shown in fetched text. Supports standalone opt-in feature plugins, component encapsulation and limited project-class coupling.
2. **Epic Games — [Abilities in Lyra](https://dev.epicgames.com/documentation/en-us/unreal-engine/abilities-in-lyra-in-unreal-engine?application_version=5.6).** Unreal Engine **5.6** documentation selection; no page publication date shown. Supports mechanic-neutral GAS primitives, per-actor state, ability-set definitions/granted handles, lifecycle cleanup, and explicit cost/cooldown checking and commitment. Lyra is a sample architecture, not a universal prescription.
3. **Godot Engine — [Scene organization](https://docs.godotengine.org/en/4.5/tutorials/best_practices/scene_organization.html).** **4.5** documentation; no page publication date shown. Explicit guidance on focused components, dependency injection, owner-mediated relationships, signals versus initiation, and configuration diagnostics.
4. **Bevy — [Quick Start: Plugins](https://bevy.org/learn/quick-start/getting-started/plugins/).** Living, unversioned official tutorial; no publication date or version asserted here. Describes plugins as application composition units, replaceable capabilities and omission of render/UI plugins for headless use; systems are assembled into ECS schedules.
5. **Bevy API documentation — [Time](https://docs.rs/bevy/0.17.2/bevy/time/struct.Time.html).** Pinned **0.17.2** library documentation hosted on docs.rs; fetched package metadata shows **2025-10-04** (package publication metadata, not this report's access date or proof of a separately dated article). Documents `Time<Real>`, `Time<Virtual>`, `Time<Fixed>` and custom clocks.
6. **Unity Technologies — [Use ScriptableObjects as event channels in game code](https://unity.com/how-to/scriptableobjects-event-channels-game-code).** Undated, unversioned official how-to linked to the PaddleBallSO demo; no engine-version claim. Supports loose coupling/high cohesion, typed channel payloads, subscription cleanup and event debugging. Global availability should be adapted to Bulkhead's session-scoped ownership.
7. **Unity Technologies — [Separate game data and logic with ScriptableObjects](https://unity.com/how-to/separate-game-data-logic-scriptable-objects).** Undated, unversioned official how-to; no engine-version claim. Supports separating static/shared data from behavior and unique instance values, and substituting JSON-backed definitions without changing consumers. The Bulkhead recommendation to keep registered definitions immutable is a deliberate ownership policy, not a claim that Unity ScriptableObjects are inherently immutable.
