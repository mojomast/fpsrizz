# Architecture

How Bulkhead is put together and why. For what is and is not implemented see [docs/reference/spec.md](spec.md); for writing plugins see
[docs/guide/plugins.md](../guide/plugins.md); for the JSON formats see [docs/reference/content-format.md](content-format.md).

> **Production stack.** SDK **2.0.0** exposes official **Three.js 0.187.0** through `src/sdk/render.ts` as `THREE`.
> The historical boundary-approved `src/platform/render/mini3/index.ts` path is now a facade over the pinned official
> runtime in its `vendor/` directory. The former mini3 renderer remains behind `legacy.ts` for old fixtures only.
> Bundling and the dev server use esbuild, tests use `node --test` running TypeScript directly (Node >= 22.18), and type
> checking is a separate `tsc --noEmit` (TypeScript 7). Locked npm packages reproduce the vendored renderer; section 9
> documents the completed, contained migration. The toolchain has not been rewritten to Vite or Vitest.

## 1. Layers and dependency rules

```
                      +-----------------------------------------------+
                      |  src/app        composition root              |
                      |  catalog, frame loop, shell, creator panel    |
                      +--------+------------------+-------------------+
                               |                  |
              imports anything |                  | imports presets (JSON)
                               v                  v
  +--------------------+   +---------------------+   +--------------------+
  |  src/plugins/*     |   |  src/platform       |   |  games/*/presets   |
  |  games/*/plugins/* |   |  browser adapters:  |   |  *.json            |
  |  (SDK only)        |   |  input, audio,      |   +--------------------+
  |  + family contracts|   |  storage, ui, flow, |
  +---------+----------+   |  render + Three.js  |
            |              +----------+----------+
            | sdk/index.ts            | sdk, kernel
            | (+ sdk/render.ts        |
            |  with "render")         |
            v                         v
        +---------------------------------+
        |  src/sdk   public plugin API    |
        |  core.ts  contracts/*          |-- render.ts imports the historical mini3 facade
        |  contracts/audio.ts  render.ts  |
        +----------------+----------------+
                         | kernel only
                         v
        +---------------------------------+
        |  src/kernel   runtime kernel    |
        |  no game concepts, no DOM       |
        +---------------------------------+
```

- **Kernel** (`src/kernel`): plugin host, registries, entity store, event/command/service buses, scheduler, scopes, asset
  store, RNG, semver, resolver, manifest and validation helpers. It has no shooter concepts: phases and roles are data
  passed in by the application.
- **SDK** (`src/sdk`): `core.ts` is the generic host surface (tokens, `definePlugin`, `SDK_VERSION`, the phase list,
  validation helpers); `contracts/shooter.ts` is the shared shooter vocabulary (components, events, services, registries
   and roles that shooter plugins use to cooperate without importing each other). Separate contracts define experience
   policy, vehicle racing, turn tactics, narrative adventure, push puzzles and audio. `render.ts` is the rendering SDK; `index.ts` is
  the general entry point. `SDK_VERSION` is `2.0.0`; bundled manifests declare `"sdk": "^2.0.0"`.
- **Platform** (`src/platform`): adapters for the browser: DOM input, Web Audio, `localStorage`, UI mounting, the flow
  service, the render host and vendored official Three.js behind the historical mini3 facade.
- **App** (`src/app`): wires adapters into sessions as host services, owns the catalog of compiled-in plugins, the frame
  loop, the menus and the creator panel. No gameplay rules live here.
- **Plugins** (`src/plugins` for shared engine-level plugins, `games/<family>/plugins` for games) and **content** (`games/<family>/presets`): everything the game actually does.

### Game composition canvas

`src/app/game-composer.ts` is an app-layer authoring tool, not a gameplay plugin. It edits a versioned, layout-optional
`GameGraph` (`src/app/game-graph.ts`) and compiles to preset schema 1. Manifest dependency edges are projections; authored
role-selection edges choose provider owners. The UI stages through the real host before apply. `src/app/catalog-providers.json`
is generated from observed role registrations, and `npm run graph` exposes the same compiler to agents. See
[game composer](game-composer.md).

### Authoring-time reuse discovery

`scripts/reuse-lib.mjs` builds an inventory from source manifests, optional plugin-local `reuse.json` sidecars, public SDK
runtime exports, built-in presets and isolated default registration snapshots. It uses the existing host staging path
with concrete dependencies and validation skipped for discovery; it never starts a session or invokes role callbacks.
Registration metadata is descriptive, not proof of cross-reference validity or arbitrary configuration behavior.

The [ten-game portfolio](../games/ten-game-portfolio.md) composes new authored content packs and presets over existing family
authorities and presentations. `mechanics/outcome-rating` is a separately selected, owned evaluator for game-supplied
finite metrics; the racing and tactics authorities use it for result medals without transferring victory policy to it.

`scripts/find-reuse.mjs` searches live inventory by intent and exposes text/JSON inspection. Curated recipes in
`docs/reuse-recipes.json` link tested composition examples. `scripts/index-reuse.mjs` generates `docs/reference/reuse-index.md` and
`docs/reuse-index.json`; source digests and deterministic output comparison make stale references fail `npm run check`.
This tooling belongs outside the runtime layers. Semantic reuse scope is explicit metadata, not inferred from a genre
name or import permission. The source catalog remains the runtime installation authority. See [docs/guide/reuse.md](../guide/reuse.md).

`scripts/boundaries.ts` (run by `npm run lint`, tested by `tests/boundaries.test.ts`) enforces these rules on every
`.ts`, `.tsx`, `.mts`, `.js` and `.mjs` file under `src`. It tokenises each file (comments and strings are ignored) and
checks static `import` / `export ... from` specifiers and `import("...")` calls with a literal argument. `import type` is
checked like any other import.

| Rule id | Applies to | Rule |
|---|---|---|
| `plugin-isolation` | `src/plugins/<p>/**` | May import only its own folder and `src/sdk/index.ts`. The kernel, platform, app, SDK internals (`core.ts`, `contracts/*`), other plugins and bare packages are denied. |
| `render-capability` | `src/plugins/<p>/**` | May import `src/sdk/render.ts` only if the plugin's `manifest.json` lists `"render"` in `capabilities`. |
| `kernel-purity` | `src/kernel/**` | May import only other `src/kernel` files; no bare packages, not even `node:` modules. |
| `no-dom-in-kernel` | `src/kernel/**` | The identifiers `document` and `window` used as `document.` or `window.` are denied. |
| `sdk-surface` | `src/sdk/**` | May import only `src/sdk` and `src/kernel`. Exception: `src/sdk/render.ts` may also import `src/platform/render/mini3`. |
| `platform-layer` | `src/platform/**` | May import only `src/platform`, `src/kernel` and `src/sdk`; never plugins or the app. |

`src/app` has no rule: the composition root may import anything. `tests/` and `scripts/` are not scanned. Capabilities
in manifests are declarations of intent; apart from the rendering import above they are not enforced.

## 2. Plugins of the reference game

Reference-shooter plugin ids, with what they own. All use SDK 2 (`"sdk": "^2.0.0"`).

