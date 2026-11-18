# HOLLOWMERE — The Lantern Below

Hollowmere is an independent side-scrolling metroidvania family. It does not use the shooter combat, player, camera or
world plugins. A simulation/content/presentation split composes four reusable providers: side-scrolling platform
physics, a capability ledger, an explorable room map and the existing stack inventory.

**[Play Hollowmere on GitHub Pages](https://mojomast.github.io/fpsrizz/?preset=hollowmere/ascent)**

## Premise and run shape

The Lantern Tree is going dark. Three Sun Sigils sleep in the drowned kingdom of Hollowmere, and the Hollow King waits
behind the crown door. The Lantern Bearer starts at **Mossgate Threshold** with a saber and a beacon, then explores
twelve interconnected rooms across **Mossfall Approach**, **The Rootways**, **The Sunken Archive**, **Bellows Keep**
and **The Hollow Throne**.

A run has no procedural layout. The authored world graph is stable; combat, discovery, ability order and how much of the
map you reveal are the run's variables. Killing the Hollow King ends the run in victory. Death returns you to the last
bound beacon with your permanent abilities and collected items; enemies repopulate the room.

## Controls

| Input | Action |
|---|---|
| `A / D` or `← / →` | Move |
| `Space` / `Z` | Jump; second press in the air after unlocking Windroot |
| `J` / left click | Lantern saber combo; hold up/down to change the strike |
| `K` / `Shift` | Emberstep dash after unlocking it |
| `L` | Lantern Bolt after unlocking it; costs 10 focus |
| `W / S` | Aim saber up or dive; up also aims the bolt |
| `E` | Interact with a beacon, NPC, or threshold |
| `Esc` / `P` | Open/close the field journal |
| `M` | Open the journal directly on the world map |
| `1–5` in the journal | Map, Inventory, Capabilities, Stats, Options |
| `↑ / ↓`, `Enter` | Select/use an inventory item or toggle an option |
| `Tab` / `← →` / `Esc` | Journal tab navigation / close |

The pause menu is game-owned, not the host launcher. The experience uses a free pointer policy for clickable UI controls
without capturing the mouse.

## Movement

Movement is a deterministic fixed-step controller with:

- acceleration/friction, air control, gravity and variable-height jumping;
- **jump buffering** and **coyote time**;
- **Windroot** double jump;
- **Emberstep** dash with one grounded/air charge and cooldown;
- **Rootgrip** wall slide and wall jump;
- down + jump drop-through on one-way platforms;
- one-way platforms, solid terrain and spike hazards from authored room rows.

The provider is `mechanics/platforming` (`PlatformerRole`). It intentionally owns only movement/collision semantics; the
game supplies room collision, unlocked abilities and animation.

## Combat

The Lantern Saber has a three-step combo. A side strike has a short lunge on the third hit, an up strike covers aerial
space, and a down strike in the air bounces the bearer off a struck enemy. Enemy contact is not damage; telegraphed
strikes and projectiles are. Player invulnerability, screen-space damage labels, hit flashes, windup telegraphs, screen
shake and focus regeneration are presentation/combat policy; the canvas feedback module keeps labels at 11–14px and
caps simultaneous effects.

The bestiary is deliberately behavior-first rather than a single health slider:

| Enemy | Behaviour |
|---|---|
| Moss Goblin | Patrols and commits to a telegraphed melee strike |
| Thorn Spider | Fast charger; closes distance quickly |
| Cave Bat | Hovering flyer |
| Bone Archivist | Durable archive guardian |
| Drowned Echo | Floating caster with a ranged ember |
| Cinder Golem | Heavy charger |
| The Hollow King | Two-phase boss with a shockwave and phase-two projectile fans |

## Abilities, items and gating

The capability ledger is reusable and stores named unlocks. Hollowmere unlocks:

| Ability | Source | Use |
|---|---|---|
| Lantern Saber | Starting capability | Sword combo |
| Windroot | The Windroot Well | Second air jump |
| Emberstep | The Deep Rootway | Dash |
| Rootgrip | The Burrow of Hands | Wall slide/jump |
| Lantern Bolt | The Wax Vault | Ranged focus attack |

Three Sun Sigils are inventory keys: **Moss**, **Tides** and **Embers**. The Bellows Bridge crown door checks all three.
The world's rule gates are authored references to capability IDs or item IDs; the capability/room-map providers do not
know about Hollowmere's doors.

Items are ordinary `item` content managed by the reusable `mechanics/inventory` provider. The pack holds 20 stacks; Moss
Tonic and Focus Draught are usable in the pause journal. The world's starting pack and checkpoints are game policy.

## World map and pause journal

The reusable `mechanics/room-map` provider owns current/visited/revealed state and validates the room graph. It reveals
neighbours when entering a room; Hollowmere decides when a beacon or NPC reveals more. The field journal renders:

- **Map** — authored region-coloured room rectangles, known links, current marker and explored/fog silhouette.
- **Inventory** — stack counts, item art, descriptions and use/equip actions (the current pack has consumables).
- **Capabilities** — unlocked/sealed movement and combat skills with Assetrizz icons.
- **Stats** — completion, rooms visited/known, kills, deaths, sword level, embers and playtime.
- **Options** — screen shake, damage numbers, control hints and reduced flashes; persisted in
  `hollowmere/options.v1`.

Checkpoint beacons restore health/focus, bind respawn and save. Save data uses `hollowmere/save.v1`, schema 1, with
room/checkpoint, abilities, items, collected pickups, flags, embers, upgrades, stats and map state. Invalid or missing
saves start a fresh run; there is no in-room snapshot or cloud save.

## NPCs

- **Brann Emberhand** at Mossgate offers sword tempering for three embers, a free heal, and lore.
- **Mara, Root Scholar** in the optional Root Shrine reveals Archive rooms for eight embers and explains the Hollow King.

Both use Assetrizz night-watch/dye-merchant portraits and blacksmith/scholar world strips. Dialogue freezes the room
until a choice or close command; options are disabled when the cost or state is invalid. NPCs are optional.

## Presentation and feedback

The canvas feedback layer is deliberately separate from the camera transform. `effects.ts` projects world effects and
renders damage/heal text in screen space at 11–14 CSS px with a dark outline, deterministic rise/fade and hard caps
(12 labels, 16 impacts, 60 particles). Enemy windups show a progress ring and ground wedge; player damage gets a short
edge flash, low-health vignette and a persistent invulnerability rim rather than disappearing. World shadows, a
screen-space ground haze, drifting motes and a darker varied terrain pass add depth without changing collision or
simulation. The journal uses the same presentation contract with safe-area-aware responsive HUD and tab layouts.

## Composition and reuse

| Need | Provider / decision |
|---|---|
| Side-scrolling movement | New reusable `mechanics/platforming` + `PlatformerRole`; no existing provider covers platformer gravity/jumps |
| Ability unlocks and gates | New reusable `mechanics/capabilities` + `CapabilityRole`; keyed-door plugin is shooter-family and does not model movement unlocks |
| Explorable world map | New reusable `mechanics/room-map` + `RoomMapRole`; navigation is a pure graph query with no visited/revealed state |
| Items and consumables | Reuse `mechanics/inventory` + `item` content |
| Family simulation | `hollowmere/game` provides `Metroidvania`, owns rooms, combat, NPCs, saves and win rules |
| Presentation | `hollowmere/presentation` provides `sdk/hud`; canvas world and tabbed journal consume the family service |
| Content | `hollowmere/content` provides `metroidvania-world` and the five item definitions |
| Theme | `theme/assetrizz` role `theme/assetrizz-hollowmere`; assets are pinned through the existing Assetrizz manifest |

The preset `hollowmere/ascent` selects exactly one provider per role. `mechanics/platforming`, `mechanics/capabilities`
and `mechanics/room-map` have their own manifests and reuse sidecars and can be selected by another title without loading
Hollowmere. See [the reusable mechanics guide](reusable-mechanics.md), [navigation](navigation.md) for the graph-query
difference, and [inventory](inventory.md).

## Asset use

The game heavily reuses the pinned Assetrizz library:

- five 1280×720 region backdrops — forest clearing, misty swamp, cave interior, volcanic plain and castle hall;
- five terrain families plus platform edges rendered from hand-painted wall/floor painters;
- forest goblin, small imp, forest spider, bone skeleton, pale ghost, stone golem and cave bat strips;
- knight/mage/rogue humanoid strips, blacksmith/scholar NPC strips and portraits;
- ornate sword, feather, boots, gauntlet, wand, potion, gem, coin, scroll, map, lantern and crown icons;
- the existing Assetrizz hall plate as a journal backdrop.

Source: `https://github.com/mojomast/assetrizz`, revision `05339c228f55ac95ad21b5c947db0c6e36207cd4`; provenance remains
**original, generated for Kyle Durepos**. `scripts/assetrizz.json` pins every input and `scripts/assetrizz.py import`
regenerates public art and painters. No audio asset is claimed; the current presentation is visual-first.

## Evidence and limits

- `tests/mechanics-metroidvania-providers.test.ts` covers jump/dash/wall-jump behavior, capability non-regression and
  room-map visited/revealed/dispose state.
- `games/hollowmere/tests/hollowmere.test.ts` stages the full 12-room production preset, moves between rooms, binds a checkpoint, opens
  dialogue, uses a consumable while paused and checks map/ability/inventory observations.
- `tests/hollowmere-demo/run.mjs` drives the production bundle through the canvas, movement, journal tabs, map,
  inventory, capabilities, stats, options and pause/resume.
- The authored graph and all room rectangles are validated; **physical jump reachability is a playtest concern**, not
  proven by the static validator.
- This is a first full family slice: no gamepad, remapping, room editor, quest journal, animation graph, audio/music or
  multiple save slots yet. The composer can modify its preset but not its content rows.

### Hollowmere polish milestone verification — 2026-11-16

- `npm run check`: **773/773 tests**, typecheck, boundaries and reuse-index freshness passed. The provider suite,
  production Hollowmere suite, screen-space FX tests and graph-round-trip suite are included.
- `npm run validate-game -- --bundled`: **25 presets staged**, including `hollowmere/ascent`.
- `node tests/hollowmere-demo/run.mjs`: **5/5** production-browser checks for Assetrizz canvas/movement/jump, NPC dialogue,
  all five journal tabs, map shortcut and phone layout.
- `node tests/composer-demo/run.mjs`: **3/3** checks for graph loading, role metadata/inspector, live host staging and close flow.
- `node tests/creator-demo/run.mjs`: **67** creator-panel checks passed with the Canvas tab and generated map/provider metadata.
- `node tests/cinder-demo/run.mjs`: **6/6** preserved Cinder acceptance checks.
- `npm run smoke`: **37/37**; milestone production bundle hash
  `3b65fb123f2d8b913d5ddb52e0a7a99171d2991aa31a6a8dd41cb885666a59dd`.
