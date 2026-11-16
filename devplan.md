# Development plan

Status of the five milestones, then the next expansion steps. For what exists today see [SPEC.md](SPEC.md); for the
contained Three.js migration and retained esbuild/`node:test` toolchain see
[ARCHITECTURE.md](ARCHITECTURE.md).

For a research-backed, cross-genre plugin and game-slice proposal, see [GAME_PLUGIN_ROADMAP.md](GAME_PLUGIN_ROADMAP.md).
That proposal is not an implementation status or a replacement for the milestones below.

Cross-genre slices now include timed raid, score attack, holdout, key dungeon, stealth, puzzle, horror, seeded gauntlet
and planar racing, with curated Assetrizz art. The staged dependency plan is in [BUILD_ORDER.md](BUILD_ORDER.md).
Experimental vertical geometry queries and a network message codec are isolated prototypes; neither vertical gameplay
nor multiplayer is integrated. Local profile best scores are implemented; full run saving remains planned.

The independent-family wave from [GAME_PLATFORM_STRATEGY.md](GAME_PLATFORM_STRATEGY.md) now has:

- Official Three.js 0.187.0 behind the existing render SDK, orthographic camera leases, SDK 2 compatibility migration.
- Experience-selected pointer/control policy, scoped input contexts and UI ingress gating.
- Overhead racing, turn tactics and narrative adventure, each with independent simulation, presentation, JSON content
  and curated art/audio themes. Adventure includes an explicit chapter save; general run saving remains planned.
- A parallel implementation/task record in [PARALLEL_BUILD_PLAN.md](PARALLEL_BUILD_PLAN.md).

The follow-up **Stonewake** preset adds an independent 3D escape-puzzle family: three authored chambers, movable
boulders/pressure plates, two-beat golem pursuit, reversible turns, articulated mesh actors and a rotatable camera.
It reuses the curated Chalk & Timber imagery for floor material/portraits and authors new volumetric geometry in its
presentation plugin. See [the game guide](docs/stonewake.md). General 3D physics and GLB loading remain separate work.

The **2026-11-16 cross-genre reuse wave** implements four shared mechanic providers, strict kit content, opt-in
role-dependent activation ordering and three new 3D consumers: **Sky Salvage**, **Ember Bastion** and **Verdant Relay**.
Headless integration completes all three with default and independent replacement resource providers, comparing state
and owner-tagged resource/action/objective receipts. The new games use seconds and turns explicitly. See
[implementation and ownership plan](REUSABLE_MECHANICS_PLAN.md), [mechanic API](docs/reusable-mechanics.md) and
[primary-source research](docs/research/reusable-mechanics-2026-11-16.md). Browser acceptance results are recorded in
`.smoke/reusable-games-report.json` after running `node tests/reusable-games-demo/run.mjs` against a production build.

The follow-up **reuse discovery workflow** adds live capability search, a generated human/machine inventory, validated
plugin-local scope/examples metadata and composition recipes. Agent guidance now starts with capability search and a
reuse/extend/new decision; the scaffolder suggests existing elements. Inventory freshness is part of `npm run check`.
See [REUSE.md](REUSE.md). This makes existing behavior discoverable; semantic duplicate detection remains a review task.

The **general-capability follow-up** delivers a shared public-contract resource conformance runner used by the default
and independent test providers, including interleaved-host isolation and partial-kit construction cleanup. It also
extracts consumer-owned SDK command queues for Stonewake/The Last Light and explicit-clock deadlines for Sky/Verdant,
with real-consumer boundary and replay-ownership tests. New recipes, local capability metadata and a reusable
[design/evidence template](docs/reusable-capability-template.md) make those seams discoverable. See
[conformance](docs/mechanic-conformance.md), [queues](docs/command-queues.md), [deadlines](docs/deadlines.md) and
[the evaluated item-possession decision](docs/item-possession-decision.md): key/story collections stay local because
only Story implements the proposed multi-item transaction. Independent clock/action/objective replacements and
general run replay/restore remain separate work.

Integrated acceptance passed **635 tests**, **23 bundled preset validations**, the production build, **37 smoke checks**
and **20 family-browser acceptance groups**. See the [buildout verification record](docs/general-capability-buildout.md).

