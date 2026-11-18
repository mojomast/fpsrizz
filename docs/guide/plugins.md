# Plugins and the public SDK

Everything in the reference game — weapons, enemies, maps, rules, HUD, rendering — is a plugin or a content pack
built on the API described here. Third-party authors get exactly the same API.

- **SDK version:** `3.0.0` (`SDK_VERSION`). Manifests declare a compatible range in `sdk`. SDK 3 only added APIs,
  so the host also accepts `^2.0.0` manifests (`SDK_COMPAT`); new plugins should declare `^3.0.0`. See
  [Migrating to SDK 3](#migrating-to-sdk-3).
- **One entry point:** `src/sdk/index.ts`. Rendering plugins may additionally import `src/sdk/render.ts`.
- **Enforced:** `npm run lint` (`scripts/boundaries.ts`) fails if a plugin imports anything else — the kernel,
  platform adapters, the app, another plugin's files, or an npm package.

The independent Silt Archive, Salt Ledger and Common Ground families expose `Silt`, `SaltLedger` and `Hearth`
respectively through the SDK entry point. Their services provide game-specific observations and bounded semantic
command ingress; the selected family authority owns command legality and simulation policy. See the
[Silt](../../games/expeditions/docs/silt-archive.md), [Salt](../../games/expeditions/docs/salt-ledger.md) and [Common Ground](../../games/expeditions/docs/common-ground.md) guides for
composition, controls and limitations.
`Hearth` exposes the editable house lot as detached floor and placement snapshots; build commands are validated and
committed by `common/game` against its owned resource pool. See [Common Ground](../../games/expeditions/docs/common-ground.md#build-your-house).

`mechanics/relationships` supplies consumer-owned, bounded symmetric actor-pair scores through
`RelationshipMechanicRole` and `relationshipMechanic`. The consumer defines pairs and bounds and owns social behavior,
thresholds, and consequences; see [its plugin guide](../../src/plugins/mechanics-relationships/README.md).
`mechanics/conditions` manages named, refreshable target conditions over a borrowed explicit clock using
`ConditionMechanicRole` and `conditionMechanic`. Consumers advance the clock and decide the effects; see
[the conditions plugin guide](../../src/plugins/mechanics-conditions/README.md).

## 1. Two kinds of extension

| | Trusted code plugin | Data-only content pack |
|---|---|---|
| What | TypeScript module compiled into the app | JSON: manifest + content entries |
| Can add | new behaviour: systems, attack/AI behaviours, effects, modes, HUDs, renderers, content kinds | new *definitions* that select existing behaviours: weapons, enemies, pickups, ammo, maps |
| Installed | at build time (catalog entry) | at build time **or** imported at runtime in the creator panel |
| Trust | full application trust | never executes: no scripts, expressions or function strings |

**Trust model.** Code plugins are ordinary application code. `capabilities` in a manifest *document intent*
(and gate the rendering SDK import in the lint rule); they are **not a sandbox**. Only install code you trust.
Content packs are validated JSON and cannot run code or load remote assets.

**Data or code?** If the change is "a different number, name, texture, map or combination of existing behaviours",
it is data. If you catch yourself wanting an `if` — a new way to attack, move, think, score, draw — it needs a code
plugin that registers a behaviour, after which data can select it by id.

**Discovery is build-time.** `scripts/gen-catalog.mjs` scans plugin folders and writes `src/app/catalog.generated.ts`,
the list of plugins compiled into the app. Adding a local plugin means adding its folder (plus naming it in a preset). A deployed build cannot install new JavaScript;
it can import data packs.

**Authoring discovery:** use `npm run find-reuse -- "capability words"` before implementing another mechanic.
`--show <id>` explains entry points, concrete enable dependencies, required role selections, registered behaviors,
examples and scope limits. See [docs/guide/reuse.md](reuse.md) and [the generated inventory](../reference/reuse-index.md). This authoring tool
observes isolated default registrations, without activating sessions; it does not replace preset validation.

Each bundled plugin's directory includes a `README.md` describing its purpose, composition, relevant contracts,
verification and limits. Start there for a concrete provider or content pack, then consult its manifest, linked family
guide and current SDK declarations for the authoritative details. Role selection and enabling the provider are
separate steps; validate the complete composition with `npm run validate-game -- --bundled`.

## 2. Anatomy

```
src/plugins/my-plugin/
  manifest.json     # validated before any code is imported
  index.ts          # default export: definePlugin({ register, activate })
  content.json      # optional: declarative content entries shipped with the plugin
  reuse.json        # optional: authoring-only capability/scope/examples metadata; not a runtime manifest field
  README.md         # purpose, composition, public interfaces, verification and limits
```

### manifest.json (schema 1)

```json
{
  "schema": 1,
  "id": "example/ricochet",
  "name": "Ricochet Rifle",
  "version": "1.0.0",
  "kind": "code",
  "sdk": "^3.0.0",
  "description": "…",
  "dependencies": { "core/combat": "^1.0.0" },
  "optionalDependencies": {},
  "conflicts": [],
  "capabilities": ["simulation"],
  "requiresRoles": [],
  "roleDependencies": [],
  "config": { "bounces": { "type": "number", "label": "Max bounces", "default": 3, "min": 0, "max": 8 } }
}
```

- `id` is namespaced (`namespace/name`); further name segments and `.` or `_` in the name are supported. See
  `docs/reference/content-format.md` for the ID rules. One installed version per id.
- `kind`: `"code"` or `"content"`.
- `dependencies` must be **enabled in the preset** (they are never auto-enabled) and satisfy the range.
  `optionalDependencies` may be absent; if enabled, the range must match and the plugin activates after them.
- `conflicts`: ids that cannot be enabled together with this plugin.
- `capabilities`: free-form intent labels. `"render"` is required to import `src/sdk/render.ts`.
- `requiresRoles`: exclusive roles that must have a selected provider whenever this plugin is active. This is a
  selection requirement; it does not order plugin activation.
- `roleDependencies` (optional, default `[]`): roles whose selected provider-owning plugins must activate before this
  plugin. Also requires a valid selection. Use this when resolving an owner-bound factory in `activate`; the consumer
  depends on the role contract rather than a concrete implementation ID. Self-owner edges are ignored, and cycles
  are rejected during staging before the previous session is replaced.
- `preload` (optional, SDK 3): static asset paths relative to the site root (`"models/level.glb"`), loaded through the
  host asset service before `activate()` runs, so `Assets.peek()` works synchronously there. A missing file fails
  activation. See the [assets reference](../reference/assets.md).
- `config`: typed settings (`number` | `boolean` | `string` | `select` with `options`). A preset overrides them under
  `config["<plugin id>"]`; plugins read `ctx.config`.

Ranges support `^ ~ >= > <= < =`, `x`/`*` wildcards, space-separated AND and `||`.

### Resolution rules

Loading/registration follow concrete dependency order. Session activation additionally follows selected
`roleDependencies` provider owners; among plugins that are ready, the lexicographically smallest id goes first.
Session disposal is the exact reverse of activation. The host rejects, naming the plugins involved: missing or
disabled dependencies, version or SDK mismatches, cycles, duplicate ids, conflicts, unknown role providers and
ambiguous exclusive roles.

## 3. Lifecycle

```
discover manifests ─▶ validate graph ─▶ import code ─▶ register (dependency order, isolated registries)
   ─▶ load content entries ─▶ validators (cross-references, roles, config)
   ─▶ COMMIT: stop old session, dispose old registrations
   ─▶ new session: activate plugins (dependency order) ─▶ activate selected role providers
   ─▶ … play … ─▶ stop: dispose plugin scopes in reverse order
```

- Everything before COMMIT happens in **staged, isolated registries**. If anything fails there, the running game is
  untouched and you get a list of issues (`source`, field `path`, `message`).
- If activation fails, everything the attempt created is disposed and the app returns to an error screen.
- Changing the plugin set always goes through a full session restart on fresh registries.
- A system or event handler that throws during play **pauses the session** and reports the responsible plugin.

```ts
import { definePlugin } from '../../sdk/index.ts';

export default definePlugin({
  register(ctx) { /* definitions, factories, content kinds, role providers, validators. Start nothing. */ },
  activate(ctx) { /* per-session: systems, subscriptions, services, entities, UI and scene roots. */ },
});
```

**Rules**

1. No side effects and no mutable state at module scope. All state lives in closures created in `activate` (or in a
   factory's `start`), so a restart gets a clean slate.
2. Acquire everything through the context so it has an owner: `ctx.systems.add`, `ctx.events.on`,
   `ctx.services.provide`, `ctx.commands.handle`, `ctx.world.create`, `ui.mount(ctx, …)`, `render.createRoot(ctx, …)`.
   For anything else (DOM listeners, timers, audio nodes) call `ctx.scope.add(() => cleanup(), 'kind')`.
3. Async work: pass `ctx.signal` to cancellable APIs and wrap awaits in `ctx.guard(promise)` — it rejects with
   `ScopeDisposedError` if the session ended meanwhile. `ctx.scope.add` on a dead scope runs the cleanup immediately,
   so a late completion cannot attach a live resource.
4. Simulation plugins must not touch the DOM or rendering. Use `ctx.services.tryGet(Ui)` / `tryGet(Render)` and return
   early if absent so the plugin also runs headless (tests).
5. Gameplay randomness comes from `ctx.rng` (seeded per plugin from the preset `seed`). `ctx.cosmeticRng` is for
   visuals/audio only. Use `ctx.time.now` (simulation seconds) for cooldowns and timers — never `Date.now()`.

### RegisterContext

| Member | Purpose |
|---|---|
| `register(token, id, value)` | Add to a typed registry. Duplicate ids fail and name both owners. |
| `provideRole(role, id, provider)` | Offer a provider for an exclusive role. |
| `contentKind(kind, { description, load(data, c) })` | Teach the host a new kind of declarative content. |
| `defineContent(kind, id, data)` | Add content from code through the same loader data packs use. |
| `addValidator(v => …)` | Cross-reference checks after all plugins registered; report with `v.reporter(source, path).error(msg)`. |
| `config`, `manifest`, `pluginId`, `registries` (read), `scope` | |

### SessionContext

| Member | Purpose |
|---|---|
| `world` | Entities: `create()`, `destroy(id)`, `isAlive`, `add/get/has/remove(id, Component)`, `each(Component, fn)`, `first`, `count`. |
| `systems.add({ id, phase, order?, update(dt) })` | Fixed-step system (60 Hz). |
| `systems.addFrame({ id, order?, update(alpha, frameDt) })` | Once per rendered frame; `alpha` interpolates between ticks. |
| `events.on(Event, fn)` / `events.emit(Event, payload)` | Facts that already happened. |
| `commands.handle(Command, fn)` / `commands.dispatch(Command, payload)` | Requests to change gameplay; exactly one handler. |
| `services.provide/get/tryGet(Service)` | Immediate queries. |
| `registries` | Read-only: `get`, `require`, `has`, `entries`, `ids`, `ownerOf`. |
| `role(Role)` | `{ id, provider }` selected by the preset, or `undefined`. |
| `instantiate(Registry, id, (def, ownerCtx) => instance)` | Session-bound instance of a registered factory, created once per session **in the context of the plugin that registered it**. |
| `persist({ save, load })` | SDK 3: saves and restores state that lives outside components (closures, engine worlds) for snapshots, quicksave and replays. See [snapshots](../reference/snapshots.md). |
| `time` (`tick`, `now`, `step`), `rng`, `cosmeticRng`, `config`, `preset`, `log`, `scope`, `signal`, `guard` | |

## 4. Simulation model

- Fixed step 1/60 s. At most 5 ticks per rendered frame; backlog beyond that is discarded (the game slows down
  rather than spiralling after a stall).
- **Phases** (in order): `input`, `control`, `ai`, `movement`, `combat`, `damage`, `world`, `rules`, `presentation`.
  Inside a phase: ascending `order` (default 0), then id.
- **Entities** are numeric ids that are never reused within a session. `destroy()` takes effect immediately for
  queries (`isAlive` false, `get` undefined) and data is purged after the running system returns. `each()` iterates a
  snapshot: entities created during the pass are not visited, destroyed ones are skipped.
- **Events** emitted inside a system are delivered right after that system returns, before the next system, in
  emission order. Outside a tick they are delivered immediately.
- **Components are plain data.** Define your own with `defineComponent<T>('my-plugin/thing')`.
- **Input** is sampled once per tick: `input.tick.held(action)`, `.pressed(action)`, `.released(action)`, `.lookX`.
  Press/release edges and look deltas appear in exactly one tick even when several ticks run in one frame.
- **Coordinates:** metres, Y up, gameplay on the XZ plane. `yaw` 0 faces −Z, positive turns left.
  Use `yawDirX(yaw)`, `yawDirZ(yaw)`, `yawOf(dx, dz)`, `angleDelta(a, b)`.

### Damage resolution order

`combat.damage(req)` (or the `DealDamage` command) queues a request. In phase `damage`, FIFO:
stale or dead targets are skipped → `DamageModifiers` run in ascending `order` then id, each receiving the previous
amount → amounts ≤ 0 are dropped → hp is reduced → `Damaged` is emitted → at hp ≤ 0 the target is marked dead and
`Died` is emitted **exactly once**.

## 5. Extension points

All tokens are exported from `src/sdk/index.ts`; their TypeScript types are the authoritative reference
(`src/sdk/contracts/shooter.ts`).

### Registries

| Token | Value | Who uses it |
|---|---|---|
| `AttackBehaviors` | `{ description, validateParams?(params, r, registries), start(ctx) => (shot) => void }` | weapons and enemy attacks select one by id |
| `AiBehaviors` | `{ description, validateParams?, start(ctx) => (self, enemy, def, dt) => void }` | enemy definitions |
| `PickupEffects` | `{ description, validateParams?, start(ctx) => (target, params) => boolean }` | pickup definitions |
| `DamageModifiers` | `{ description, order, start(ctx) => (req, amount) => number }` | additive, ordered |
| `Prefabs` | `{ description, start(ctx) => (at, params) => EntityId }` | map spawns, `spawnPrefab(ctx, id, at, params)` |
| `MapFormats` | `{ description, build(id, data, r) => WorldDescription \| undefined }` | maps declare `format` |
| `InputActions` | `{ label, keys: ['KeyW', 'Mouse0', 'WheelUp', …] }` | bound by the input adapter, listed on the start screen |
| `Weapons`, `AmmoTypes`, `Enemies`, `Pickups`, `Maps` | plain definitions | filled from content |
| `ActorRenderers` (render SDK) | `{ description, start(ctx) => (entity, visual) => ActorHandle }` | `Visual.renderer` |

Factories (`start`) run once per session in the registering plugin's context — create systems, components and
subscriptions there; they are cleaned up with that plugin.

### Content kinds provided by the core plugins

`ammo`, `weapon`, `pickup` (core/combat), `enemy` (core/enemies), `map` (core/world). See `docs/reference/content-format.md`.

### Exclusive roles

The preset picks exactly one provider per role under `roles`. Replacing means selecting a different provider.

| Role token | Role id | Provider |
|---|---|---|
| `ControllerRole` | `sdk/controller` | `{ name, description, activate(ctx) }` — turns `Input` into the player's `Intent`/`Transform` |
| `CameraRole` | `sdk/camera` | same shape — provides the `View` service and updates it every frame |
| `ModeRole` | `sdk/mode` | same shape — spawning policy, objectives, end condition |
| `HudRole` | `sdk/hud` | same shape — player-facing HUD |
| `ThemeRole` | `sdk/theme` | `{ name, textures, sounds, visuals }` — the art and sound pack |

`activate(ctx)` of a selected provider runs after every plugin has activated, with the providing plugin's context.
Unselected providers never run.

`roleDependencies` orders the provider's **plugin activation**, not this later role callback. Prefer lazily
instantiated factories when consumers need a selected implementation during their own `activate`.

### Services

| Token | Provided by | Use |
|---|---|---|
| `World` | core/world | `desc`, `moveCircle`, `raycast` (ray or swept circle), `lineOfSight`, `isFree`, `findPath`, `doors()`, `door(id)`, `setDoorOpen`, `triggers()`, `version` |
| `Interactions` | core/world | `register(ctx, id, provider)` registers scoped Use candidates for single-target arbitration |
| `Profile` | host (optional) | synchronous `load`, `save`, and `clear` for versioned local profile values; operations return explicit results |
| `Combat` | core/combat | `damage`, `heal`, `hitscan`, `sweepActors`, `fireAttack`, `giveAmmo`, `giveWeapon` |
| `EnemyAi` | core/enemies | `spawn`, `findTarget`, `canSee`, `distanceTo`, `moveToward`, `moveDir`, `faceTarget`, `beginAttack`, `aliveCount` |
| `View` | selected camera | interpolated camera pose and the viewed entity |
| `Flow` | host | `setObjective`, `setStatus(key, label, value)`, `notify(text)`, `end({ outcome, title, detail, stats })`, `ended`, `revision` |
| `Input` | host | `tick` snapshot |
| `Audio` | host | `play(themeSoundKey, { gain, pan, rate })` |
| `Ui` | host (browser only) | `mount(ctx, 'hud' \| 'overlay', className)`, `addStyles(ctx, css)` |
| `Settings` | host | `lookSensitivity` |
| `Render` (render SDK) | host (browser only) | scene roots, cameras, owned and shared GPU resources |

Interaction providers return eligible `{ id, priority, distance, use }` candidates for the actor and pose. Lower
priority and then distance win; provider and candidate IDs break ties deterministically, except equally distant
built-in targets retain map order. Built-in switches use priority 0 and doors 1. The selected callback consumes the
Use press even when it denies the action. The returned disposer unregisters early; otherwise the owner's scope does.
Providers implement their own reach, facing and visibility checks. Cooperating plugins should use this service rather
than independently consuming `Intent.use`.

`Profile` stores strings, booleans and finite numbers, not session snapshots. Save replaces the whole profile; it does
not provide locking or atomic read-modify-write across tabs. Consumers should tolerate an absent service and report
storage errors. The arena mode uses it for a local best score.

Magazine weapons opt in with `WeaponDef.magazineSize` and `reloadTime`. `WeaponRuntime` holds loaded rounds and reload
state; `Inventory.ammo` holds reserve for these weapons. Starter magazines draw from starting ammo in slot order,
newly granted weapons start empty, reload completes in simulation time, and switching cancels a reload. Controllers
supporting reload write the optional `Intent.reload` edge each tick; stock FPS and dash controllers bind R. Weapons
without these fields retain shared-pool ammunition semantics.

### Components (public game state)

`Transform`, `Collider`, `Health`, `Intent`, `Player`, `Inventory`, `Enemy`, `Pickup`, `Visual`.
HUDs and modes read these directly: `ctx.world.get(playerId, Health)`.

### Events

`Damaged`, `Died`, `AttackFired`, `Impact`, `WeaponSwitched`, `WeaponDry`, `PickupCollected`, `EnemyAlerted`,
`DoorChanged`, `TriggerFired`, `UseFailed`, `FlowEnded`. Command: `DealDamage`.

## 6. Rendering SDK (`src/sdk/render.ts`)

```ts
import { Render, THREE, ActorRenderers } from '../../sdk/render.ts'; // manifest needs "render" in capabilities
```

`THREE` is official Three.js r187 (scene graph, `Mesh`, `BufferGeometry`, `PlaneGeometry`,
`BoxGeometry`, `MeshBasicMaterial`, `MeshLambertMaterial`, `CanvasTexture`, `PointLight`, …). You get real scene-graph
access inside roots you own:

- `render.createRoot(ctx, 'world' | 'view')` — an owned `Group`; detached automatically with your session scope.
  `view` is drawn after the world on a cleared depth buffer (first-person weapon models).
- `render.own(ctx, resource)` — ties a geometry/material/texture you created to your scope (`dispose()` is called).
- `render.shared(ctx, key, create)` — reference-counted resource shared across plugins; disposed with its last owner.
- `render.texture(ctx, key, painter, { repeat })` — shared nearest-filtered texture from a theme `Painter`.
- `render.camera`, `render.viewCamera`, `render.setEnvironment`, `render.stats`.
- `render.setWorldCamera(ctx, camera)` — select an owned `PerspectiveCamera` or `OrthographicCamera`. The most recently
  acquired live camera lease is active. Disposal restores the previous live lease or the default perspective camera;
  disposing an older lease cannot steal a newer view. Resize preserves an orthographic camera's vertical span and zoom.

Removing a mesh from the scene does **not** free GPU memory — always route resources through `own`/`shared`.

Gameplay refers to **theme keys** (`"enemy-grunt"`, `"pistol-fire"`), never to files or textures. The selected
`ThemeRole` provider maps keys to painters, visuals and sounds, so a different art pack needs no gameplay change.

### Migrating to SDK 3

Nothing breaks: SDK 3 is additive and the host keeps loading `^2.0.0` manifests. Change a manifest to `^3.0.0` when
the plugin starts using an SDK 3 API (entity queries, `Transform3D` / `Renderable`, render sync, physics, assets,
input axes, audio buses, snapshots), so older hosts reject it cleanly. New families should use `Transform3D` with
`std/transform` and `std/render-sync` ([spatial reference](../reference/spatial.md)) instead of the shooter's planar
`Transform`; shooter presets can opt into both through the `shooter/transform3d` bridge.

### Migrating rendering plugins to SDK 2

The host's registration, services, entities and shooter tokens retain their identity. The rendering namespace changed
incompatibly from mini3 to official Three.js, so bundled manifests now declare `"sdk": "^2.0.0"`. SDK-1-only plugins are
rejected by staging rather than silently run with incompatible rendering semantics.

- Set colors through `material.color.setHex(value)`, `material.emissive.setHex(value)` and `light.color.setHex(value)`;
  scene backgrounds use `new THREE.Color(value)`. Constructor color parameters still accept numeric colors.
- Three.js defaults to XYZ Euler order; the host's legacy cameras explicitly use YXZ. Set an appropriate order on
  custom cameras/objects when relying on the original convention.
- Painted color textures use `SRGBColorSpace`; the render host outputs sRGB with no tone mapping. Lighting and colors
  need visual review: the old renderer's point-light attenuation is not Three.js's lighting model.
- Keep ownership through `render.own/shared/texture/createRoot`. Removing a mesh still does not dispose its resources.
- Core Three.js facilities such as orthographic cameras, raycasting and animation are available. Addon loaders such as
  `GLTFLoader` still need a boundary-compliant SDK/adapter integration; a general async model/asset service is not supplied.

### Experience and contextual input contracts

`ExperienceRole` (`sdk/experience`) is an optional metadata-only role:

```ts
ctx.provideRole(ExperienceRole, 'my-game/experience', {
  name: 'My game', description: 'Select a unit and plan your move.', pointer: 'free',
  controls: [['Click', 'Select'], ['Enter', 'Commit']],
});
```

`pointer` is `locked`, `free` or `none`. Without the role the app preserves first-person capture behavior. A selected
controls list replaces the launcher's default FPS controls. Native UI focus owns its keys/clicks; pause remains available.
`SessionControl.playing` is a read-only host gate for gameplay ingress. Presentation callbacks reject requests when it is
false, and family authorities commit accepted semantic commands in their simulation systems.

The optional host service `InputContexts` creates owner-scoped input snapshots:

```ts
const context = ctx.services.get(InputContexts).create(ctx, {
  priority: 10, consume: true, exclusive: true,
  bindings: [{ action: 'confirm', keys: ['Enter', 'Space'] }],
});
// context.tick.held/pressed/released, lookX/lookY, pointer
context.setEnabled(false); // Cancels held state; re-enable after closing the overlay.
```

Contexts run in descending priority. A consuming context claims matching keys; an exclusive context also blocks
unmapped keys and pointer input from lower contexts and legacy actions. Context transitions cancel held input and
require a physical release before a held key can enter its new context. `dispose()` releases early; scope disposal does
it automatically. `Input.tick.pointer` is an optional sampled `{ x, y, inside }` in canvas-local CSS pixels, allowing
older headless input fakes to omit it. These APIs provide contextual bindings, not a shipped user rebinding/gamepad UI.

### Independent family contracts

| Contract | Authority | Separate consumers and authoring |
|---|---|---|
| `Race`, `RaceTracks` | `vehicle/racing` owns motion, gates, laps and deadline | `vehicle/presentation`, `vehicle-track` content; [guide](../../games/racing/README.md) |
| `Tactics`, `TacticsMissions` | `board/tactics` owns units, AP and queued turn commands | `board/presentation`, `board-mission` content; [guide](../../games/tactics/README.md) |
| `Adventure`, `AdventureChapters` | `story/adventure` owns room/item/flag state and queued actions | `story/presentation`, `adventure-chapter` content; [guide](../../games/adventure/README.md) |
| `PushPuzzle`, `PuzzleCampaigns` | `puzzle/rules` owns stones, plates, deterministic pursuit, undo and chamber progression | `puzzle/presentation`, `push-puzzle` content; [guide](../../games/puzzles/docs/stonewake.md) |
| `Sky`, `SkyRoutes` | `sky/game` composes recovery, matching deliveries and moving hazards | `sky/presentation`, `sky-route` content; [guide](../../games/sky/README.md) |
| `Ember`, `EmberConfigs` | `ember/game` composes construction, lanes, waves and per-tower firing | `ember/presentation`, `ember-defense` content; [guide](../../games/ember/README.md) |
| `Verdant`, `VerdantWorlds` | `verdant/game` composes restoration decisions and environmental drain | `verdant/presentation`, `verdant-world` content; [guide](../../games/verdant/README.md) |

These contracts are exported by `src/sdk/index.ts`; consumers never import another plugin. The families omit shooter
systems entirely. Tactics/adventure/puzzles retain the 60 Hz scheduler for ingress, but idle ticks do not advance their
authoritative turn/story state. This is not a universal turn wrapper for existing shooter systems.

### Reusable cross-genre mechanics

`Cinder` (`cinder/run`) is a shooter-family service exposing detached `CinderState` observations and bounded semantic
commands (`choose`, `pulse`, `choose-class`, `choose-threat`, `end-turn`, `toggle-inventory`, `inventory-move`, `inventory-confirm`,
`inventory-filter`, `inventory-drop`, `toggle-crafting`, `crafting-move`, `crafting-confirm`, `craft`, `toggle-grid`,
`iso-click`, `toggle-help`, `dialogue-choice`, `dialogue-close`). It reports class/mastery, selected/best threat, action
points/round and an isometric hover preview, total/engaged enemy intent counts, depth, non-blocking in-level XP and offers,
owned weapons, stacked boons, inventory/equipment, known recipes, fogged map state, nearby NPC and dialogue, and
warden/Keeper enrage state. `CinderOffer` is a discriminated union of weapon and relic
cards; stale offer epochs cannot claim a reward after a newer draw. `cinder/game` composes seven selected mechanic roles
(resources, clock, actions, objectives, progression, inventory, crafting) beneath this family authority and owns a one-tile
action-point turn loop with telegraphed enemy actions, opt-in threat tiers, behavioral elites and boss enrage phases. It also
owns optional NPCs/Oracle bargains, pack filtering/drop, known-recipe forge, fogged automap/grid data and a selection of
`presentation/camera-modes` for the reusable first-person/isometric camera. New enemy definitions may select the
`cinder/manual` AI behavior: a validated metadata/no-op hook (`actions`, `supportHeal`, `preferredRange`) read by Cinder's
manual enemy turn, not an autonomous AI. `cinder/hud` independently presents the non-modal class/threat select, pack,
forge, dialogue, field guide, automap/grid, view badge, turn bar, AP/attack hover hint, boon tray and depth waypoint.
`TurnControl` is installed to suspend real-time enemy AI; the game does not
use `sdk/mechanic-sequence`. Dungeon wings are emitted as room markers by `dungeon/generator`. See
[Cinder Vault](../../games/cinder/README.md), [classes/loot](../../games/cinder/docs/classes.md), [inventory](../reference/inventory.md),
[crafting](../reference/crafting.md), [camera modes](../reference/camera-modes.md), [dungeon generator](../reference/dungeon-generator.md) and
[progression](../reference/progression.md).

#### Hollowmere and the composition canvas

Hollowmere is a side-scrolling metroidvania family. `mechanics/platforming` provides `PlatformerRole` and a pure
AABB movement handle (coyote/jump buffer, variable jump, double jump, dash, wall slide/jump).
`mechanics/capabilities` provides `CapabilityRole` and named unlock/rank handles; `mechanics/room-map` provides
`RoomMapRole` and current/visited/revealed room handles. All three are cross-genre and own no game content. The game
selects them alongside `mechanics/inventory`. `hollowmere/game` provides `Metroidvania` and the
`metroidvania-world` content kind; `hollowmere/presentation` provides `sdk/hud`; `hollowmere/content` supplies the
world and items. See [Hollowmere](../../games/hollowmere/README.md).

The app-level game composition canvas is not a plugin: it edits a versioned `GameGraph` and compiles to a preset. Its pure
model is `src/app/game-graph.ts`; provider offers come from the generated `src/app/catalog-providers.json`; validation
is staged through the host. `npm run graph` is the agent/CLI surface. See [game composer](../reference/game-composer.md).

#### Selectable building blocks

`NavigationRole` (`sdk/mechanic-navigation`) selects a pure graph-query provider. The bundled `mechanics/navigation`
implementation searches finite directed graphs with unit-cost edges, preserving caller-specified neighbor order for
equal-length ties. Stonewake supplies legal pursuit graphs; Signal Break supplies movement graphs and converts step
distances to AP locally. The provider owns no session state and installs no systems. See [navigation](../reference/navigation.md).

`SequenceProviders` factories selected by `SequenceMechanicRole` (`sdk/mechanic-sequence`) own ordered cursors with
finite repeated rounds. `sequenceMechanic(ctx)` resolves the selected factory. NEON RUN and Foundry Circuit retain
their different crossing/timeout policies and delegate accepted checkpoint progression to the same implementation.
These are two game compositions within racing; other genre uses are potential compositions, not tested consumers.
See [sequences](../reference/sequences.md).

`OutcomeRatingProviders` factories selected by `OutcomeRatingRole` (`sdk/mechanic-outcome-rating`) classify explicit
finite metrics against ordered inclusive thresholds. `outcomeRatingMechanic(ctx)` resolves the selected factory;
the consumer creates an owned evaluator and disposes it after use. The last matching tier wins. Racing supplies elapsed
time while tactics supplies turns and survivors; games retain outcome, threshold, reward and persistence policy.
The role is optional for these two consumers and is resolved on victory after role activation. See
[outcome ratings](../reference/portfolio-shared-mechanics.md).

`CardPilesProviders` factories selected by `CardPilesRole` (`sdk/portfolio-card-piles`) own a bounded partition of
unique card IDs in ordered draw, hand and discard zones. `cardPilesMechanic(ctx)` resolves the selected factory. Ash &
Ink and Cloud Cartographer supply different actions and outcomes while using the same provider. Draws and discards
are blocked while `SessionControl` is paused; initialize an opening hand after play starts. No shuffle, card effects,
turns or reshuffle are provided. See [card games and piles](../../games/puzzles/docs/portfolio-cards.md).

Presets explicitly enable the selected implementations. Navigation consumers require the pure registration-time role;
sequence consumers using factories during activation declare `roleDependencies`. Updated bundled presets contain the
new selections. Existing custom presets using the migrated authorities need the matching role/provider fragment;
their game service signatures and authored track/chamber/mission formats remain unchanged.

`createOwnedInstances(provider, kind)` shares provider/consumer lifetime and live-ID bookkeeping for stateful factories.
Use one pool per factory namespace; validate definitions before `acquire(owner, id)`. Leases release both scope entries
on early disposal and prevent stale handles from affecting a replacement. It owns identity/lifetime, not state, pause
policy or notifications. Clock, sequence and progression providers use it. See [owned instances](../reference/owned-instances.md).

`ProgressionProviders` factories selected by `ProgressionMechanicRole` (`sdk/mechanic-progression`) own linear XP curves,
level counts and pending game-defined rewards. XP grants can complete several levels atomically; the game applies its own
stat/perk effects and calls `consumeLevel` after committing a reward. Cinder Vault uses this for in-level boons that do
not pause combat. See [experience and levels](../reference/progression.md).

`InventoryProviders` factories selected by `InventoryMechanicRole` (`sdk/mechanic-inventory`) own bounded item stacks and
optional equipment-slot assignments. The plugin registers the `item` content kind. Consumers own item effects, stats,
loot rolls, UI and persistence; add/remove/equip/unequip are atomic. See [stack inventory](../reference/inventory.md).

`presentation/camera-modes` is a reusable `CameraRole` provider with a first-person view and an orthographic isometric
follow view. It publishes `View` and the optional `ViewModes` service (`mode`, `yaw`, `set`, `toggle`, `rotate`,
`pickGround`); `ViewModeChanged` reports successful changes. `pickGround` maps a CSS-pixel position through the active
orthographic camera to the ground plane for consumer click actions. `core-presentation` consumes `ViewModes` to hide ceiling quads, first-person weapon models and fog in
overhead modes. First-person weapon sprites use a smaller bottom-center pivot; see
[weapon presentation](../reference/weapon-rig.md).

`presentation/player-avatar` is an optional overhead presenter. A consumer adds `PlayerAvatar`
(`{ visual, scale, y }`) to its player; while `ViewModes` is isometric the plugin attaches a theme `Visual` body and removes
it in first person. It manages only the body presentation component, not animation graphs, equipment or collision. Cinder
uses Assetrizz knight/mage/rogue visuals per class. See [camera modes](../reference/camera-modes.md).

`CraftingProviders` factories selected by `CraftingMechanicRole` (`sdk/mechanic-crafting`) execute deterministic known
item-to-item recipes through a selected inventory handle. The plugin registers `crafting-recipe` content. Preview is pure;
craft rechecks, consumes all inputs and restores them if output placement fails. Cinder owns Ember Shard drops, run-ember
costs, the NPC forge and pack UI. See [crafting](../reference/crafting.md).

`dungeon/generator` is a content-driven map format rather than an exclusive role. It emits one `WorldDescription` with up
to three isolated dungeon wings, combined with its rooms/corridors and inert `dungeon/marker` spawn points. The consuming
mode supplies enemies/loot and owns wing transitions. See [seeded dungeon rooms](../reference/dungeon-generator.md).

`TurnControl` (`sdk/turn-control`) is a presence-only service for modes that own discrete actions. While installed,
`core/enemies` suppresses its autonomous think/separation systems; the mode must execute enemy turns. It reports phase,
round and action points for presentation. Absence restores real-time AI. Cinder Vault uses it for one-tile action-point
combat; see [Cinder Vault](../../games/cinder/README.md).

#### Resource/action/clock/objective composition

`ResourcePoolProviders`, `MechanicClockProviders`, `MechanicActionProviders` and `ObjectiveProviders` expose independent
factories selected by `ResourceMechanicRole`, `ClockMechanicRole`, `ActionMechanicRole` and `ObjectiveMechanicRole`.
`createMechanicKit(ctx, definitionId, instanceId)` assembles them from a validated `MechanicKits` definition.
`resourceMechanic`, `clockMechanic`, `actionMechanic` and `objectiveMechanic` also resolve each independently. All handles
are per-consumer, explicitly disposable, and reject paused/stale writes. Replacing a selected factory needs no game
source change. Sky, Ember and Verdant share the implementations and use different orchestration/time domains.

Read [the complete mechanic API, transaction semantics, limits and substitution examples](../reference/reusable-mechanics.md).
The typed events `MechanicResourcesChanged`, `MechanicActionCommitted` and `MechanicObjectiveChanged` carry owner and
instance IDs. No new gameplay logic lives in the generic kernel.

Two additive SDK helpers share orchestration below the family services:

- `createCommandQueue` owns bounded semantic ingress, pause/disposal gating and explicit FIFO draining. The consumer
  normalizes/copies input and chooses single-command or snapshot-batch processing. Stonewake and The Last Light use the
  same helper with different processing policies. See [command queue API and semantics](../reference/command-queues.md).
- `createDeadline` borrows a `MechanicClock` for arm/cancel/due/remaining queries in its seconds or turns domain. It does
  not advance or dispose that clock. Sky uses deadlines for temporary flight effects; Verdant uses them for environmental
  and season boundaries. See [deadline API and boundary behavior](../reference/deadlines.md).

These helpers require no new exclusive roles and install no systems. Resolve any needed clock through its existing role.
Game authorities retain command legality, drain cadence, time advancement and local effects. Action cooldowns continue
to belong to `MechanicActions`. A queue's accepted ingress is distinct from an action's resource/cooldown commitment,
which is distinct from a completed game-local outcome.

Provider compatibility includes observable behavior as well as TypeScript signatures. Use
[resource conformance cases](../reference/mechanic-conformance.md) and the
[capability design/evidence template](../cookbook/reusable-capability-template.md) when extending a public seam. Optional
services need an explicit absence policy; observation snapshots are not automatically complete saves.

Validators can call `v.roleProviders(role)` to obtain enabled `{ id, owner, value }` registry entries. Prefer checking
actual provided contracts over rejecting a plugin's namespace. `v.selectedRole(role)` still returns the preset's
selected provider ID only.

`PushPuzzle` exposes a frozen `campaign`, a monotonically increasing `revision`, detached `state()` snapshots and
`enqueue(PuzzleCommand): boolean`. Commands are `move` with a cardinal `direction`, `wait`, `undo`, `restart`, `next`
and `replay`; at most 32 are queued, one commits per `control` tick. Paused/disposed services reject ingress. The
`PuzzleResolved` event carries a semantic sound cue only after a turn or undo commits. See
`games/puzzles/contracts/puzzle.ts` for types and the game guide for rules and limits. This is additive to SDK 2.

## 7. How do I…

**Add a weapon (data).** Content entry of kind `weapon` selecting an existing behaviour
(`core/hitscan`, `core/projectile`, `core/melee`). Mark it `"starter": true` to put it in the default loadout, or
hand it out with a `pickup` using effect `core/give-weapon`. Each weapon needs a unique `slot` (1–9).

**Add a weapon behaviour (code).** `ctx.register(AttackBehaviors, 'my/behavior', { validateParams, start })`.
`start(ctx)` returns the fire function and may add systems and private components. Query walls with
`World.raycast` (pass a radius for a swept circle), actors with `Combat.sweepActors`, deal damage with
`Combat.damage`, and emit `Impact` for feedback. Then define a weapon in data that names the behaviour.

**Add an enemy (data).** Content entry of kind `enemy` choosing an `ai` (`core/chaser`, `core/ranged`) and an
`attack.behavior`. A prefab with the same id is registered automatically; place it in a map's `spawns`.

**Add enemy AI (code).** `ctx.register(AiBehaviors, 'my/ai', { start(ctx) { const ai = ctx.services.get(EnemyAi); return (self, enemy, def, dt) => { … } } })`.

**Add a map (data).** Content entry of kind `map` with `"format": "core/grid"`; select it with preset
`options.map`.

**Add a custom system (code).** `ctx.systems.add({ id: 'my/regen', phase: 'rules', update(dt) { … } })` in `activate`.

**Add a game mode (code).** `ctx.provideRole(ModeRole, 'my/mode', { name, description, activate(ctx) { … } })`.
The mode spawns the player and whatever else it wants (`spawnPrefab`), reports through `Flow`, and calls `flow.end`.
Add a validator if the mode needs something from the map.

**Replace the HUD (code).** `ctx.provideRole(HudRole, 'my/hud', { …, activate(ctx) { const ui = ctx.services.tryGet(Ui); if (!ui) return; const root = ui.mount(ctx, 'hud', 'my-hud'); … } })`
and select it in the preset. The previous HUD's provider is simply never activated.

**Add a custom actor renderer (code, render capability).**
`ctx.register(ActorRenderers, 'my/renderer', { description, start(ctx) { return (entity, visual) => ({ object, update(frame) {…}, dispose() {…} }) } })`,
then set `Visual.renderer = 'my/renderer'` on the entities that should use it.

## 8. Tutorial: your first plugin (≈5 minutes)

Goal: a plugin that slowly regenerates the player's health and says so on the HUD.

1. Scaffold: `npm run new-plugin -- example/regen "Health Regen"` creates `src/plugins/example-regen/` from
   `templates/plugin-starter/`; the generated catalog picks it up.
2. Add `"example/regen"` to `plugins` in
   `games/shooter/presets/default.json`.
3. Replace `activate` in `src/plugins/example-regen/index.ts`:

```ts
import { Combat, Flow, Player, definePlugin } from '../../sdk/index.ts';

export default definePlugin({
  activate(ctx) {
    const combat = ctx.services.get(Combat);
    ctx.services.get(Flow).notify('Regeneration online');
    let next = 1;
    ctx.systems.add({
      id: 'example/regen.tick',
      phase: 'rules',
      update() {
        if (ctx.time.now < next) return;
        next = ctx.time.now + 1;
        ctx.world.each(Player, (e) => void combat.heal(e, 2));
      },
    });
  },
});
```

4. Add `"dependencies": { "core/combat": "^1.0.0" }` to its manifest (it uses the `Combat` service).
5. `npm run dev`, take damage, and watch health tick back up. `npm run check` must stay green.
6. Remove the id from the preset (or untick it in the creator panel, **`** key) and restart: the system is gone.

## 9. Testing a plugin headlessly

`tests/helpers/game.ts` builds the real host with the gameplay plugins and fake platform services:

See `tests/ext-ricochet.test.ts` for a working example with imports, catalog, preset, assertions and teardown. The
`headlessPreset` override is shallow: passing `plugins` replaces the whole default list. Include the required core
plugins as well as your extension. The harness supplies input and flow, but no UI or renderer; test presentation in a
browser as well. Call `game.host.stop()` during teardown.

## 10. Limits of v1 (be honest with yourself)

The SDK covers the extension points the reference game exercises. Fundamentally new capabilities — vertical
movement and stacked floors, non-grid collision, networking, save/load migration, skeletal animation — will need a
versioned SDK extension, not just JSON. See `docs/reference/spec.md` and `docs/archive/devplan.md`.

## Appendix A — API reference (signatures)

The types below are defined by the runtime and re-exported from `src/sdk/index.ts`. They are part of the public
contract; this appendix exists so plugin authors never need to open `src/kernel`.

```ts
interface EntityApi {                       // ctx.world
  create(): EntityId;                       // owned by the calling plugin
  destroy(id: EntityId): void;
  isAlive(id: EntityId): boolean;
  add<T>(id: EntityId, c: ComponentToken<T>, data: T): T;
  get<T>(id: EntityId, c: ComponentToken<T>): T | undefined;   // undefined for dead/stale ids
  has(id: EntityId, c: ComponentToken<unknown>): boolean;
  remove(id: EntityId, c: ComponentToken<unknown>): void;
  each<T>(c: ComponentToken<T>, fn: (id: EntityId, data: T) => void): void;
  first(c: ComponentToken<unknown>): EntityId | undefined;
  count(c?: ComponentToken<unknown>): number;
  ownerOf(id: EntityId): string | undefined;
  query(spec: { with: ComponentToken<unknown>[]; without?: ComponentToken<unknown>[] }): Query;  // SDK 3; see docs/reference/queries.md
  markChanged(id: EntityId, c: ComponentToken<unknown>): void;  // SDK 3: report an in-place mutation to queries
}

interface Query {                           // cached, disposed with the plugin's session scope
  readonly size: number;
  each(fn: (id: EntityId) => void): void;   // snapshot-safe, match order
  ids(): EntityId[];
  has(id: EntityId): boolean;
  peek(): QueryChanges;                     // { added, removed, changed } since the last drain
  drain(): QueryChanges;                    // same, then clears this handle's tracking
  dispose(): void;
}

interface RegistryReader {                  // ctx.registries, v.registries
  get<T>(t: RegistryToken<T>, id: string): T | undefined;
  require<T>(t: RegistryToken<T>, id: string): T;              // throws with the list of known ids
  has(t: RegistryToken<unknown>, id: string): boolean;
  ownerOf(t: RegistryToken<unknown>, id: string): string | undefined;
  entries<T>(t: RegistryToken<T>): { id: string; value: T; owner: string }[];
  ids(t: RegistryToken<unknown>): string[];
}

interface ValidationContext {               // ctx.addValidator(v => …)
  registries: RegistryReader;               // every enabled plugin and pack has registered by now
  preset: GamePreset;                       // raw preset: preset.config holds overrides only
  activePlugins: readonly string[];
  selectedRole(role: RoleToken<unknown>): string | undefined;
  reporter(source: string, path?: string): Reporter;
}

class Reporter {                            // path-tracking error sink
  at(key: string | number): Reporter;       // r.at('spawns').at(3).at('prefab') -> "spawns[3].prefab"
  error(message: string): undefined;
}
// Helpers return the typed value, or undefined after reporting:
vString(v, r, { max?, nonEmpty? })   vNumber(v, r, { min?, max?, int? })   vBool(v, r)   vId(v, r)
vObject(v, r)   vArray(v, r, { min?, max? })   vOneOf(v, r, ['a', 'b'] as const)   vJson(v, r)   isObject(v)

interface Rng {                             // ctx.rng (seeded, private stream per plugin), ctx.cosmeticRng
  next(): number;                           // [0, 1)
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;          // do not call with an empty list
  fork(name: string): Rng;
}
```

Notes that the type signatures do not make obvious:

- **`ctx.config` is fully resolved** in both `register` and `activate`: manifest defaults overlaid with the preset's
  overrides, already validated against type/min/max/options. Validators that need a setting should close over
  `ctx.config` from `register` (the `ValidationContext` only exposes the raw preset).
- **Validators run after all registration**, so content from every enabled pack (maps, weapons, …) is visible. The
  selected map id is `preset.options.map`; `core/world` already reports a missing or unknown map.
- **Factories start lazily.** A behaviour's `start(ctx)` runs the first time something uses it in a session (first
  shot, first AI tick), not at activation. Systems it adds appear from the following tick.
- **Role activation order:** selected providers activate after all plugins, ordered by their owning plugin's
  activation order, then role id. Do not rely on another role having run: look services up lazily
  (`ctx.services.tryGet(View)` inside a frame system). The **mode** creates the player
  (`spawnPrefab(ctx, 'core/player', world.desc.playerStart)`); controller and camera find it via the `Player`
  component at run time.
- **`defineContent` from `register`** goes through the same loader as pack content, so the plugin defining the content
  kind must be a dependency (it registers first). References (ammo type, behaviour, prefab) are checked by validators
  against all enabled plugins — depend on the pack or plugin that provides them.
- **`World.raycast`** with a radius is an exact swept circle (boxes inflated by the radius, with rounded corners):
  `t` is the distance the circle's *centre* travels, `(x, z)` is the centre at contact, and the normal is the unit
  vector from the contact surface to the centre — axis-aligned on faces, diagonal on a convex box corner. A query
  that starts overlapping returns `t = 0`. Keep a small offset from surfaces after a bounce.
- **`validateParams(params, r, registries)`** receives the raw params exactly as written in the definition (no
  defaults filled in). Enforce required params and ranges yourself, reject unknown keys, and use `registries` to check
  references to other content.
- **`Combat.sweepActors`** tests a circle of `radius` against each living collider (radii add). It ignores walls —
  limit `maxDist` with a wall query first. `AttackShot.x/z` is the shooter's centre.
- **`Impact`**: `effect` is a theme visual key played once, `sound` a theme sound key, `target` is 0 for walls, and the
  normal points away from the surface (for actors: opposite to the travel direction).
- **After death** the entity stays alive as a corpse: `Health.dead` is true, enemies lose their `Collider`, and
  `Enemy.state` is `"dead"`. Components are still readable in `Died` handlers. Collected pickups are destroyed
  (`isAlive` becomes false) after `PickupCollected`.
- **`Flow.end`** marks the run ended and emits `FlowEnded`; the browser host keeps simulating for about 1.1 s (the `ending` state, so the last hit and death effects play out) and then shows the result screen.
  Headless sessions keep ticking — modes must stop spawning once `flow.ended` is true.
- Weapon switching blocks firing for 0.3 s of simulation time.
- `Transform.prev*` is maintained for every entity by `core/world` at the start of each tick; set `prev*` yourself
  only when you teleport something.

## Appendix B — test session API

`game.session()` returns the running session; `game.host` the plugin host.

| Member | Use |
|---|---|
| `session.entities` | `first/get/has/add/remove/each/count/isAlive/destroy/snapshot()` (same as `EntityApi`, plus `create(owner)`) |
| `session.services.get(Token)` | any service, e.g. `World`, `Combat`, `Flow` |
| `session.registries` | `has/get/require/entries/ids/ownerOf` |
| `session.events.on(Event, fn, 'test', session.scope)` | observe events |
| `session.commands.dispatch(Command, payload)` | issue commands |
| `session.scheduler` | `runTick()`, `advance(seconds)`, `tick`, `time`, `describe()` → `{ id, owner, phase, order, ms }[]` |
| `session.state`, `session.fault` | `'running'` / `'faulted'` and the responsible plugin |
| `host.apply(preset, extraCatalogEntries?)` | stage + switch; rejects with `HostError` (`stage`, `issues`, `pluginId`) |
| `host.restart()`, `host.stop()`, `host.resourceReport()` | lifecycle and leak checks (`byOwner` groups by plugin) |

A catalog entry is `{ manifest, load?: () => import('…/index.ts'), content?: [...] }`. To get a `SessionContext`
inside a test, add a tiny probe plugin whose `activate` stores `ctx`. To place actors exactly, write their
`Transform` (`x`, `z`, `prevX`, `prevZ`, `yaw`).
