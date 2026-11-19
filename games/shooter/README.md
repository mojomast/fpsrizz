# Shooter (the reference game)

The 2.5D shooter that proved the engine: the `core-*` stack (world, player, combat, enemies, content, modes, HUD,
presentation) and the `example-*` extensions and genre slices (arena, survival, holdout, stealth, extraction, escape,
roguelite, key dungeon, time trial, racing course and more). Presets are in `presets/`; `default.json` is the first
experience the app opens.

Its vocabulary, `games/shooter/contracts/shooter.ts`, stays in the SDK for now: the app's frame loop and the render SDK
use it, and so do the shared presentation and mechanics plugins. Rules and content: [spec](../../docs/reference/spec.md)
and [content format](../../docs/reference/content-format.md). Its tests stay in `tests/` because they double as the
kernel and host acceptance suite.
