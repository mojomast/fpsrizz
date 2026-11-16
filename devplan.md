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

**Cinder Vault** now runs as a three-depth generated dungeon roguelite. `dungeon/generator` emits a 94×30 map with
7–9-room wings; `mechanics/progression` owns XP levels and pending boons while combat continues. Wardens gate descents,
weapon caches and a six-weapon armory supply loadout depth, and the Keeper closes the run. It composes the shared
resource/action/clock/objective providers and existing shooter stack. Headless acceptance covers in-level leveling,
queued rewards, all three depths and independent progression replacement; browser acceptance covers live movement/fire,
non-modal boon selection and the complete depth route. See [the game guide](docs/cinder-vault.md),
[dungeon generator](docs/dungeon-generator.md) and [progression](docs/progression.md).

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
