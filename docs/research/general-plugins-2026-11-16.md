# Designing gameplay plugins for multiple games

Research date: **2026-11-16**. This report extends the earlier
[cross-genre mechanics research](reusable-mechanics-2026-11-16.md) and the implemented
[reuse discovery workflow](../../REUSE.md).

Implementation follow-up: [bounded command queues](../command-queues.md), [explicit-clock deadlines](../deadlines.md),
[resource conformance](../mechanic-conformance.md) and the [capability design/evidence template](../reusable-capability-template.md).
The conditional [item-possession pilot was evaluated and retained locally](../item-possession-decision.md). The research
baseline and proposed-work sections below describe the state and recommendations at the time of the investigation.

## Scope and method

The question is how to design a capability that several different games can genuinely reuse, while keeping the
game-specific rules understandable. Four parallel investigations cover mechanic boundaries, operational contracts,
verification/discoverability, and concrete opportunities in this repository. Primary documentation supplies the
external evidence; source code and existing tests establish Bulkhead's current capabilities. Recommendations for
future work are proposals, not descriptions of implemented plugins or promises made by other engines.

Documentation versions identify the pages consulted, not the newest available engine versions. The research/access
date is not a publication date. Links and applicability notes accompany the consolidated findings below.

## Research baseline

The discovery inventory contains **60 plugins**, **119 public SDK runtime values** and **seven composition recipes**.
Five plugins have documented cross-genre scope: `mechanics/resources`, `mechanics/clock`, `mechanics/actions`,
`mechanics/objectives` and the `mechanics/kits` content loader. The inventory also labels 12 family-specific plugins,
15 content packs and 28 unreviewed implementations; those labels are documentation, not a semantic proof.

The existing shared providers are used by Sky Salvage, Ember Bastion and Verdant Relay. Their current contract and
verification boundaries are documented in [reusable mechanics](../reusable-mechanics.md). The earlier research report's
"supplied baseline" describes the state before that implementation wave; this report uses the current implementation.

## Main finding: share a stable rule, compose its meaning

A useful general plugin owns a small rule that stays the same across games. Each game supplies its meaning, legality,
orchestration and presentation. For example, atomic debit/credit can serve stamina, battery charge or water while the
games retain movement, vehicle handling or restoration rules. A neutral name does not remove a dependency on a player,
weapon, collision grid, room graph or particular camera.

Epic explicitly distinguishes mechanic-neutral GAS primitives from Lyra's game-framework extensions [S2]. Its Game
Features guidance emphasizes opt-in components and limiting dependencies on project-specific Actor subclasses [S1].
Godot recommends focused reusable scenes with injected context and owner-mediated relationships [S4]. These sources
support narrow boundaries; they do not demonstrate that every feature should become its own plugin.

### 1. Extract the common invariant, not the whole feature name

Write the shared rule before naming the API. Good existing Bulkhead examples are bounded resource transactions,
cooldown eligibility and prerequisite-aware counters. Broad nouns such as "combat," "inventory" and "progression"
usually combine several different rules and state lifetimes.

Being generic still entails precise choices. The existing resource provider rejects overflow and checks debits against
pre-gain balances. Those choices are part of its contract. A different game's requirement to clamp, borrow or finance
a purchase with its simultaneous proceeds does not justify silently changing that shared meaning.

For a proposed extraction, identify two concrete consumers and spell out both the shared invariant and the differing
policies. This is a practical Bulkhead design heuristic, not a vendor standard or proof of universal applicability.

### 2. Separate four responsibilities without requiring four plugins

| Responsibility | Contents | Boundary |
|---|---|---|
| Authored definition | Costs, limits, cooldowns, prerequisite IDs, labels/theme keys | Validated data, shared without live mutable instance state |
| Mechanic instance | Balances, deadlines, progress and revisions | Explicitly owned state with a small mutation API |
| Game orchestration | Target legality, turn advancement, local consequences, rewards and victory | The game's authority composes the mechanics |
| Presentation | HUD, camera, animation and audio feedback | Optional consumer of snapshots and committed facts |

