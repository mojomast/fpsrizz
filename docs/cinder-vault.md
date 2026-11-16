# CINDER VAULT — Ashbound Roguelite

A three-depth first-person dungeon roguelite built on the shooter stack. Each depth is a large generated wing of rooms
and corridors, populated with its own encounters, wardens, weapon caches and a descent portal. XP and boons are earned
**inside** a depth; there is no camp or draft screen between fights.

Launch the bundled preset `cinder/vault`, or use `?preset=cinder/vault` on the app URL, press Play, then enter the first
depth.

## Play

- **WASD** move; **mouse** aim; **left click / Space** fire; **1–6** select a bound weapon; **Q / wheel** cycles.
- **R** reloads a magazine. **Shift** sprint; **Ctrl** dash; **V** ember pulse.
- Kills grant XP and embers. When a level completes, a non-blocking boon tray appears at the right. **Combat continues.**
  Press **7, 8 or 9** whenever you are ready to take the corresponding level reward.
- Each depth's **Ash Warden** seals the descent. Kill it, then step onto the glowing descent pad to teleport into the next
  wing. The third depth ends with the **Cinder Keeper**; defeating it ends the run.
- **Esc** pauses. Restart from the host result screen after victory or death. There is no in-run camp, shop or loading
  interstitial.

The generated map is **94 × 30 cells** (188 × 60 m): three isolated 30-cell wings with solid void between them. Each wing
has 7, 8 or 9 rooms plus connecting single-cell corridors, room lights and a descent pad. The layout is deterministic for
the content seed; encounters, boon offers and caches vary by run attempt. Cinder teleports between wing start markers, so
the immutable world does not need runtime map replacement.

Depths are **The Ash Gate**, **The Hollow Court** and **The Cinder Sanctum**. Encounters are placed from room markers:
regular enemies occupy non-start rooms, one warden occupies the warden room, and the final wing adds two attendants to the
Keeper. Loot rooms contain a medkit, bolt cache and one weapon cache when an unclaimed weapon remains. Descending grants
48 rounds, five sparks and 20 health.

## Experience and boons

Levels require `30 + 20 × (level − 1)` XP. Enemy XP is derived from score: Ash Thrall 10, Candle Imp 15, Ash Warden 80,
Cinder Keeper 300. Each completed level grants **+5 maximum health and heals 6**, then queues a reward. Multiple levels can
complete from a single kill; one offer is shown at a time and the next is drawn after you choose.

Three offers are generated: one unclaimed weapon and two relic boons while weapons remain, then three relic boons. The
offer is a normal HUD overlay, not a pause. If you ignore it, combat keeps running and further completed levels queue.
Weapons found in caches are also added to the current arsenal and never offered again.

| Boon | Each rank |
|---|---|
| Oath of the Blade | +25% outgoing weapon and pulse damage |
| Heart of the Undying | +25 maximum health and 35 immediate healing |
| Saint of Iron | 12% incoming damage reduction, additive to 36% at rank three |
| Ruby Hunger | Heal four per player-attributed kill |
| Starless Spark | +20 base pulse damage and +2m pulse radius |
| The Gilded Debt | +3 run embers per kill |

The run starts with **Thornwake** (knife) and **Cinderkey** (pistol) and opens on the pistol. Weapon caches can grant the
other four. All six are drafted through level-up offers and armory caches:

| Slot | Weapon | Role | Magazine / reload | Firing |
|---|---|---|---|---|
| 1 | **Thornwake** | Knife | Unlimited | Quick melee, 40 damage per swing |
| 2 | **Cinderkey** | Pistol | 8 / 0.9s | Precise semi-auto, 34 damage |
| 3 | **Mothspindle** | SMG | 28 / 1.5s | Automatic, 13 damage, wide spread |
| 4 | **Briarward** | Assault | 20 / 1.8s | Automatic, 25 damage, tighter bursts |
| 5 | **Far Oracle** | Sniper | 5 / 2.0s | Semi-auto, 90 damage, long range |
| 6 | **Ashbell** | Rocket | 2 / 2.3s | Explosive ember projectile, 95 damage |

Cinderkey, Far Oracle, Thornwake and Ashbell fire per press; Mothspindle and Briarward can be held. Rounds and sparks are
shared reserves; a new magazine weapon is chambered from its ammo grant, and reloads conserve the reserve. Boons and
weapons reset on death or restart; meta legacy does not.

## Legacy and persistence

Kills grant 3 run embers, plus two per Gilded Debt rank. Ending a run awards
`floor(run embers / 20) + 10 for victory` legacy embers. Every eight legacy embers grants five extra starting health, capped
at 25. This small persistent bonus makes failed attempts useful without removing the need to learn the depths.

Profile keys are `cinder/vault.v1.embers` and `cinder/vault.v1.runs`, each a stored integer from 0 to 1,000,000. Invalid or
out-of-range values read as zero. The run attempt and legacy balance save at run start/end; there is no in-progress run
save/restore. Unavailable or corrupt storage is reported in the HUD and the run remains playable.

## Composition and reuse decisions

