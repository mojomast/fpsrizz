# Game plugin research and roadmap

This is a proposed roadmap, not a list of implemented plugins. Its purpose is to help authors combine reusable
mechanics into distinct games, identify changes that must happen below the plugin layer, and choose small playable
milestones. See [docs/guide/create-a-game.md](../guide/create-a-game.md) for the current authoring workflow and [docs/reference/spec.md](../reference/spec.md) for what
is implemented today.

For the subsequent research into complete, sharply differentiated game experiences, see
[docs/archive/game-platform-strategy.md](game-platform-strategy.md). It audits the current shared shooter assumptions and proposes
input, actor, presentation, time-model and authoring boundaries for broader game families.

The first independent-family implementation is tracked in [docs/archive/parallel-build-plan.md](parallel-build-plan.md), with actual
scope in [docs/reference/spec.md](../reference/spec.md): Three.js/SDK 2, experience input policy, overhead racing, turn tactics and narrative adventure.

Bulkhead currently has a plugin host and a playable 2.5D reference shooter, with example content, attack, HUD and
survival-mode extensions. Presets select plugins, maps and role providers; plugins share contracts through the SDK.
Game ideas below assume these existing pieces only where the current contracts and implementation support them.

## Implementation progress

Since this research was written, time-trial, arena score attack, holdout, sprint/dash, keys and gates, a timed ward,
and a stationary vision-cone guard have been implemented. Catalogued presets exercise a keyed dungeon, stealth map,
puzzle, horror map, arena, holdout and timed raid. Their scope is intentionally smaller than the full genre ideas
below; for example, stealth has no patrol, sound or light sensing and the horror map has no save system. The tables
below retain the broader recommendations and acceptance criteria, not a claim that every fuller feature exists.

## How to read this roadmap

- **Plugin** means behavior that can be packaged behind the existing public extension model, possibly alongside a
  shared SDK contract that lets independent plugins cooperate. Names below are proposals, not catalog IDs.
- **Engine/platform work** means changes to world representation, rendering, browser adapters, host services or SDK
  contracts; adding a manifest alone cannot supply it. Preserve the generic kernel and use versioned contracts when
  compatibility changes.
- **Preset** means a composition of enabled plugins, selected exclusive role providers and content. Dependencies are
  explicit; a game needs content and testing as well as behavior plugins.

## Current capabilities and hard boundaries

- The fixed-step host, controller/camera/mode roles, input actions, prefab and behavior registries, content kinds,
  validation, deterministic RNG, events and owned lifetimes already provide a useful composition foundation. See
  `games/shooter/contracts/shooter.ts`, `src/app/catalog.ts` and `docs/guide/plugins.md`.
- Existing maps, `Transform`, collision, world queries, AI and combat largely operate on the XZ plane. A pitched
  perspective camera is possible, but stock attacks still aim on that plane. A different map format alone cannot
  add stacked floors, jumping or height-aware collisions. See `games/shooter/plugins/core-world/` and `docs/reference/architecture.md`.
- A custom planar controller can implement sprint, dash, inertia or vehicle steering; `core/melee` already provides a
  short-range single-target attack. A custom mode can use map zones as simple checkpoints and manage laps. High-speed
  or non-player checkpoint crossings need swept/custom detection; the stock zone triggers are player-only.
- Camera providers can create perspective chase or top-down views, but stock presentation includes a first-person
  weapon view and the stock player has no visible actor model. A third-person game needs suitable presentation too.
  True orthographic and split-screen views require rendering/host work. See `games/shooter/plugins/core-presentation/`.
- Core enemy AI already owns automatic LOS acquisition and alerting before calling its behavior. A custom AI behavior
  alone cannot replace that perception model; stealth needs a new/refactored enemy perception seam or an independent
  enemy implementation. Audio playback and visual lighting are not authoritative hearing or light exposure systems.
- Code plugins are trusted and compiled in. Imported JSON packs only provide data. Saved games, persistent imported
  packs, general multiplayer, authoritative vertical physics and real-GPU performance validation are not implemented.

## Movement, views and sensing candidates

These are proposed code plugins, not installed plugin IDs. Each preset must explicitly choose compatible role providers.