Epic's immutable Gameplay Effect assets, per-application specs and cosmetic cues illustrate these distinctions [S3].
Unity demonstrates shared definitions, unique per-element state and data-source substitution [S5]. Bulkhead's
frozen-definition rule is its own stronger ownership policy; Unity ScriptableObjects are not inherently immutable.

Choose lifetime deliberately: a player's progression may outlive an avatar, a room or a HUD. A shared definition must
not accidentally give all towers one cooldown. Conversely, a shared wallet may intentionally serve several action
handles. The ownership and sharing decisions should be explicit in the composition.

### 3. Use configuration for values and typed extension points for behavior

Prefer **existing data/config → composition → existing extension point → narrow contract extension → new provider**.
Unity's strategy guidance shows interchangeable algorithms selected by an outer context [S6]. Epic distinguishes
ordinary effect modifiers from custom calculations and components [S3].

- Different resource names, costs, durations or targets usually need definitions.
- A genuinely different algorithm may need a small typed strategy or registry entry.
- A family-only rule can stay in the family authority.
- Flags such as `isShooter` or `dialogueMode` inside a general mechanic indicate a boundary worth re-examining.
- A DSL needs a demonstrated authoring benefit and a plan for validation, debugging, execution limits and migration.

Inheritance can be useful within a stable local extension hierarchy. The recommendation is to compose capabilities
at the game boundary, not to ban subclassing. Likewise, additional roles/events/plugins must earn their wiring and
debugging cost. Four logically distinct responsibilities may fit in a small implementation without four deployable units.

### 4. Keep the dependency and transaction boundaries honest

An action may need a compatible resource handle and clock; it should not require the entire shooter `World`, `Race`
or `Adventure` service to charge a cost. A race-specific boost adapter can combine shared costs with local acceleration.
A colony can use numeric conversion without importing a narrative room/flag/journal framework.

The game validates spatial/target legality before shared action execution. Local effects follow only after success.
The existing atomic boundary covers resource costs/gains and action cooldown state. It does **not** provide rollback
for movement, dialogue branching, objective updates or arbitrary custom callbacks. If a later local step can fail,
prepare that outcome first or design a clearly bounded broader protocol; a sequence of mutating calls is not a transaction.

### 5. Specify operational behavior as part of the API

TypeScript compatibility is structural [S12]. It checks members and signatures, not purity, ownership, deterministic
time, truthful rejection or event timing. A substitutable plugin therefore needs a behavioral contract as well:

- **Factory versus instance:** `ctx.instantiate` caches a factory per registry/ID/session; `create(owner,id,...)` makes
  independent consumer state. Specify owned versus borrowed dependencies. Disposing an action should not implicitly
  destroy a shared resource pool borrowed by other actors.
- **Time:** name seconds or turns, the advancement authority, and whether advancement occurs before or after a decision.
  State what a turn means. Specify exact deadline equality, large jumps, pause and invalid-action behavior. Bevy's custom
  clocks support explicit time domains [S8], but its zero-advance and numeric rules differ from Bulkhead's.
- **Ingress versus completion:** `enqueue(...) === true` means accepted into a queue. It does not mean the eventual gameplay
  action succeeded. `execute().ok` and `MechanicActionCommitted` cover the shared action commit; a completed delivery,
  tower construction or dialogue branch is a separate game-level outcome [S10].
- **Events:** define when notifications run and what their payload describes. Bevy explicitly distinguishes immediate
  and deferred observer execution [S9]. Bulkhead defers fixed-system events until the system returns; outside a tick,
  handlers can run before the emitting call returns. An earlier payload can describe an earlier commit while a query
  already sees later state.
- **Reentrancy and faults:** exclusion can be per handle or per shared state. The existing action guard is per handle;
  another handle sharing its pool can still be invoked by a callback. Disposal during callbacks and notification after
  faults need explicit expectations. These are specification questions, not confirmed regressions from this research.
- **Identity:** state the uniqueness scope and reuse policy for IDs. Owner/instance IDs reused after disposal may need
  incarnation or correlation information if a future asynchronous consumer retains old notifications.
- **Ordinary rejection versus exceptions:** describe what remains unchanged on a normal rejection and what may already
  be committed after a throwing provider/observer. Prefer stable codes for new machine-consumed failures; do not make
  callers parse the existing human-readable `reason` strings as an undocumented protocol.

