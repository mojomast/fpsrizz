# Bulkhead: specification of the delivered foundation

This document states what is implemented, what is deliberately not, and where the extension boundaries are. Anything
described as "planned" does not exist. Design rationale and structure are in [docs/reference/architecture.md](architecture.md); the
plugin API is in [docs/guide/plugins.md](../guide/plugins.md); JSON formats are in [docs/reference/content-format.md](content-format.md).

## 1. Delivered stack

The original offline build used mini3. Production now uses official Three.js through the existing rendering SDK.
The generic kernel and the esbuild/Node test toolchain are retained:

| Concern | Brief | Delivered |
|---|---|---|
| Rendering | Three.js | **Three.js 0.187.0**, reproducibly vendored behind `src/platform/render/service.ts` and `src/sdk/render.ts` (`THREE`) |
| Bundler / dev server | Vite | **esbuild** (`scripts/build.mjs`, `scripts/dev.mjs`, `scripts/preview.mjs`) |
| Tests | Vitest | **`node --test`** running TypeScript directly (Node >= 22.18 type stripping) |
| Type checking | (implied) | Separate `tsc --noEmit`, TypeScript 7 |
| Runtime dependencies | n/a | Vendored Three.js, built into the local bundle; no CDN runtime fetch |
| Lockfile | n/a | `package-lock.json` locks development tools and upstream renderer/type sources; use `npm ci`. |

`scripts/tools.mjs` resolves esbuild and Playwright from the project's `node_modules`, then from `TOOLS_NODE_MODULES`,
then from `/opt/npm-tools/node_modules`. `npm run vendor-three` reproduces the upstream runtime/declarations and
license/hash records. SDK 2 records the incompatible native rendering namespace; boundary lint rules remain intact.

## 2. Implemented scope

### 2.1 Runtime and plugin host (`src/kernel`)

- Manifest-first discovery: manifests are JSON, validated (schema 1) before any plugin code is imported. Code plugins
  must be compiled in (catalog entry with a loader); content packs must not carry a loader.
- Dependency resolution: dependencies must be enabled in the preset (never auto-enabled), semver ranges
  (`^ ~ >= > <= < =`, wildcards, AND by space, `||`), SDK range check, conflicts, cycles, duplicates. Activation order
  is a topological sort with lexicographic tie-break; disposal is the reverse.
- Staged loading: code import, `register()`, content loading and validators run in isolated registries. A failure at any
  stage leaves the running game untouched and reports issues with source, field path and message.
- Owner-bound lifetimes (`Scope`), reference-counted shared assets (`AssetStore`), reverse-order disposal, one failing
  disposer never blocks the rest and is logged with its owner.
- Epoch handling: a newer `apply`, a `restart` or a `stop` supersedes an in-flight start; the stale start is discarded
  and rejects with stage `superseded`. Late async completions cannot attach resources to a dead scope.
- Fault isolation: a system, frame system or event handler that throws puts the session in `faulted`, pauses the
  scheduler and records the responsible plugin and system id.
- Session-bound factory instances (`instantiate`) created in the context of the plugin that registered the factory.
- Exclusive roles (controller, camera, mode, HUD, theme) chosen by the preset; missing, ambiguous and unknown
  selections are validation errors.
- Content kinds with loaders and cross-reference validators; `host.survey()` lists what installed plugins would
  contribute (used by the creator panel to offer choices).
- Typed configuration per plugin (`number`, `boolean`, `string`, `select`) with preset overrides, range-checked.

### 2.2 Simulation

- Fixed 60 Hz step, at most 5 ticks per rendered frame; excess backlog is discarded and counted (`droppedTime`).
- Nine ordered phases (`input`, `control`, `ai`, `movement`, `combat`, `damage`, `world`, `rules`, `presentation`),
  systems ordered by `order` then id; frame systems receive an interpolation `alpha`.
