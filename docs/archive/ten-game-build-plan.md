# Ten-game portfolio build plan

The portfolio is a set of ten separately selectable, authored games built from the existing Bulkhead SDK and
independent game families. Two racing, two turn-tactics, two narrative-adventure and two push-puzzle games are
joined by one drone-courier game and one colony-restoration game. Each must have its own authored scenario, identity,
rules as supported by its family, and an executable completion route. Games sharing an engine are explicitly presented
as members of that family, not as ten new engines or ten unrelated genres.

Two additional card games exercise a second new shared provider for ordered card zones. They are documented separately
in [the card guide](../games/portfolio-cards.md), rather than being counted as two of the original ten slots.

## Composition and ownership

- Games choose installed code and content via presets; they do not import sibling plugins. Authored scenario data stays
  in its own content plugin, simulation in family plugins, presentation in presentation plugins, and portable rules in
  SDK-facing providers. The catalog is the composition root.
- Reuse existing providers before building another implementation. In particular, investigate `mechanics/sequence` for
  ordered race progression, `mechanics/navigation` for tactics reachability, and `mechanics/resources`,
  `mechanics/actions`, `mechanics/clock` and `mechanics/objectives` for the courier and colony. Adventure and puzzle
  behavior is family-bound; content may reuse it without treating its private rules as cross-genre providers.
- New shared functionality must have a documented concrete gap, a public SDK contract, real independent consumers,
  deterministic semantics, scoped ownership, tests and discoverable metadata. Merely enabling a plugin in multiple
  presets does not demonstrate gameplay reuse.
- Work is parallelized by content family. One integrator owns catalog registration, generated indexes, final validation
  and consistency of documentation. No worker changes another worker's authored content.

## Acceptance gates

1. Each new preset stages through the real host; each title activates and has a tested completion path. Invalid commands,
   pause/restart and disposal are checked where applicable.
2. Shared providers have tests for their contract and real consumers in at least two projects, including relevant cleanup
   and rejected operations. Integration does not break existing presets or optional-provider behavior.
3. Browser-facing builds receive actual browser checks, including representative interaction, UI errors and asset loading.
   Staging alone is not evidence that a game can be completed or that its presentation works.
4. Refresh the reuse index; run `npm run check`, bundled preset validation, `npm run build`, and `npm run smoke`.
   Record actual outcomes and distinguish automated completion from human playtesting.

The research and portfolio guides record the resulting titles, reuse decisions, routes and family limitations.

## Reuse decisions

| Need | Inspected candidate | Decision |
|---|---|---|
| Ordered checkpoints and laps | `mechanics/sequence`, `vehicle/racing`, `games/racing/tests/overhead-racing.test.ts` | Reuse the existing selected sequence provider. Crossing geometry and time limits remain race policy. |
| Tactical and puzzle movement | `mechanics/navigation`, `board/tactics`, `puzzle/rules`, `games/tactics/tests/turn-tactics.test.ts` | Reuse deterministic unit-edge queries; each game retains occupancy, legality, costs and enemy decisions. |
| Energy, costs, cooldowns and goals | `mechanics/resources`, `mechanics/actions`, `mechanics/clock`, `mechanics/objectives`, `mechanics/kits` | Compose the existing providers with authored definitions. Seconds and turns remain explicit. |
| Narrative conversations and puzzles | `story/adventure` and its chapter format | Reuse the family authority and author new chapters; it is not a general-purpose inventory provider. |
| Push-puzzle rules | `puzzle/rules` and its chamber format | Reuse the existing family authority; validate each new chamber with a real solution. |
| Challenge evaluation and attempt records | Existing objective counters, sequence cursor and host profile storage | Investigate narrowly scoped providers only where actual different family consumers demonstrate a missing rule. Objective completion and persisted profile storage are not by themselves shared scoring or record comparison. |