| Candidate | Responsibility and intended reuse | Prerequisites / caveats |
|---|---|---|
| Planar movement controllers | Sprint, dash, dodge, acceleration and stamina; arena shooters and exploration | Replace the controller role; one owner writes player movement. Shared movement/ability contracts are needed for independent plug-and-play modifiers. |
| Vehicle controller | Steering, acceleration, braking, boost and circle-based wall collision | Uses planar world queries; high-speed movement needs continuous sweeps. Traction and car-to-car physics are not provided. |
| Race mode and checkpoints | Ordered gates, laps, timing, penalties and finish; supports arcade racing | Depends on vehicle/controller and map content; custom swept crossings are needed for high speed or non-player racers. |
| Perspective camera and presentation | Chase, fixed-angle or top-down perspective; visible player/vehicle and appropriate HUD | Controller/camera role choices and presentation must agree; custom visuals may be required. Orthographic and split-screen need rendering work. |
| Perception and alert system | Vision cones, noise events, suspicion, patrol/forgetting and alarms; stealth and horror | Core enemy AI auto-alerts independently. Replace/refactor its perception seam or use a separate enemy stack; do not treat a custom AI behavior as a replacement. |
| Advanced melee | Windup, recovery, arcs, blocking/parry and per-swing hit tracking | Build on existing damage/attack extension points where possible. Rich interoperable action state may need shared SDK contracts; hits remain planar. |

For real platforming or bridges, first design a versioned world/pose/physics contract covering height, floors and
ceilings, collisions, queries, navigation, triggers, AI, combat and rendering together. A cosmetic hop is not a jump.

## Proposed core gameplay plugins

Names are descriptive, not committed IDs or manifests. Keep rules private to their first mode until two real consumers
demonstrate a useful shared interface. A preset selects one mode; additive mechanics must cooperate with that mode
through services, events, registries or explicit SDK contracts rather than competing for the mode role.

| Priority | Plugin or module | Responsibilities | Unlocks / dependencies | First proof |
|---|---|---|---|
| P0 | Time-trial mode | Deadline, objectives, scoring and result | Current world, player, combat and authored map | Switch-and-exit with timer; timeout, victory and restart tests |
| P0 | Arena score-attack mode | Kill/time limits, scores, match result and spawn policy | Current world/combat/player and enemies, plus arena content | Playable PvE arena, validated spawns, scoring and deterministic reset |
| P0 | Interaction, keys and gates | Interactable state, key acquisition/consumption, locked door requests and feedback | Current world and a key pickup/interaction path; shared contract only when another consumer needs it | A key opens one intended gate; rejected interactions preserve state |
| P1 | Checkpoints and holdout rules | Ordered checkpoint sequences or capture/hold timers | Current map and custom occupancy/swept detection; stock trigger events are entry-only | Timer only advances in zone; crossing and restart behavior are deterministic |
| P1 | Encounter and pickup director | Spawn groups, pacing, enemy budgets, timed pickup respawns | Existing `example/survival` contains private wave logic; extract only after a second mode needs it | Preserve survival behavior and drive a second mode through the same tested seam |
| P1 | Status effects and abilities | Cooldowns, timed effects, modifiers and data-defined upgrades | Current damage modifiers and actions are a starting point; coordinate ownership and stacking | Two independent effects stack, expire and clean up predictably |
| P1 | Session roguelite mode and rewards | Seeded reward choices, encounter variety, upgrades and run results | Ability/effect rules and director only as needed; start on an authored single map | Same seed and inputs reproduce rewards; reset clears run state |
| P1 | Alternate planar controller and camera | Dash or top-down movement plus perspective camera and compatible presentation | Controller and camera roles; visible actor instead of stock first-person view | Playable non-FPS slice with headless movement and browser camera tests |
| P2 | General items, containers and equipment | Item definitions/instances, stacks, transfers, keys, loot and equipment | Explicit public inventory contract if shared; current `Inventory` is weapons and pooled ammo | Conservation and ownership tests, including rejected and interrupted transfers |
| P2 | Tactical weapon handling | Magazines, reload, reserves, fire modes and equipment use | Coordinate with or replace the stock weapon firing pipeline; a HUD alone cannot implement reloading | Ammo conservation, reload timing/interruption and weapon switching |
| P2 | Perception and stealth agents | Sight cones, noise, suspicion, patrol and search | New or refactored perception/enemy stack; core enemy AI auto-alert cannot simply be overridden by an AI behavior | Sight/noise tests plus patrol, alert, loss of target and reset |
| P2 | Profile/progression adapter | Persistent scores, unlocks and player profile | Storage provider with versioning, explicit errors and migrations; separate from run-save | Corrupt/unavailable storage and migrations handled without falsely reporting success |
| P3 | Extraction loop and stash | Loot carrying, extraction eligibility, loss/settlement and durable stash | Items, loot, profile storage and atomic/idempotent settlement; optional networking is separate | Extract commits once, death loses specified items, interrupted settlement recovers |

