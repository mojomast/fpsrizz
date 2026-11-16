# Three substantial games: implementation program

This program adds three independent, playable compositions: The Silt Archive (a dungeon crawler), The Salt Ledger (a
party RPG), and a household life simulator. Each has its own authority, content, presentation, SDK service, preset,
player guide, and acceptance tests. The design notes are proposals; implementation guides and tests are the source of
truth for what actually ships.

## Design and reuse

- [Dungeon crawler plan](research/dungeon-crawler-plan-2026-11-16.md) compares its intended scope with Cinder Vault and
  specifies districts, exploration, encounters, progression and outcomes.
- [RPG plan](research/rpg-plan-2026-11-16.md) describes an authored party adventure with regions, quests, combat and
  consequential choices.
- [Life-simulation plan](research/life-simulation-plan-2026-11-16.md) describes a shared household with individual
  needs, relationships, schedules, money and neighborhood goals.
- [Acceptance strategy](research/three-games-acceptance-2026-11-16.md) defines the evidence expected for content,
  complete routes, lifecycle, deterministic play and browser controls.
- [Assetrizz audit](research/three-games-assets-2026-11-16.md) lists existing pinned art and gaps without assuming that
  upstream manifest entries have been imported or visually reviewed.

Existing candidates include `mechanics/navigation`, `mechanics/room-map`, `mechanics/inventory`, `mechanics/crafting`,
`mechanics/progression`, `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives`,
`recipe/bounded-command-queue`, and `recipe/scoped-input`. Each game's implementation must document actual selections
and limits. Cinder, Story and Tactics are useful family-specific references, not universal dungeon, dialogue or combat
providers. Household schedules, social rules, and game-specific quest and encounter policies need explicit owners.

## Integration gates

Register the finished plugins and presets in the bundled catalog; refresh the reuse index and provider metadata. Verify
real legal routes, rejected actions, pause, restart, ownership, and honest content coverage through headless tests.
Exercise player-facing controls and representative progression at desktop and narrow sizes in the browser. Run
`npm run check`, bundled preset staging, production build and smoke, then the new game browser journeys. Document
actual counts and limitations; do not describe planned content as shipped or equate browser activation with complete
playthroughs. Human playtesting remains separate evidence for pacing, accessibility and game feel.