| Plugin id | Folder | Kind | Role providers | Content kinds and registrations | Services |
|---|---|---|---|---|---|
| `core/world` | `core-world` | code | none; requires role `sdk/mode` | content kind `map`; map format `core/grid` | provides `World` |
| `core/combat` | `core-combat` | code | none | content kinds `ammo`, `weapon`, `pickup`; attack behaviours `core/hitscan`, `core/projectile`, `core/melee`; pickup effects `core/heal`, `core/give-ammo`, `core/give-weapon`; handles command `DealDamage` | provides `Combat` |
| `core/player` | `core-player` | code | `sdk/controller`: `core/fps-controller`; `sdk/camera`: `core/fp-camera`; requires both roles | prefab `core/player`; input actions (move, turn, fire, use, weapon next/previous, weapon slots 1 to 9) | camera provider supplies `View` |
| `core/enemies` | `core-enemies` | code | none | content kind `enemy`; AI behaviours `core/chaser`, `core/ranged`; damage modifier `core/team-immunity` | provides `EnemyAi` |
| `core/modes` | `core-modes` | code | `sdk/mode`: `core/objective` | none | uses `Flow` |
| `core/hud` | `core-hud` | code | `sdk/hud`: `core/hud` | setting `showCrosshair` | uses `Ui`, `Flow` |
| `core/presentation` | `core-presentation` | code (`render`, `audio`) | none; requires roles `sdk/theme` and `sdk/camera` | actor renderer `core/billboard` | uses `Render`, `Audio`, `View` |
| `theme/industrial` | `theme-industrial` | code | `sdk/theme`: `theme/industrial` | textures, sounds and visuals (art and sound pack) | none |
| `theme/assetrizz` | `theme-assetrizz` | code | `sdk/theme`: `theme/assetrizz` | five pinned Assetrizz tiles, two enemy strips, two Blender weapon sprites, industrial-derived remaining visuals and sounds | none |
| `core/content` | `core-content` | content | none | 2 ammo types, 2 weapons, 3 pickups, 2 enemies, map `core/arena` | none |
| `example/pack` | `example-pack` | content | none | weapon, enemy, pickup and map `example/annex` | none |
| `example/ricochet` | `example-ricochet` | code | none | attack behaviour `example/ricochet`; weapon `example/ricochet-rifle` through `defineContent` | none |
| `example/hud` | `example-hud` | code | `sdk/hud`: `example/visor-hud` | setting `accent` | uses `Ui`, `Flow`, `View` |
| `example/survival` | `example-survival` | code | `sdk/mode`: `example/survival` | many settings (waves, counts, timings) | uses `World`, `Flow` |
| `example/time-trial` | `example-time-trial` | code | `sdk/mode`: `example/time-trial` | configurable time limit | uses `World`, `Flow` |
| `example/arena` | `example-arena` | code | `sdk/mode`: `example/arena` | scoring and spawn settings | uses `World`, `Flow` |
| `example/dash-controller` | `example-dash-controller` | code | `sdk/controller`: `example/dash-controller` | sprint and dash actions and settings | uses `Input`, `World` |
| `example/ward` | `example-ward` | code | none | ward pickup effect and damage modifier | none |
| `example/adventure-pack` | `example-adventure-pack` | content | none | puzzle and horror objective maps | none |
| `example/holdout` | `example-holdout` | code | `sdk/mode`: `example/holdout` | holdout and spawn settings | uses `World`, `Flow` |
| `example/keys` | `example-keys` | code | none | key pickup effect and keyed gate prefab | uses `Interactions`, `World` |
| `example/key-dungeon` | `example-key-dungeon` | content | none | keyed dungeon map and pickup | none |
| `example/stealth` | `example-stealth` | code | none | stationary line-of-sight guard prefab | uses `World`, `Flow` |
| `example/stealth-map` | `example-stealth-map` | content | none | stealth infiltration map | none |
| `example/escape` | `example-escape` | code | `sdk/mode`: `example/escape` | exit-based escape mode | uses `World`, `Flow` |
| `example/roguelite` | `example-roguelite` | code | `sdk/mode`: `example/roguelite` | seeded encounters and run-only upgrades | uses `World`, `Flow` |
| `dungeon/generator` | `dungeon-generator` | code | none | registers map format `dungeon/generator` and inert `dungeon/marker` prefab for seeded dungeon wings | uses `MapFormats`, `Prefabs` |
| `mechanics/progression` | `mechanics-progression` | code | `sdk/mechanic-progression`: `mechanics/progression` | XP curves, level ledgers and pending rewards | uses `ProgressionProviders` |
| `mechanics/inventory` | `mechanics-inventory` | code | `sdk/mechanic-inventory`: `mechanics/inventory` | stack inventory, equipment slots and `item` content | uses `InventoryProviders`, `Items` |
| `mechanics/crafting` | `mechanics-crafting` | code | `sdk/mechanic-crafting`: `mechanics/crafting` | known item recipes and atomic crafting content | uses `CraftingProviders`, `CraftingRecipes` |
| `mechanics/outcome-rating` | `mechanics-outcome-rating` | code | `sdk/mechanic-outcome-rating`: `mechanics/outcome-rating` | ordered threshold classification for explicit outcome metrics | owned evaluator; racing and tactics consumers |
| `portfolio-cards/piles` | `portfolio-cards-piles` | code | `sdk/portfolio-card-piles`: `portfolio-cards/piles` | ordered unique-card draw, hand and discard partition | owned factory; two card-game consumers |
| `portfolio-cards/ash`, `portfolio-cards/cloud` | respective `portfolio-cards-*` folders | code | respective `sdk/experience` roles | separate deterministic glyph and weather card rules | provide `PortfolioCards`, consume selected piles |
| `portfolio-cards/presentation` | `portfolio-cards-presentation` | code | none | keyboard-accessible card table | consumes `PortfolioCards`, `Ui` |
| `presentation/camera-modes` | `presentation-camera-modes` | code | `sdk/camera`: `presentation/camera-modes` | first-person and orthographic isometric camera modes; provides `View`, `ViewModes` | renderer optional; uses `Render.setWorldCamera`, `InputActions` |
| `presentation/player-avatar` | `presentation-player-avatar` | code | `sdk/player-avatar` component consumer | attaches a theme Visual body only in overhead modes | uses `PlayerAvatar`, `ViewModes` |
| `cinder/game` | `cinder-game` | code | `sdk/mode`: `cinder/vault`, `sdk/experience`: `cinder/experience`, `sdk/controller`: `cinder/turn-controller`, `sdk/camera`: `presentation/camera-modes` | three-depth turn-based dungeon orchestration, threat tiers/elite affixes/boss enrage, classes, loot, NPCs/Oracle, forge, fogged map data, boons and run inputs | provides `Cinder`, `TurnControl` |
| `cinder/hud` | `cinder-hud` | code | `sdk/hud`: `cinder/hud` | class/threat select, transitions, field guide, first-person/isometric view badge, AP hover preview, automap/tactical grid, pack filters/drop, forge, NPC dialogue, AP/intent and boon HUD | uses `Cinder`, `Ui`, `ViewModes` |
| `cinder/content` | `cinder-content` | content | none | existing ammo, weapon, enemy, map and mechanic-kit content | none |
| `mechanics/platforming` | `mechanics-platforming` | code | `sdk/platformer`: `mechanics/platforming` | AABB side-scroller movement with coyote/buffered jumps, double jump, dash, wall slide/jump | pure provider; uses `PlatformerRole` |
| `mechanics/capabilities` | `mechanics-capabilities` | code | `sdk/capabilities`: `mechanics/capabilities` | named capability/rank unlocks with frozen observations | provider-owned handles |
| `mechanics/room-map` | `mechanics-room-map` | code | `sdk/room-map`: `mechanics/room-map` | explorable room graph with current/visited/revealed state | provider-owned handles |
| `hollowmere/game` | `hollowmere-game` | code | `sdk/experience`: `hollowmere/ascent` | twelve-room side-scrolling metroidvania, combat, checkpoints, NPC services, save and boss victory | provides `Metroidvania`; composes platforming/capability/room-map/inventory |
| `hollowmere/presentation` | `hollowmere-presentation` | code | `sdk/hud`: `hollowmere/hud` | canvas world view and tabbed field journal | uses `Metroidvania`, `Ui`, `ThemeRole` |
| `hollowmere/content` | `hollowmere-content` | content | none | `metroidvania-world` plus five item definitions | none |
| `example/racing` | `example-racing` | code | `sdk/controller`: `example/racing-controller`, `sdk/mode`: `example/race` | planar driving and ordered swept checkpoints | uses `World`, `Flow`, `Input` |
| `example/race-track` | `example-race-track` | content | none | Foundry Circuit map | none |
| `example/extraction` | `example-extraction` | code | `sdk/mode`: `example/extraction` | timed run-only loot extraction | uses `World`, `Flow` |
| `example/extraction-map` | `example-extraction-map` | content | none | Salvage Run map and loot pickups | none |
| `example/tactical-pack` | `example-tactical-pack` | content | none | Relay Station map and magazine carbine | none |