Other useful but non-universal candidates include traps/deployables, enemy variants and bosses, dialogue/NPCs,
spatial audio cues, minigames, shops and crafting. Build these when a specific game calls for them rather than making
them prerequisites for all games. A wave director is likewise a candidate extraction, not already a standalone plugin.

## Game recipes

Each recipe also needs a compatible controller, camera, mode, map, input and (for browser play) presentation, HUD and
theme. Below, **existing** means the current shipped code supports the mechanic; all other names are proposals.

| Game | Smallest plausible composition | Additional work for a fuller version |
|---|---|---|
| Objective shooter | Existing `core/objective`, world, combat, enemies and content | More maps, behaviors, themes and objective rules |
| Wave survival | Existing `example/survival`, world, combat and enemies | Optional director, endless mode, upgrades and high-score persistence |
| Time-trial raid | Time-trial mode + existing switches, zones, doors and combat | Leaderboards need persistence or a service; required tags need validation |
| Arena score attack | Arena mode + enemy spawns + timed pickups + arena content | Richer movement and enemy variety; PvP needs the separate multiplayer foundation |
| Key-and-gate dungeon | Interaction/keys + key pickup + mode + authored map; combat optional | Secrets, NPCs, puzzles, general inventory and save games |
| Holdout/defense | Holdout mode + occupancy checks + enemy spawning + current combat | Extract shared encounter pacing once more than one mode needs it |
| Single-session roguelite | Run mode + seeded rewards/upgrades + existing or new encounters | Multi-map transitions, procedural generation and persistent meta-progression are separate work |
| Stealth infiltration | Stealth perception/agents + interaction/keys + objective mode + map | Sound propagation, lighting-based detection and richer guard AI need explicit simulation rules |
| Tactical shooter | Tactical weapons + equipment + objective/round mode + appropriate enemies | Full cover/squad AI, elevation and networked play each require more work |
| Puzzle adventure | Existing switch-and-exit mode and map, then puzzle logic for sequences and conditions | Shared interaction, stateful puzzles, journal/dialogue and save points as desired |
| Survival horror | Existing combat, enemies, scarce pickups and a custom escape map; optional custom mode/HUD | Stalking behavior, general inventory, sound-based sensing and persistent save points |
| Dungeon crawler | Grid world, suitable map, existing or step-based controller and custom mode | Turn scheduling, party stats and inventory if needed; a strict turn-based game must coordinate every participant |
| Arcade racer | Vehicle controller + chase/top-down camera + race mode + checkpoints + track | Swept detection, vehicle presentation and collision policy; 3D tracks require new world support |
| Extraction prototype | Item/loot rules + timed extraction mode on one map | A full extraction game also needs durable stash, safe settlement and possibly server authority |

Existing modes spawn their own players and map entities; a new mode must define its own spawn and result policy or
explicitly use a shared spawning service. Merely enabling several mechanics does not automatically compose their rules.

### Interaction integration detail

The current world system owns Use arbitration: it selects a nearby facing switch or door. A new plugin independently
handling the same input cannot prevent the world system from also acting. For composable keys, inspectables, terminals
and NPCs, define a shared single-consumer interaction contract and adapt or replace the current Use handler. For a
small prototype, avoid overlapping targets and use existing events. `TriggerFired` is too late to veto a switch's
automatic `opens`: omit `opens` and explicitly call `World.setDoorOpen` once the puzzle condition is met. See
`games/shooter/plugins/core-world/index.ts`.

## Foundational work beyond gameplay plugins