The **selectable building-block wave** adds deterministic unit-edge `mechanics/navigation` for Stonewake/Signal Break
and finite ordered `mechanics/sequence` for the two racing compositions. Their algorithms have independent replacement
implementations in tests; the games retain occupancy, crossing and outcome policy. Clock and sequence factories share
an SDK live-ID/dual-scope lease helper. See [implementation and verification](docs/building-block-plugins.md),
[navigation](docs/navigation.md), [sequences](docs/sequences.md) and [ownership](docs/owned-instances.md).

This wave passed **703 tests**, **23 preset validations**, the production build, **20 family-browser groups** and
**11 genre-preset browser checks**. Smoke passed **36/37**: its headless frame-budget assertion still fails in the
default shooter after isolated rerun. A diagnostic localized the spike to rendering, not scheduler advancement;
performance acceptance remains unresolved. Details and actual logs are in the building-block verification record.

The broader strategy remains a roadmap: general scene/run scopes, async asset bundles, reusable perception/effects,
genre editors, full vertical gameplay and multiplayer have not been delivered by these slices.

## Milestones

**Cinder Vault** now runs as a turn-based three-depth generated dungeon roguelite. `dungeon/generator` emits a 94×30
map with 7–9-room wings; `mechanics/progression` owns XP levels and pending boons while turns continue;
`mechanics/inventory` provides the 12-stack pack with filters/drop and gear slots; `mechanics/crafting` executes nine
known Ember Shard recipes. Start-of-run Pilgrim/Delver/Ashbound threats scale enemy damage/health, elite frequency, healing,
loot and legacy without hidden scaling. Three classes spend 3–4 action points on one-tile steps, attacks, reloads, pulses,
items or gear; `TurnControl` suspends real-time enemy AI and the mode telegraphs enemy actions. New Ash Hounds, support
Ember Acolytes and Cinder Brutes widen the depth pools; Warded/Swift/Emberbound/Siphoned elites add behavior, and
wardens/Keeper enrage below half health. `presentation/camera-modes` adds a
reusable `O`-toggled orthographic isometric view with `ViewModes` presentation adaptation, a floor player marker and
class-specific knight/mage/rogue avatar bodies. First-person weapon sprites use a bottom-center pivot at 0.28 scale
instead of the previous lower-right 0.44 framing.
Optional Assetrizz NPCs (Ember Smith, Lantern Cartographer, Ash Oracle) provide forge/mend, paid map reveal or
health/ember bargains; a fogged automap and `M` tactical grid expose explored layout and AP reach; `H` opens a movement-blocking
field guide. `Z`/`X` rotate the orthographic camera, isometric WASD follows its azimuth, pointer hover previews move/attack AP,
and clicks spend AP on movement or attacks. Wardens gate descents, loot, four new relics and a six-weapon armory supply build
depth; class mastery, best threat and legacy persist, and the Keeper closes the run. Headless acceptance covers class/threat
selection, AP turns, elite/boss scaling, Oracle pact, intent damage, inventory/equipment, map/grid, field guide,
camera-view toggle, NPC/forge, in-level leveling, all depths and independent progression replacement; browser acceptance covers
class/threat selection, transitions, field guide, first-person/isometric screenshots, hover preview, grid, NPC dialogue, forge,
pack filters, input turns, non-modal boon selection and the complete route. See [the game guide](docs/cinder-vault.md),
[classes and loot](docs/cinder-classes.md), [inventory](docs/inventory.md), [crafting](docs/crafting.md),
[dungeon generator](docs/dungeon-generator.md) and [progression](docs/progression.md).

**Hollowmere** adds an independent side-scrolling metroidvania family. Reusable `mechanics/platforming`,
`mechanics/capabilities` and `mechanics/room-map` providers supply movement, ability/rank state and explorable room
state; `mechanics/inventory` supplies items. `hollowmere/game` owns a 12-room Assetrizz world, combat, checkpoints,
NPCs, save/load, three Sun Sigils and a two-phase boss. `hollowmere/presentation` renders the canvas world and a
game-owned field journal with map, inventory, capabilities, stats and persisted options. The same wave adds a full-screen
JSON-first game composition canvas (`src/app/game-graph.ts`, `game-composer.ts`) for humans and agents, with role/provider
metadata generated from the reuse index, deterministic preset compilation, host-staged validation, import/export and a
`npm run graph` CLI. Headless tests cover the providers, world/checkpoint/dialogue/pause path and graph round-trips;
browser acceptance covers Hollowmere and the composer. At that milestone local verification was **773/773 tests**, **25 bundled presets**, Hollowmere **5/5**, composer **3/3**, creator **67**, Cinder **6/6**, smoke **37/37**. See [Hollowmere](docs/hollowmere.md) and [game composer](docs/game-composer.md).