### Independent game families

These complete graphs have no shooter-plugin dependencies. Each simulation publishes its own SDK service; presentation
reads that contract and treats browser services as optional in headless sessions.

| Simulation / service | Presentation | Data pack (folder) / content kind | Theme | Format and gameplay guide |
|---|---|---|---|---|
| `vehicle/racing` / `Race` | `vehicle/presentation` | `vehicle/track` (`vehicle-track`) / `vehicle-track` | `theme/arcade` | [Overhead racing](../../games/racing/README.md) |
| `board/tactics` / `Tactics` | `board/presentation` | `board/mission` (`board-mission`) / `board-mission` | `theme/board` | [Turn tactics](../../games/tactics/README.md) |
| `story/adventure` / `Adventure` | `story/presentation` | `story/chapter` (`story-chapter`) / `adventure-chapter` | `theme/story` | [Narrative adventure](../../games/adventure/README.md) |
| `puzzle/rules` / `PushPuzzle` | `puzzle/presentation` | `puzzle/chambers` (`puzzle-chambers`) / `push-puzzle` | `theme/board` | [Stonewake](../../games/puzzles/docs/stonewake.md) |
| `hollowmere/game` / `Metroidvania` | `hollowmere/presentation` | `hollowmere/content` (`metroidvania-world`) / `metroidvania-world` | `theme/assetrizz` (`theme/assetrizz-hollowmere`) | [Hollowmere](../../games/hollowmere/README.md) |

The optional `ExperienceRole` (`sdk/experience`) selects a provider with `name`, `description`, pointer policy
(`locked`, `free`, `none`) and optional launcher `controls`. Without a selected experience, the launcher retains the
locked-pointer FPS behavior. These family selections are independent of the shooter controller/camera/mode roles.

Host-provided services in every browser session (installed by `src/app/main.ts`): `Input`, `InputContexts`,
`SessionControl`, `Render`, `Audio`, `Ui`, `Settings`, `Profile` and `Flow`.
Only the plugin graph and role selections in the preset decide which providers run; unselected providers never
activate. Most rows of this table are replaceable: a different HUD, mode, theme, controller or camera is a different
provider selected in the preset.

## 3. Ownership model

Three lifetimes, each with a defined owner and disposal point.

| Lifetime | Created by | Holds | Ends when |
|---|---|---|---|
| **Application** | `src/app/main.ts` at page load | The `PluginHost`, input core and DOM listeners, audio service (`AudioContext`), render host (WebGL context, renderer, the `AssetStore`), UI layers, menus, creator panel | The page closes |
| **Registration** (a "staged graph") | `host.stage()` | Registries (`RegistrySet`), role providers, content kinds, validators, and a registration `Scope` (owner `host`) with one child scope per plugin (`register:<id>`) | `host.stop()`, a successful `apply` of another graph, or `host.discard()` of an unused stage |
| **Session** | `host.apply()` / `host.restart()` | Entities, systems and frame systems, event subscriptions, command handlers, services, UI roots, scene roots, GPU resources, shared-asset references, and a session `Scope` with one child scope per plugin (`plugin:<id>`) | `Session.dispose()` (stop, restart, apply, failed activation) |

**Scope** (`src/kernel/scope.ts`) is the unit of ownership: a list of disposers tagged by kind, an `AbortSignal`, child
scopes, and a `guard()` for async work. `dispose()` is idempotent, disposes children first and then its own items in
reverse order of acquisition, and one failing disposer never blocks the others (it is logged with its owner). Adding to a
disposed scope runs the disposer immediately, so late async completions cannot attach live resources to a dead session.