Lifecycle names are not portable semantics. For example, Bevy's plugin `cleanup` is a startup stage before execution
[S7], whereas Bulkhead scope disposal is teardown. Bulkhead's `requiresRoles` requires selection; `roleDependencies`
orders selected provider owners; selected role callbacks still run after plugin activation. Preserve these distinctions.

### 6. Make persistence and compatibility explicit opt-in capabilities

A detached observation snapshot is not necessarily a save. Current objective snapshots omit successful-receipt history,
and action cooldown state has no generic restoration protocol. Replaying ordinary mutation APIs while loading can
produce new events or rewards. A future save feature needs validated data, stable identities, time/queue/receipt policy,
definition versions and a deliberate restore boundary.

The existing `Profile` contract stores strings, booleans and numbers through synchronous whole-profile replacement.
It does not provide atomic multi-tab read-modify-write or a saved simulation. Arena best scores and Story's chapter
history share this storage facility while retaining different domain schemas.

Compatibility also has a producer side: adding a required method to an interface can break independent providers,
even when existing callers still compile. Rust's compatibility guide makes that distinction explicit [S11], and
TypeScript's required-member compatibility rules explain the corresponding structural constraint [S12]. Changed
notification timing, pause fallback or overflow behavior can be breaking without changing a type signature. Keep
SDK, implementation, content and save-schema versions conceptually separate; use optional capabilities only when
their absence has a defined outcome.

## Repository-grounded opportunities

The following are **proposed pilots**, not newly implemented plugins. Consumer names describe existing sources of
behavior or future migration targets. Source paths refer to the audited implementation; line numbers are deliberately
omitted here because they drift during edits.

Discovery inspected `mechanics/resources`, `mechanics/clock`, `mechanics/actions`, `mechanics/objectives`,
`mechanics/kits`, `example/ward`, `example/keys`, `story/adventure`, `core/world`, `recipe/resource-actions`,
`recipe/independent-actor-actions`, `recipe/scoped-input` and `recipe/profile-storage`. The decisions below reuse the
existing providers and extension points, propose narrow extractions where behavior overlaps, and defer broader systems
whose common contract has not been demonstrated.

| Capability | Evidence / consumers | Shared part and retained local rules | Recommendation |
|---|---|---|---|
| Resources, action costs/cooldowns, objectives | `mechanics/*`; Sky, Ember and Verdant already share them | Shared bounded transactions/readiness/progress; targets, outcomes and advancement policy remain local | Reuse existing providers; broaden adoption where semantics fit |
| Bounded semantic ingress | `puzzle-rules/index.ts`, `story-adventure/index.ts`, `ember-game/index.ts` under `src/plugins/` | Owned bounded FIFO, copied/normalized commands, paused/stale rejection and explicit drain; schema, drain budget, legality and outcome stay local | First pilot; a generic SDK helper may suffice instead of another selectable plugin |
| Explicit-clock deadlines | `sky-game/index.ts`: boost/hit windows; `verdant-game/index.ts`: dry-wind/season boundaries | Arm/cancel/query remaining/due over a borrowed clock; movement speed, damage, drain and victory precedence stay local | Second pilot; extend clock reuse with a small deadline capability |
| Item-possession collection | `example-keys/index.ts`: actor keyrings; `story-adventure/index.ts`: ordered unique item IDs and combinations | Membership and atomic require/remove/add; reach/facing, story flags, journal and save replay stay local | Conditional third pilot; compare against binary resources and current small collections first |
| Status effects / attribute modifiers | `example-ward/index.ts`, Sky temporary speed, `example-roguelite/index.ts` upgrades | Duration overlaps deadlines; add/multiply/clamp algebra, stacking/refresh and affected attributes do not yet share one demonstrated contract | Reuse the shooter modifier extension; defer a full cross-genre effect engine |
| Interactions / spawning | Shooter `Interactions`/`Prefabs`, Sky collection, Story choices, Survival and Ember waves | Some eligibility/cadence may overlap; spatial competition, explicit action selection, placement and creation authorities differ | Preserve existing extensions; extract only a second demonstrated common rule |
| Progression / saves / production | Existing objectives and Profile; puzzle undo; Story replay; immediate Verdant conversions | Monotonic goals and storage already exist; reversible state, complete restores and delayed jobs require different protocols | Reuse existing pieces; current code does not justify a universal progression, save or production system |

