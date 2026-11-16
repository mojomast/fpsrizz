# Optional portfolio assistance

## Integration

Both plugins are registered in the bundled catalog. Add `mechanics/hints` and `portfolio/assist` to an opted-in preset's `plugins`, and add `"sdk/mechanic-hints": "mechanics/hints"` to its `roles`. The assist manifest's role dependency orders the provider factory before the consumer; no concrete game dependency is needed because game services are discovered lazily. The preset still needs its existing family plugins, roles, content and presentation.

The two portfolio puzzle presets and `portfolio-cards-ash.json` / `portfolio-cards-cloud.json` enable assistance; it can also be added to other compositions using `PushPuzzle`, such as Stonewake. Additions are opt-in. If both services are present, puzzle takes precedence. Unsupported or completed states hide the control. A browser `Ui` service is needed; headless sessions remain valid.

## Behavior

The button is keyboard-operable, uses a polite status region, and reveals no text before a request. Puzzle assistance counts actual occupied plates, then reveals the current chamber's authored hint. Cards assistance reflects the public hand and summary, then gives an Ash matching-glyph observation or Cloud storm/survey observation. It reads only published state and never submits commands. Game strings are rendered as text, not markup. A changed state revision clears the old hint and its reveal level, as do in-game and session restarts. Requests while paused are rejected. This is contextual guidance, not a solver; the card observations depend on the shipped games' public summary vocabulary.

## Reuse decision and contract

Discovery: `mechanics/sequence` / `recipe/ordered-rounds` offer one irreversible finite cursor, not independently resettable topics; `mechanics/capabilities` permits rank jumps and has no reset; `mechanics/objectives` tracks irreversible prerequisite counters and receipts; `story/adventure` journal is a family-specific record of completed story actions. None provides a consumer-local graduated, one-at-a-time resettable reveal ledger. `createOwnedInstances` supplies dual-scope lifetime bookkeeping, so `mechanics/hints` reuses that helper rather than reproducing it. The provider stores only counts: consumers determine topic eligibility, text, state-derived context and resets. No time, randomness, persistence, game authority or callbacks are implied.

The contract accepts 1–128 unique topics with 1–128 levels apiece. `reveal` increments exactly one level or rejects atomically; `reset` clears one known topic, with no revision change for a no-op. Paused or disposed calls reject. Two consumers may use the same instance ID independently. Disposing either owner scope invalidates its handles; recreation cannot be mutated by an old handle. See the provider README for usage and `tests/portfolio-assist.test.ts` for real card/puzzle compositions and lifecycle checks.
