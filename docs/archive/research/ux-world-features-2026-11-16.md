# UX and world-feature research — 2026-11-16

This research informed the second Cinder Vault pass: short area transitions, a fogged automap with a tactical grid,
pack filtering/drop management, optional NPC dialogue, and known-recipe crafting.

## Findings

1. **Transitions should orient, not delay.** NN/g recommends roughly 100–500 ms for most interface motion, with
   larger entrances at 200–300 ms and easing out on arrival and in on exit
   ([NN/g duration](https://www.nngroup.com/articles/animation-duration/)). A game-UI motion system recommends
   250–400 ms for full-screen transitions, and says to animate the frame rather than the content the player came for
   ([UI animation](https://h-idris.com/blog/game-ui-animation.html)). Cinder uses a short 600 ms house/hall wipe for
   entering a class or depth, does not block input during it, respects reduced-motion, and keeps the class/depth title
   legible for only a moment. Pack, crafting, dialogue and grid panels enter in about 200 ms.
2. **Maps need two kinds of memory.** Roguelike fog-of-war practice distinguishes a persistent explored layout from what
   is visible now; revealing everything removes the exploration loop, while hiding the current room makes tactical play
   guesswork ([fog-of-war discussion](https://www.reddit.com/r/roguelikedev/comments/58p0gd/looking_for_advice_and_tips_on_fog_of_war/),
   [explored vs visible minimap](https://www.youtube.com/watch?v=BbIjfVo_KRc)). Cinder keeps an explored tile set, draws
   only explored floor/wall outlines, and shows current-visible enemies. The compact automap supports orientation; `M`
   opens a larger tactical grid with current AP-reachable cells. NPCs and exits are landmarks; loot is only marked where
   explored.
3. **Inventory management should be fast, filtered and reversible.** Inventory UX guidance repeatedly recommends category
   tabs/filters and predictable sorting because players arrive with a specific intent
   ([inventory system categories](https://getarmature.com/building-a-custom-game-inventory-system-with-armature),
   [iterative inventory UI](https://gridsagegames.com/blog/2016/06/iterative-ui-design)). Cinder adds `TAB` filters for
   All/Gear/Items, keeps equipment rows separate, shows counts and current embers, lets `X` discard carried items without
   spending an action, and keeps use/equip costs visible. Actions remain keyboard-first while pointer lock is active.
4. **Optional dialogue should be concise and stateful.** Emily Short's conversation design analysis describes
   hub-and-spoke conversations and the value of repetition/state changes rather than one static speech
   ([conversation design](https://www.gamedeveloper.com/game-platforms/analysis-conversation-design-in-games)). Cinder's
   NPCs are optional, use a small hub of services, update their line after a service is used, and never seize control
   during combat. Two roles cover the loop: an **Ember Smith** for crafting and a one-time mend, and a **Lantern
   Cartographer** for paid map revelation and warden lore.
5. **Crafting works best as a visible input/output loop, not a hidden recipe dump.** The Crashlands postmortem found that
   unlocking every recipe at once made crafting overwhelming and detached from exploration, while recipe discovery became
   part of the find→build loop ([crafting postmortem](https://www.gamedeveloper.com/design/how-we-unbroke-our-crafting-system)).
   Cinder keeps the small recipe set known so short runs are not gated on recipe hunting, but makes **Ember Shards** the
   discovery/drop variable. Every recipe shows inputs, current `have/need`, the output and an ember cost before commit.
   Crafting is deterministic and atomic: it consumes the full input set or changes nothing.
6. **NPCs and crafting should not become mandatory interruptions.** The new services are reachable at the start of each
   wing, but the player can ignore them. Crafting is also available from the pack with `C`; the Smith is a free station and
   a one-time heal, not a modal tax on every floor. This preserves the turn-based pacing while making loot decisions
   meaningful.

## Implemented experience

| Feature | Cinder behavior |
|---|---|
| Area transitions | 600 ms hall wipe on class entry/depth descent; does not block input; reduced-motion honored |
| Panel motion | 180–220 ms ease-out entrances for pack, forge, dialogue and grid |
| Automap | Compact explored map; floor/wall outline; NPC/exit/loot landmarks; current visible enemies |
| Tactical grid | `M`; explored layout, AP-reachable teal cells, visible enemy intent, NPC/exit/loot markers |
| Pack management | `TAB` filters, `X` drop, `C` craft, equipment rows, counts, embers, use/equip costs |
| NPCs | Orla the Ember Smith (depth 1/3), Vey the Lantern Cartographer (depth 2); optional hub dialogue |
| Smith services | Open the forge; mend 30 health once for 12 embers; lore |
| Cartographer services | Reveal this wing for 10 embers once; warden lore |
| Crafting station | Known recipes from the pack or Smith; item inputs plus run-ember cost; atomic output |
| Ingredients | Ember Shard item; weighted depth caches and enemy drops feed the recipe loop |
| Art | New Assetrizz blacksmith/scholar world strips and dye-merchant/night-watch portraits, pinned by config/hash |
| Accessibility | Keyboard-only overlays, short motion, reduced-motion CSS, no color-only state labels |

## Balance notes

- Ember costs are deliberately low relative to gear value: Brew Draught 2, Brew Flask 4, Forge Ashplate 8, Gild Chain 10,
  Cut Oracle Lens 12, Forge Warden Plate 16. This makes shards and run embers compete with legacy banking.
- The Smith's one-time mend (12 embers for 30 health) is a recovery valve, not a full heal. The Cartographer's reveal
  (10 embers) trades power for orientation; it does not reveal living enemies outside line of sight.
- Known recipes avoid a recipe-hunt detour; the discovery loop is the shard/drop distribution and the decision to spend
  limited pack stacks. No recipe has a failure chance or randomized output.

## Limits

- This is design research plus automated/browser acceptance, not a player study.
- The automap is a compact 2D canvas, not a full cartographic map with pan/zoom or annotations.
- Crafting is item-to-item with a consumer-owned ember cost; it has no recipe discovery state, crafting skill, station
  upgrade, experimentation, randomized affixes or failure outcomes.
- NPCs expose a fixed service hub; there is no quest graph, save-state conversation memory or voiced dialogue.
- Transition screenshots run slowly in headless SwiftShader, so browser acceptance checks visibility/state rather than
  animated frame rate.