- Entity store with numeric ids that are never reused in a session; structural changes during iteration are safe.
- Events delivered after each system returns; commands with exactly one handler; services for immediate queries.
- Per-tick input snapshot; press/release edges and mouse deltas are consumed in exactly one tick.
- Seeded per-plugin RNG (`ctx.rng`); simulation time (`ctx.time.now`) for cooldowns and timers.
- Damage is queued and resolved in the `damage` phase through an ordered modifier chain; `Died` is emitted once.

### 2.3 World (`core/world`)

- Grid JSON (schema 1, up to 96 x 96 cells) is translated into a `WorldDescription`, the single source for rendering,
  collision, line of sight and navigation.
- Planar AABB collision with circle depenetration and wall sliding; analytic ray and swept-circle queries (no
  tunnelling at any speed); doors are togglable boxes that every query respects.
- Grid A* (8-connected, no corner cutting) with line-of-sight smoothing; closed doors block paths.
- Doors (lockable), switches (activated with Use), zone triggers, spawns, point lights, ambient light and fog.

### 2.4 Content validation

- Manifest, preset, pack envelope and per-kind data are validated with path-tracking reporters; limits on string and
  array sizes and JSON nesting depth; no scripts, expressions or remote URLs can enter through content.
- Cross-reference checks: behaviours exist and their params validate, ammo types exist, weapon slots are unique,
  pickup effects exist, enemy AI and attack behaviours exist, map spawns reference registered prefabs and lie in free
  space, the selected map exists, the objective mode needs an `exit` zone, the survival mode needs enemy spawn points.

### 2.5 Reference game (section 3 describes it)

Seven code plugins, one content pack (`core/content`) and a theme (`theme/industrial`) make up the playable game; see the
plugin table in docs/reference/architecture.md.

### 2.6 Extensions (section 4)

Four demonstrations show the extension points: a data-only pack, a new attack behaviour, a replacement HUD, and a
replacement game mode. All four are switched on through presets and none edits a core plugin.

Additional extensions include time-trial and arena score modes, a sprint/dash controller, a timed damage-reduction ward
effect, a key pickup and keyed gate, a stationary vision-cone guard, and several objective maps. The time-trial, arena,
holdout, puzzle, horror, key-dungeon and stationary-guard stealth presets are catalogued. Stealth detection is
planar vision only; guards do not patrol or react to light and sound. The arena stores a local best score through an
optional profile service; this does not provide full run saves or atomic cross-tab updates. The seeded gauntlet has
automatic run-only upgrades. Foundry Circuit provides a planar first-person checkpoint time trial, not vehicle physics.
Salvage Run is a timed extraction slice with run-only loot; it has no persistent stash. The Key Dungeon preset uses a
second fantasy Assetrizz theme with curated textures and enemy strips and fantasy Blender weapon renders.
Relay Station adds a magazine-fed carbine with manual reload; fire-mode switching and tactical equipment remain future work.

### 2.7 Creator tools (`src/app/creator.ts`)

A panel opened with the backquote key or the **Creator tools** button, with four tabs:

- **Plugins & preset:** preset picker, per-plugin enable toggles (disabling a plugin that others require is refused with
  the dependents named), map / role / theme selectors, per-plugin configuration inputs, gameplay seed, **Validate**
  (stages the draft without touching the game), **Apply & restart**, and draft reset.
- **Content:** import a content pack or preset from a file or pasted JSON (1 MB limit; staged and validated before
  anything changes), export the active preset or any installed pack (copy or download).
- **Canvas:** opens the full-screen GameGraph composition editor: node/role wiring, catalog palette, inspector, options,
  typed config, host-staged validation, apply, import/export and deterministic auto-layout.
- **Debug:** frame timing, render statistics, session state, host resource counts, active systems with average cost,
  entities per owner, resources per plugin, shared assets and their owners, registry contributions, host log.

### 2.8 Tooling and tests

