# Difficulty, replayability and quality-of-life research — 2026-11-16

Scope: Cinder Vault’s turn-based roguelite loop. The goal was to make the vault harder in legible, player-selected
ways, widen build/run variety without replacing the existing systems, and reduce friction around information and setup.

## Sources reviewed

- Entalto Studios, [5 Essential Tips to Make Your Roguelite Game Work](https://entaltostudios.com/5-essential-tips-to-make-your-roguelite-game-work)
  — gradual complexity, behavior-led enemy variety rather than pure stat inflation, and controlled rather than chaotic
  randomness.
- Frostilyte, [More games should handle difficulty like Slay the Spire](https://frostilyte.ca/2020/04/16/more-games-should-handle-difficulty-like-slay-the-spire)
  — explicit, incremental ascension modifiers such as elite frequency and enemy damage, rather than an opaque global
  difficulty switch.
- Asuka Wang, [Hades](https://asukawang.com/blog/hades/) — player-authored Heat-style constraints that let different
  skill levels choose their own challenge while preserving reward value.
- [Roguelike and Roguelite Design: Runs, Variety, and Death as a Teacher](https://gamedesign.gg/articles/roguelike-and-roguelite-design)
  — persistent unlocks versus run-local power, and variety as the reason to start another run.
- Summerfall Studios, [Deckbuilders & Roguelites 101](https://www.summerfallstudios.com/malys-developer-updates/deckbuilders-amp-roguelites-101-how-to-approach-a-new-genre)
  — short run arcs, meaningful build decisions and meta progression that changes future choices rather than only numbers.

## Decisions

1. **Use opt-in threat tiers at the start of a run.** `Pilgrim`, `Delver` and `Ashbound` are visible before class choice.
   They do not hide a sliding difficulty director. `Delver` remains the baseline; `Ashbound` is the high-risk/high-legacy
   option. The class screen shows the exact tradeoffs instead of only a label.
2. **Scale behavior before health.** Depth changes the encounter pool: Ash Hounds act twice, Ember Acolytes heal wounded
   allies, and Cinder Brutes are durable heavy hitters. Elite affixes add Warded damage reduction, Swift extra actions,
   Emberbound death detonation or Siphoned self-healing. Health multipliers are deliberately modest (Ashbound +10%) and
   are paired with new decisions, not used as the only difficulty knob.
3. **Make elite frequency visible and bounded.** Elite chance rises with depth and threat. `Ashbound` guarantees at least
   one elite per wing so the difficulty promise is not left to a low-probability roll.
4. **Give bosses a second act.** Wardens enrage below half health and gain an action; the Cinder Keeper escalates from two
   to three actions. The HUD names the enrage state. This creates a readable phase change without a new boss entity or a
   hidden damage spike.
5. **Separate execution difficulty from reward.** Threat modifies enemy damage/health, healing, elite frequency and loot,
   and scales legacy at the end of the run. The selected threat is recorded in the result and the best cleared threat is
   persisted for the class screen.
6. **Add run variety through authored choices.** Four new relics create build pivots (execute wounded targets, regenerate,
   shard farming, action refunds on player kills). Four new items and three recipes add loot/crafting decisions. The Ash
   Oracle is an optional risk/reward event: pay health for a random boon or embers for a sealed find. She appears on deeper
   wings, so not every run contains the same choice.
7. **Quality of life is information at the point of decision.**
   - The isometric pointer now previews a move’s AP cost or an attack’s target/health/range in the turn bar before the click.
   - `H` opens a field guide with turn, control, elite and threat explanations; movement is blocked while it is open.
   - Threat selection is visible on the class screen, and the active threat is always in the turn bar.
   - Wardens always drop at least one equipment item, avoiding a loot roll that could make a boss reward feel empty.
   - The prior automap, tactical grid, pack filters, seed display, guaranteed depth cache and in-place transitions remain.

## Implementation notes

- `CinderThreats` in `games/cinder/plugins/cinder-game/threats.ts` is data, not hidden state. `CinderState` exposes the selected
  threat, all threat definitions, the best clear and the AP hover preview.
- `Elite` is a Cinder-local component. Affixes are applied at spawn and read by the manual enemy turn; the autonomous core
  AI remains suspended by `TurnControl`.
- New enemy content uses the `cinder/manual` AI behavior. That behavior intentionally has no autonomous movement: it is a
  validation/metadata hook for the Cinder-owned discrete enemy turn, with `actions` and `supportHeal` parameters.
- The Oracle reuses the existing night-watch portrait/world strip with a distinct lavender tint; no new generated art or
  provenance record was required. Her event state is run-local.
- Threat selection is available only during class select. It is not a mid-run difficulty toggle, avoiding retroactive
  changes to an encounter already in progress.

## Limits / future work

- This is a three-tier starting point, not a full Heat/Ascension ladder with individually unlockable modifiers. A future
  pass could split threat into named vows (elite frequency, boss phase, healing, greed) and unlock higher tiers after clears.
- Threat balance still needs human playtesting; the acceptance suite proves rules and reachability, not a fun-curve study.
- The Oracle’s portrait is intentionally reused, not a new Assetrizz import. Weapon, class, enemy and UI art provenance is
  unchanged.
- No run save/restore, daily seed browser, or run-history screen was added in this pass.