**What attaches to a scope.** Everything a plugin acquires through its `SessionContext` is registered on that plugin's
session scope: `systems.add` and `addFrame`, `events.on`, `commands.handle`, `services.provide`, `ui.mount` and
`ui.addStyles`, `InputContexts.create`, `render.createRoot`, `render.setWorldCamera`, `render.own`, `render.shared` and
`render.texture`. Anything else (DOM listeners,
timers, audio nodes) goes through `ctx.scope.add(fn, kind)`. Entities are tagged with their creating plugin for diagnostics
(`ctx.world.ownerOf`, the debug panel's per-owner counts); they are not destroyed when a plugin scope is disposed but are
cleared with the session.

**Shared assets.** `AssetStore` (`src/kernel/assets.ts`) is a reference-counted map. `acquire(scope, key, create, dispose)`
creates the asset on first use, counts one reference per acquiring scope, and disposes it when the last reference is
released, so removing one consumer never destroys something another still uses. The render host exposes it as
`render.shared()` and `render.texture()`; the creator's debug tab lists keys, reference counts and owners.

**What the host disposes, and when**

| Event | Disposed | Kept |
|---|---|---|
| `host.restart()` | The session: plugin scopes in reverse role-aware activation order, then host-owned session items, then the scheduler, buses, services and entity store | The staged graph: registries and registrations. `register()` does not run again; `activate()` does |
| `host.apply(preset)` after successful staging | The old session as above, then the old registration scope and registries | The catalog of installed plugins (plus any imported pack entries, merged on commit) |
| `host.apply(preset)` that fails while staging | Everything the attempt created | The running session and the active graph are untouched |
| Activation failure or an `apply` that is superseded | The new session and its graph (a failed start leaves no session, no half-state) | Nothing of the failed attempt |
| `host.stop()` | Session, then active registrations | The catalog |
| Fault (a system or handler throws) | Nothing. The session is marked `faulted`, the scheduler is paused, and the plugin and system id are recorded for the error screen | Everything, for inspection; choosing Main menu and then Play restarts the session |

## 4. Plugin host lifecycle

`PluginHost.apply(preset, extraCatalogEntries?)`, in order. Steps 1 to 7 are the staging phase; they only touch isolated
registries and throw a `HostError` whose `stage` names where it stopped.

1. **`preset`**: parse and validate the preset (schema 1).
2. **`catalog`**: validate manifests of any extra entries (an imported pack): code plugins need a loader, content packs
   must not have one, ids must be unique among the supplied entries (an entry whose id is already installed replaces it).
3. **`graph`**: resolve dependencies. Rejects: not installed or not enabled, version or SDK range mismatch, conflicts,
   cycles, duplicate ids. Produces the topological activation order (lexicographic tie-break).
4. **`preset`** again: resolve per-plugin configuration (manifest defaults overlaid with preset values) and range-check it;
   unknown keys and settings for disabled plugins are errors.
5. **`load`**: import the code of the validated plugins only. A module without a default export object fails here.
6. **`register`**: in activation order, for each plugin call `register(ctx)` and then load its content entries through the
   content kinds registered so far. Any reported issue disposes the attempt.
7. **`validate`**: required roles have a selection, no ambiguous role, every selected provider is offered by an enabled
   plugin, then all validators registered by plugins run (cross-references: behaviours, ammo, slots, prefabs, map checks).
   Compute `StagedGraph.activationOrder` from concrete dependencies, enabled optional dependencies and the selected
   provider owners of explicit manifest `roleDependencies`. Lexicographic ties remain deterministic; self-role edges
   are ignored. Missing selections or role-dependent cycles fail before commit. `StagedGraph.order` retains the
   original loading/registration order. Existing `requiresRoles` is selection-only, preserving world/mode compositions.
8. **Commit**: if a newer `apply`, `restart` or `stop` happened meanwhile, the staged graph is discarded and the call rejects
   with stage `superseded`. Otherwise the old session and registrations are disposed and the new graph becomes active.
9. **`activate`**: create the `Session`, let the app install host services, then for each plugin in `activationOrder` build its
   `SessionContext` (child scope, seeded RNG, config, bound `systems`, `events`, `commands`, `services`) and `await
   activate(ctx)`. After every plugin is active, the selected role providers' `activate(ctx)` run (ordered by the
   providing plugin's activation order, then role id), each with the providing plugin's context. After every await the
   host re-checks that the session is still current. The session becomes `running` and its pending entity changes are
   flushed.

Everything in steps 1 to 7 can fail without any effect on the running game. A failure in step 9 disposes the new session
and the graph; the application shows an error screen.

## 5. Simulation

### 5.1 Scheduler

`Scheduler` (`src/kernel/scheduler.ts`) advances in whole ticks of 1/60 s. `advance(frameDt)` accumulates real time, runs
at most **5** ticks, and if time is still owed it discards the backlog in whole steps (counted in `droppedTime`) while
keeping the sub-step remainder, so a stall slows the game instead of spiralling. Frame systems then run once with
`alpha = remainder / step` in [0, 1]. Simulation time is `tick / 60`, derived from the tick count rather than accumulated
floats. The application also clamps each frame's elapsed time to 0.25 s.

### 5.2 One tick

```
beforeTick hooks         host: inputCore.beginTick()  -> per-tick input snapshot
for each system in order (phase index, then `order`, then id):
    events are deferred
    system.update(1/60)
    entity store flush (destroyed entities purged) -> deliver queued events in emission order -> flush again
tick += 1
```

- Systems added during a tick start running from the next tick. Removal takes effect immediately: a removed system
  never runs again, including later in the tick in which it was removed (a system may remove itself; its current
  `update` finishes). This keeps a disposed plugin's systems from touching resources its scope already released.
  Covered by `tests/kernel-scheduler.test.ts`.
- An event emitted while a system runs is delivered right after that system returns, before the next system. An event
  emitted by a handler is appended to the same delivery pass. Outside a tick (activation, frame systems, UI) events are
  delivered immediately. More than 10 000 events in one delivery is treated as a runaway loop and raises an error (a fault when it happens during a tick).
- `EntityStore`: `create` is immediate; `destroy` makes the entity not alive at once (`isAlive` false, `get` undefined) and
  its data is purged after the running system returns; `each` iterates a snapshot (entities created during the pass are not
  visited, destroyed ones are skipped) and may be nested. Ids start at 1 and are never reused within a session.
- A throwing system or event handler faults the session: no further ticks run and the owner is reported.

### 5.3 System order of the reference game

Phases run in this order: `input`, `control`, `ai`, `movement`, `combat`, `damage`, `world`, `rules`, `presentation`.
Systems present in the default preset, in execution order:

| Phase | Order | System id | Plugin | Purpose |
|---|---|---|---|---|
| `input` | -100 | `core/world.snapshot-poses` | `core/world` | Copies every `Transform` to its `prev*` fields (render interpolation) |
| `control` | 0 | `core/player.controller` | `core/player` | Turns the input snapshot into `Intent`, yaw and planar movement |
| `ai` | 0 | `core/enemies.think` | `core/enemies` | Enemy state machine and AI behaviours; skipped when a `TurnControl` service is installed |
| `ai` | 10 | `core/enemies.separate` | `core/enemies` | Nudges enemies apart from other solid actors; skipped when a `TurnControl` service is installed |
| `movement` | 0 | `core/combat.projectiles` | `core/combat` | Advances projectiles with continuous sweeps; added when the projectile behaviour is first used |
| `combat` | 0 | `core/combat.weapons` | `core/combat` | Weapon switching, ammo, cooldowns, firing |
| `damage` | 0 | `core/combat.damage` | `core/combat` | Resolves the queued damage requests |
| `world` | 0 | `core/world.doors-and-triggers` | `core/world` | Door animation, Use handling, zone triggers |
| `world` | 10 | `core/combat.pickups` | `core/combat` | Pickup collection |
| `presentation` | 0 | `core/enemies.animate` | `core/enemies` | Sets each enemy's `Visual.state` (no drawing) |

Extension systems: `example/ricochet.move` (`movement`, added on first use of the behaviour), `example/survival.waves`,
`example/time-trial.timer`, `example/arena.rules`, `example/holdout.defense`, and `example/ward.expire` (`rules`),
`example/stealth.vision` (`ai`, added on first guard spawn), plus
`example/roguelite.progress`, `cinder/game.run`, `example/racing.rules` and `example/extraction.rules` (`rules`), `example/racing.drive`,
`cinder/game.control` and `example/dash-controller.control` (`control`, replacing the FPS controller when selected; Cinder's control
also routes pack/forge/grid/dialogue ingress and suspends autonomous enemy AI through `TurnControl`). `core/objective` registers no system; it works through events
(`TriggerFired`, `Died`, `UseFailed`). Frame systems, once per rendered frame, in execution order:

| Order | System id | Plugin | Purpose |
|---|---|---|---|
| -100 | `core/player.camera` | `core/player` | Publishes the interpolated `View` (position, yaw, bob, death roll) |
| 0 | `core/hud.update` or `example/visor-hud.frame` | the selected HUD | Updates the DOM HUD |
| 100 | `core/presentation.frame` | `core/presentation` | Copies `View` into the camera, animates doors and switches, updates actors, effects and the weapon sprite |
| 150 | `cinder/hud.draw` | `cinder/hud` (when selected) | Reflects Cinder class select/transitions, AP/round/intents, view mode, pack/forge/grid/dialogue, depth, non-modal boon tray and weapons; no pointer interaction |

Independent family systems (default order 0; frame systems run once per rendered frame rather than spending turns):

| Phase / cadence | System id | Plugin | Purpose |
|---|---|---|---|
| `movement` | `hollowmere/game.update` | `hollowmere/game` | Fixed-tick platform movement, combat, room transitions, pickups, NPCs, checkpoints and boss turns |
| frame | `hollowmere/presentation` | `hollowmere/presentation` | Canvas world camera, HUD, dialogue and tabbed journal; consumes `Metroidvania` state |
| `movement` | `vehicle/racing.drive` | `vehicle/racing` | Fixed-tick vehicle motion, ordered directional gates, laps and timeout |
| frame | `vehicle/presentation.scene` | `vehicle/presentation` | Interpolates the vehicle and updates circuit markers |
| frame | `vehicle/presentation.hud` | `vehicle/presentation` | Updates lap, speed, remaining time and race status |
| `presentation` | `vehicle/presentation.audio` | `vehicle/presentation` | Schedules discrete engine, skid, checkpoint and finish cues |
| `control` | `board/tactics.commands` | `board/tactics` | Resolves queued actions and deterministic enemy turns |
| frame | `board/presentation.hud` | `board/presentation` | Refreshes the interactive DOM board and action feedback from state revisions |
| `rules` | `story/adventure.commands` | `story/adventure` | Resolves queued story actions and chapter-specific save/load/reset requests |
| frame | `story/presentation.frame` | `story/presentation` | Refreshes room art, choices, inventory and journal from adventure state |
| `control` | `puzzle/rules.commands` | `puzzle/rules` | Commits one bounded command per tick: stone pushes, plate/gate checks, two-beat golem pursuit, undo and chamber transitions |
| frame | `puzzle/presentation.frame` | `puzzle/presentation` | Updates the 3D diorama, smooths articulated pieces and orbit camera, fits the responsive HUD and reflects puzzle revisions |
| `control` | `sky/presentation.controls` | `sky/presentation` | Samples held keyboard/touch directions into bounded semantic flight commands |
| `movement` | `sky/game.flight` | `sky/game` | Advances a seconds clock, commits cargo/boost/repair actions and checks delivery/hazard outcomes |
| frame | `sky/presentation.frame` | `sky/presentation` | Fits the floating-island camera, animates drone/crates and updates flight telemetry |
| `rules` | `ember/game.defense` | `ember/game` | Commits construction/repair/pulse, advances waves and independently shared tower fire actions |
| frame | `ember/presentation.frame` | `ember/presentation` | Updates authored 3D lane, towers/enemies and resource/cooldown HUD |
| `control` | `verdant/game.commands` | `verdant/game` | Commits one decision, advances its turn clock, applies dry-wind drain and checks restored relays |
| frame | `verdant/presentation.scene` | `verdant/presentation` | Fits island bounds around panels and reflects relay growth/selection |
| frame | `verdant/presentation.ui` | `verdant/presentation` | Displays resources, forecasts and shared action definitions/cooldowns |
| `control` | `portfolio-cards/ash.commands` / `portfolio-cards/cloud.commands` | selected card game | Commits one queued card action, advances the game's local rules and checks its outcome |
| frame | `portfolio-cards/presentation.ui` | `portfolio-cards/presentation` | Renders the selected card game's hand, status and actions |
| frame | `portfolio/assist.refresh` | `portfolio/assist` | Refreshes optional contextual hints from puzzle or card state without issuing gameplay commands |
| `control` | `common/game.turn` | `common/game` | Commits household actions and advances the explicit turn clock and resident simulation |
| frame | `common/presentation.frame` | `common/presentation` | Renders household state and optionally queues paced wait commands while playing |
| `control` | `silt/game.commands` | `silt/game` | Commits expedition commands, enemy turns and district tide |
| `input` | `silt/presentation.input` | `silt/presentation` | Converts scoped keyboard presses into expedition commands |
| frame | `silt/presentation.ui` | `silt/presentation` | Renders the current chamber, survey and controls from the game service |
| `rules` | `salt/game.commands` | `salt/game` | Commits queued campaign, quest and tactical commands |
| frame | `salt/presentation.frame` | `salt/presentation` | Renders the campaign, tracked journal and tactical board |
| frame | `expedition/assist.refresh` | `expedition/assist` | Refreshes optional contextual hints without submitting gameplay commands |

Stonewake's rules own a discrete board independent of the renderer. Its presentation builds real lit mesh geometry,
maps authored cell coordinates to the XZ plane, ray-picks floor meshes and emits semantic move commands. Camera and
animation time never advance turns. Chamber rebuilds reuse the session's scoped materials/geometries/textures;
replacing scene objects does not allocate another resource set. The 256-turn undo history restores authoritative
positions, turn parity and outcome, while cosmetic interpolation catches up separately.

The `mechanics/resources`, `mechanics/clock`, `mechanics/actions` and `mechanics/objectives` plugins register **no systems**.
They supply role-selected factories with separate per-consumer handles, owned by both consumer and provider scopes.
`mechanics/kits` validates immutable definitions; the SDK composes handles, while gameplay algorithms stay in plugins.
Actions synchronously validate resources and reserve cooldown before notifying observers. A game checks spatial legality
before execution and commits local effects only after success. These are resource/action transactions, not arbitrary
multi-plugin rollback. Owner/instance-tagged events describe committed facts; they are not an implicit global command bus.
See [the mechanic contracts and bounds](reusable-mechanics.md).

Reusable orchestration helpers live in the SDK, with state allocated per consumer rather than in module globals.
`createCommandQueue` owns pending commands and supplies bounded FIFO ingress/draining to the existing
`puzzle/rules.commands` and `story/adventure.commands` systems. Those systems retain their one-command and snapshot-batch
policies respectively. Schema normalization and gameplay legality stay in each family.

`createDeadline` owns deadline state while borrowing an existing `MechanicClock`. Sky's seconds-based temporary effects
and Verdant's turn-based environmental/season boundaries use it from their existing systems. Only the game advances the
clock and applies/rearms effects. Helpers register scoped cleanup, install no systems, and add no kernel game concepts.
See [queues](command-queues.md), [deadlines](deadlines.md) and [resource conformance](mechanic-conformance.md).

`mechanics/navigation` offers a registration-time pure `NavigationRole` query implementation. Puzzle pursuit and board
reachability build their own legal ordered graphs and consume common unit-edge search results; occupancy, movement,
turn/AP spending and AI policies stay in the respective family. The provider stores no session data or mutable cache.
Static puzzle content-connectivity validation remains local to its registration-time loader.

`mechanics/sequence` offers a role-selected factory for ordered cursors with finite repeated rounds. Independent-vehicle
and shooter-backed racing delegate checkpoint progression while retaining distinct crossing/time-limit policies.

`mechanics/progression` offers a role-selected factory for linear XP curves, level counts and pending game-defined
rewards. Cinder Vault grants XP from kills, applies its own health/boon effects and keeps a three-card tray open while
turns continue; the provider never pauses or applies perks. `mechanics/inventory` offers bounded stacks and optional
equipment slots and registers item content; `mechanics/crafting` executes known item recipes atomically. Cinder owns
threat definitions, elite affixes, boss enrage, effects, loot, filters/drop, ember costs, NPC/Oracle services and UI. New
enemy content may use Cinder's `cinder/manual` AI metadata hook; it is a no-op in autonomous core AI. `dungeon/generator` registers a map format
and inert marker prefab. It emits one bounded `WorldDescription` with up to three isolated room/corridor wings; Cinder
supplies encounters and owns all descent/teleport rules.

`TurnControl` is a presence-only SDK service. When Cinder provides it, `core/enemies` suppresses autonomous AI and
separation; Cinder executes engaged enemy actions after the player's action-point turn. Base enemies get one action,
Ash Hounds and Swift elites two, support Acolytes may heal instead, and enraged bosses gain one. This keeps the shooter
family's existing real-time games unchanged when the service is absent.

`ViewModes` is an optional presentation service. `presentation/camera-modes` publishes first-person and orthographic
isometric projections, replaces its own `Render.setWorldCamera` lease on toggle, and exposes the player floor marker.
`presentation/player-avatar` attaches a `Visual` class body only in isometric mode; core-presentation hides ceilings,
first-person view models and fog while an overhead mode is active. `ViewModes.rotate` drives `Z`/`X` camera steps and
`pickGround` supports Cinder's AP-spending clicked movement/attacks and hover previews. First-person weapon sprites use a smaller bottom-center
pivot. The world camera
selection keeps one lease per consumer context, so toggling cannot accumulate stale selections.

The shared SDK `createOwnedInstances` composes scopes and consumer-local IDs for clock, sequence, progression and
inventory factories. None of these providers/map formats installs simulation systems; family systems remain the
authorities.

Validation can inspect `v.roleProviders(role)` for enabled provider IDs, owners and values. Board/puzzle composition
checks reject foreign experience authorities through this role metadata, not entire `story/`, `vehicle/` or `board/`
namespaces. Neutral plugins under those namespaces remain usable; the known incompatible shooter authorities still
have explicit exclusions.

### 5.4 Damage

`combat.damage(req)` (or the `DealDamage` command) validates the amount and queues a copy. The `damage` phase processes
the queue in FIFO order: skip stale or dead targets, run damage modifiers in ascending `order` then id (each receives the
previous amount), drop the request if the amount is not positive, subtract health, emit `Damaged`, and when health reaches
zero set `dead` and emit `Died` once. The only built-in modifier is `core/team-immunity`.

### 5.5 Randomness and time

Gameplay randomness comes from `ctx.rng`, a mulberry32 stream seeded from the preset `seed` combined with a hash of the
plugin id, so each plugin has a private deterministic stream. `ctx.cosmeticRng` is seeded from the wall clock and is for
visuals and audio only (no bundled plugin uses it). Cooldowns and timers use `ctx.time.now` (simulation seconds), never
the wall clock. Shared mechanic clocks additionally make time domain explicit: games advance `seconds` by simulation
`dt`, or advance `turns` by whole accepted decisions. Idle frames/ticks cannot advance a turn clock.

## 6. World

The grid format is only an authoring format. `core/world`'s `buildGridMap` validates it and produces a
`WorldDescription`: cells, merged wall solids (horizontal runs of identical wall tiles become one box), doors, spawns,
triggers, lights, ambient and fog. Rendering, collision, line of sight and navigation all read that one description, so
they cannot disagree. Nothing outside `grid.ts` interprets tile characters.

- **Collision** (`collision.ts`): one list of axis-aligned boxes (walls, plus one box per door). Actors are circles.
  `moveCircle` moves in sub-steps of at most half the radius (at most 16), then pushes the circle out of each box along the
  line to the closest point, repeating up to 4 times per sub-step; this gives sliding along walls and around corners.
  `isFree` tests a circle against the map bounds and every box.
- **Ray and swept-circle queries**: `raycast` is an analytic slab test against every active box. With a radius the boxes
  are inflated by the radius, so the result is the distance the circle's centre can travel; speed can never cause
  tunnelling. Where the ray enters a corner region of the inflated box, the test is made against that corner's arc (a
  rounded rectangle), so a circle that misses the real corner is not reported as a hit, and the normal there points
  radially away from the corner. Elsewhere the normal is axis-aligned (the face entered); a query that starts overlapping
  returns `t = 0` through the nearest face. `lineOfSight` is a zero-radius ray.