- `npm run lint` enforces the import boundaries (`scripts/boundaries.ts`, tested by `tests/boundaries.test.ts`).
- `node --test` suites cover the kernel (scope, assets, registry, ecs, scheduler, semver, validation), host lifecycle
  and resolver, the platform input core, flow service and settings sanitising, world collision, combat (damage pipeline,
  modifiers, pickups, enemy line-of-sight rules, objective flow), and each extension.
- `npm run smoke` drives the production build in headless Chrome with software WebGL2 through a full playthrough,
  preset switching, repeated apply/restart cycles (resource counts must not grow) and a frame-timing check.
- `tests/*-demo` and `tests/art-preview` hold browser scripts for individual subsystems; they are run by hand and are
  not part of `npm test`.

### 2.9 Independent game families

Eight additional preset graphs run without any shooter player, collision world, combat, enemy, reference-content,
HUD or presentation plugin. Each has its own simulation authority, presentation plugin, validated content pack and
theme. They share host lifecycle, services, deterministic scheduling and the public SDK.

| Preset | Implemented scope | Deliberate slice limits |
|---|---|---|
| `vehicle/neon-run` | Visible overhead car; acceleration/braking/reversing, steering, drift grip, off-track drag, ordered directional swept gates, two laps, timer and restart | One authored circuit; arcade kinematics, no rigid-body vehicle physics or opponents |
| `board/turn-tactics` | Squad selection, occupancy/path movement, AP, LOS and cover forecasts, explicit queued actions, deterministic enemy turns, victory/defeat | One authored mission; no campaign, procedural missions or multiplayer |
| `story/last-light` | Three illustrated rooms, two initial dialogue branches, inventory combination, clue/flag gates, journal, completed chapter and explicit save/load | Short chapter; replay-validated chapter save, not a general ECS snapshot or transactional economy |
| `puzzle/stonewake` | Three lit 3D chambers, articulated explorer/golem meshes, pushable boulders, pressure plates and exit gates, deterministic two-beat pursuit, undo/retry/replay, orbit camera and ray picking | Grid-based turns in a volumetric scene; no jumping, rigid-body physics, persisted campaign or imported GLB models |
| `sky/salvage` | Lit floating islands, authored matching cargo deliveries, drone flight, moving hazard, boost/repair and touch controls | One route; planar flight in 3D, no rigid-body flight or saved run |
| `ember/bastion` | Authored 3D lane/pads, tower construction, three enemy waves, repair/pulse, victory/defeat and replay | One defense scenario, one tower type; no campaign or path editing UI |
| `verdant/relay` | Three 3D island relays, turn-based resource production/conversion/restoration, cooldowns and dry-wind forecast | One season scenario; no offline production, general save or undo |
| `hollowmere/ascent` | Twelve-room canvas metroidvania, reusable platform/capability/room-map providers, combat, checkpoints, NPCs, tabbed journal and boss | One authored world; physical routes and boss balance need playtesting, no room editor or gamepad |
| `portfolio/*` | Ten authored experiences across racing, tactics, adventure, puzzles, drone delivery and colony restoration | Shared family rules, art and presentation; see the portfolio guide for each scenario's specific limits |
| `portfolio-cards/ash`, `portfolio-cards/cloud` | Two small card games with different actions and outcomes over shared ordered draw/hand/discard piles | Fixed 12-card decks; no shuffle, deckbuilding or persistence |
| `silt/archive` | Three-district dungeon expedition with room exploration, combat, tide, equipment and extraction | Session-only; room assembly and expedition policy are family-specific |
| `salt/ledger` | Party RPG across 16 locations with tactical battles, side quests and three endings | Session-only; no terrain tactics, crafting or persistent save |
| `common/ground` | Three-resident household with needs, work, relationships, editable floor plan and furniture, projects and gathering | Turn-based; no spatial pathfinding or in-progress household save |