The [ten-game portfolio](docs/ten-game-portfolio.md) adds authored puzzle campaigns, racing trials, tactics missions,
adventures, a courier route and a restoration season. Racing and tactics also consume the shared outcome-rating
provider; complete routes are exercised headlessly. Two additional card games exercise a shared ordered-piles provider.
Current portfolio verification: **791/791 tests**, **37 bundled presets staged**, **12 browser action checks** and
**37/37 smoke checks**. See the portfolio guide for the exact scope and verification.

| # | Stage | Status | What it delivered |
|---|---|---|---|
| 1 | Shell, SDK, host, lifecycle tests | **Done** | Runtime kernel (scopes, registries, entity store, buses, scheduler, resolver, validation), plugin host with staged loading, public SDK, application shell, import-boundary lint, lifecycle and resolver test suites |
| 2 | One room, movement, one weapon | **Done** | Grid world with collision, controller and camera, hitscan weapon, mini3 renderer and presentation, HUD, input and audio adapters |
| 3 | Full reference game, validated content | **Done** | Bulkhead Station arena, two weapons, two enemy types with navigation, pickups, doors and switches, objective mode, JSON content kinds with cross-reference validation, theme with procedural art and sound |
| 4 | Four extensions and creator tools | **Done** | Data pack, ricochet behaviour, visor HUD, survival mode, four presets, creator panel (plugin toggles, preset picker, import and export, debug views) |
| 5 | Cleanup and failure verification, browser playthrough, performance, handoff | See `HANDOFF.md` | |

## Next three expansion steps

Ordered; each is independent of the later ones.

1. **Build on the independent families.** Expand authored tracks/missions/chapters and iterate on handling, forecasts,
   feedback and accessibility through playtests. Introduce scoped asynchronous image/audio/glTF preparation and bundle
   delivery once their lifecycle is specified. Measure the new Three.js renderer on real GPUs. The renderer migration
   is complete; esbuild/Node tests and import-boundary rules remain in place.
2. **Vertical gameplay as a versioned SDK extension.** Add height to the world description and to `Transform`, a new
   controller and camera provider with pitch and jumping, and 3D collision and ray queries. This changes shared contracts,
   so it requires a future versioned contract with manifests declaring the range. Extend the grid format (or add a new
   map format) for floor and ceiling heights. SDK 2 currently denotes the native Three.js rendering migration.
3. **Creator tooling.** A graphical grid-map painter that writes the existing map JSON, persistence of imported content
   packs alongside the selected preset, and versioned save games (the design is in CONTENT_FORMAT.md: plugin and pack
   versions recorded, refusal to load on mismatch).

## Roadmap and ideas

Not scheduled; none of these exist.

- Visual scripting for map triggers and simple modes.
- More complete audiovisual directions beyond the shipped industrial, Assetrizz, arcade, board and story themes.
- Gamepad support and key rebinding.
- Audio occlusion from the world's line-of-sight queries.
- Scene light budgeting and real-device rendering benchmarks with Three.js.
- A spatial hash for collision and queries on larger maps (today every query tests every box).
- Use Three.js instancing for large actor populations if profiling justifies it; its native frustum culling is available.
- Recording and replay of per-tick input, building on the deterministic fixed-step simulation.
- Runtime installation of third-party code plugins, which would first require a sandboxing model (today code plugins are
  compiled in and fully trusted).
- Resolve the scheduler's removal contract: `ARCHITECTURE.md` says removals during a tick take effect on the next tick,
  while `src/kernel/scheduler.ts` immediately skips a removed system. Decide the intended behavior and cover it with a
  regression test before aligning implementation and documentation.

## Carried over from the offline build

- The original offline build had no lockfile; development dependencies are now locked in `package-lock.json`.
- GPU performance has not been measured; the smoke test ran with software WebGL2 and checks CPU time per frame only.
- Browser coverage is Chrome only.
- Imported content packs are not persisted across page loads.
