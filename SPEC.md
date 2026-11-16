# Bulkhead: specification of the delivered foundation

This document states what is implemented, what is deliberately not, and where the extension boundaries are. Anything
described as "planned" does not exist. Design rationale and structure are in [ARCHITECTURE.md](ARCHITECTURE.md); the
plugin API is in [PLUGINS.md](PLUGINS.md); JSON formats are in [CONTENT_FORMAT.md](CONTENT_FORMAT.md).

## 1. Stack deviation from the original brief

The brief asked for Three.js + Vite + Vitest. The build environment had no network access to the npm registry, so none
of them could be installed. The delivered stack is:

| Concern | Brief | Delivered |
|---|---|---|
| Rendering | Three.js | **mini3**, an in-repo WebGL2 renderer mirroring a subset of the Three.js API (`src/platform/render/mini3`), behind `src/platform/render/service.ts` and `src/sdk/render.ts` (exported as `THREE`) |
| Bundler / dev server | Vite | **esbuild** (`scripts/build.mjs`, `scripts/dev.mjs`, `scripts/preview.mjs`) |
| Tests | Vitest | **`node --test`** running TypeScript directly (Node >= 22.18 type stripping) |
| Type checking | (implied) | Separate `tsc --noEmit`, TypeScript 7 |
| Runtime dependencies | n/a | **None** |
| Lockfile | n/a | **None.** `package.json` pins the devDependencies; `package-lock.json` could not be generated offline and is created by the first networked `npm install` |

`scripts/tools.mjs` resolves esbuild and Playwright from the project's `node_modules`, then from `TOOLS_NODE_MODULES`,
then from `/opt/npm-tools/node_modules`. The migration path to the originally requested stack is described in
ARCHITECTURE.md and scheduled in [devplan.md](devplan.md).

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
plugin table in ARCHITECTURE.md.

### 2.6 Extensions (section 4)

Four demonstrations show the extension points: a data-only pack, a new attack behaviour, a replacement HUD, and a
replacement game mode. All four are switched on through presets and none edits a core plugin.

### 2.7 Creator tools (`src/app/creator.ts`)

A panel opened with the backquote key or the **Creator tools** button, with three tabs:

- **Plugins & preset:** preset picker, per-plugin enable toggles (disabling a plugin that others require is refused with
  the dependents named), map / role / theme selectors, per-plugin configuration inputs, gameplay seed, **Validate**
  (stages the draft without touching the game), **Apply & restart**, and draft reset.
- **Content:** import a content pack or preset from a file or pasted JSON (1 MB limit; staged and validated before
  anything changes), export the active preset or any installed pack (copy or download).
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

## 3. Reference game: Bulkhead Station

**Objective.** Flip the override switch, then reach the exit pad. Dying ends the run. Both outcomes show a result screen
with statistics (time, hostiles down).

**Arena (`core/arena`, in `src/plugins/core-content/content.json`).** A 26 x 20 cell grid, 2 m cells (52 m x 40 m),
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
height 1.5 m, field of view 74 degrees (configurable). Controls are listed in [README.md](README.md).

## 4. Extension demonstrations

| Extension | Folder | What it shows |
|---|---|---|
| Data-only pack (`example/pack`) | `src/plugins/example-pack` | Scattergun (slot 4, 7 pellets), Brute enemy (tinted, scaled Grunt art), Shell box pickup, and the map "Bulkhead Annex" (`example/annex`, 15 x 11 cells: two rooms joined by a door and a locked vault holding the exit pad). No code. |
| Ricochet (`example/ricochet`) | `src/plugins/example-ricochet` | A new attack behaviour `example/ricochet` (projectile that bounces off walls) and the Ricochet Rifle (slot 3, cell ammo) added through `defineContent`. |
| Visor HUD (`example/hud`) | `src/plugins/example-hud` | An alternative `sdk/hud` provider, `example/visor-hud`, with a compass strip and an arc health gauge; setting `accent` (cyan, amber, green). |
| Survival (`example/survival`) | `src/plugins/example-survival` | An alternative `sdk/mode` provider, `example/survival`: escalating waves spawned out of sight at the map's enemy points, score, victory after the last wave. |

The four presets in `src/content/presets` select them (see the README). Switching presets goes through the creator panel
(preset picker, then **Apply & restart**); the selection is persisted in `localStorage`.

## 5. Limitations

These are deliberate scope limits or known gaps, not bugs.

- **Gameplay is planar with one elevation.** `Transform` has `x`, `z` and `yaw` only; floors are at y = 0 and ceilings at
  the map's wall height. There is no jumping, no slopes or stairs, no stacked floors, no height in the world description.