See [racing](../../games/racing/README.md), [tactics](../../games/tactics/README.md), [adventure](../../games/adventure/README.md),
[Stonewake](../../games/puzzles/docs/stonewake.md) and [Hollowmere](../../games/hollowmere/README.md) for
content schemas, controls and completion routes. Art directions use curated Assetrizz images and original procedural
elements; each theme supplies its own synthesized cues. Sampled music and a continuous audio-director API are future work.
The [ten-game portfolio](../games/ten-game-portfolio.md) documents the authored scenarios and their verified routes.
The two puzzle and two card presets select an optional shared hint ledger and contextual assistance; hints are requested
by the player and do not submit game commands. See [portfolio assistance](../../games/puzzles/docs/portfolio-assist.md).

`ExperienceRole` selects locked/free/no-pointer input policy and launcher controls. `InputContexts` supplies scoped
priority/consumption and exclusive focus. `SessionControl` gates gameplay ingress from UI. Tactics/adventure/puzzle state
changes only on commands: the scheduler can service input while their authoritative state waits. Camera leases support
perspective/orthographic projection and clean restoration when switching games.

### 2.10 Reusable mechanics across genres

**Hollowmere** is a side-scrolling metroidvania composed from three new cross-genre providers plus the existing
inventory provider. `mechanics/platforming` supplies AABB movement with coyote/buffered jumps, variable height, double
jump, dash, wall slide/jump and one-way collision. `mechanics/capabilities` stores named unlocks/ranks;
`mechanics/room-map` stores current, visited and revealed room state with an authored room graph. Hollowmere itself owns
the twelve-room world, combat/enemy turns, checkpoints/save, NPC services, item effects, the three Sun Sigils and the
Hollow King win rule. Its presentation renders a canvas world with pinned Assetrizz backdrops, terrain, enemy and
character art, plus a game-owned tabbed pause journal (map, inventory, capabilities, stats and persisted options). The
room graph validates references and map rectangles; physical jump reachability remains a playtest concern. See
[Hollowmere](../../games/hollowmere/README.md).

**Cinder Vault** is a turn-based shooter-family fantasy roguelite composing resource/action/clock/objective, progression,
inventory and crafting providers. `dungeon/generator` builds a sealed 94×30 map containing three independent 30-cell wings with
7–9 rooms, corridors, room markers, lights and descent pads. Cinder consumes those markers, spawns each depth's
encounters and wardens, and teleports through its descent pads. At the class screen the player selects an explicit Pilgrim,
Delver or Ashbound threat, then one of three classes. Threat scales enemy damage/health, elite chance, healing, loot and
legacy without hidden mid-run scaling. Encounters widen from thralls/imps/hounds to support acolytes and heavy brutes;
behavioral elites add Warded, Swift, Emberbound or Siphoned rules, and wardens/Keeper enrage below half health. The player
spends 3 actions per turn (4 for Vaultrunner) on one-tile steps, attacks, reloads, pulse, consumables or gear changes. `TurnControl`
suspends autonomous real-time enemy AI; engaged enemies telegraph attack/advance intent and act after End Turn. The
reusable `presentation/camera-modes` CameraRole adds an `O`-toggled orthographic isometric view with a player floor marker
and class-specific Assetrizz body avatars; its `ViewModes` service supports rotation and ground-plane picking so Cinder can
move camera-relative with WASD and spend AP on clicked movement or enemy attacks; hovering previews path/attack cost in the turn bar, and `H` opens a
movement-blocking field guide. Presentation hides first-person-only view models, ceilings and fog without changing
simulation. First-person weapon sprites use a smaller bottom-center viewmodel rig. XP is earned during a floor; completed
levels queue three-card boon offers selected with 7/8/9 **without pausing turns**. Four additional relics reward execution,
regeneration, shard hunting and action refunds. The 12-stack pack supports armor/charm gear and consumables with
All/Gear/Items filters and free dropping; weighted depth caches and enemy drops provide loot and Ember Shards, and wardens
guarantee equipment. Optional Assetrizz NPCs open a known-recipe nine-recipe forge, reveal a fogged automap, or offer the
Oracle's health/ember bargains; `M` provides a tactical AP-reach grid. A six-weapon Gloamforge armory, a cooldown pulse and
a base 900-health final Keeper (threat-scaled) round out the run. Optional versioned profile values track attempts, legacy embers, best cleared
threat and per-class mastery; run embers, weapons, boons, gear and pack reset on death. The
generated layout is content-seeded while encounters/loot vary by attempt. See
[rules](../../games/cinder/README.md), [classes and loot](../../games/cinder/docs/classes.md), [inventory](inventory.md),
[crafting](crafting.md), [camera modes](camera-modes.md), [dungeon generator](dungeon-generator.md) and
[progression](progression.md).

