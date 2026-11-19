# story/presentation

Illustrated point-and-click interface for [`story/adventure`](../story-adventure/README.md). It reads the `Adventure` service, submits commands and plays optional theme sound cues from resolved actions. It uses UI and audio services when available and has no rendering dependency; listeners, UI and frame updates belong to the plugin scope. Input is guarded when the host is paused.

[`portfolio/quiet-index`](../../presets/portfolio-archive-adventure.json) selects `story/adventure` for `sdk/experience`, `theme/story` for `sdk/theme`, and `portfolio/quiet-index` through `options.chapter`. Click or use Tab/Enter to navigate rooms and actions; Save and Load are explicit. The chapter defines labels, room art keys, item icon keys and optional action sound keys; authoring rules and save limitations are in the [adventure guide](../../README.md). The portfolio chapters reuse the story theme imagery; see [portfolio adventures](../../docs/portfolio-adventures.md).

Verify with `node --test games/adventure/tests/narrative-adventure.test.ts games/adventure/tests/portfolio-adventures.test.ts`, `npm run build && npm run smoke`, and `node tests/portfolio-demo/run.mjs`.
