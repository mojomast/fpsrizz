# Dash Controller

`example/dash-controller` supplies a planar first-person controller with sprint and directional dash. WASD moves, mouse turns, Shift sprints and Ctrl dashes; a dash without movement input uses the facing direction.

## Use

Enable `core/player`, `core/world`, and this plugin; select `roles["sdk/controller"] = "example/dash-controller"`. The [arena-score preset](../../presets/arena-score.json) is a complete working composition. Under `config["example/dash-controller"]`, defaults are `moveSpeed: 5.4`, `sprintMultiplier: 1.5`, `dashSpeed: 16`, `dashDuration: 0.2`, and `dashCooldown: 1` (durations in seconds). See [manifest.json](manifest.json) for ranges.

Actions and the controller role register during staging; the selected controller installs its movement system for the session. Its temporary motion components are removed on scope cleanup. Movement uses world collision and operates on player entities; the plugin does not spawn a player or provide a game mode.

## Verify

Run `node --test tests/dash-controller.test.ts` from the repository root.