Sky, Ember and Verdant use identical `mechanics/resources`, `mechanics/clock`, `mechanics/actions` and
`mechanics/objectives` providers plus a strict `mechanic-kit` loader. Shared behavior includes atomic bounded
debit/credit, data-defined costs/gains, explicit seconds/turn cooldowns, and prerequisite-aware objective progress.
Factories create isolated, consumer/provider-owned instances. Opt-in `roleDependencies` orders selected factory
owners before consumers; existing `requiresRoles` remains selection-only. Provider implementations are replaceable
through preset roles. Tests run all three winning routes with both the default and an independent test resource provider,
comparing final state and committed events, including each tower's separate shared fire cooldown.

Movement, target legality, hazards and orchestration remain family responsibilities. Shared transactions cover
resources/action cooldowns; they do not roll back arbitrary game-local effects. Shooter/tactics/story/puzzle rules
remain in their family authorities. See [mechanics](reusable-mechanics.md) and
[dated research](../archive/research/reusable-mechanics-2026-11-16.md).

The **game composition canvas** (`src/app/game-composer.ts`) is a JSON-first authoring foundation over the same preset
schema. Its versioned `GameGraph` model has plugin nodes, manifest dependency projections, exclusive-role nodes and
authored provider selection edges. Layout is optional and compile-ignored. The pure compiler validates references,
dependencies, roles and typed config deterministically; the UI then stages through the host before Apply. A generated
provider catalog supplies role offers, and `npm run graph` exposes the same operations to agents/CLI. See
[game composer](game-composer.md).

The follow-up general-capability work extracts owned bounded command queues for Stonewake and The Last Light, and
explicit-clock deadlines for Sky and Verdant. These are SDK helpers used from existing family systems. Queue capacity,
pause/disposal gating and draining are shared; normalization, legality and processing cadence are consumer policy.
Deadlines borrow seconds/turn clocks; games retain advancement and effect precedence. Resource behavior is exercised
through a reusable conformance runner against both the default and an independent test implementation. See
[queues](command-queues.md), [deadlines](deadlines.md) and [conformance](mechanic-conformance.md).

The selectable `mechanics/navigation` provider supplies deterministic unit-edge graph search to puzzle pursuit and
tactics reachability. Games construct legal ordered graphs and retain movement/occupancy/AP policy. The selectable
`mechanics/sequence` provider supplies ordered cursors and finite repeated rounds to NEON RUN and Foundry Circuit;
their crossing geometry, per-tick crossing policy, timeout precedence and presentation stay local. The selectable
`mechanics/progression` provider supplies linear XP curves, atomic multi-level grants and pending game-defined rewards;
`mechanics/inventory` supplies bounded item stacks and optional equipment slots plus `item` content; `mechanics/crafting`
supplies deterministic known item-to-item recipes. Cinder Vault keeps threat definitions, elite affixes, boon effects,
gear stats, loot weights, ember costs, pack filters/drop and the non-pausing tray local. Its `cinder/manual` AI behavior is
a validated metadata/no-op hook for Cinder's discrete multi-action and support enemy turns; it does not add autonomous AI. `dungeon/generator` is a seeded shooter-family map
format that emits three isolated room/corridor wings and inert room markers; Cinder owns encounters, warden gates,
caches, teleports and victory. `TurnControl` is a presence-only service: when a mode provides it, core autonomous enemy
AI is suspended and the mode executes discrete enemy turns. `ViewModes` is an optional presentation service from the
reusable first-person/isometric camera provider; core presentation adapts first-person-only layers, but simulation does
not change. None of these installs automatic simulation systems or changes authored family content formats. See [navigation](navigation.md), [sequences](sequences.md),
[progression](progression.md), [inventory](inventory.md), [crafting](crafting.md) and
[dungeon generator](dungeon-generator.md).

