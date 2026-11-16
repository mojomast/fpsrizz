# Architecture

How Bulkhead is put together and why. For what is and is not implemented see [SPEC.md](SPEC.md); for writing plugins see
[PLUGINS.md](PLUGINS.md); for the JSON formats see [CONTENT_FORMAT.md](CONTENT_FORMAT.md).

> **Stack deviation.** The original brief asked for Three.js + Vite + Vitest. This build was produced without network
> access to the npm registry, so none could be installed. Rendering uses **mini3** (`src/platform/render/mini3`), an
> in-repo WebGL2 renderer mirroring a subset of the Three.js API, behind the render adapter
> (`src/platform/render/service.ts`) and the rendering SDK (`src/sdk/render.ts`, exported as `THREE`). Bundling and the dev
> server use esbuild, tests use `node --test` running TypeScript directly (Node >= 22.18), and type checking is a separate
> `tsc --noEmit` (TypeScript 7). There are no runtime dependencies and no lockfile (`package-lock.json` could not be
> generated offline; the first networked `npm install` creates it). Section 9 describes the migration path.

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
  |  src/plugins/*     |   |  src/platform       |   |  src/content       |
  |  reference game,   |   |  browser adapters:  |   |  presets/*.json    |
  |  theme, extensions |   |  input, audio,      |   +--------------------+
  |  (SDK only)        |   |  storage, ui, flow, |
  +---------+----------+   |  render + mini3     |
            |              +----------+----------+
            | sdk/index.ts            | sdk, kernel
            | (+ sdk/render.ts        |
            |  with "render")         |
            v                         v
        +---------------------------------+
        |  src/sdk   public plugin API    |
        |  core.ts  contracts/shooter.ts  |-- render.ts also imports mini3
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
  and roles that gameplay plugins use to cooperate without importing each other); `contracts/audio.ts` is the sound
  description format; `render.ts` is the rendering SDK. `index.ts` is the single entry point.
- **Platform** (`src/platform`): adapters for the browser: DOM input, Web Audio, `localStorage`, UI mounting, the flow
  service, the render host and mini3.
- **App** (`src/app`): wires adapters into sessions as host services, owns the catalog of compiled-in plugins, the frame
  loop, the menus and the creator panel. No gameplay rules live here.
- **Plugins** (`src/plugins`) and **content** (`src/content/presets`): everything the game actually does.

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

Every plugin id, with what it owns. All use SDK 1.0.0 (`"sdk": "^1.0.0"`).

| Plugin id | Folder | Kind | Role providers | Content kinds and registrations | Services |
|---|---|---|---|---|---|
| `core/world` | `core-world` | code | none; requires role `sdk/mode` | content kind `map`; map format `core/grid` | provides `World` |
| `core/combat` | `core-combat` | code | none | content kinds `ammo`, `weapon`, `pickup`; attack behaviours `core/hitscan`, `core/projectile`, `core/melee`; pickup effects `core/heal`, `core/give-ammo`, `core/give-weapon`; handles command `DealDamage` | provides `Combat` |
| `core/player` | `core-player` | code | `sdk/controller`: `core/fps-controller`; `sdk/camera`: `core/fp-camera`; requires both roles | prefab `core/player`; input actions (move, turn, fire, use, weapon next/previous, weapon slots 1 to 5) | camera provider supplies `View` |
| `core/enemies` | `core-enemies` | code | none | content kind `enemy`; AI behaviours `core/chaser`, `core/ranged`; damage modifier `core/team-immunity` | provides `EnemyAi` |
| `core/modes` | `core-modes` | code | `sdk/mode`: `core/objective` | none | uses `Flow` |
| `core/hud` | `core-hud` | code | `sdk/hud`: `core/hud` | setting `showCrosshair` | uses `Ui`, `Flow` |
| `core/presentation` | `core-presentation` | code (`render`, `audio`) | none; requires roles `sdk/theme` and `sdk/camera` | actor renderer `core/billboard` | uses `Render`, `Audio`, `View` |
| `theme/industrial` | `theme-industrial` | code | `sdk/theme`: `theme/industrial` | textures, sounds and visuals (art and sound pack) | none |
| `core/content` | `core-content` | content | none | 2 ammo types, 2 weapons, 3 pickups, 2 enemies, map `core/arena` | none |
| `example/pack` | `example-pack` | content | none | weapon, enemy, pickup and map `example/annex` | none |
| `example/ricochet` | `example-ricochet` | code | none | attack behaviour `example/ricochet`; weapon `example/ricochet-rifle` through `defineContent` | none |
| `example/hud` | `example-hud` | code | `sdk/hud`: `example/visor-hud` | setting `accent` | uses `Ui`, `Flow`, `View` |
| `example/survival` | `example-survival` | code | `sdk/mode`: `example/survival` | many settings (waves, counts, timings) | uses `World`, `Flow` |

Host-provided services in every session (installed by `src/app/main.ts`): `Input`, `Render`, `Audio`, `Ui`, `Settings`,
`Flow`. Only the plugin graph and role selections in the preset decide which providers run; unselected providers never
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
`ui.addStyles`, `render.createRoot`, `render.own`, `render.shared` and `render.texture`. Anything else (DOM listeners,
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
| `host.restart()` | The session: plugin scopes in reverse activation order, then host-owned session items, then the scheduler, buses, services and entity store | The staged graph: registries and registrations. `register()` does not run again; `activate()` does |
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
8. **Commit**: if a newer `apply`, `restart` or `stop` happened meanwhile, the staged graph is discarded and the call rejects
   with stage `superseded`. Otherwise the old session and registrations are disposed and the new graph becomes active.
9. **`activate`**: create the `Session`, let the app install host services, then for each plugin in order build its
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

- Systems added or removed during a tick take effect from the next tick.
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
| `ai` | 0 | `core/enemies.think` | `core/enemies` | Enemy state machine and AI behaviours |
| `ai` | 10 | `core/enemies.separate` | `core/enemies` | Nudges enemies apart from other solid actors |
| `movement` | 0 | `core/combat.projectiles` | `core/combat` | Advances projectiles with continuous sweeps; added when the projectile behaviour is first used |
| `combat` | 0 | `core/combat.weapons` | `core/combat` | Weapon switching, ammo, cooldowns, firing |
| `damage` | 0 | `core/combat.damage` | `core/combat` | Resolves the queued damage requests |
| `world` | 0 | `core/world.doors-and-triggers` | `core/world` | Door animation, Use handling, zone triggers |
| `world` | 10 | `core/combat.pickups` | `core/combat` | Pickup collection |
| `presentation` | 0 | `core/enemies.animate` | `core/enemies` | Sets each enemy's `Visual.state` (no drawing) |

Extension systems: `example/ricochet.move` (`movement`, added on first use of the behaviour) and `example/survival.waves`
(`rules`, survival preset). `core/objective` registers no system; it works through events (`TriggerFired`, `Died`,
`UseFailed`). Frame systems, once per rendered frame, in execution order:

| Order | System id | Plugin | Purpose |
|---|---|---|---|
| -100 | `core/player.camera` | `core/player` | Publishes the interpolated `View` (position, yaw, bob, death roll) |
| 0 | `core/hud.update` or `example/visor-hud.frame` | the selected HUD | Updates the DOM HUD |
| 100 | `core/presentation.frame` | `core/presentation` | Copies `View` into the camera, animates doors and switches, updates actors, effects and the weapon sprite |

### 5.4 Damage

`combat.damage(req)` (or the `DealDamage` command) validates the amount and queues a copy. The `damage` phase processes
the queue in FIFO order: skip stale or dead targets, run damage modifiers in ascending `order` then id (each receives the
previous amount), drop the request if the amount is not positive, subtract health, emit `Damaged`, and when health reaches
zero set `dead` and emit `Died` once. The only built-in modifier is `core/team-immunity`.

### 5.5 Randomness and time

Gameplay randomness comes from `ctx.rng`, a mulberry32 stream seeded from the preset `seed` combined with a hash of the
plugin id, so each plugin has a private deterministic stream. `ctx.cosmeticRng` is seeded from the wall clock and is for
visuals and audio only (no bundled plugin uses it). Cooldowns and timers use `ctx.time.now` (simulation seconds), never
the wall clock.

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
| `playing` | Esc (pointer lock lost), window blur, tab hidden, backquote | `paused` |
| `paused` | Resume | `playing` |
| `playing` | `Flow.end` called by the mode | `ending` |
| `ending` | 1.1 s of real time elapsed | `ended` (result screen) |
| `paused`, `ended` | Restart (fresh session, same registrations) | `playing` |
| `paused`, `ended`, `error` | Main menu | `menu` |
| any | Simulation fault, or a preset that cannot start | `error` |

If WebGL2 or the renderer is unavailable, the app shows an "Unsupported" screen and nothing else starts.

- **Simulation runs only while the player has control**: `playing` with the pointer captured, or `ending` (a short real-time
  delay of 1.1 s after the run ends so the final moments play out). In every other state the scheduler is paused, but
  frame systems still run and the scene is still rendered every frame, so menus sit over the live world.
- Each frame: clamp elapsed time, set the scheduler's paused flag from the state, `scheduler.advance(dt)`, handle the
  `ending` to `ended` transition, then `renderHost.render()`. A faulted session is not advanced; its last frame stays on screen.
- The first session is created when the initial preset is applied, with the scheduler paused; `Play` starts it, and later
  plays or restarts create a fresh session on the same registrations (`host.restart()`).
- **`?test`**: with `?test` in the URL the app treats the pointer as always captured and never requests pointer lock, so
  headless browsers can drive it with synthetic events; `Esc` then pauses directly (there is no pointer-lock exit to
  detect). `scripts/smoke.mjs` loads the page this way. Independently of `?test`, the app always exposes
  `window.__bulkhead` (host, input core, render host, shell, creator, state, `play`, `applyPreset`, ...). It exists for
  `scripts/smoke.mjs` and manual debugging; it is tooling, not part of the plugin API.
- **Persistence** (`src/platform/storage.ts`): `localStorage` keys `shooter-foundation/settings`
  (`{ schema: 1, sensitivity, volume, pixelRatioCap }`, values clamped on load, unknown schema falls back to defaults) and
  `shooter-foundation/preset` (`{ schema: 1, preset }`, the whole preset object). On start the stored preset is staged and
  applied; if it no longer validates (for example it names an imported pack that is gone) the default preset is used.
  Imported packs live in the host's in-memory catalog only. There are no save games.

## 8. Platform, input, audio and rendering

### 8.1 Input

`createInputCore` keeps `held` actions plus pending press and release edges and accumulated mouse movement. At the start
of every simulation tick `beginTick()` moves the pending edges and look delta into a snapshot that plugins read through
`Input.tick` (`held`, `pressed`, `released`, `lookX`, `lookY`). Because the snapshot is taken per tick, an edge is visible in
exactly one tick even when several catch-up ticks run in one frame. Key auto-repeat creates no new edges. `clear()` (window
blur, tab hidden, pointer lock lost, pause) drops all state without generating release edges.

`bindDomInput` maps `KeyboardEvent.code`, `Mouse0` to `Mouse2`, `WheelUp` and `WheelDown` to the action ids registered in
the `InputActions` registry by plugins (so the start screen's control list is generated from the enabled plugins). Presses
are accepted only while the app is `playing` and captured; releases are always accepted so keys never stick. The bundled
player ignores `lookY`: aim is yaw only.

### 8.2 Audio

`createAudioService` synthesises sounds with Web Audio from `SoundDef` descriptions (oscillator and filtered-noise layers
with linear gain envelopes and exponential frequency and filter ramps). The sound table comes from the selected theme.
The `AudioContext` is created on the first `resume()`, called from the Play button's user gesture. At most 24 voices play at
once; unknown sound ids warn once and are ignored; without Web Audio nothing plays. Distance attenuation (full volume
within 3 m, falling off quadratically to silence at 30 m) and stereo pan are applied by the sound hooks in
`core/presentation`, not by the platform adapter; there is no occlusion.

### 8.3 Rendering architecture

The render host (`src/platform/render/service.ts`) owns the WebGL renderer, two scenes and two cameras, and exposes the
`Render` service from the SDK:

- **World layer**: the world scene and a perspective camera (near 0.05, far 200; field of view comes from the `View`). It is
  cleared to the environment colour and carries the fog set by `render.setEnvironment`.
- **View layer**: a second scene with its own camera (vertical field of view 50, at the origin looking down -Z), drawn after
  the world on a cleared depth buffer without clearing colour. It holds the first-person weapon sprite so it never clips
  into walls.
- `createRoot(ctx, layer)` gives each plugin an owned `Group` in a layer, detached with the plugin's scope. `own`, `shared`
  and `texture` tie GPU resources (geometries, materials, textures) to scopes; removing a mesh from a scene does not free
  GPU memory, disposing the resource does. Theme painters are drawn once into canvases and uploaded as nearest-filtered
  textures.
- Pixel ratio is `min(devicePixelRatio, cap)` with the cap (1, 1.5 or 2) from the user's quality setting; the canvas
  backing size follows its CSS size on resize.

**How presentation derives meshes from the `WorldDescription`** (`core/presentation/worldmesh.ts`): walls become quads only
on faces that border an open cell; floors and ceilings are one quad per open cell. Quads are grouped by theme texture key
into one merged mesh per key (a few draw calls instead of thousands). Each door is its own group, drawn with the door art
and sliding down into the floor as `openness` goes from 0 to 1, and hidden when fully open. Switch panels and the exit pad
are unlit quads; the pad pulses. The map's lights become point lights and its ambient and fog become the environment.
Nothing is drawn from the grid characters.

**Actors** (`actors.ts`): every entity with `Transform` and `Visual` gets an `ActorHandle` from the actor renderer named
by `Visual.renderer` (the default `core/billboard` when empty). The billboard is an upright quad whose yaw matches the view's
yaw, anchored at its bottom edge, with animation frames chosen from the theme's visual definition and `Visual.state`.
Positions are interpolated between ticks with `alpha`. Opaque sprites use **alpha-test cutout** (`alphaTest` 0.5 discards
transparent texels) with depth writes on, so they occlude and are occluded correctly by walls and each other with no
sorting. Projectiles and glows use additive blending, transparent and without depth writes, and are sorted back to front.
Handles are disposed when the entity disappears. One-shot impact effects use a pool of 32 quads.

### 8.4 The mini3 subset

mini3 mirrors Three.js class and property names for the subset the game needs. `src/sdk/render.ts` re-exports it as `THREE`.

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

Not provided: `Quaternion`, `Matrix4`, `Vector2`, `Color`, `Sprite`, `Line`, `Points`, directional, spot and hemisphere
lights, shadows, `Raycaster`, loaders, render targets and post-processing, instancing, frustum culling, `FogExp2`.

**Semantic differences from Three.js** (relevant for migration and for anyone comparing output):

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

## 9. Migration to Three.js, Vite and Vitest

The renderer is behind two seams, so the change is contained. Plugins only see `THREE` and `Render` from the SDK; none
import mini3.

1. Install `three`, `vite` and `vitest` on a networked machine and commit the generated `package-lock.json`.
2. `src/sdk/render.ts`: replace the mini3 namespace import with `three`. `scripts/boundaries.ts` currently forbids bare
   imports in `src/sdk` and `src/platform`; allow `three` in `src/sdk/render.ts` and `src/platform/render`, and update
   `tests/boundaries.test.ts`.
3. `src/platform/render/service.ts`: construct Three's renderer and scenes. Adapt `setEnvironment` (`scene.background` and
   `Fog` colours become `Color` objects) and set `colorSpace` on theme textures.
4. `src/app/main.ts` imports `isWebGL2Available` from mini3; replace it with an in-app check.
5. `core/presentation`: three places assign numeric colours (`worldmesh.ts` for the exit pad, `weaponview.ts` for the muzzle
   flash material and light) and must use `Color` setters; the camera needs `rotation.order = 'YXZ'`; light `intensity` and
   `distance` in maps may need retuning, and colour management may require converting palettes.
6. Replace `scripts/build.mjs`, `dev.mjs` and `preview.mjs` with Vite (`public/` is native; the page's script entry changes
   from `./assets/main.js` to the source entry; the `__DEV__` define declared in `src/globals.d.ts` is currently unused by
   the code). `scripts/smoke.mjs` serves `dist/` and
   keeps working if the output layout is kept.
7. Tests: they import `node:test` and `node:assert/strict`; either keep `node --test` (no dependency) or port them to
   Vitest (the assertion style is not a drop-in match for Vitest's `assert`). Retire `tests/mini3-demo` with mini3.
8. Remove the offline tool-resolution fallback in `scripts/tools.mjs` once `node_modules` is the only source.

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
| Kernel knows no game concepts; shooter vocabulary lives in `sdk/contracts` | Another genre could reuse the kernel; the boundary is checked by lint |
| The renderer hides behind the adapter and `sdk/render.ts` | The offline stack could be replaced by Three.js without touching gameplay or plugins |
