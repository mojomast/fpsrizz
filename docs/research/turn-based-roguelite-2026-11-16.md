# Turn-based roguelite research — 2026-11-16

This research informed the Cinder Vault redesign: grid movement, one-tile steps, three-action turns, telegraphed enemy
intent, class loadouts, item/equipment choices and modest persistent mastery.

## Findings

1. **Perfect information makes turn-based tactics legible.** *Into the Breach* and *Slay the Spire* show upcoming enemy
   actions before they resolve, letting players make plans instead of memorizing enemy rotations
   ([Enemy intentions](https://atomicbobomb.home.blog/2020/05/17/into-the-breach-enemy-intentions/),
   [Perfect information](https://jeremiahgames.com/2019/03/04/perfect-information-the-killer-feature-of-slay-the-spire-and-into-the-breach/)).
   Cinder therefore previews counts of attacking/advancing engaged enemies in the HUD, tints attackers red and resolves
   attacks on the enemy turn. Enemy actions are deterministic once the player commits.
2. **Movement range is a core balance lever.** A range of roughly 3–4 grid cells keeps positioning relevant without
   making every corridor crossing a chore, while low ranges make buffs disproportionately large
   ([Choosing the ideal movement range](https://www.gamedeveloper.com/design/choosing-the-ideal-movement-range)).
   Cinder gives most classes 3 actions; the fragile Vaultrunner gets 4. One tile costs one action. Heavy attacks cost 2.
3. **Action economy should be visible and scarce.** Every move, attack, reload, pulse and consumable spends an action.
   Free actions are limited to aiming, opening the pack and weapon switching. This keeps each turn a small priority
   puzzle and prevents the previous real-time hold-to-fire pattern from trivializing positioning.
4. **Telegraphing is not enough without response options.** Enemies should not deal unavoidable instant damage during
   the player's decision phase. Core rogue-like guidance warns against “one attack” death from reasonable play
   ([Eight rules of roguelike design](https://www.gamedeveloper.com/game-platforms/analysis-the-eight-rules-of-roguelike-design)).
   Cinder has no autonomous tick damage during the player turn; attacks only resolve after End Turn, with exact damage
   known from enemy stats and armor.
5. **Items should create decisions, not just numbers.** Item choices are strongest when known items remain situational
   and unknown/rare items offer tradeoffs (Harris). Cinder uses a 12-stack bag, two equipment slots, consumables that
   cost an action, and gear that trades one slot against another. Gear drops compete with weapon and relic choices
   rather than replacing them.
6. **Meta progression should expand options without erasing skill.** Persistent progression should keep failure
   rewarding while preserving the run challenge ([Roguelite meta-progression](https://bugnet.io/blog/how-to-design-a-roguelite-meta-progression)).
   Cinder keeps small legacy-health ranks and class mastery bonuses (+5 health, a potion, +5% damage/armor at milestones)
   rather than unlimited account power. All three classes are available immediately; mastery is the long-term axis.
7. **Reduce mandatory friction.** The previous loop stopped after every short wave. The new loop has no camp or draft
   screen. Level-up choices remain open during combat, and when no enemy has noticed the player, ending a turn immediately
   starts the next player turn instead of playing a fake enemy-phase pause. Depth transitions are proximity-driven and
   do not open a loading menu.

## Cinder rules selected from the research

| Decision | Value |
|---|---|
| Player turn | 3 actions (Warden, Emberwright) / 4 (Vaultrunner) |
| Step | 1 action, one cardinal cell, mouse aim free |
| Light attack | 1 action; Cinderkey, Thornwake, Mothspindle, Briarward |
| Heavy attack | 2 actions; Far Oracle, Ashbell |
| Reload / pulse / consumable / gear swap | 1 action |
| Enemy action | 1 per engaged enemy per round; final Keeper gets 2 |
| Enemy intent | Attack if line-of-sight within its range, otherwise advance |
| Player opening | Cinderkey plus class-specific Ashbell/Mothspindle where applicable |
| Level curve | 30 XP then +20 per level; kill XP from enemy score / 10 |
| Level reward | +5 max health, heal 6, one three-card offer; combat continues |
| Loot | One guaranteed depth shard + weighted cache, Warden shard/gear + draught, 32% regular shards + 18% other drops |
| Gear slots | Armor and charm; +8–12% armor or +8–15% damage, lifesteal/embers |
| Consumables | Ember Draught (35 health), Ember Flask (45 damage in line-of-sight, 6m) |
| Mastery | 20/50/90/140/200 XP milestones; +5 HP, potion, +5% damage, +5 HP, +5% armor |
| Legacy | Existing health rank at 8 embers per rank, capped +25 |

Balance notes:

- A Warden has 130 base health and 10% armor; a Thrall deals 9, so a single non-telegraphed hit cannot erase a run. The
  Emberwright has 90 health but stronger pulses/Ashbell; the Vaultrunner has 85 health and one extra action.
- Enemies only engage when close or in sight. This avoids every room emptying toward the player while preserving
  purposeful exploration. The intent counter and red tint provide response time.
- Loot is useful but not required: the starter Cinderkey and class weapon can finish encounters; caches and mastery
  smooth later attempts. The 12-stack bag prevents infinite hoarding and asks the player to compare gear/consumables.
- The final Keeper has two actions and 900 health, but telegraphed attacks and the deeper run's levels/relics give the
  player multiple tools. This is an initial authored balance, not a substitute for hands-on playtesting.

## Limits and follow-up

The evidence is design-principle research plus automated acceptance, not a player study. Balance should be tuned from
actual play: initial AP costs, enemy engagement radius, loot frequency, mastery thresholds and Keeper health are the
highest-leverage variables. The Ashbell's projectile travels in simulation time after its initiating action (enemy attacks
resolve immediately); this is presentation/damage timing, not a second player action, but should be reviewed for feel.
Threat telegraphs currently combine per-enemy red tint with HUD attack/advance counts rather than full per-enemy attack
line overlays. The shared runtime still has no general initiative/queue service: Cinder's alternating
player/enemy turn engine is family-specific because its grid movement, shooter weapons and depth authority differ from
the board tactics family. The `TurnControl` SDK service exists only to disable autonomous real-time enemy AI when a mode
owns discrete actions.