- **Doors** are thin boxes (a fifth of the cell size thick) that become inactive when open, so movement, rays, line of
  sight and navigation all change together. A door cannot close on top of an actor. `world.version` increments when
  blocking state changes. A locked door opens only through a trigger or `setDoorOpen(..., force)`.
- **Navigation** (`nav.ts`): A* over grid cells (8-connected, no corner cutting). A cell is blocked if solid or a closed
  door. The raw path is smoothed by skipping to the farthest waypoint reachable in a straight swept-circle line (radius 0.3).
  Enemies re-path about every 0.4 s, or immediately when `world.version` changes, and walk straight at the target when a
  swept line is clear.
- **Triggers**: a switch fires on Use when the player is within 0.9 cells and roughly facing it; Use otherwise toggles the
  nearest door in front. A zone fires when a player enters its radius (edge-triggered).
- **Queries are brute force** over the box list: simple, and one list keeps door state consistent everywhere. This is
  sized for maps of a few hundred boxes (see Key decisions).

## 7. Application frame loop

`src/app/main.ts` owns a state machine; `shell.ts` draws the screens.

| From | Trigger | To |
|---|---|---|
| `boot` | Initial preset applied (the stored one, else the default) | `menu` |
| `menu` | Play | `playing` |
| `playing` | Esc (pointer lock lost for locked experiences; direct pause for free/none), window blur, tab hidden, backquote | `paused` |
| `paused` | Resume | `playing` |
| `playing` | `Flow.end` called by the mode | `ending` |
| `ending` | 1.1 s of real time elapsed | `ended` (result screen) |
| `paused`, `ended` | Restart (fresh session, same registrations) | `playing` |
| `paused`, `ended`, `error` | Main menu | `menu` |
| any | Simulation fault, or a preset that cannot start | `error` |