### 2.11 Agent-facing reuse discovery

`npm run find-reuse` searches live manifest/registration data, public SDK runtime values and curated capability metadata.
Results distinguish cross-genre providers, family-specific authorities, content, presentation and unreviewed scope;
they link declarations, composition recipes, presets and tests. It supports exact inspection, filters and JSON output.
Plugin `reuse.json` sidecars and task-level recipes supply vocabulary and limits that cannot be inferred from code names.
The scaffolder surfaces related candidates and creates an unreviewed sidecar. Generated Markdown/JSON references and
their source digest are checked by `npm run check`; invalid references and stale output fail the check.

Discovery observes trusted default registration in isolated stages without session activation. It does not prove
compatibility, execute gameplay, infer every conditional registration or detect every semantically duplicate algorithm.
The complete game still needs staging and gameplay verification. See [the reuse-first workflow](../guide/reuse.md).

## 3. Reference game: Bulkhead Station

**Objective.** Flip the override switch, then reach the exit pad. Dying ends the run. Both outcomes show a result screen
with statistics (time, hostiles down).

**Arena (`core/arena`, in `games/shooter/plugins/core-content/content.json`).** A 26 x 20 cell grid, 2 m cells (52 m x 40 m),
3 m walls. Map ids use the prefixes `bay`, `hall`, `ctrl`, `svc` and `exit`:

- A spawn room (the bay, south-west) where the player starts, facing north.
- A hall (north-west) reached from the bay through `bay-door`.
- A control room (north-east) reached from the hall through `hall-door`; it holds the override switch on its north wall.
- A service corridor that runs east along the south from the bay (`service-door`) and joins the control room's south
  passage, forming a loop: bay, hall, control room, corridor, bay.
- A locked exit chamber (south-east) behind `exit-gate`, which only the switch opens. The exit pad is inside.

The map places 10 enemies (6 Grunts, 4 Spitters), 4 medkits, 3 bullet pickups, 2 cell pickups and 13 point lights.

**Weapons** (both in the starting loadout; keys `1`, `2`):

| Slot | Weapon | Behaviour | Damage | Cooldown | Ammo (start / max) |
|---|---|---|---|---|---|
| 1 | Service Pistol | `core/hitscan`, small spread | 20 | 0.27 s, semi-automatic | Bullets (48 / 200) |
| 2 | Plasma Launcher | `core/projectile`, speed 17 m/s | 55 | 0.75 s | Cells (8 / 40) |

**Enemies.** Enemies are idle until they have line of sight to the player within their sight range, or are damaged.

| Enemy | Health | Speed | Behaviour |
|---|---|---|---|
| Grunt | 60 | 3.3 m/s | `core/chaser`: path to the player, `core/melee` for 12 damage after a 0.28 s wind-up |
| Spitter | 40 | 2.5 m/s | `core/ranged`: needs line of sight, keeps near 8 m, strafes between shots, `core/projectile` acid for 10 damage |

Enemy attacks release only if the target is still visible at the end of the wind-up. Enemies do not damage their own
team (`core/team-immunity`). Dead enemies leave a corpse sprite and no collider.

**Pickups.** Medkit (+25 health, not consumed at full health), Bullets (+24), Cells (+6).