### Pilot A: bounded semantic ingress

Pair **Stonewake's one-command-per-tick rules** with **The Last Light's batch processing**. Preserve capacities of 32 and
128 respectively, clearing on each game's existing transitions, and Story's processing of the batch present when its
loop starts. Command unions, target validation and committed outcomes remain in the game plugins. Tactics' remembered
accepted request IDs differ from objective receipts remembered only after successful progress; do not unify those rules.

Evidence to retain: full playthrough/save routes, capacity rejection without mutation, no idle turn consumption,
paused/disposed ingress, detached accepted payloads, independent owners and stable recreation counts. Measure the
removed duplicate plumbing against the new API/adapters. A boolean pause service cannot reveal a pause/resume entirely
between observations; specify the achievable contract rather than implying an unobserved pause epoch exists.

### Pilot B: explicit-clock deadlines

Pair **Sky's seconds-based boost/collision-exclusion windows** with **Verdant's successful-turn deadlines**. Keep action
cooldowns in `mechanics/actions`: eligibility for reuse and duration of an active effect are different concepts.
Start with arm/cancel/remaining/due and exact `now >= deadline` semantics. Let the game rearm dry-wind work explicitly;
introduce recurring callbacks or catch-up only after their policies are actually needed.

Before migration, characterize Sky's exact boundary traces and Verdant's drain/victory precedence. Preserve idle,
rejection, pause and teardown behavior in both domains. Ward is a useful later consumer, but its existing
`ctx.time.now` phase alignment needs care. No inspected shipped game currently demonstrates delayed production with
reservations, refunds and blocked output, so that is a separate future requirement.

### Pilot C: item possession, only if the shared invariant earns its cost

Pair **Key Dungeon keyrings** with **The Last Light's ordered item combinations**. Test whether 0/1 resources already
suffice. Ordering, presence-only predicates and detached replay evaluation are possible reasons for a separate small
collection; an "inventory" name is not. If justified, initially share ordered membership and atomic require/remove/add.

Preserve actor isolation, duplicate pickup rejection, Story's item acquisition order, and failed-save replay leaving
gameplay progress and committed events unchanged while reporting failure. Exclude equipment slots, instance attributes, cross-container transfers and
recipe execution until there are real consumers. If adapters and replay machinery cost more than the actual repeated
rule, retain the existing small implementations and document the composition instead.

## Evidence: demonstrate the specific reuse claim

The useful claim is that **named contracts work in named compositions under tested conditions**. A metadata label or
a game count does not prove generality. Different consumers reveal assumptions in a provider; a different provider
reveals assumptions in the consumers. These are complementary directions of reuse.

### Current evidence and its limits

`tests/reusable-games.test.ts` completes all three games with default resources and an independently implemented
`z-test/resources`. Replacement catalogs omit the default resource implementation entirely. The tests compare final
authoritative states and resource/action/objective receipt arrays, and assert actual costs, per-tower cooldowns and
objective completion. The other three mechanic providers remain the defaults in every scenario.

| Consumer | Distinct pressure exercised | Resource / action / objective events per resource provider | Route limits |
|---|---|---|---|
| Sky Salvage | Seconds, spatial collect/deliver legality, cargo limits, distinct delivery receipts | 8 / 6 / 3 | Boost and repair are not executed in this differential route |
| Ember Bastion | Seconds, shared pool/clock, three separately owned tower action handles | 91 / 70 / 3 | Three builds and 67 fire commits; pulse, repair and loss are not exercised here |
| Verdant Relay | Whole turns, conversions, successful decisions advance time; idle scheduler ticks do not | 10 / 8 / 3 | Eight accepted decisions; no losing route or restart under the alternate in this test |

The resource implementations also share focused rejection, ownership, pause and disposal assertions. The broader
default-provider suite in `tests/mechanics-providers.test.ts` covers additional semantics but is not yet fully
parameterized for replacements. A rejecting pool double there tests an important failure path; it is not another
successful gameplay implementation.