If WebGL2 or the renderer is unavailable, the app shows an "Unsupported" screen and nothing else starts.

- **Simulation runs only while the player has control**: `playing` with the selected experience's pointer requirement
  satisfied, or `ending` (a short real-time delay of 1.1 s after the run ends so the final moments play out). Locked
  experiences require pointer capture; `free` and `none` do not request or require pointer lock. In every other state
  the scheduler is paused, but
  frame systems still run and the scene is still rendered every frame, so menus sit over the live world.
- Each frame: clamp elapsed time, set the scheduler's paused flag from the state, `scheduler.advance(dt)`, handle the
  `ending` to `ended` transition, then `renderHost.render()`. A faulted session is not advanced; its last frame stays on screen.
- The first session is created when the initial preset is applied, with the scheduler paused; `Play` starts it, and later
  plays or restarts create a fresh session on the same registrations (`host.restart()`).
- **Experience policy and UI ingress**: `ExperienceRole` supplies pointer policy and optional start-screen controls.
  Its absence preserves FPS capture and the registered `InputActions` control list. `SessionControl.playing` is true only
  for the current running session in the host's `playing` state with its pointer requirement satisfied. UI handlers
  reject command ingress while it is false; authoritative changes are committed by simulation systems. Frame systems
  still running over a menu or pause screen does not authorize UI gameplay actions.
