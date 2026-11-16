# CINDER VAULT — Ashbound Roguelite

A turn-based first-person dungeon roguelite. Every run has three large generated wings, a chosen class, action-point
movement/combat, telegraphed enemy turns, loot and an inventory. XP and level rewards happen **during** a depth; there is
no camp, draft or loading interstitial.

Play the current build: **[Cinder Vault on GitHub Pages](https://mojomast.github.io/fpsrizz/?preset=cinder/vault)**. Launch the bundled preset `cinder/vault`, or use `?preset=cinder/vault` on the app URL, press Play, choose a vault threat
with **7 / 8 / 9** and a class with **1 / 2 / 3**, then descend. Delver is the default threat.

## Play

- **WASD** takes one cardinal tile per press; **mouse** aims freely. In isometric view WASD is relative to the camera azimuth;
  in first person it follows the player's facing. Each step costs 1 action.
- **Click / Space** attacks. Cinderkey, Thornwake, Mothspindle and Briarward cost 1 action; Far Oracle and Ashbell cost 2.
  Mothspindle fires a 3-round burst and Briarward a 2-round burst per action. **1–6** switch weapons for free. **R**
  reloads for 1 action.
- **Enter** ends the turn. A turn starts with 3 actions (Vaultrunner 4); when actions run out the enemy phase begins.
- **V** releases an ember pulse for 1 action. **I** opens the pack; ↑/↓ selects, Enter uses/equips/unequips, **TAB**
  filters All/Gear/Items, **DEL** drops one carried item and **C** opens the forge. Consumable use and gear changes cost 1 action.
- **M** opens the tactical grid; **E** talks to a nearby NPC. **1–4** selects dialogue options and **E** closes dialogue.
- **H** opens the field guide. It is a keyboard-only reference panel and blocks movement while open.
- **O** toggles the reusable first-person / orthographic isometric camera; **Z / X** rotate it. Cinder uses a free pointer:
  in isometric view, WASD moves relative to the camera, hover to preview a move’s AP cost or an attack’s range/health, click a
  reachable floor tile to spend its path AP, or click a visible enemy to aim and attack with the current weapon. The entire run
  can be played from isometric view; first person remains available. Short hall transitions cover class entry and depth descent.
- On the class screen, **7 / 8 / 9** chooses the vault threat. During a run, **7 / 8 / 9** chooses a level-up boon. Combat and
  turns continue while the boon tray is open; it is not a modal intermission.
- Each depth's **Ash Warden** seals the descent. Kill it, step onto the glowing pad, and the next wing loads in place.
  The third depth ends with the **Cinder Keeper**.
- **Esc** pauses. Restart from the host result screen after victory or death.

The generated map is **94 × 30 cells** (188 × 60 m): three isolated 30-cell wings with solid void between them. Each wing
has 7, 8 or 9 rooms plus connecting single-cell corridors, room lights and a descent pad. The layout is deterministic for
the content seed; encounters, boon offers, loot and class mastery vary by run/attempt. Cinder teleports between wing start
markers, so the immutable world does not need runtime map replacement.

Depths are **The Ash Gate**, **The Hollow Court** and **The Cinder Sanctum**. Regular enemies occupy non-start rooms, one
warden occupies the warden room, and the final wing adds an Ash Hound and Ember Acolyte attendant to the Keeper. Loot rooms
contain a medkit, ammo cache and a weapon cache while an unclaimed weapon remains. Each depth also adds one weighted pack
cache, plus one shard and one cache per point of threat loot bonus. Descending grants 48 rounds, five sparks and 20 health.

Depth encounter pools widen as the wing deepens:

| Depth | Regular enemy pool |
|---|---|
| I · The Ash Gate | Ash Thralls, Candle Imps, Ash Hounds |
| II · The Hollow Court | Ash Thralls, Candle Imps, Ash Hounds, Ember Acolytes |
| III · The Cinder Sanctum | Candle Imps, Ash Hounds, Ember Acolytes, Cinder Brutes |

| Enemy | Behavior |
|---|---|
| Ash Thrall | Melee chaser; reliable baseline damage |
| Candle Imp | Ranged cinder projectile; prefers distance |
| Ash Hound | Fast melee; **two actions per enemy turn** |
| Ember Acolyte | Ranged support; **mends the most wounded visible ally within 8m** for 12 instead of attacking |
| Cinder Brute | Durable heavy melee; high health and damage |
| Ash Warden | Melee depth boss; enrages below half health |
| The Cinder Keeper | Ranged final boss with two actions; enrages to three |

## Turn rules and enemy intent

`TurnControl` disables autonomous real-time enemy AI for Cinder; the mode owns moves and attacks. During the player turn
nothing acts until the turn ends. Engaged enemies report whether they will **attack** or **advance**; attackers are tinted
red and counted in the HUD. End Turn resolves all engaged enemy actions: each enemy gets one action (line-of-sight attack
or one-cell advance), Ash Hounds and Swift elites get two, Ember Acolytes may mend instead of acting, and the final Keeper
gets two. Enraged bosses gain one additional action. Enemy attacks are immediate after commitment and use their damage
values; the player's class/gear armor reduces them.

## Vault threat and elites

The class screen exposes three opt-in threat tiers with **7 / 8 / 9**. The chosen threat applies from the first wing and is
shown in the turn bar and result screen; the best cleared threat persists.

| Threat | Enemy damage | Enemy health | Elite chance | Healing | Extra loot | Legacy |
|---|---:|---:|---:|---:|---:|---:|
| Pilgrim | ×0.85 | ×0.90 | 3% + depth | ×1.25 | — | ×0.80 |
| Delver | ×1.00 | ×1.00 | 10% + depth | ×1.00 | — | ×1.00 |
| Ashbound | ×1.20 | ×1.10 | 28% + depth, at least one per wing | ×0.80 | shard + cache per depth | ×1.30 |

Depth adds 5 percentage points to elite chance (capped at 65%). Elites gain one visible affix and 30% more health:

| Affix | Effect |
|---|---|
| Warded | 25% incoming damage reduction |
| Swift | Two actions per enemy turn |
| Emberbound | Detonates for 22 damage within 3.2m when slain |
| Siphoned | Heals itself for 8 whenever it strikes the player |

Wardens and the Keeper enrage at 50% health. Their HUD name changes to `ENRAGED`, the Warden gains a second action and the
Keeper a third. Threat does not grant hidden rubber-banding or mid-run scaling.

If no enemy has noticed the player, ending a turn immediately starts the next player turn instead of showing a fake
enemy-phase pause. This keeps exploration moving without making enemy turns real-time. Design sources and balance
rationale are in the [turn-based roguelite research notes](research/turn-based-roguelite-2026-11-16.md).

## Classes and mastery

All three classes are available at the start; persistent class mastery is the long-term progression axis.

Base table; class cards add legacy health and mastery bonuses.

| Class | Base health | Actions | Opening extra | Identity |
|---|---:|---:|---|---|
| **Ash Warden** | 130 | 3 | — | 10% damage reduction; two Ember Draughts; knight avatar |
| **Emberwright** | 90 | 3 | Ashbell | +35% pulse damage; Ember Flask; mage avatar |
| **Vaultrunner** | 85 | 4 | Mothspindle | +10% weapon damage; Ember Flask; rogue avatar |

All classes carry Thornwake and Cinderkey. Class mastery stores persistent XP in three profile keys; thresholds
**20 / 50 / 90 / 140 / 200** grant +5 health, a starting draught, +5% class damage, +5 health and +5% class armor. The
class cards show rank, XP and the next threshold. See [classes, loot and mastery](cinder-classes.md).

## Experience and boons

Levels require `30 + 20 × (level − 1)` XP. Enemy XP is derived from score: Ash Thrall 10, Candle Imp 15, Ash Hound 14,
Ember Acolyte 22, Cinder Brute 32, Ash Warden 80, Cinder Keeper 300. Each level grants **+5 maximum health and heals 6**,
then queues a reward. Multiple levels can complete from one kill; one offer is shown at a time and the next is drawn after
you choose.

Three offers are generated: one unclaimed weapon and two relic boons while weapons remain, then three relic boons. The
offer is a normal HUD overlay, not a pause.

| Boon | Each rank |
|---|---|
| Oath of the Blade | +25% outgoing weapon and pulse damage |
| Heart of the Undying | +25 maximum health and 35 immediate healing |
| Saint of Iron | 12% incoming damage reduction, additive to 36% at rank three |
| Ruby Hunger | Heal four per player-attributed kill |
| Starless Spark | +20 base pulse damage and +2m pulse radius |
| The Gilded Debt | +3 run embers per kill |
| Executioner's Oath | +30% damage to enemies below half health |
| Emberheart | Recover 2 health at the start of each player turn |
| Shardfinder | Wardens and elite kills yield an extra Ember Shard |
| Warpath | Gain 1 action whenever you personally slay an enemy |

The six-weapon arsenal remains:

| Slot | Weapon | Role | Magazine / reload | Firing |
|---|---|---|---|---|
| 1 | **Thornwake** | Knife | Unlimited | Quick melee, 40 damage; 1 action |
| 2 | **Cinderkey** | Pistol | 8 / 0.9s | Precise semi-auto, 34 damage; 1 action |
| 3 | **Mothspindle** | SMG | 28 / 1.5s | 3-round burst, 13 damage each, wide spread; 1 action |
| 4 | **Briarward** | Assault | 20 / 1.8s | 2-round burst, 25 damage each, tighter; 1 action |
| 5 | **Far Oracle** | Sniper | 5 / 2.0s | Semi-auto, 90 damage, long range; 2 actions |
| 6 | **Ashbell** | Rocket | 2 / 2.3s | Explosive ember projectile, 95 damage; 2 actions |

Rounds and sparks are shared reserves; a new magazine weapon is chambered from its ammo grant, and reloads conserve the
reserve. Boons, gear, weapons and run loot reset on death or restart; class mastery and legacy do not.

## Automap and tactical grid

The HUD carries a compact **fogged automap** of the current wing. Explored floor and derived wall outlines persist for the
depth, while enemies, NPCs, loot and the descent marker are shown only when currently visible/explored. **M** expands the
same state into a tactical grid with AP-reachable cells highlighted and enemy intent markers. The map is a fixed 2D
canvas: it cannot be panned, zoomed or annotated, and it does not reveal unexplored layout unless Vey the Cartographer is
paid to chart the wing (10 run embers). The automap is hidden on narrow screens; the tactical grid remains available. Design sources and transition/map/NPC/
crafting rationale are in the [UX and world-feature research notes](research/ux-world-features-2026-11-16.md).

## First-person and isometric view

Cinder selects the reusable `presentation/camera-modes` CameraRole instead of `core/fp-camera`. `O` toggles between the
normal interpolated first-person view and an orthographic isometric follow camera. The simulation, controller, collisions,
turn loop and pointer aim are unchanged; the player's mounted weapon view AND HUD crosshair are hidden in isometric mode
so the overview stays readable.

`ViewModes` is an optional SDK presentation service with mode/yaw, rotation and ground-picking helpers. On mode change
`core-presentation` hides ceiling quads and first-person-only weapon view models, disables distance fog, and relies on
wall-top caps for a closed overhead silhouette. Cinder's free pointer feeds `pickGround` into AP-spending click actions.
The camera role draws a floor ring and facing arrow. `presentation/player-avatar` supplies a class-specific Assetrizz body
sprite in isometric mode (knight/mage/rogue) and removes it again in first person. The camera uses a fixed diagonal
orthographic projection, follows with short smoothing and snaps after large teleports. Mouse yaw still
sets aim; the arrow shows facing. `O` restores the first-person camera, ceiling/fog/weapon presentation and crosshair.

The mode is presentation-only and has no pan, zoom, full scene picking or second 2D renderer. `pickGround` is limited to
the ground plane, so clicking the visible floor or the tile under an enemy is the targeting model. First-person weapons use
a bottom-center rig with a smaller footprint. See [weapon presentation](weapon-rig.md) and [camera modes](camera-modes.md)
for the reusable presentation contracts.

## NPCs and crafting

Each depth starts with one optional friendly NPC near the start marker; from depth two an **Ash Oracle** can also be found
in a loot room:

- **Orla, Ember Smith** (depths 1 and 3) opens the forge, can mend 30 health once for 12 run embers, and gives a lore line.
- **Vey, Lantern Cartographer** (depth 2) can reveal the current wing once for 10 run embers and offers warden lore.
- **The Ash Oracle** (depths 2–3, random loot room) offers two once-per-visit bargains: lose 20 health for a random relic
  boon, or spend 25 run embers for a random sealed item. Her blood pact cannot reduce the player below 1 health.

NPCs use Assetrizz blacksmith/scholar world strips and dye-merchant/night-watch portraits. The Oracle reuses the night-watch
portrait and world strip with a lavender tint. Approach and press **E**. The dialogue is a small optional hub; it pauses the
turn only because the player chose to open it, and `E` closes it. No NPC is required for progression.

### Ember forge

`mechanics/crafting` owns the generic known-recipe execution; Cinder owns the UI, Ember Shard drops and run-ember costs.
Pack `C` opens the forge anywhere; Orla's dialogue opens the same panel. Each row shows every input's `have/need`, the
output, the ember cost and whether the recipe is currently legal. Crafting is deterministic and atomic: inputs are
consumed only if the full output can be placed, otherwise the inputs are restored. The nine recipes are:

| Recipe | Inputs | Output | Embers |
|---|---|---|---:|
| Brew Ember Draught | 2 Ember Shard | Ember Draught | 2 |
| Brew Ember Flask | 1 Ember Draught + 1 Ember Shard | Ember Flask | 4 |
| Brew Ember Tonic | 1 Ember Draught + 1 Ember Shard | Ember Tonic | 6 |
| Forge Iron Band | 2 Ember Shard | Iron Band | 4 |
| Forge Ashplate | 2 Ember Shard + 1 Ember Draught | Ashplate | 8 |
| Gild a Chain | 2 Ember Flask + 1 Ember Shard | Gilded Chain | 10 |
| Cut Oracle Lens | 1 Hunter's Charm + 2 Ember Shard | Oracle Lens | 12 |
| Cut Obsidian Edge | 1 Hunter's Charm + 2 Ember Shard | Obsidian Edge | 14 |
| Forge Warden Plate | 1 Ashplate + 3 Ember Shard | Warden Plate | 16 |

Ember Shards are stackable uncommon loot; each depth grants one, regular enemies have a 32% chance and wardens grant one. There is no recipe discovery, failure
chance or randomized output; known recipes keep the short run focused on shard drops and ember spending. See
[crafting](crafting.md).

## Inventory, loot and persistence

The pack is a reusable `mechanics/inventory` provider: 12 stack slots, armor and charm equipment slots. Each depth adds
one guaranteed Ember Shard plus one weighted cache item; Ashbound adds a shard and cache per threat loot point. An Ash Warden
guarantees a shard, a random cache and an equipment item; the final Keeper also drops a draught. Regular enemies have
a 32% shard chance and an independent 18% gear/consumable chance. Ember Shards feed the forge. Pack filters, drop and
crafting are Cinder policy over the generic inventory handle. Gear is applied locally by Cinder:

| Item | Type | Effect |
|---|---|---|
| Ember Draught | Consumable, common | Restore 35 health; 1 action |
| Ember Flask | Consumable, uncommon | 45 damage to visible foes within 6m; 1 action |
| Ember Tonic | Consumable, rare | Restore 20 health and gain 1 action; costs 1 action |
| Shard Bomb | Consumable, uncommon | 35 damage to visible foes within 4m; 1 action |
| Iron Band | Armor, common | 5% incoming damage reduction |
| Ashplate | Armor, uncommon | 8% incoming damage reduction |
| Warden Plate | Armor, epic | 12% incoming damage reduction |
| Hunter's Charm | Charm, uncommon | +8% weapon damage and 1 health per kill |
| Oracle Lens | Charm, rare | +15% weapon damage |
| Obsidian Edge | Charm, rare | +12% weapon damage |
| Gilded Chain | Charm, rare | +2 embers per kill |
| Ember Shard | Crafting ingredient, uncommon | Consumed by the six forge recipes |

Kills grant 3 run embers plus boon/gear bonuses. Ending a run awards `floor(run embers / 20) + 10 for victory` legacy
embers, multiplied by the threat legacy factor (Pilgrim 0.8, Delver 1.0, Ashbound 1.3). Every eight legacy embers grants
five extra starting health, capped at 25. Profile keys are `cinder/vault.v1.embers`, `.runs`, `.threat` (best cleared
threat rank) and `.mastery.warden` / `.emberwright` / `.vaultrunner`. Invalid values read as zero. No in-progress run
save/restore exists. Unavailable/corrupt storage is reported but the run remains playable.

## Composition and reuse decisions

| Need | Inspected candidate | Decision |
|---|---|---|
| Camera/view toggle | `core/fp-camera`, board/vehicle/puzzle orthographic presentations | Add reusable `presentation/camera-modes` + `ViewModes`; keep Cinder simulation/controller unchanged |
| Turn-based movement/combat | existing `core/player` continuous controller, `board/tactics` | Board tactics is a separate family. Add a Cinder-local action-point controller; expose `TurnControl` so core autonomous enemy AI is suspended |
| Large dungeon layout | `example/key-dungeon`, `core/world` map formats | Add `dungeon/generator`; Cinder consumes room markers and teleports between isolated wings |
| XP and levels | `mechanics/objectives`, `example/roguelite`, `mechanics/sequence` | Objectives are one-shot DAGs; add `mechanics/progression` for XP/level/pending state, keep boons local |
| Inventory and equipment | `story/adventure`, key possession, resources | No stack/equipment provider. Add `mechanics/inventory`; Cinder owns item effects, filters/drop, loot and HUD |
| Crafting | `mechanics/actions`, `mechanics/resources`, story item combinations | Add `mechanics/crafting` for atomic known item recipes; Cinder owns Ember Shard drops, ember costs, NPC forge and UI |
| Classes and persistent mastery | `Profile`, progression provider | Three local class definitions plus versioned mastery keys; class perks and selection remain game policy |
| Currency, pulse cooldown and depth objective | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives` | One-action turn-domain `cinder/kit`; track depths with the shared objective track |
| Weapon grants | `Combat.giveWeapon`, `core/give-weapon`, `WeaponRuntime` | Shared combat owns magazines; Cinder adds class/cache grants and instant turn-cost reloads |
| Damage upgrades | `DamageModifiers`, `example/ward` | Cinder-local buffs component combines class, gear, enemy-affix and boon modifiers |
| Difficulty and elites | hard-coded depth counts, core enemy AI | Threat tiers are Cinder data; elites are a run-local component read by the manual turn. Behavior-first modifiers avoid a single HP slider |
| Enemy turn metadata | `AiBehaviors` registry, core chaser/ranged | Add `cinder/manual` as a validated metadata/no-op AI behavior for Cinder-only multi-action and support fields; autonomous AI stays suspended |
| Risk/reward event | existing NPC dialogue/service pattern | Add the Oracle role and run-local pact/trade state through the existing NPC prefab and dialogue HUD |
| Art | Assetrizz manifest, Gloamforge weapon sets, `theme/assetrizz-fantasy` | Add `theme/assetrizz-cinder` surfaces/weapons, NPC world strips and two NPC portraits; import UI images and verified card previews |

Plugins: `presentation/camera-modes`, `presentation/player-avatar`, `dungeon/generator`, `mechanics/progression`, `mechanics/inventory`,
`mechanics/crafting`, `cinder/game`, `cinder/content` and `cinder/hud`. `Cinder` exposes detached observations and bounded semantic commands. `TurnControl`,
`ProgressionProviders`, `InventoryProviders`, `CraftingProviders` and `Items` are public SDK contracts.

## Assets and provenance

Source: `https://github.com/mojomast/assetrizz`, revision `05339c228f55ac95ad21b5c947db0c6e36207cd4`.
The artwork's recorded provenance is **“original, generated for Kyle Durepos”**, not the repository code's MIT license.
`scripts/assetrizz.json` pins source paths and SHA-256s; `public/assetrizz/provenance.json` ships the record. Reproduce
with `python3 scripts/assetrizz.py import`.

The HUD uses the imported ornate relic icons, item icons, six weapon previews, two NPC portraits, Assetrizz
blacksmith/scholar NPC strips and knight/mage/rogue player avatar strips. The Oracle reuses the night-watch portrait/world
strip with a lavender tint, so this pass adds no new image provenance. The Assetrizz hall plate is reused as the class/depth
transition backdrop. Existing fantasy tiles, goblin/imp animation strips and Gloamforge renders supply the dungeon and
combat presentation. Cinder's tile painters crop transparent margins, fill residual transparency and use dark cave stone
for ceilings. `src/plugins/theme-assetrizz/cinder-weapons.ts` encodes all six 512px weapon renders.
`scripts/weapon-previews.json` pins the preview sources; `python3 scripts/import-weapon-previews.py` writes 192px card
thumbnails and `public/weapons/provenance.json` (`--check` verifies them). Weapon art is original under
`assets/weapons/fantasy/README.md`. Audio is synthesized. No Assetrizz audio or unrelated provenance is implied.

## Evidence

`tests/mechanics-progression.test.ts` exercises the default and independent counted-total progression providers.
`tests/mechanics-inventory.test.ts` covers stack capacity, atomic add/remove, gear swaps, full-bag rejection, pause,
ownership and restart. `tests/dungeon-generator.test.ts` verifies layouts, connectivity, markers and recipe rejection.
`tests/cinder-vault.test.ts` covers class and threat selection, threat health scaling, guaranteed Ashbound elites, boss
enrage, the new enemy/`cinder/manual` registrations, the Oracle blood pact, field-guide blocking, one-tile action-point
turns, suspended autonomous AI, enemy intent and damage, inventory consumption/equipment, in-level level-up, weapon caches,
all three depths, the Keeper, validation, pause/death/profile/restart and pulse legality under default and independent
progression. `tests/cinder-demo/run.mjs` runs the production bundle: threat/class select, field guide, live
movement/fire/end-turn, isometric hover preview, inventory, non-modal boon selection at desktop and phone sizes, all depth
transitions, victory and restart. Journey combat encounters are accelerated via the public combat service; controller, turn,
inventory and HUD behavior is exercised before/during that route.

### Cinder/Hollowmere milestone verification — 2026-11-16

- `npm run check`: **773/773 tests**, typecheck, boundaries and reuse-index freshness passed. Coverage now includes
  threat selection and health scaling, guaranteed Ashbound elites, boss enrage, the new enemy/`cinder/manual`
  registrations, the Oracle blood pact, field-guide input blocking, AP hover data, class/threat UI, plus the existing
  turn, inventory, map/grid, camera/avatar, NPC/forge, all-depth and independent-progression suites.
- `npm run validate-game -- --bundled`: **24 presets staged**, including `cinder/vault`.
- `npm run build`: passed; production `dist/` built.
- `node tests/cinder-demo/run.mjs`: **6/6**, covering class and threat selection, class/depth transitions, field guide,
  first-person/isometric view with avatar, isometric AP hover preview, camera rotation/picking, bottom-center weapon
  presentation, automap/tactical grid, NPC dialogue, forge overlay, filtered pack and drop, movement, firing, end turn,
  non-modal boons, all depths, victory and restart.
- Discovery: **71 plugins, 144 SDK values, 15 recipes** after the threat/elite/QoL pass. The content pack now carries
  **7 enemy archetypes, 12 item definitions and 9 crafting recipes**.
- `npm run smoke`: **37/37**; the default shooter passed the headless frame-budget check in the final run (latest
  8.6 FPS, 1.34 ms CPU/frame, 13 draw calls, 1,978 triangles). No threshold was changed.
- Deployment: GitHub Pages serves **https://mojomast.github.io/fpsrizz/?preset=cinder/vault** from the `gh-pages`
  branch. That milestone's `dist/assets/main.js` SHA-256 was `3b65fb123f2d8b913d5ddb52e0a7a99171d2991aa31a6a8dd41cb885666a59dd`.

Browser evidence is in `.smoke/cinder-report.json` and `.smoke/cinder-*.png`; smoke evidence is in
`.smoke/smoke-report.json`. The screenshots include threat/class selection, field guide, isometric AP hover, class/depth
transitions, automap/grid, NPC dialogue, forge, filtered pack and phone layouts. Hands-on cursor/pointer feel, threat/class
balance and subjective audio review remain pending; browser acceptance uses the established test-mode pointer-lock
accommodation and accelerated journey combat via the public combat service. The automated evidence validates mechanics and
acceptance, not a player-study balance conclusion.
