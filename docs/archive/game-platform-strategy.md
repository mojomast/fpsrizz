# From shooter variants to distinct game experiences

Research and repository audit: **2026-11-16**, against source commit `3c1dab6`.
**Status: proposed design and implementation sequence, not implemented APIs.**

**Implementation follow-up:** the first independent-family wave now supplies Three.js/SDK 2, experience pointer/input
policy and separate racer, tactics and adventure graphs. See [docs/archive/parallel-build-plan.md](parallel-build-plan.md),
[docs/reference/spec.md](../reference/spec.md) and [docs/guide/plugins.md](../guide/plugins.md) for delivered behavior and signatures. This document preserves the
pre-wave audit and broader design; its remaining proposals are not claims of implemented platform capabilities.

## 1. Recommendation

Build a platform that composes **complete game experiences**: player actions, simulation rules, world model, camera,
visual presentation, sound, interface, progression, content and authoring tools. Keep the existing generic kernel.
Make the shooter stack one optional game family alongside vehicle, board/tactics, adventure and later other families.

Optimize for coherent, tested combinations. Supporting many game families does not require every plugin to work with
every other plugin. A card game should be able to omit spatial collision, a racer should omit weapons, and a tactics
game should own its turn rules. Reuse the contracts that genuinely match across games.

**The next proof should be three contrasting games, not another collection of FPS modes:**

1. **Overhead arcade racer:** visible vehicle, inertia/drifting, racing line decisions, speed/lap HUD and engine audio.
2. **Turn-based tactics:** cursor selection, a squad, action points, previews and an explicit end-turn action.
3. **Narrative puzzle adventure:** illustrated rooms, inspection, dialogue, inventory combinations and persistent flags.

These exercise different controls, time models, representations and interfaces while retaining the shooter as a
regression reference. They provide stronger evidence of versatility than preset count.

## 2. Why the current games resemble one another

An audit of all 16 JSON presets found:

| Shared choice | Count |
|---|---:|
| `core/fp-camera` | 16/16 |
| `core/hud` | 15/16; the other uses the visor shooter HUD |
| `core/player`, `core/world`, `core/combat`, `core/enemies`, `core/presentation`, `core/content` | Each enabled in 16/16 |
| FPS controller | 12/16; dash controller 3/16; racing controller 1/16 |

The new rules are real, but much of the player experience remains inherited from Bulkhead Station. Specific causes:

| Evidence in current source | Consequence | Required design change |
|---|---|---|
| `src/app/main.ts:116–120,199–228,324–328` gates gameplay input and simulation on pointer capture | Cursor-based games inherit an FPS interaction model | Experience-selected input/focus policy |
| `src/app/main.ts:157–166` always describes mouse yaw and weapon-oriented controls | The launcher describes the wrong experience for a racer | Generate controls from active contexts, not every enabled provider |
| `games/shooter/plugins/core-player/index.ts:27–58,154–174` bundles actor, health, starter weapons, FPS input and camera | Reusing the player also imports shooter assumptions; it has no visible actor by default | Separate possession, actor archetypes, controller and loadout |
| `games/shooter/plugins/core-content/manifest.json` bundles map, enemies, weapons and pickups | Reusing one reference asset requires the shooter content graph | Small content packs grouped by actual dependency needs |
| `games/shooter/plugins/core-presentation/index.ts:39–44` always constructs world meshes, actors, effects, weapon view and shooter audio hooks together | A camera replacement still gets first-person presentation machinery | Selectable presentation features and explicit ownership |
| `src/sdk/render.ts:19–32` exposes two fixed perspective cameras/layers | No native orthographic/multi-viewport contract | Versioned view/projection and viewport support |
| `src/platform/input.ts:83–100` fans a key out to all registered actions | Enabling providers does not select their active bindings | Context priority, consumption and scoped activation |
| `games/shooter/plugins/core-hud/index.ts:170–250` centers health, inventory and firing | New mode status text sits inside the same shooter interface | Genre HUDs reading genre-specific state |
| `src/plugins/theme-assetrizz/index.ts:100–104` changes texture maps while sharing sound and visual definitions | A fantasy reskin preserves much of the same audiovisual behavior | Art, motion, UI and audio direction per experience |
| `scripts/build.mjs:20–29` builds one bundle without splitting | Catalog loaders defer activation, but do not provide per-game downloads | Experience-aware code and asset packaging |

