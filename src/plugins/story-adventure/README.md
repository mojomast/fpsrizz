# story/adventure

Headless authority for rooms, actions, flags, inventory, journal and chapter-specific saves. It registers `adventure-chapter`, provides `Adventure`, and emits `AdventureActionResolved` for accepted actions. Consumers use the [SDK contract](../../sdk/contracts/adventure.ts), not internal implementation. [`story/presentation`](../story-presentation/README.md) supplies the interface.

[`portfolio/quiet-index`](../../content/presets/portfolio-archive-adventure.json) enables this plugin, presentation, a chapter pack and theme; it selects `story/adventure` for `sdk/experience`, `theme/story` for `sdk/theme`, and `portfolio/quiet-index` in `options.chapter`. Point and click or use Tab/Enter to explore. The [adventure guide](../../../docs/narrative-adventure.md) describes chapter fields, validation, conditions and effects; [portfolio adventures](../../../docs/portfolio-adventures.md) documents the scenarios and their reused observatory imagery.

`Adventure.enqueue` accepts a bounded FIFO batch, not a guarantee that an action is legal. The queue holds 128 commands, rejects paused ingress, and processes the batch present at the start of a rules tick. Saves are explicit, optional-profile, chapter/version-specific action histories replayed before committing; they are not general session snapshots. Reset and host restart do not write a save. The authority is session-owned and works without UI or rendering.

Verify with `node --test tests/narrative-adventure.test.ts tests/portfolio-adventures.test.ts` and `npm run check`.
