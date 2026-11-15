# Plugins and the public SDK

Everything in the reference game — weapons, enemies, maps, rules, HUD, rendering — is a plugin or a content pack
built on the API described here. Third-party authors get exactly the same API.

- **SDK version:** `1.0.0` (`SDK_VERSION`). Manifests declare a compatible range in `sdk`.
- **One entry point:** `src/sdk/index.ts`. Rendering plugins may additionally import `src/sdk/render.ts`.
- **Enforced:** `npm run lint` (`scripts/boundaries.ts`) fails if a plugin imports anything else — the kernel,
  platform adapters, the app, another plugin's files, or an npm package.

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

**Discovery is build-time.** `src/app/catalog.ts` lists the plugins compiled into the app. Adding a local plugin means
adding its folder and one catalog line (plus naming it in a preset). A deployed build cannot install new JavaScript;
it can import data packs.

## 2. Anatomy

```
src/plugins/my-plugin/
  manifest.json     # validated before any code is imported
  index.ts          # default export: definePlugin({ register, activate })
  content.json      # optional: declarative content entries shipped with the plugin
```

### manifest.json (schema 1)

```json
{
  "schema": 1,
  "id": "example/ricochet",
  "name": "Ricochet Rifle",
  "version": "1.0.0",
  "kind": "code",
  "sdk": "^1.0.0",
  "description": "…",
  "dependencies": { "core/combat": "^1.0.0" },
  "optionalDependencies": {},
  "conflicts": [],
  "capabilities": ["simulation"],
  "requiresRoles": [],
  "config": { "bounces": { "type": "number", "label": "Max bounces", "default": 3, "min": 0, "max": 8 } }
}
```

- `id` is namespaced (`namespace/name`, lowercase, digits, `-`). One installed version per id.
- `kind`: `"code"` or `"content"`.
- `dependencies` must be **enabled in the preset** (they are never auto-enabled) and satisfy the range.
  `optionalDependencies` may be absent; if enabled, the range must match and the plugin activates after them.
- `conflicts`: ids that cannot be enabled together with this plugin.
- `capabilities`: free-form intent labels. `"render"` is required to import `src/sdk/render.ts`.
- `requiresRoles`: exclusive roles that must have a selected provider whenever this plugin is active.
- `config`: typed settings (`number` | `boolean` | `string` | `select` with `options`). A preset overrides them under
  `config["<plugin id>"]`; plugins read `ctx.config`.

Ranges support `^ ~ >= > <= < =`, `x`/`*` wildcards, space-separated AND and `||`.

### Resolution rules

Activation order is a topological sort of the enabled plugins; among plugins that are ready, the lexicographically
smallest id goes first. Disposal is the exact reverse. The host rejects, naming the plugins involved: missing or
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
| `AttackBehaviors` | `{ description, validateParams?(params, r), start(ctx) => (shot) => void }` | weapons and enemy attacks select one by id |
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

`ammo`, `weapon`, `pickup` (core/combat), `enemy` (core/enemies), `map` (core/world). See `CONTENT_FORMAT.md`.

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

### Services

| Token | Provided by | Use |
|---|---|---|
| `World` | core/world | `desc`, `moveCircle`, `raycast` (ray or swept circle), `lineOfSight`, `isFree`, `findPath`, `doors()`, `door(id)`, `setDoorOpen`, `triggers()`, `version` |
| `Combat` | core/combat | `damage`, `heal`, `hitscan`, `sweepActors`, `fireAttack`, `giveAmmo`, `giveWeapon` |
| `EnemyAi` | core/enemies | `spawn`, `findTarget`, `canSee`, `distanceTo`, `moveToward`, `moveDir`, `faceTarget`, `beginAttack`, `aliveCount` |
| `View` | selected camera | interpolated camera pose and the viewed entity |
| `Flow` | host | `setObjective`, `setStatus(key, label, value)`, `notify(text)`, `end({ outcome, title, detail, stats })`, `ended`, `revision` |
| `Input` | host | `tick` snapshot |
| `Audio` | host | `play(themeSoundKey, { gain, pan, rate })` |
| `Ui` | host (browser only) | `mount(ctx, 'hud' \| 'overlay', className)`, `addStyles(ctx, css)` |
| `Settings` | host | `lookSensitivity` |
| `Render` (render SDK) | host (browser only) | scene roots, cameras, owned and shared GPU resources |

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

`THREE` is the project's Three.js-style rendering namespace (scene graph, `Mesh`, `BufferGeometry`, `PlaneGeometry`,
`BoxGeometry`, `MeshBasicMaterial`, `MeshLambertMaterial`, `CanvasTexture`, `PointLight`, …). You get real scene-graph
access inside roots you own:

- `render.createRoot(ctx, 'world' | 'view')` — an owned `Group`; detached automatically with your session scope.
  `view` is drawn after the world on a cleared depth buffer (first-person weapon models).
- `render.own(ctx, resource)` — ties a geometry/material/texture you created to your scope (`dispose()` is called).
- `render.shared(ctx, key, create)` — reference-counted resource shared across plugins; disposed with its last owner.
- `render.texture(ctx, key, painter, { repeat })` — shared nearest-filtered texture from a theme `Painter`.
- `render.camera`, `render.viewCamera`, `render.setEnvironment`, `render.stats`.

Removing a mesh from the scene does **not** free GPU memory — always route resources through `own`/`shared`.

Gameplay refers to **theme keys** (`"enemy-grunt"`, `"pistol-fire"`), never to files or textures. The selected
`ThemeRole` provider maps keys to painters, visuals and sounds, so a different art pack needs no gameplay change.

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
   `templates/plugin-starter/` and prints the two lines to paste.
2. Paste the catalog line into `src/app/catalog.ts`, and add `"example/regen"` to `plugins` in
   `src/content/presets/default.json`.
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

```ts
const game = createHeadlessGame([{ manifest, load: () => import('../src/plugins/my-plugin/index.ts') }]);
await game.host.apply(headlessPreset({ plugins: [...] }));
game.input.press('core/fire');
game.ticks(60);
```

## 10. Limits of v1 (be honest with yourself)

The SDK covers the extension points the reference game exercises. Fundamentally new capabilities — vertical
movement and stacked floors, non-grid collision, networking, save/load migration, skeletal animation — will need a
versioned SDK extension, not just JSON. See `SPEC.md` and `devplan.md`.

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
- **`World.raycast`** with a radius is a swept circle against boxes inflated by that radius: `t` is the distance the
  circle's *centre* travels, `(x, z)` is the centre at contact, and the normal is always axis-aligned (at a convex
  corner it is the face that was entered). A query that starts overlapping returns `t = 0`. Keep a small offset from
  surfaces after a bounce.
- **`Combat.sweepActors`** tests a circle of `radius` against each living collider (radii add). It ignores walls —
  limit `maxDist` with a wall query first. `AttackShot.x/z` is the shooter's centre.
- **`Impact`**: `effect` is a theme visual key played once, `sound` a theme sound key, `target` is 0 for walls, and the
  normal points away from the surface (for actors: opposite to the travel direction).
- **After death** the entity stays alive as a corpse: `Health.dead` is true, enemies lose their `Collider`, and
  `Enemy.state` is `"dead"`. Components are still readable in `Died` handlers. Collected pickups are destroyed
  (`isAlive` becomes false) after `PickupCollected`.
- **`Flow.end`** marks the run ended and emits `FlowEnded`; the browser host then pauses and shows the result screen.
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