The generic host already has useful foundations: scopes, registries, explicit dependencies, roles, commands/events,
deterministic simulation and staged validation. The primary constraint is the set of assumptions above that host.

## 3. Best practices and what to borrow

These sources support the principles below; the specific Bulkhead design is a recommendation, not a claim that these
engines prescribe the same API.

| Research | Finding | Application here |
|---|---|---|
| [Epic's Lyra sample][lyra] and [Modular Game Features][features] | Experiences compose feature plugins, input, actors and UI; Lyra includes a distinct top-down game alongside shooters | Make the experience the composition unit, larger than a mode |
| [Godot scene organization][godot] | Keep units self-contained; inject external dependencies and align ownership with lifetime | Explicit dependencies and room/run/overlay scopes; no global scene assumptions |
| [Game Programming Patterns: Component][components] | Split along domains; composition has real coordination costs, and excessive abstraction is harmful | Separate actor/control/view; extract shared mechanics after independent consumers prove the need |
| [Enhanced Input][input] | Mapping contexts can be added, removed and prioritized per player | Driving, on-foot, inventory and dialogue contexts must not all consume the same press |
| [Phaser scenes][scenes] | Scenes own their display/input/update concerns while sharing platform resources | Distinct gameplay, shop, menu and overlay lifetimes; one browser adapter can serve them |
| [Bevy state documentation][states] | Transition schedules and run conditions separate state entry/exit from ongoing updates | Explicit game-flow transitions and simulation gating |
| [MDA framework][mda] | Mechanics produce dynamics and player experience; aesthetics means emotional response, not just graphics | Define intended decisions and feelings before selecting plugin ingredients |
| [Game Accessibility Guidelines][accessibility] | Remapping, readable UI, input consistency and configurable feedback improve access | Preserve these across all presentation packs rather than reimplementing settings per game |

Avoid copying an entire engine architecture. Borrow the seams that resolve observed constraints, then verify them in
small complete games.

## 4. Design a distinct experience before selecting plugins

Every game should have a short **experience brief** containing:

- **Player fantasy and verbs:** what the player does repeatedly, and which actions are deliberately unavailable.
- **Decision loop:** a representative 30 seconds, a complete encounter/level, and a whole session.
- **Time and agency:** real-time, turn-based, pause-and-plan, event-driven; one actor, squad, vehicle or no world actor.
- **Information:** what is visible, hidden, uncertain or forecast; how the player learns it.
- **Space:** track, board, room network, open field, platform course or non-spatial state graph.
- **Resources and consequences:** what is spent, risked, recovered and carried between scenes/runs.
- **Presentation direction:** projection, framing, scale, palette, silhouettes, typography, motion and audio language.
- **Content grammar:** which layouts, interactions and encounter sequences create the intended decisions.
- **Completion proof:** a short playable route, failure/recovery route, required assets and acceptance checks.

Proposed review heuristic: change the dominant decision loop, and deliberately differentiate at least four other axes
above from the closest existing game. This is a design-review aid, not a scientific measure or an engine validator.

Examples of meaningful differentiation:

- Horror creates vulnerability through scarce tools, uncertain threats and meaningful retreat, not darkness alone.
- Racing creates decisions through braking distance, grip and corner exits, not a timer attached to walking.
- Tactics makes positioning and action expenditure explicit and forecastable, rather than running slow FPS enemies.
- Puzzles require learning a rule and applying it to new situations, rather than locating one switch in each room.
- Roguelites need choices that change viable strategies; automatic numerical upgrades are a starting demonstration.

## 5. Proposed platform architecture

```text
Experience recipe + authored content + presentation direction
    | resolves to explicit, validated plugin and provider selections
    v
Game-family modules         Optional shared mechanics       Presentation features
shooter / vehicle /         items, interaction,             camera, world/actor drawing,
board / adventure           effects, objectives             HUD, UI flow, audio, feedback
    \___________________________ SDK contracts __________________________/
                               |
Browser adapters: input/focus, renderer, assets, audio, storage
                               |
Generic kernel: host, ownership, registries, ECS, scheduling, buses
```

### 5.1 Experience recipes

An experience declares its actor/possession policy, controller, simulation policy, world family, mode, camera,
presentation, HUD, flow screens, content, asset bundles and device requirements.

Start with an authoring descriptor that **compiles to the existing explicit preset** plus validated experience content.
Show the resolved dependency graph and a diff before saving the recipe. Do not silently enable dependencies at runtime
or add unsupported fields to schema-1 presets. A recipe compiler and its schema are proposed tools, not current commands.

Use roles for exclusive owners (one active controller per context, one primary view policy, one mode). Use registries
for additive contributions (abilities, interactions, actor renderers, screen definitions). Keep coherent code together;
not every animation, widget or actor component deserves its own plugin.

Compatibility should be expressed through typed/versioned SDK contracts and staging validators. Existing manifest
`capabilities` labels are largely descriptive; they do not prove compatibility. Initially use validators rather than
inventing a universal capability solver. Diagnostics should explain missing interfaces, incompatible time/world models
and the provider responsible for each selected subsystem.

### 5.2 Actor and control separation

Introduce a small control/possession contract: a local input seat controls an actor, a selection, or a UI context. Health,
weapons and kills are optional components, not requirements for being controlled. Separate actor creation from default
loadout and camera registration. A vehicle, squad cursor and investigator should have different prefabs.

Keep gameplay intents family-specific: driving intent is not firing intent; squad commands are not analog movement.
Normalize browser devices before mapping to actions. Convert actions into simulation commands at a documented boundary.
Only one system owns each actor's authoritative motion; abilities request impulses or movement modifiers through that
owner rather than racing to write `Transform` from several systems.

### 5.3 Input, focus and pointer policy

Provide scoped contexts with buttons, scalar/vector axes, pointer position, priority, consumption, rebinding and labels.
Support policies such as locked-relative pointer, free cursor and no-pointer controls. Pointer lock must become an
experience choice independent of whether the simulation is allowed to run. The browser adapter still owns DOM access.

An inventory overlay claims UI focus, chooses whether the game pauses, consumes its click, and restores the previous
context on close. It must not fire a gun or accelerate a car underneath. Clear/cancel held actions during transitions;
define whether a held key must be released before a newly active context accepts it. Add gamepad/touch adapters behind
the same action contract as those device targets are adopted.

### 5.4 Time, commands and game flow

Separate three concerns:

1. **Platform/UI updates:** pointer processing, focus and visual transitions continue while gameplay waits.
2. **Authoritative simulation:** fixed ticks for real-time games, explicit action/turn commits for turn games.
3. **Presentation clocks:** animation/music can continue without advancing turns, cooldowns or the world.

A turn-mode plugin alone cannot freeze the existing real-time AI, damage, pickups and timers. A turn family must own
those rules and omit incompatible systems, or use explicit run conditions for every participating system. Do not simply
pause the current scheduler: `beforeTick` currently samples gameplay input, so pausing it also changes command delivery.
Add a host-side input/command ingress that can queue actions while simulation waits; apply commands at defined boundaries,
not from arbitrary DOM callbacks. Never use a visual animation's completion time as the authoritative turn outcome.

Represent title, exploration, battle, inventory, dialogue, shop, results and next-level transitions explicitly. Start with
one world plus overlays. Add run and room scopes when the first multi-room game needs them, including entity ownership:
disposing a current plugin scope does not by itself destroy its entities. Carry run state intentionally between rooms.
Do not introduce global mutable singletons to keep it alive across `host.restart()`.

### 5.5 World families and simulation ownership

Keep planar world queries for games that benefit from them. Introduce separate board topology/occupancy, room/hotspot
graphs or side-view collision when the game requires them. A card or narrative game need not provide `World` at all.
Share identity, commands and lifecycle, not a universal world interface with dozens of irrelevant methods.

For interoperable spatial plugins, specify units, coordinate convention, contact rules, query filtering and movement
ownership. Rendering and simulation use the same authored world data. A 2D side-view platformer can use a dedicated
planar physics family; it does not require the shooter's full bridge/stacked-floor migration. True 3D exploration does.

The current vertical query prototype is not support/grounding, navigation, combat or a renderer. Integrate those together
before advertising vertical gameplay. Likewise, the network codec is not multiplayer. Player-scoped input is a useful
prerequisite, but transport, authority, replication and reconciliation remain a separate end-to-end project.

### 5.6 Presentation is a composition, not just a texture table

Separate world rendering, actor rendering, camera application, viewmodels, effects, gameplay audio and HUD. Select only
the required features. A recipe owns the global environment/camera policy; additive effects use explicit channels so
plugins cannot overwrite one another's camera or fog settings. Keep shooter presentation available as a compatibility
composition while introducing independent non-FPS presentations.

Each presentation pack needs:

- Camera framing/projection, follow behavior, transitions, occlusion and screen-to-world picking.
- Visible player/vehicle/squad models or sprites, facing, scale, anchors, animation and selection feedback.
- World composition: roof cutaways for overhead rooms, track edges, board overlays or illustrated room hotspots.
- Genre HUD and menus, typography/spacing tokens, icons, focus order and responsive layout.
- A motion language: anticipation, impact, recovery, easing and optional shake/hit-stop.
- An audio direction: ambience, music, interaction feedback, distance cues, mixing and transitions.

Public presentation state should describe gameplay facts. HUDs can read small typed models such as race progress or
selected-unit actions rather than parse `Flow.status` text. Audio/visual feedback can subscribe to completed events;
requests that can fail need synchronous results or explicitly queued commands with outcomes. Deferred events are not
a veto or arbitration mechanism.

## 6. Genre designs and reusable plugin families

All names below are proposed module groups, not installed plugin IDs. Each game needs its own brief and authored content.

| Game | Distinct core decisions and required mechanics | Presentation and sound | Likely reusable modules |
|---|---|---|---|
| Arena action | Aggressive movement, weapon/resource cycling, crowd positioning, combos and enemy telegraphs | First-person or twin-stick; sharp impacts, responsive motion, legible high-energy HUD | Action states, damage/effects, encounter pacing, feedback |
| Arcade racing | Choose braking points, manage grip/drift/boost, recover lines, beat laps/ghosts | Overhead or chase view, visible vehicle, speed/lap/sector UI, skid and engine loops | Vehicle motion, directional swept gates, track tools, camera follow |
| Turn tactics | Select units, spend AP, compare cover/LOS previews, commit action then enemy turn | Orthographic board, silhouettes/selection rings, action timeline, deliberate transitions | Board occupancy, command history, turn resolver, selection/picking |
| Stealth heist | Observe patrols, create distractions, manage suspicion and escape after detection | Overhead/fixed-angle view, readable cones and last-known positions, restrained alarm layers | Perception/noise, patrol/search state, interaction, inventory |
| Survival horror | Choose retreat vs confrontation, conserve light/tools, find safe rooms, remember routes | First-person or fixed cinematic view, sparse UI, acoustic space, controlled reveals | Stalking/perception, resource economy, room transitions, saves |
| Puzzle adventure | Inspect, combine evidence/items, converse, learn and apply puzzle rules | Illustrated scenes, hotspots, dialogue portraits, journal and contextual feedback | Interaction, flags, dialogue graphs, containers, puzzle evaluators |
| Action roguelite | Choose branching rewards and routes; build synergies and trade survival for power | Top-down readable arena, selectable reward cards, distinctive ability telegraphs | Effects/abilities, reward choices, run graph, encounter pacing |
| Extraction | Choose loot vs carrying cost/exposure, retreat timing, risk and recovery | Inventory/weight/extraction UI, route signals and threat audio | Item transfers, equipment, objectives; later transactional settlement |
| Cozy management | Place objects, schedule work, manage production and relationships | Warm isometric/2D scene, placement ghosts, construction UI, calm feedback | Placement/grid topology, recipes, economy, jobs, dialogue, profile |
| Card/board strategy | Manipulate hands/decks, turn resources and resolve effects in an explicit order | Table/card UI, drag/select alternatives, preview/log, audiovisual card cues | Turn commands, deterministic rules, UI layout, save participants |
| Side-view platformer | Commit jumps, use air control, read hazards, recover from failure | Side camera, parallax, grounded character animation, checkpoint transitions | Dedicated movement/contact model, action timing, camera zones |

Share perception between stealth and horror only where evidence rules match; share an item transfer authority between
adventure and extraction; share command resolution between compatible turn games. Avoid a single giant ability engine,
universal inventory, AI tree or world service before those consumers exist.

## 7. Renderer and asset strategy

### Renderer decision

For the desired breadth, recommend a bounded evaluation of **real Three.js behind the existing render SDK** rather than
continuously reimplementing advanced features in mini3. Three.js already supplies [orthographic cameras][ortho] and a
[glTF loader][gltf]. This does not supply collision, AI or game feel, and current mini3-specific behavior still needs
migration tests. Keep third-party implementation behind a boundary-compliant platform adapter (for example,
reproducibly generated vendored modules); gameplay plugins continue using the SDK, and import rules stay enforced.

Compare three fixtures before choosing the migration: the reference shooter, an overhead sprite/vehicle scene with
picking, and a Blender GLB actor with animation. Check image/color/lighting differences, disposal, startup payload and
real-device performance. Retain esbuild and `node:test`; changing renderer does not require changing the entire toolchain.
DOM-based dialogue/card UI can progress independently. Do not make every UI-only game require WebGL2 at app startup.

### Assetrizz as an art-direction pipeline

The pinned [Assetrizz source][assetrizz] describes 14,641 PNGs, 23 style packs and 18 categories, including UI, portraits,
vehicles, buildings, backgrounds, markers and VFX. Current integration uses only a small subset of that opportunity.

Use a coherent asset collection per experience, extending beyond walls and enemies:

| Experience | Candidate direction to inspect | Priority assets |
|---|---|---|
| Racer | `vaporwave_synth` or `lowpoly_render` | Compatible vehicle views, track surfaces, roadside props, checkpoints and HUD |
| Tactics | `isometric_voxel` or `pixel_32` | Units with suitable facing, cover/terrain, selection markers and ability icons |
| Adventure | `storybook_gouache`, `paper_cutout` or `ink_watercolor` | Room plates, objects, portraits, inventory icons and dialogue frames |
| Horror | `gothic_woodcut` or `dark_scifi` | Environmental storytelling props, readable silhouettes, clues and sparse UI |

These are candidates, not promises that the catalog supplies every needed angle or animation. Inspect pixels and
metadata before committing. A front/side turnaround is not a walk cycle; an isometric sprite is not automatically
suitable for a rotating camera. Preserve a style bible covering perspective, palette, lighting, density and scale.

Proposed build pipeline:

1. Search the pinned manifest with semantic role, style, projection, dimensions and alpha needs.
2. Generate contact sheets showing real candidates together; approve at actual in-game scale.
3. Map semantic keys to curated files, explicit frame rectangles, pivots, units, sampling mode and animation states.
4. Record revision, source path, SHA-256, transformations and the upstream license note without relabeling it MIT.
5. Build per-experience bundles/atlases and validate missing roles, alpha, frames and texture budgets.
6. Preview representative rooms, UI and motion; verify loading, cancellation, switching and disposal in-browser.

Keep the existing synchronous painters as a supported small-asset path. For broader sets, add scoped async image/audio/
model preparation, a readiness barrier, fallback policy and cache identity including content version and import settings.
Decode before consumers create textures or infer weapon muzzle positions. Role activation currently happens after
plugin activation; a theme role's `activate` is not a safe implicit preload hook. A failed preparation must have defined
behavior; the current host does not roll back failures after commit.

Use Blender for assets needing geometry, bespoke silhouettes or consistent animated views: vehicles, visible players,
props, weapons and missing sprite directions. Standardize scale, forward axis, pivot, animation names and attachment
points. A GLB visual and its collision representation are separate authored outputs.

### Audio and feedback

Assetrizz is an image library. Add sampled audio/music support alongside existing synthesis: owned playback handles,
loops, bus gains, crossfades, voice limits and pause/resume policy. Games choose an audio director and sound set. Driving
needs continuously parameterized engine/slip audio; horror needs deliberate silence, ambience and spatial evidence;
tactics needs action confirmation and readable consequence cues.

Gameplay noise/perception is authoritative simulation data. Do not derive hearing from whether a sound actually played
or its device volume. Music scheduling uses the audio clock, following [Web Audio scheduling guidance][audio], while
gameplay timers stay on the simulation clock. Rhythm games additionally need timestamped input, latency calibration
and an explicit audio-to-simulation time model; the current fixed tick alone is insufficient.

## 8. Plugin contracts and integration discipline

For every shared feature, document and test:

| Contract concern | Required answer |
|---|---|
| Authority | Which plugin owns mutable state and which operation may change it? |
| Inputs/results | Typed request, validation/rejection, once-only effects and completed-event payload |
| Time/order | Tick, turn or presentation clock; phase and ordering dependencies |
| Lifetime | Registration, session, future run/room/overlay; cleanup of entities, UI, audio and assets |
| Compatibility | Required contract version, geometry/time family and selected providers |
| Persistence | Captured state, restore order, schema/content identity and migration policy |
| Tooling | Authoring schema, preview, diagnostics and a minimal working recipe |
| Verification | Headless behavior plus browser input/presentation and reset tests |

Example: a distraction requests an action, its owner validates inventory/cooldown, commits the cost, then emits a noise
fact and presentation cue. The perception system updates suspicion; the audio director chooses how to render the cue.
Failure spends nothing. Muting sound changes neither suspicion nor gameplay.

Organize new shared contracts internally by responsibility (`input`, `experience`, `view`, `items`, `turns`, `perception`)
while preserving the public `src/sdk/index.ts` import boundary. Do not move game rules into the kernel. Additive APIs
need a released SDK version and accurate minimum manifest ranges; incompatible changes need a major version/migration.
Preserve token identity and legacy semantics when re-exporting existing shooter contracts.

## 9. Authoring, delivery and persistence

The creator should evolve from a checkbox catalog into an experience composer with:

- Family templates and an inspectable resolved dependency graph; explain incompatible choices before activation.
- Genre-specific editors: track spline/gates, board cover/occupancy, room hotspots/dialogue, puzzle graph, encounter graph.
- Shared transform/selection, asset browsing, preview and undo foundations reused by those editors.
- Schema-driven inspectors and actionable validation, including prefab parameters and required presentation keys.
- Play-from-room/encounter tools, deterministic input replay, event/authority traces and resource ownership reports.
- An agent-readable recipe, asset lockfile, sample content, runnable validation and a scripted completion scenario.

Prefer proven external authoring formats/importers where they fit; there is no need to build every painting/modeling
tool inside the creator. Treat imported scene layout and authored collision/gameplay semantics as separate concerns.

Package code/assets by experience. [esbuild splitting][splitting] can make async imports separate files; the current
single `outfile` build does not. Retain trusted compiled plugin discovery, generate stable manifests/content hashes,
test GitHub Pages subpaths and mixed-cache updates, and offer a build containing only one selected experience. Measure
download bytes, decoded memory, GPU resources and time-to-interactive rather than only source file size.

Persistence has distinct milestones: local preferences/profile, authored-game run saves, and transactional economies.
Run saves need participant capture at a safe boundary, RNG/timers/queues/world state and content versions. Persisted
extraction needs atomic, idempotent settlement; a profile read-modify-write is not sufficient. Establish ownership and
capture contracts before adding campaigns or durable stash. Multiplayer adds server authority to those decisions.

## 10. Implementation order and gates

| Stage | Deliverable | Completion gate |
|---|---|---|
| A: remove forced shooter dependencies | Input/focus policy, actor/loadout separation, optional viewmodel/shooter audio, split reference content | A non-shooter runs without `core/player`, `core/combat`, `core/enemies`, `core/content`; legacy presets still work |
| B: first contrasting game | Overhead racer, visible vehicle, own HUD/flow/audio, track grammar, handling polish | Play a complete lap; braking/drifting decisions matter; no shooter HUD, weapon view or irrelevant controls |
| C: second time model | Board/tactics family, cursor picking, command ingress, turn resolver and forecast UI | Waiting leaves authoritative board state unchanged; one committed action spends resources and resolves exactly once |
| D: non-spatial/room-driven game | Narrative puzzle adventure, dialogue/inventory overlays, room transitions and save participant | Complete a multi-room puzzle; UI consumes clicks; state survives intended transitions and reload |
| E: extract proven shared systems | Item transfers from adventure/extraction, perception from stealth/horror, effects from two action games | Independent consumers pass the same contract tests and retain their distinct rules |
| F: strengthen existing genres | Real stealth patrol/search, horror pacing, roguelite choices, tactical equipment and extraction economy | Each has a distinctive encounter loop and authored win/failure/recovery routes |
| G: new foundations | Side-view platformer, 3D vertical world, management scale, multiplayer or rhythm as chosen | Each passes its own full-stack acceptance; prototypes alone do not count |

Input/actor/presentation ownership decisions precede parallel implementation. After those contracts settle, racer,
tactics and adventure implementation can proceed independently with bounded file ownership. Asset curation, UI mockups,
sound design and content authoring can run alongside the infrastructure work. Renderer evaluation runs alongside A;
orthographic/model-dependent work waits for the selected backend. UI-only adventure can progress without it.

The order prioritizes **architectural contrast**, updating the earlier mode-first emphasis in `docs/archive/build-order.md`. It does
not require general 3D physics or multiplayer before the first sharply different games are playable.

## 11. Acceptance: prove both correctness and difference

Keep existing behavior tests and add targeted contracts rather than testing every possible plugin combination.
Maintain a supported composition matrix for each experience and test cross-experience switching.

Concrete gates:

- **Dependency independence:** racer and adventure do not enable shooter combat/enemy/player modules merely to start.
- **Input:** free cursor works without `?test`; inventory/dialogue clicks do not leak; rebinding changes visible prompts.
- **Time:** after 30 seconds of deliberation, turn-owned resources/positions are unchanged; UI still responds.
- **Presentation:** the controlled actor, camera, HUD, sounds and menus match the brief; all required assets resolve.
- **Lifecycle:** switch between shooter, racer and tactics; no leaked input contexts, entities, UI, audio or GPU resources.
- **Mechanics:** test action rejection, resource conservation, deterministic outcomes, failure and recovery.
- **Content:** actual movement/commands can complete a level; teleport-only tests do not establish playable routes.
- **Performance:** profile representative hardware and asset budgets; software-rendered smoke timing is not a GPU benchmark.
- **Accessibility:** keyboard/gamepad focus as applicable, readable text, non-color-only signals, remapping and adjustable motion/audio.

The current `tests/genre-demo/run.mjs` proves startup/HUD/movement/firing for several presets. It does not establish
genre identity or a complete loop. New browser scenarios should exercise each genre's defining action and transitions.

Use human playtests alongside automation: without seeing the title, can players identify the game's verbs, priorities
and intended feel? Review screenshots for composition, short silent clips for movement, and audio clips for sonic identity.
Visual difference is insufficient if optimal play is identical; mechanical difference is undercommunicated if the UI and
feedback still teach the old game. Fun and clarity require iteration, not an automatic similarity score.

## 12. Immediate implementation brief

The highest-value next ticket is **a complete overhead racer with no shooter dependency**. It should deliver:

1. An experience-selected free/no-pointer policy and correct driving controls on the start screen.
2. A vehicle prefab with motion and racing state, independent of health/weapon inventory.
3. An overhead camera, visible vehicle and track renderer with readable boundaries and checkpoints.
4. Acceleration/braking/drift behavior, an ordered lap, failure/restart and a compact speed/lap HUD.
5. A cohesive Assetrizz/Blender art selection and scoped engine/skid/music behavior.
6. Contract/route tests, browser playthrough, cross-preset reset and a short human handling review.

In parallel, design the tactics and adventure briefs against these new boundaries. Promote shared APIs only where those
briefs reveal an actual second use. This builds versatility through completed games rather than an expanding list of
unused plugin interfaces.

## Sources

Consulted 2026-11-16. Official documentation is used where available; MDA is a design-research framework, and
Game Programming Patterns is practitioner guidance. The recommendations above are the application of these sources
to this repository, not claims that any single source guarantees a versatile platform.

[lyra]: https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-sample-game-in-unreal-engine
[features]: https://www.unrealengine.com/en-US/blog/modular-game-features-in-ue5-plug-n-play-the-unreal-way
[godot]: https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html
[components]: https://gameprogrammingpatterns.com/component.html
[input]: https://dev.epicgames.com/documentation/en-us/unreal-engine/enhanced-input-in-unreal-engine
[scenes]: https://docs.phaser.io/phaser/concepts/scenes
[states]: https://docs.rs/bevy/0.20.1/bevy/state/index.html
[mda]: https://aaai.org/papers/ws04-04-001-mda-a-formal-approach-to-game-design-and-game-research/
[accessibility]: https://gameaccessibilityguidelines.com/full-list/
[ortho]: https://threejs.org/docs/pages/OrthographicCamera.html
[gltf]: https://threejs.org/docs/pages/GLTFLoader.html
[assetrizz]: https://github.com/mojomast/assetrizz/tree/05339c228f55ac95ad21b5c947db0c6e36207cd4
[audio]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques
[splitting]: https://esbuild.github.io/api/#splitting
