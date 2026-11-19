# Hollowmere canvas presentation

`hollowmere/presentation` renders the `Metroidvania` service as a canvas world and DOM HUD/field journal. It provides `HudRole` as `hollowmere/hud`; enable it with `hollowmere/game` and select that HUD plus a theme. The complete [preset](../../presets/hollowmere-ascent.json) selects `theme/assetrizz-hollowmere` and all game dependencies.

The journal displays map, inventory, capabilities, stats and options, with keyboard and pointer controls. The presenter reads game observations, sends commands, uses theme painters and optionally persists options through `Profile`; simulation remains game-owned. UI mounts, frame updates and event listeners are scoped to the plugin. It tolerates absent UI/game services in headless execution.

This is a Hollowmere-specific consumer, not a general canvas renderer; journal navigation is keyboard-first with pointer buttons and currently has no gamepad or binding remapping. See [controls and presentation](../../README.md), [SDK](../../contracts/metroidvania.ts), [game tests](../../tests/hollowmere.test.ts), [effect tests](../../tests/hollowmere-effects.test.ts) and [browser demo](../../tests/hollowmere-demo/run.mjs).