**Player.** 100 health (configurable), 5.4 m/s maximum speed with acceleration, collision radius 0.35 m, fixed eye
height 1.5 m, field of view 74 degrees (configurable). Controls are listed in [README.md](../../README.md).

## 4. Extension demonstrations

| Extension | Folder | What it shows |
|---|---|---|
| Data-only pack (`example/pack`) | `games/shooter/plugins/example-pack` | Scattergun (slot 4, 7 pellets), Brute enemy (tinted, scaled Grunt art), Shell box pickup, and the map "Bulkhead Annex" (`example/annex`, 15 x 11 cells: two rooms joined by a door and a locked vault holding the exit pad). No code. |
| Ricochet (`example/ricochet`) | `games/shooter/plugins/example-ricochet` | A new attack behaviour `example/ricochet` (projectile that bounces off walls) and the Ricochet Rifle (slot 3, cell ammo) added through `defineContent`. |
| Visor HUD (`example/hud`) | `games/shooter/plugins/example-hud` | An alternative `sdk/hud` provider, `example/visor-hud`, with a compass strip and an arc health gauge; setting `accent` (cyan, amber, green). |
| Survival (`example/survival`) | `games/shooter/plugins/example-survival` | An alternative `sdk/mode` provider, `example/survival`: escalating waves spawned out of sight at the map's enemy points, score, victory after the last wave. |

The presets in `games/shooter/presets` select them (see the README). An additional Assetrizz preset selects five curated
dark-sci-fi tiles, two enemy sprite strips and two Blender weapon renders with industrial-derived remaining sprites and sounds. Switching presets goes through the creator panel
(preset picker, then **Apply & restart**); the selection is persisted in `localStorage`.

## 5. Limitations

These are deliberate scope limits or known gaps, not bugs.

- **Shooter gameplay is planar with one elevation.** `Transform` has `x`, `z` and `yaw` only; floors are at y = 0 and ceilings at
  the map's wall height. There is no jumping, no slopes or stairs, no stacked floors, no height in the world description.
- **Shooter fixed eye height and yaw-only aim.** Its camera pitch is 0 and vertical mouse movement is ignored.
- **Shooter grid maps only.** The `MapFormats` registry allows another authoring format, but only `core/grid` exists, and every
  format must produce the same axis-aligned `WorldDescription`.
- **AABB collision.** Walls and doors are axis-aligned boxes, actors are circles, and hit normals are axis-aligned.
  Queries are brute force over all boxes (sized for maps of a few hundred boxes). Swept-circle queries inflate each box
  by the circle's radius and round the corners (see docs/reference/architecture.md, World); hit normals on faces stay axis-aligned.
- **No general run snapshots.** Adventure has explicit versioned chapter save/load; the shooter and other families do
  not have full run saves. The general save format remains a design note in docs/reference/content-format.md.
- **No networking or rollback.** Simulation is deterministic given the same per-tick input (fixed step, seeded RNG), but
  there is no input recording or replay, and bit-identical results across browsers or JavaScript engines are not claimed.
- **Code plugins are build-time and trusted.** A deployed build cannot install new JavaScript. Manifest `capabilities`
  document intent and gate only the rendering-SDK import in the lint rule; there is no sandbox.
- **Content packs cannot carry assets.** Content refers to art and sound by theme key. An unknown texture key renders as
  a magenta checker and an unknown visual key is not drawn (both log a warning); an unknown sound key is ignored with a
  warning. Imported packs live in memory only and are not persisted across page loads.
- **Renderer integration scope.** Three.js core/WebGL is available; a scoped asynchronous model/asset loader and glTF
  addon integration remain future work. Browser startup still requires WebGL2, including for the DOM adventure.
- **Procedural placeholder art and audio** (section 7).
- **GPU performance is unmeasured.** The build environment had only software WebGL2. The smoke test asserts CPU work
  per frame, not GPU frame time.
