# Time Trial Raid

`example/time-trial` provides a timed shooter objective mode: activate objective switches and reach an exit before the deadline. Player death or expiry ends the run.

## Use

Enable `core/world`, `core/player`, and this plugin; set `roles["sdk/mode"] = "example/time-trial"`. The [time-trial preset](../../presets/time-trial.json) uses `core/arena`. Configure `config["example/time-trial"].seconds` (default 180, range 1–3600) and optionally `playerPrefab` (default `core/player`). The selected map needs an objective-tagged switch and a repeatable exit-tagged zone.

The role and map validation register at staging. Selecting the mode spawns session entities and installs event listeners and timer rules. This is an on-foot switch-and-exit raid, not the checkpoint driving mode.

## Verify

Run `node --test games/shooter/tests/time-trial.test.ts` from the repository root.