Two further qualifications matter: the route drivers react to current state rather than replaying a recorded fixed
command tape, and the three receipt arrays establish ordering within each event type rather than total interleaving.
The existing evidence supports resource substitution in these scenarios; it does not establish every provider's
interchangeability, universal deterministic replay or cross-type event-order equality.

### Small, purposeful improvements

1. **Parameterize existing public-contract cases.** Run the same applicable assertions through real role-selected
   factories. Derive expectations from the documented promise: pre-gain affordability, exact cooldown equality,
   unchanged state on rejection, prerequisite legality and successful-receipt scope. Keep tests for consumer/provider
   teardown explicit. Avoid requiring a foreign provider to match internal allocation counts.
2. **Choose scenarios by the assumption they challenge.** Seconds versus turns, single versus multiple action handles,
   shared versus isolated resources and rejection versus success add distinct evidence. Add another consumer or
   replacement when it tests a real claim; a full Cartesian product is not automatically useful.
3. **Use short sequence tests where ordering matters.** Preview → intervening mutation → execute; pause → reject →
   resume; dispose → recreate → attempt stale mutation. Hypothesis and fast-check document generated stateful/model
   tests and shrinking [S13, S14]. Begin with hand-authored cases; a model should be simpler than the implementation,
   not a copy of its equations. No new test dependency is required by this recommendation.
4. **Make time an explicit input.** Use mechanic `advance` and scheduler ticks instead of sleeps. Bevy's headless runner
   and manual-time controls illustrate the separate concerns [S15, S16]. Check representability and exact boundaries;
   arbitrary timestep repartitioning is not a valid invariant for tick-dependent movement, spawning or targeting.
5. **Record actual inputs for a replay claim.** Retain preset/content identity, provider selections, seed, fixed step and
   tick-indexed command attempts, including rejections. Compare meaningful state checkpoints and the promised event
   stream in a fresh session. Preserve minimized failing tapes as regression fixtures.

High-value lifecycle cases include isolated owners, interleaved hosts, preview invalidation, pause/resume, early and
repeated disposal, ID reuse, provider teardown, partial kit-construction failure and restart with retained old handles.
Use existing host-level coverage for generic staging/activation/async rules; add plugin-specific cases only for state
and resources that plugin actually owns. These are claim-driven case selections, not a requirement to duplicate the
entire host test suite for every mechanic.

### Discovery should point to evidence, not certify it

The existing index checks registrations, metadata references, recipe staging and freshness. It does not activate those
recipes or establish the semantics of referenced test files. Its `reviewed` flag comes from metadata scope, not from a
test run. Its source digest excludes ordinary Markdown and test bodies, so freshness is not an evidence fingerprint.

Use four descriptive evidence levels in design notes if useful: **discoverable**, **contract-exercised**,
**composition-exercised**, and **substitution-exercised**. Record lifecycle, replay and browser coverage separately.
These are proposed local labels, not a new schema or industry standard. Current resource replacement reaches the last
level for its tested subset; the other shared providers have contract/composition evidence.

Link a semantic contract section, real consumer and named test case from the existing metadata/docs. Keep unsupported
semantics prominent. If machine-readable run evidence is later needed, design a schema revision with case references,
tested dimensions, known gaps and source/test/contract fingerprints. Do not add unknown fields to today's strict
`reuse.json` schema. JSON Schema's own annotations guidance explains why examples/defaults are not executable validation
[S17]; Bulkhead currently uses its own validator, but the same documentation-versus-execution distinction applies.
Compatibility should cover the declared observable contract, consistent with SemVer's requirement for a precise public
API [S18].

## Proposed authoring artifact: a short design note

Before stabilizing a new reusable API, record the following alongside its design. This is a prose review template,
**not a new manifest or `reuse.json` schema**. A small capability may answer several rows in one paragraph.