- **`?test`**: with `?test` in the URL the app treats the pointer requirement as satisfied and never requests pointer lock, so
  headless browsers can drive it with synthetic events; `Esc` then pauses directly (there is no pointer-lock exit to
  detect). `scripts/smoke.mjs` loads the page this way. Independently of `?test`, the app always exposes
  `window.__bulkhead` (host, input core, render host, shell, creator, state, `play`, `applyPreset`, ...). It exists for
  `scripts/smoke.mjs` and manual debugging; it is tooling, not part of the plugin API.
- **Persistence** (`src/platform/storage.ts`): `localStorage` keys `shooter-foundation/settings`
  (`{ schema: 1, sensitivity, volume, pixelRatioCap }`, values clamped on load, unknown schema falls back to defaults) and
  `shooter-foundation/preset` (`{ schema: 1, preset }`, the whole preset object). On start the stored preset is staged and
  applied; if it no longer validates (for example it names an imported pack that is gone) the default preset is used.
  Imported packs live in the host's in-memory catalog only. There is no general run/session save. `story/adventure` has
  an explicit chapter-specific Save/Load: a versioned action history stored through `Profile` under
  `story/save/<chapter-id>` is replayed into temporary state and committed only after validation. Chapter identity and
  version must match; reset/restart does not overwrite the save. See [Narrative adventure](../../games/adventure/README.md).

## 8. Platform, input, audio and rendering

### 8.1 Input

`createInputCore` keeps `held` actions plus pending press and release edges and accumulated mouse movement. At the start
of every simulation tick `beginTick()` moves the pending edges and look delta into a snapshot that plugins read through
`Input.tick` (`held`, `pressed`, `released`, `lookX`, `lookY`, optional `pointer`). The pointer snapshot is in canvas-relative
CSS pixels (`x`, `y`, `inside`), not backing-store pixels; older/headless adapters may omit it. Because the snapshot is
taken per tick, an edge is visible in
exactly one tick even when several catch-up ticks run in one frame. Key auto-repeat creates no new edges. `clear()` (window
blur, tab hidden, pointer lock lost, pause) drops all state without generating release edges.

`bindDomInput` maps `KeyboardEvent.code`, `Mouse0` to `Mouse2`, `WheelUp` and `WheelDown` to the action ids registered in
the `InputActions` registry by plugins. A selected experience can supply its own launcher control list. Presses are
accepted only while the app is `playing` and its experience pointer policy is satisfied; releases are always accepted
so keys never stick. The bundled FPS player ignores `lookY`: aim is yaw only.

`InputContexts.create(ctx, options)` creates scoped bindings with a per-tick snapshot. Higher `priority` routes first;
`consume` defaults to true for matching input, while `exclusive` claims even unmapped keyboard/pointer input from lower
contexts and legacy `Input`. Creation, enable/disable transitions and disposal cancel held actions and edges so input
cannot leak across modal or ownership changes; previously held keys must be released before reuse. Disposal belongs to
the creating scope. DOM-driven game commands additionally consult `SessionControl.playing`.

### 8.2 Audio

`createAudioService` synthesises sounds with Web Audio from `SoundDef` descriptions (oscillator and filtered-noise layers
with linear gain envelopes and exponential frequency and filter ramps). The sound table comes from the selected theme.
The `AudioContext` is created on the first `resume()`, called from the Play button's user gesture. At most 24 voices play at
once; unknown sound ids warn once and are ignored; without Web Audio nothing plays. Distance attenuation (full volume
within 3 m, falling off quadratically to silence at 30 m) and stereo pan are applied by the sound hooks in
`core/presentation`, not by the platform adapter; there is no occlusion.

### 8.3 Rendering architecture

The render host (`src/platform/render/service.ts`) owns the official Three.js WebGL renderer, two scenes and fallback
world/view cameras, and exposes the `Render` service from the SDK:

- **World layer**: the world scene has a fallback perspective camera (near 0.05, far 200; the shooter field of view comes
  from `View`). It is cleared to the environment colour and carries the fog set by `render.setEnvironment`.
- **Scoped world cameras**: `render.setWorldCamera(ctx, camera)` accepts a `THREE.PerspectiveCamera` or
  `THREE.OrthographicCamera`. Each call leases selection through the caller's scope; the newest live lease wins. Disposing
  an older lease cannot steal a newer selection. Cleanup restores the newest surviving camera or the host fallback;
  selection/restoration immediately applies the current aspect. Resize updates perspective aspect; for orthographic
  cameras it preserves vertical extent, horizontal center and zoom while adjusting horizontal extent to the canvas.
  `render.camera` remains the fallback perspective camera, not a mutable alias to the selected camera. Selection owns
  the lease, not the camera object, and does not dispose that object.
- **View layer**: a second scene with its own camera (vertical field of view 50, at the origin looking down -Z), drawn after
  the world on a cleared depth buffer without clearing colour. It holds the first-person weapon sprite so it never clips
  into walls.
- `createRoot(ctx, layer)` gives each plugin an owned `Group` in a layer, detached with the plugin's scope. `own`, `shared`
  and `texture` tie GPU resources (geometries, materials, textures) to scopes; removing a mesh from a scene does not free
  GPU memory, disposing the resource does. Theme painters are drawn once into canvases and uploaded as nearest-filtered
  textures marked `SRGBColorSpace`. Renderer output is also sRGB, with `NoToneMapping`; scene/material/light colors use
  native Three.js `Color` objects. FPS world/view cameras use Euler order `YXZ`.
- Pixel ratio is `min(devicePixelRatio, cap)` with the cap (1, 1.5 or 2) from the user's quality setting; the canvas
  backing size follows its CSS size on resize.

**How presentation derives meshes from the `WorldDescription`** (`core/presentation/worldmesh.ts`): walls become quads only
on faces that border an open cell; floors and ceilings are one quad per open cell. Quads are grouped by theme texture key
into one merged mesh per key (a few draw calls instead of thousands). Each door is its own group, drawn with the door art
and sliding down into the floor as `openness` goes from 0 to 1, and hidden when fully open. Switch panels and the exit pad
are unlit quads; the pad pulses using native `Color.setHex`. The map's lights become point lights and its ambient and fog
become the environment. Reference-map artistic ambient and point-light intensities are multiplied by PI to compensate
for Lambert's BRDF; point lights use decay 0 with Three.js's smooth range cutoff rather than inverse-square falloff.
Nothing is drawn from the grid characters.

**Actors** (`actors.ts`): every entity with `Transform` and `Visual` gets an `ActorHandle` from the actor renderer named
by `Visual.renderer` (the default `core/billboard` when empty). The billboard is an upright quad whose yaw matches the view's
yaw, anchored at its bottom edge, with animation frames chosen from the theme's visual definition and `Visual.state`.
Positions are interpolated between ticks with `alpha`. Opaque sprites use **alpha-test cutout** (`alphaTest` 0.5 discards
transparent texels) with depth writes on, so they occlude and are occluded correctly by walls and each other with no
sorting. Projectiles and glows use additive blending, transparent and without depth writes, and are sorted back to front.
Handles are disposed when the entity disappears. One-shot impact effects use a pool of 32 quads.

### 8.4 Historical mini3 subset (legacy fixtures only)

The former offline mini3 renderer mirrored Three.js class and property names for a small reference-game subset. The
following table and semantic differences describe **that historical implementation only**, reachable through
`src/platform/render/mini3/legacy.ts` for old fixtures. Production `src/sdk/render.ts` exports official Three.js through
the `mini3/index.ts` facade, including the full core/WebGL namespace and its matching declaration graph; the limitations
below do not describe the current SDK.