| Workstream | What it must solve | Needed for |
|---|---|---|
| SDK composition | Shared tokens only for independently authored consumers: interactions, item ownership, perception/noise and spawn rules; define order and ownership. Preserve existing shooter APIs where possible. | Reusable plug-and-play mechanics; incompatible changes require SDK versioning. |
| Profile and run persistence | Profile saves need versioned storage, migrations, content identity and explicit write failure. Full run saves additionally capture scheduler time, RNG, world, queues and plugin-owned closure state; ECS snapshots alone are insufficient. | Durable high scores/unlocks, save points, campaigns and extraction. |
| Multiplayer platform | Authority, transport, server lifecycle, network IDs, player-specific input, replication, disconnect/reconnect and match state. Audit bundled systems that assume one player and one session-level `Flow`. | Co-op or PvP; fixed ticks and seeded RNG do not provide networking or rollback. |
| World/vertical gameplay | Versioned pose, heights, collision, LOS, attacks, triggers, nav, maps and rendering; migrate consumers together. | Real jumping, slopes, stacked floors, vertical aiming or height-aware opponents. |
| Input and UI | Device/axis support, rebinding where needed, and modal focus/pointer-lock policy. | Gamepad/touch and modal inventory/dialogue; current browser input focuses on keyboard/mouse. |
| Scale and dynamic geometry | Spatial indexing and deliberate collision/navigation/renderer updates for dynamic solids and larger maps. | Large worlds, destructible obstacles or moving cover. |

## Assetrizz integration: art pipeline for every game family