| Question | Required design information |
|---|---|
| What exists already? | Search terms, candidate IDs, inspected consumer/tests, and the specific missing behavior |
| What is shared? | One sentence describing the common invariant, plus two concrete uses with different game policies |
| What varies? | Values handled by content; behavior handled by typed collaborators; rules retained in each game |
| Who owns state? | Definition lifetime, provider lifetime, consumer instance lifetime, IDs, destruction and reset |
| Who may mutate it? | Authoritative entry point, copied input/snapshot rules, normal rejection results |
| What does time mean? | Clock domain, advancement authority, boundary order, pause and expiry semantics where relevant |
| What does success commit? | Exact fields covered atomically, publication/reentrancy order, and failure limits |
| What does it depend on? | Required contracts, selected roles, startup ordering and optional presentation adapters |
| How can it evolve? | Compatibility promises, definition/schema references, migration or explicit unsupported persistence |
| What demonstrates reuse? | Different consumer scenarios, isolation/lifecycle tests, and substitution evidence appropriate to the claim |
| How will an agent find it? | Capability vocabulary, scope limits, public entry points, recipe and executable example/test paths |

Use the existing sidecar fields to publish the concise outcome: `summary`, `keywords`, `entryPoints`, `useWhen`,
`limitations`, `docs`, `examples` and `tests`. Put richer design/evidence notes in a linked Markdown file. Any later
machine-readable evidence fields would need an explicit schema/tooling change before authors could use them.

For evidence, append a short record: **claim; contract; consumer/provider composition; named cases and their oracles;
time/ownership/lifecycle dimensions; actual command and result; replay inputs when relevant; known gaps; reuse decision**.
This is enough to make an agent's choice reviewable without adding a separate discovery or testing service.

## Recommended order of work

1. Publish the behavioral contract and parameterize the existing resource conformance assertions for both implementations.
2. Pilot bounded command ingress in Stonewake and The Last Light, measuring the duplication removed and preserving
   each game's processing policy.
3. Pilot explicit-clock deadlines in Sky and Verdant, with before/at/after boundary and pause/rejection cases.
4. Evaluate the item-possession pilot against existing numeric resources before approving another contract.

Keep the current resource/action/objective providers as the foundation. The next shared abstraction should be promoted
when real consumers show that it removes repeated rules without obscuring their game-specific policies.

## Verification for this research update

- The evidence investigator ran the three selected suites (`reusable-games.test.ts`, `mechanics-providers.test.ts`,
  `reuse-discovery.test.mjs`) under installed Node **22.19.0**: **25 passed, 0 failed, 0 skipped**.
- The parent ran `npm run check`: typechecking, boundary checks, reuse-index freshness and **578 tests passed**.
- Some investigator shells initially selected Node 20 and failed to load `.ts` files. Selecting the installed Node 22
  runtime resolved that environment issue; no package or runtime installation was needed.
- This update consists of research documentation. Browser observations in the baseline come from earlier acceptance
  work; this research did not rerun the build or browser suite.

## Primary source record

All pages below were fetched and inspected on 2026-11-16. Page publication/update dates were not established unless noted.
Versioned URLs identify the documentation view consulted; they do not assert the latest engine release.

