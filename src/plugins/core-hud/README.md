# Standard HUD (`core/hud`)

The `core/hud` provider for `sdk/hud` displays health, ammunition, weapon selection, objective and status text, notices, a crosshair, and damage feedback. It observes shooter components and events and uses flow data when available.

## Use

Enable the plugin and select `"sdk/hud": "core/hud"`, as in the [default preset](../../content/presets/default.json). Set `config.core/hud.showCrosshair` to `false` to hide the crosshair; its default is `true`. The manifest declares no plugin dependencies, but useful shooter information depends on the relevant gameplay services and components being present.

The role mounts UI and installs its frame update only when selected and when `Ui` is available; it returns immediately in headless sessions. UI and event subscriptions are session-owned. This is a shooter HUD, not a generic turn-based interface. See [plugin lifecycle](../../../docs/guide/plugins.md), [game session tests](../../../tests/game-session.test.ts), and the [HUD browser demo](../../../tests/hud-demo/). Run `npm test` for automated tests.