- **Single player, keyboard and mouse only.** No gamepad or touch input, no key rebinding, no multiplayer.
- **Browser coverage.** The repository's browser checks drive Chrome only.
- **Fixed sizes.** Shooter grid maps are at most 96 x 96 cells with at most 64 doors, 128 triggers, 64 lights and 512 spawns;
  32 shooter one-shot effects are pooled;
  at most 24 sound voices play at once.

## 6. Extension boundaries

A finite SDK cannot express every game through JSON. The boundary has three levels.

**Data only (content pack or preset).** Possible: new ammo types; weapons that select an existing attack behaviour
(`core/hitscan`, `core/projectile`, `core/melee`) with parameters; pickups that select an existing effect
(`core/heal`, `core/give-ammo`, `core/give-weapon`); enemies that select an existing AI (`core/chaser`, `core/ranged`)
and attack behaviour, with tint, scale and health; grid maps with doors, switches, zones, spawns, lights, ambient and
fog; presets that choose plugins, roles, map, per-plugin configuration and seed. Not possible: any new behaviour,
rule, objective, HUD, content kind, art or sound. A data map can only use the existing mode logic (for example the
objective mode needs a switch tagged `objective` and a zone tagged `exit`). Independent families additionally accept
tracks, board missions and adventure chapters within their documented schemas.

**Code plugin, no SDK change.** Possible: new attack, AI and pickup-effect behaviours, damage modifiers, prefabs,
systems, components, events, commands and services, game modes, HUDs, themes (art and sound packs), actor renderers,
map formats, content kinds, input actions, validators. A new family can own its own state/world model rather than use
the planar shooter `Transform`. Cooperating plugins need shared typed contracts and explicit ownership.

**Needs an SDK version bump.** Vertical movement and stacked floors (a height in `Transform` and `WorldDescription`,
pitch and jumping in the controller and camera contracts, 3D collision queries); non-grid collision; networking and
rollback; general run saves with versioned migration; shared model/animation asset services; new host-level phases.
These change shared contracts, so they require a new SDK version and manifests that declare it (`SDK_VERSION` is `3.0.0`, with `SDK_COMPAT` still accepting `2.0.0` manifests, and plugins declare a
compatible range in `sdk`).

## 7. Asset provenance

The reference theme's visual and audio content is generated by code in this repository. The optional Assetrizz themes include pinned upstream image tiles, enemy/NPC/class-avatar sprite strips and original-size
UI plates/portraits, converted into synchronous pixel-backed painters where applicable; source PNGs and their license note
are in `public/assetrizz/`, with provenance in `scripts/assetrizz.json`. No runtime network fetch is needed.

The independent arcade, board and story themes add twelve pinned source images and explicitly labelled procedural
elements. `scripts/experience-assets.json` and `assets/experiences/provenance.json` record source/output/pixel hashes,
dimensions, transformations and the upstream note “original, generated for Kyle Durepos.” No MIT grant for that art is
asserted. Theme sound cues are original synthesis. The vendored Three.js runtime/declarations retain their own MIT
licenses and provenance under `src/platform/render/mini3/vendor/`.

- Textures and sprites (walls, floors, ceilings, doors, switches, exit pad, enemies, corpses, pickups, projectile and
  impact effects, muzzle flash, first-person weapon sprites) are drawn procedurally with the Canvas 2D API by
  `src/plugins/theme-industrial/art.ts`, using a seeded pseudo-random generator for surface noise.
- Sound effects are described as oscillator and filtered-noise layers in `src/plugins/theme-industrial/sounds.ts` and
  synthesised at play time with Web Audio by `src/platform/audio.ts`.
- The user interface uses CSS and system font stacks.
- `assets/weapons/` contains original Blender sources, GLBs and rendered PNGs. The Assetrizz themes use generic and
  fantasy pistol and launcher renders respectively; the remaining weapon renders and GLBs are not connected to gameplay.

Screenshots under `.smoke/` are build-time outputs and are not
tracked.