| Ref | Primary source | Applicability and qualification |
|---|---|---|
| S1 | [Epic: Game Features and Modular Gameplay][S1], UE 5.6 view | Encapsulated opt-in features; minimizing project-class dependencies improves reuse. Unreal component injection is not Bulkhead's lifecycle implementation. |
| S2 | [Epic: Abilities in Lyra][S2], UE 5.6 view | Mechanic-neutral GAS versus game-specific extensions; definition sets, grants and removal handles. Its multiplayer breadth is not a requirement for this project. |
| S3 | [Epic: Gameplay Effects][S3], UE 5.6 view | Immutable definitions, runtime specs, active state and cosmetic cues; ordinary modifiers versus custom calculations. Generic effects still need explicit stacking/duration policies. |
| S4 | [Godot: Scene organization][S4], 4.5 | Focused reusable scenes, dependency injection, initiating methods versus responding signals, lifetime-aware relationships. Godot formally describes its node trees as aggregation. |
| S5 | [Unity: Separate game data and logic][S5], unversioned how-to | Shared definitions versus unique state; ScriptableObject/JSON data-source substitution. Does not promise inherently immutable assets. |
| S6 | [Unity: ScriptableObjects as delegate objects][S6], unversioned how-to | Typed strategies and outer-context coordination. Uses inheritance where useful; does not mandate a universal plugin or scripting system. |
| S7 | [Bevy: Plugin lifecycle][S7], 0.17.2 API docs | Precisely named build/readiness/finish/cleanup stages. Its startup cleanup is not equivalent to session teardown. |
| S8 | [Bevy: Time][S8], 0.17.2 API docs | Real, virtual, fixed and custom clocks; explicit advancement. Its duration types and zero-advance policy are not Bulkhead's rules. |
| S9 | [Bevy: Observer execution timing][S9], 0.17.2 API docs | Immediate/deferred delivery and observer-order semantics. Does not prescribe Bulkhead's event ordering. |
| S10 | [Epic: Gameplay Ability lifecycle][S10], UE 5.6 view | Availability, activation, cost/cooldown commitment, cancellation, ending and instancing. No general rollback or exactly-once guarantee. |
| S11 | [Rust Cargo: SemVer Compatibility][S11], rolling reference | Required interface/trait additions can break implementors; structural and behavioral compatibility both matter. Rust-specific rules are not mechanically TypeScript rules. |
| S12 | [TypeScript: Type Compatibility][S12], living handbook | Structural compatibility checks required members and compatible signatures, not behavioral invariants. The fetched footer reports "Last updated: Nov 13, 2026"; this is page metadata, not a claim that the principles originated then. |
| S13 | [Hypothesis: Stateful tests][S13], rolling documentation | Generated action sequences, preconditions, invariants and short reproducing programs. Supports a testing method, not a Python integration proposal. |
| S14 | [fast-check: Model based testing][S14], rolling documentation | Command generation/shrinking and independent simplified models; replay uses seed, path and replayPath. The fetched page reports updated 2026-08-18; no package version is inferred. |
| S15 | [Bevy: MinimalPlugins][S15], 0.17.3 API docs | Actual scheduling without a window event loop. Headless execution alone does not establish deterministic time. |
| S16 | [Bevy: TimeUpdateStrategy][S16], 0.17.3 API docs | Manual time controls for tests; automatic execution can still use system time. Bulkhead already has explicit clocks and tick controls. |
| S17 | [JSON Schema: Annotations][S17], rolling official guide | Descriptions, defaults and examples are annotations; defaults are not inserted by validation and examples do not automatically validate. Does not imply Bulkhead uses JSON Schema. |
| S18 | [Semantic Versioning][S18], specification 2.0.0 | Precise public API and compatibility-based release versioning. Version labels do not substitute for behavioral verification. |

[S1]: https://dev.epicgames.com/documentation/en-us/unreal-engine/game-features-and-modular-gameplay-in-unreal-engine?application_version=5.6
[S2]: https://dev.epicgames.com/documentation/en-us/unreal-engine/abilities-in-lyra-in-unreal-engine?application_version=5.6
[S3]: https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-effects-for-the-gameplay-ability-system-in-unreal-engine?application_version=5.6
[S4]: https://docs.godotengine.org/en/4.5/tutorials/best_practices/scene_organization.html
[S5]: https://unity.com/how-to/separate-game-data-logic-scriptable-objects
[S6]: https://unity.com/how-to/scriptableobjects-delegate-objects
[S7]: https://docs.rs/bevy/0.17.2/bevy/app/trait.Plugin.html#lifecycle-of-a-plugin
[S8]: https://docs.rs/bevy/0.17.2/bevy/time/struct.Time.html
[S9]: https://docs.rs/bevy/0.17.2/bevy/ecs/observer/struct.Observer.html#observer-execution-timing
[S10]: https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-abilities-in-unreal-engine?application_version=5.6
[S11]: https://doc.rust-lang.org/cargo/reference/semver.html
[S12]: https://www.typescriptlang.org/docs/handbook/type-compatibility.html
[S13]: https://hypothesis.readthedocs.io/en/latest/stateful.html
[S14]: https://fast-check.dev/docs/advanced/model-based-testing/
[S15]: https://docs.rs/bevy/0.17.3/bevy/struct.MinimalPlugins.html
[S16]: https://docs.rs/bevy/0.17.3/bevy/time/enum.TimeUpdateStrategy.html
[S17]: https://json-schema.org/understanding-json-schema/reference/annotations
[S18]: https://semver.org/spec/v2.0.0.html