[Assetrizz](https://github.com/mojomast/assetrizz) is a searchable catalog of 2D PNG art with a manifest describing
assets and metadata such as dimensions, tileability, pivots, frames and hashes. Its art is a strong match for the
engine's 2.5D style. Use it at **authoring/build time** to discover and curate a coherent, small set for each game;
do not assume an imported JSON content pack can install images or execute an asset loader.

Research snapshots: [Assetrizz `79c63c8`](https://github.com/mojomast/assetrizz/tree/79c63c81ff9b7a92c07d640ab4a30a6956f91f8a)
and the separate [Assetrizz Hermes integration `e710b89`](https://github.com/mojomast/assetrizz-hermes/tree/e710b89c276b210969bebd67db4f1c855541586a).
The library reports 14,641 PNGs across 23 styles and 18 categories. It supplies images and a catalog, not 3D models,
audio or a general image-generation API. Its art license note describes a private project library and does not state
a redistribution grant; preserve provenance and establish the intended rights before redistributing assets. The Hermes
plugin code has a separate MIT license.

### Ways to use Assetrizz

- **Direct catalog search:** filter `assets/manifest.jsonl` or restore `db/assets.db.xz` and query SQLite/FTS5. For
  example, from an Assetrizz checkout:
  `jq -r 'select(.style_pack=="dark_scifi" and .category=="enemies") | [.slug,.path] | @tsv' assets/manifest.jsonl`.
  The bundled `pipeline/query.py` and HTTP wrapper use a different database location from the restored catalog and
  their CLI category choices do not cover every category, so direct manifest/SQLite search is the safer initial path.
- **Hermes-assisted discovery and art direction:** the separate `assetrizz-hermes` plugin offers catalog search and
  2D scene composition; its on-demand mode downloads pinned assets and verifies hashes. Scene renders and layouts are
  references or backgrounds, not automatically playable maps, collision, entities or Bulkhead plugins.
- **Future Bulkhead authoring adapter:** build a local Node tool or creator integration to search the manifest,
  preview candidates, select compatible styles and copy pinned assets plus metadata into the project. That adapter is
  proposed; it is not a feature of either project today. A shipped game should need no Python, Hermes, SQLite or
  network access to load its curated assets.

Frame metadata can describe the original sheet; inspect the actual PNG and frame layout before promising animated
sprites. The catalog's thumbnail paths are not a shipped thumbnail library.

| Assetrizz material | Bulkhead target | Example game uses / adaptation |
|---|---|---|
| Seamless tiles and surfaces | Theme textures for floors, walls and doors | Sci-fi station, dungeon stone, horror corridors, puzzle rooms and race tracks; verify tiling and resolution. |
| Characters, monsters and objects | Theme visuals / billboard actor renderers | Enemies, guards, NPCs, loot, keys and props; validate transparency, pivot/anchor and displayed scale. |
| Weapons and equipment | First-person weapon view and HUD art | Shooter weapons, melee tools, keys and tactical equipment; map art to existing semantic theme keys. |
| UI and iconography | HUD and creator/game UI plugins | Inventory slots, quest prompts, keys, abilities, timers and scoreboards; ensure readable states and accessibility. |
| Effects and decoration | Sprite effects and themed environment props | Hits, pickups, hazards and atmospheric effects; sheet layouts must be explicitly mapped and tested. |

### Current integration and next slice

`theme/assetrizz` and the `theme/assetrizz-demo` preset now ship five curated dark-sci-fi tiles, two enemy sprite
strips, and two generic Blender weapon renders. The pinned source
records and regeneration tool are `scripts/assetrizz.json` and `scripts/assetrizz.py`; the source images and license
note are under `public/assetrizz/`. The generated theme painters bundle pixel data synchronously, with no runtime
network or image decode. The theme currently carries copies of industrial art and sounds for the remaining keys.
See the README for import and search commands.

To extend this to additional assets and games:

1. Pick a cohesive handful of floor/wall textures and one prop or enemy appropriate to a single playable preset.
   Search Assetrizz's catalog at authoring time; pin the source revision and retain each file's path, hash, license and
   provenance. Include only the assets that game uses, not the entire library.
2. Adapt the selected PNGs to Bulkhead's **synchronous painter** theme interface. Today
   `games/shooter/contracts/shooter.ts` defines theme textures as painters, and `packages/platform-web/src/render/service.ts` creates
   scoped textures from them: putting PNGs in `public/` alone does not wire them into a theme. A reproducible
   build-time conversion to painters is one possible first approach; an asynchronous image API is a larger alternative.
3. Make a selectable Assetrizz-backed theme variant and preset, keeping gameplay references as semantic theme keys.
   Retain industrial fallback art and existing synthesized sounds for gaps. `packages/std/plugins/theme-industrial/` provides
   the current theme, while `games/shooter/plugins/core-presentation/` consumes it.
4. Verify pinned hashes, dimensions, transparency and generated output; stage the preset, test the headless game,
   then inspect it in-browser and test theme switching and resource cleanup. For sprites, test actual frame layout,
   animation and bottom anchoring; do not assume Assetrizz pivot metadata is already honored.

Later, a shared image asset service could provide scoped asynchronous decoding/loading, cancellation, fallback,
theme-aware cache identity and metadata-aware sprite support. That affects the theme SDK, presentation and consumers
such as weapon-view muzzle detection, and needs lifecycle/browser tests. Curated theme packs can then serve sci-fi,
fantasy, horror and other recipes without coupling game logic to file paths. Assetrizz is art, not a sampled-audio
pipeline; use existing synthesized audio or separately design/import sound support.

If using asynchronous loading, decode images before any synchronous painter is consumed: texture creation and muzzle
discovery each paint once. Do not rely on theme role activation to finish first, since role providers activate after
plugins. Scope and guard loading, account for late completion and failure, and distinguish theme identity in shared
texture cache keys. Validate actual deployed and subpath URLs, first-frame pixels, missing/corrupt assets, theme
switching and resource cleanup. A bundled deterministic painter representation is an alternative with a different
size and build-tool tradeoff.

## Suggested sequence

1. **Prove distinct games first:** ship a time-trial raid or PvE arena with the current planar stack, and a short
   switch-and-exit puzzle map. This validates authoring and mode selection without inventing infrastructure.
2. **Create an adventure slice:** key → gate → exit; resolve the shared Use arbitration problem, then add just enough
   item/interaction state for another plugin to consume. Add a non-FPS camera/controller slice to test presentation.
3. **Extract demonstrated shared mechanics:** encounter pacing after a second consumer, and a small status/effect or
   objective contract when two games use it. Extend content validation alongside each reusable definition.
4. **Choose a deeper branch:** stealth/horror with a genuine perception seam, or tactical/roguelite with richer weapon
   or upgrade state. Add versioned profile persistence if progression must outlive a session.
5. **Treat networked and vertical games as separate projects:** first prove two independent players and authoritative
   input/replication for multiplayer, or an end-to-end height-aware world slice for vertical gameplay.

For each slice: register code and content in `src/app/catalog.ts`, explicitly enable dependencies in a preset, stage it
with `npm run validate-game`, test simulation and restart headlessly, then verify its actual behavior and presentation
in the browser. The existing smoke suite tests shipped presets and does not prove a newly authored game works.
