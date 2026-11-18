# The Salt Ledger

The sea returns the dead as salt tablets. Tern burns the names to sustain its storm barrier; the Ledger Bearer must decide who controls them. Explore the city and its surrounding regions, form a party, settle local affairs and decide the names' fate.

## Play

Travel by choosing an adjacent destination. Iona can recruit Pell at Ledger Hall, Neri at Reed Ferry and Sable at Miners' Rest. The active party contains Iona and up to two companions; use Rest/Field to change the formation outside battle. Equipment in the shared bag may be swapped onto any party member. Force increases damage and Vigor increases maximum health; spend pending level rewards before entering combat. Both perks may be selected multiple times. Evidence and victories award shared XP; the threshold starts at 40, rises by 20 per level and the cap is eight.

Find the ferry manifest at Silt Shrine or defeat the orchard collectors before choosing whether the names go to families or Tern. Repair the vent at Wind Cairn or defeat the guards to decide foundry control. At Storm Mouth show testimony from the Drowned Archive or defeat the Cantor. The three seals open the Breakwater Engine. After defeating the custodian choose the barrier, return, or the covenant; the covenant requires archive testimony and worker control. City control of the Fen names reduces the custodian's health; returning them weakens the harpooner. Decisions are permanent for the current session.

At Ledger Hall, spend bond training on pairs of recruited companions, up to a score of two per pair. One training is
available initially; each one-time encounter victory restores one, to a maximum of three. A normal attack or damaging
ability gains the highest bond score with a living orthogonally adjacent ally; bonuses do not stack. Healing and bombs
do not gain this bonus. Bonds reset with the campaign.

Battles use a 5×3 board. Choose a living actor then a vacant cell (up to three unobstructed orthogonal steps, one AP) or an enemy (one AP). Iona and Neri attack adjacent enemies; Pell or anyone carrying the longbow has range three. Each hero has two AP per round. Abilities deal three base damage; Sable's ability heals a living ally in range two instead. Enemies attack the nearest living hero in range or move one orthogonal cell toward them; ties use actor ID. Defeat and withdrawal restore the party and allow another attempt. No time advances while waiting; commands are bounded and paused ingress is rejected.

## Actual content and limits

There are 16 locations, eight tracked three-stage side quests, four main evidence interactions, three recruitable
companions, eight battle setups, three regional decisions and three endings. Four side quests unlock after completing
another; each pays its reward once. Five earned equipment pieces supplement the starting gear, and healing draughts,
brine tonics and salt bombs add tactical options. Read each journal entry for its current destination and action.

Each battle has cover that reduces ranged damage by 1, a movement-blocking obstacle, and a hazard that deals 1 damage
to occupants after enemy actions; bombs ignore cover. Both sides use the same terrain. Combat has simple enemy behaviors
and no line-of-sight, cooldowns or bespoke boss phases. Side
quests are primarily linear interaction chains; there is no crafting, trading, individual ability tree, profile save,
checkpoint replay, audio or party dialogue. The campaign resets on host restart. The broader targets in the research
plan remain proposals, not claims about this build.

## Integration

The bundled `salt/ledger` preset enables `salt/game`, `salt/content`, `salt/presentation`, navigation, progression,
objectives, inventory, relationships and `theme/story`, selecting their corresponding roles. Presentation uses pinned Assetrizz art;
see `assets/experiences/provenance.json` and `public/assetrizz/provenance.json`.

Reuse decisions: `mechanics/navigation` / `recipe/ordered-navigation` supplies graph reachability; the game owns
occupancy and AP. `recipe/bounded-command-queue` supplies owned, pause-aware ingress; `mechanics/progression` owns XP
and pending levels; `mechanics/objectives` tracks side-quest steps and `mechanics/inventory` owns item stacks and
equipment storage; `mechanics/relationships` tracks party bonds. Effects and quest policy remain game-owned. The UI is an optional scoped `Ui` consumer. Tests use a
real local host catalog: `node --test games/expeditions/tests/salt-ledger.test.ts`.