| Need | Inspected candidate | Decision |
|---|---|---|
| FPS movement, combat, AI, collision and rendering | `core/player`, `core/combat`, `core/enemies`, `core/world`, `core/presentation`, `example/dash-controller` | Compose unchanged public services/content and the existing sprint/dash controller |
| Large dungeon layout | `example/key-dungeon`, `core/world` map formats | No existing generator or runtime map swap. Add `dungeon/generator`; Cinder consumes its room markers and teleports between isolated wings |
| XP and levels | `mechanics/objectives`, `example/roguelite`, `mechanics/sequence` | Objectives are one-shot DAGs; example/roguelite uses automatic rewards. Add `mechanics/progression` for owned XP/level/pending state and keep reward policy local |
| In-level reward choice | `Cinder`, `Input`, `HudRole` | Three-card non-modal tray; 7/8/9 input; no `InputContexts` exclusive mode, so weapon/reload/fire continue |
| Currency, pulse cooldown and depth objective | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives`, `recipe/resource-actions` | Author a one-action `cinder/kit`; track depths with the shared objective track |
| Weapon grants | `Combat.giveWeapon`, `core/give-weapon`, `WeaponRuntime` | Extend `giveWeapon` to chamber available reserve; use caches and level boons; shared combat owns reloads |
| Persistence | `Profile`, `recipe/profile-storage` | Two bounded versioned scalar keys; preserve unrelated profile values |
| Damage upgrades | `DamageModifiers`, `example/ward` | Cinder-local component/modifier; no generic effect-stack engine |
| Art | Assetrizz manifest, Gloamforge weapon sets, `theme/assetrizz-fantasy` | Add the `theme/assetrizz-cinder` surfaces and six-view weapon variant; import UI images and verified card previews |

Plugins: `dungeon/generator` (map format and marker prefab), `mechanics/progression` (XP ledger), `cinder/game`
(depth orchestration and HUD-facing service), `cinder/content` (map recipe, weapons, enemies, caches, kit) and
`cinder/hud` (selected HUD). The preset composes resources, clock, actions, objectives and progression through roles.
`Cinder` in `src/sdk/contracts/cinder.ts` exposes detached observations and bounded semantic commands, not mutable game
authority. Simulation remains headless; browser UI is optional.

## Assets and provenance

Source: `https://github.com/mojomast/assetrizz`, revision `05339c228f55ac95ad21b5c947db0c6e36207cd4`.
The artwork's recorded provenance is **“original, generated for Kyle Durepos”**, not the repository code's MIT license.
`scripts/assetrizz.json` pins source paths and SHA-256s; `public/assetrizz/provenance.json` ships the record. Reproduce
with `python3 scripts/assetrizz.py import`.

The HUD uses the imported ornate relic icons and the six weapon previews. The Assetrizz hall plate remains a pinned
provenance asset but no longer drives an intermission. Existing fantasy tiles, goblin/imp animation strips and
Gloamforge weapon renders supply the dungeon and combat presentation.
Cinder's tile painters crop transparent margins, fill residual transparency and use dark cave stone for ceilings.
`src/plugins/theme-assetrizz/cinder-weapons.ts` encodes all six 512px weapon renders. `scripts/weapon-previews.json` pins
the preview sources; `python3 scripts/import-weapon-previews.py` writes 192px card thumbnails and
`public/weapons/provenance.json` (`--check` verifies them). Weapon art is original to this project under
`assets/weapons/fantasy/README.md`. Audio is synthesized, including distinct firing cues and the Ashbell bell report.
No Assetrizz audio or unrelated provenance is implied. All shipped art is local at runtime.

## Evidence

`tests/mechanics-progression.test.ts` exercises the default and an independent counted-total progression provider,
multi-level grants, pending rewards, caps, pause, ownership and restart. `tests/dungeon-generator.test.ts` verifies
deterministic seeded layouts, one- and three-wing maps, room connectivity, markers, free-space placement, descent pads,
sealed borders and recipe rejection. `tests/cinder-vault.test.ts` covers the large-map start, in-level level-up while
combat and firing continue, boon selection/epoch rejection, weapon caches, all three depths, the Keeper, validation,
pause/death/profile/restart and pulse legality under default and independent progression. `tests/cinder-demo/run.mjs`
runs the production bundle: live movement/fire, non-modal boon selection at desktop/phone sizes, all depth transitions,
victory and restart. Journey combat encounters are accelerated through the public combat service for test duration;
controller, weapon and HUD behavior is exercised before and during that route.

### Integrated verification — 2026-11-16

- `npm run check`: **722 tests passed**, including typechecking, import boundaries and generated-index freshness.
- `npm run validate-game -- --bundled`: **24 presets staged successfully**.
- `npm run build`: production bundle generated successfully.
- `node tests/cinder-demo/run.mjs`: **six acceptance groups passed** — generated dungeon start, live controller/fire,
  non-modal keyboard boon selection, depth-two population, all three depths plus Keeper victory, restart, and no
  console/network errors.
- `npm run smoke`: **36/37**. All gameplay, restart/ownership and console checks pass; the existing default-shooter
  headless SwiftShader frame-budget assertion still fails at 4.1 FPS / 149.17 ms CPU per frame (14 draw calls). No
  threshold was weakened and Cinder does not use that scene. This remains an environmental performance limitation, not
  a stable hardware 60-FPS claim.
- Discovery: **67 plugins, 131 public SDK runtime values, 12 recipes**. The new progression recipe and dungeon map format
  are searchable.
- Live preview at `https://mail.tailec998.ts.net:8447/?preset=cinder/vault` returned HTTP 200 for the page, bundle,
  weapon previews and provenance; the served JavaScript matched `dist/assets/main.js` by SHA-256
  (`8e64533639fef94cd0175873100d2376eefed3b90ff4a50e00df45d6bd34248d`).

Browser evidence is in `.smoke/cinder-report.json` and `.smoke/cinder-*.png`; smoke evidence is in
`.smoke/smoke-report.json`. Hands-on pointer-lock and subjective audio review remain unverified; browser acceptance uses
the established test-mode pointer-lock accommodation.