| Area | Provided |
|---|---|
| Scene graph | `Object3D` (`position`, `rotation`, `scale`, `visible`, `renderOrder`, `children`, `parent`, `name`, `userData`, `add`, `remove`, `removeFromParent`, `traverse`, `updateMatrixWorld`, `updateWorldMatrix`), `Group`, `Scene` (`background`, `fog`), `Fog`, `Mesh` |
| Math | `Vector3` (`set`, `copy`), `Euler` (angles in radians) |
| Camera | `PerspectiveCamera` (`fov` in degrees, `aspect`, `near`, `far`, `updateProjectionMatrix`) |
| Lights | `AmbientLight`, `PointLight` (`color`, `intensity`, `distance`) |
| Geometry | `BufferGeometry` (attributes `position`, `normal`, `uv`, `color` as float arrays; 16 or 32 bit index), `BufferAttribute`, `Float32BufferAttribute`, `BoxGeometry`, `PlaneGeometry`, `CylinderGeometry` |
| Materials | `MeshBasicMaterial`, `MeshLambertMaterial` with `color`, `map`, `transparent`, `opacity`, `alphaTest`, `side`, `depthWrite`, `depthTest`, `fog`, `vertexColors`, `emissive` (lit only), `blending` (normal, additive) |
| Textures | `Texture`, `CanvasTexture`, `DataTexture`; wrap modes, nearest and linear (and mipmap) filters, `repeat`, `offset`, `flipY` |
| Renderer | `WebGLRenderer` (`setPixelRatio`, `setSize`, `setClearColor`, `clear`, `clearDepth`, `render`, `autoClear`, `info`, `dispose`), `isWebGL2Available()` |

Not provided by the legacy subset: `Quaternion`, `Matrix4`, `Vector2`, `Color`, `Sprite`, `Line`, `Points`, directional, spot and hemisphere
lights, shadows, `Raycaster`, loaders, render targets and post-processing, instancing, frustum culling, `FogExp2`.

**Historical semantic differences from Three.js** (for interpreting old fixtures):

- **No colour management.** Colours are plain `0xRRGGBB` numbers (`material.color`, `emissive`, light `color`,
  `scene.background`, `Fog.color` are numbers, not `Color` objects) and are used as-is, as are canvas texture bytes; there
  is no sRGB conversion. Recent Three.js applies colour management by default, so the same values will look different.
- **Euler order is fixed to YXZ.** `rotation.set(pitch, yaw, roll)` is applied as `Ry * Rx * Rz`; Three.js defaults to XYZ.
- **Lighting model.** Lambert shading per fragment: ambient plus up to 16 point lights (the nearest to the camera when there
  are more), each attenuated as `(1 - d / distance)^2`, with `distance` 0 meaning no falloff. No decay setting, no physical
  units. Light intensities in maps are tuned to this model and are not numerically comparable with Three.js.
- **Fog** is linear in view-space depth only.
- **Draw order.** Opaque meshes are ordered by `renderOrder` only (the depth buffer does the rest); transparent meshes are
  sorted back to front by squared distance of their origin from the camera. There is no frustum culling.
- **UV transform** is `repeat` and `offset` only. `flipY` defaults to true for image textures and false for `DataTexture`.
- **Context loss**: drawing is skipped while the context is lost; on restore GPU objects are dropped and re-uploaded lazily.
- `dispose()` on a geometry, material or texture frees it on every renderer that uploaded it.

## 9. Completed Three.js migration and reproduction

The production migration is contained behind the existing renderer adapter and SDK import seam. Import-boundary rules
were not widened: `src/sdk/render.ts` still imports the checker-approved `src/platform/render/mini3/index.ts` path, whose
exports now come from official Three.js. Plugins continue to import only the SDK. The old renderer is isolated behind
`legacy.ts` for old fixtures, rather than used as a production fallback.

Reproduce the pinned vendor tree from locked packages:

```bash
npm ci
npm run vendor-three
npm run vendor-three -- --check
```

`scripts/vendor-three.mjs` requires `three` and `@types/three` **0.187.0**. It copies official `three.module.js` and
`three.core.js` byte-for-byte, the full core/WebGL declaration dependency closure and the local WebXR declaration
dependency. The only declaration adaptation rewrites the WebXR reference to a local path. Runtime, Three types and
WebXR licenses are retained. `vendor/provenance.json` records package versions, upstream revision, source SHA-256 hashes
and output SHA-256 hashes; `--check` compares the generated bytes and rejects unexpected files.

Presentation now uses native `Color.setHex` setters, sRGB output and painter textures, and explicit `YXZ` FPS camera
rotation. Artistic map-light intensities use PI compensation and point-light decay 0, preserving the authored lighting
intent within Three's range-cutoff model. Perspective/orthographic scoped world-camera selection and resize policy are
part of SDK 2 (section 8.3); no compatibility shim replaces Three's `Color` semantics.

This delivery does not include an asynchronous GLTF loader service. It also does not replace esbuild, the custom
dev/preview scripts, `node:test`, or the tool-resolution fallback with Vite/Vitest. Those are separate toolchain choices,
not prerequisites for using official Three.js.

## 10. Key decisions

| Decision | Rationale |
|---|---|
| Entity ids are never reused within a session | A stale id can never alias a new entity; `isAlive` and `get` are safe on dead ids |
| Events are delivered after each system returns | Emitters are not re-entered mid-system; handlers see settled state; order is deterministic |
| Damage is queued and resolved in one phase | One ordered pipeline for modifiers, exactly-once `Died`, no half-applied state inside a tick |
| Roles for exclusives, registries for additive content | Many weapons can coexist, but exactly one HUD or mode runs; the preset says which |
| Factories are instantiated in the registering plugin's context | Systems and resources a behaviour creates are owned and disposed with its provider, whoever triggers it |
| Staged validation before commit | A bad preset or imported pack cannot damage the running game; errors are complete and actionable |
| Theme keys instead of asset paths | Gameplay and data are independent of art; content packs need no assets and cannot load remote files |
| Manifests are JSON validated before any code is imported | Dependency, version and conflict errors surface without running untrusted-to-the-graph code; tools can list plugins cheaply |
| Dependencies are never auto-enabled | The preset is the complete, explicit description of a game |
| Simulation plugins never touch the DOM or rendering | The real gameplay plugins run headless in tests; presentation reads state through interpolated frame systems |
| One authoritative `WorldDescription` | Rendering, collision, line of sight and navigation cannot disagree about the level |
| Per-tick input snapshot | Edges are seen exactly once even during catch-up ticks |
| Fixed step with a tick cap and discarded backlog | Deterministic simulation that slows rather than spirals after a stall |
| Simulation time for timers, seeded per-plugin RNG | Reproducible gameplay; cosmetic randomness is kept apart |
| Brute-force AABB queries sized for small maps | Simple and obviously correct; one box list keeps doors consistent; a spatial hash is the upgrade for larger maps |
| Kernel knows no game concepts; family vocabulary lives in `sdk/contracts` | Shooter, racing, tactics and story reuse the same kernel without cross-family plugin dependencies; lint checks the boundary |
| Official Three.js hides behind the adapter and `sdk/render.ts` | A pinned vendor facade keeps the existing import boundaries, full core/WebGL types and reproducible source/license provenance |