- **Fixed eye height and yaw-only aim.** The camera pitch is always 0 and vertical mouse movement is ignored.
- **Grid maps only.** The `MapFormats` registry allows another authoring format, but only `core/grid` exists, and every
  format must produce the same axis-aligned `WorldDescription`.
- **AABB collision.** Walls and doors are axis-aligned boxes, actors are circles, and hit normals are axis-aligned.
  Queries are brute force over all boxes (sized for maps of a few hundred boxes). Swept-circle queries inflate each box
  by the circle's radius and round the corners (see ARCHITECTURE.md, World); hit normals on faces stay axis-aligned.
- **No save games.** Entity data is plain JSON (`EntityStore.snapshot()` exists) but no save or load is implemented. The
  intended save format is a design note in CONTENT_FORMAT.md.
- **No networking or rollback.** Simulation is deterministic given the same per-tick input (fixed step, seeded RNG), but
  there is no input recording or replay, and bit-identical results across browsers or JavaScript engines are not claimed.
- **Code plugins are build-time and trusted.** A deployed build cannot install new JavaScript. Manifest `capabilities`
  document intent and gate only the rendering-SDK import in the lint rule; there is no sandbox.
- **Content packs cannot carry assets.** Content refers to art and sound by theme key. An unknown texture key renders as
  a magenta checker and an unknown visual key is not drawn (both log a warning); an unknown sound key is ignored with a
  warning. Imported packs live in memory only and are not persisted across page loads.
- **mini3 instead of Three.js.** Only the API subset listed in ARCHITECTURE.md exists, with documented semantic
  differences (no colour management, lighting model).
- **No lockfile** (see section 1).
- **Procedural placeholder art and audio** (section 7).
- **GPU performance is unmeasured.** The build environment had only software WebGL2. The smoke test asserts CPU work
  per frame, not GPU frame time.
- **Single player, keyboard and mouse only.** No gamepad or touch input, no key rebinding, no multiplayer.
- **Browser coverage.** The repository's browser checks drive Chrome only.
- **Fixed sizes.** Grid maps are at most 96 x 96 cells with at most 64 doors, 128 triggers, 64 lights and 512 spawns;
  the renderer shades at most 16 point lights per frame (the nearest to the camera); 32 one-shot effects are pooled;
  at most 24 sound voices play at once.

## 6. Extension boundaries

A finite v1 cannot express every game through JSON. The boundary has three levels.

**Data only (content pack or preset).** Possible: new ammo types; weapons that select an existing attack behaviour
(`core/hitscan`, `core/projectile`, `core/melee`) with parameters; pickups that select an existing effect
(`core/heal`, `core/give-ammo`, `core/give-weapon`); enemies that select an existing AI (`core/chaser`, `core/ranged`)
and attack behaviour, with tint, scale and health; grid maps with doors, switches, zones, spawns, lights, ambient and
fog; presets that choose plugins, roles, map, per-plugin configuration and seed. Not possible: any new behaviour,
rule, objective, HUD, content kind, art or sound. A data map can only use the existing mode logic (for example the
objective mode needs a switch tagged `objective` and a zone tagged `exit`).

**Code plugin, no SDK change.** Possible: new attack, AI and pickup-effect behaviours, damage modifiers, prefabs,
systems, components, events, commands and services, game modes, HUDs, themes (art and sound packs), actor renderers,
map formats, content kinds, input actions, validators. Limits: everything must fit the planar `Transform`, the nine
phases and the existing roles and contracts.

**Needs an SDK version bump.** Vertical movement and stacked floors (a height in `Transform` and `WorldDescription`,
pitch and jumping in the controller and camera contracts, 3D collision queries); non-grid collision; networking and
rollback; save games with versioned migration; skeletal animation; new host-level phases. These change shared contracts,
so they require a new SDK version and manifests that declare it (`SDK_VERSION` is `1.0.0` and plugins declare a
compatible range in `sdk`).

## 7. Asset provenance

All visual and audio content is generated by code in this repository. No third-party assets are included and none are
loaded at runtime.

- Textures and sprites (walls, floors, ceilings, doors, switches, exit pad, enemies, corpses, pickups, projectile and
  impact effects, muzzle flash, first-person weapon sprites) are drawn procedurally with the Canvas 2D API by
  `src/plugins/theme-industrial/art.ts`, using a seeded pseudo-random generator for surface noise.
- Sound effects are described as oscillator and filtered-noise layers in `src/plugins/theme-industrial/sounds.ts` and
  synthesised at play time with Web Audio by `src/platform/audio.ts`.
- The user interface uses CSS and system font stacks; there are no image, audio or font files in the repository
  (`public/` is empty).

This is original work generated for this project. Screenshots under `.smoke/` are build-time outputs and are not
tracked.
