# Seeded Gauntlet

`example/roguelite` provides three seeded encounters with two automatically awarded, run-only upgrades. It forks the session RNG for encounter selection and reward ordering.

## Use

Enable `core/world`, `core/player`, `core/enemies`, `core/combat`, and this plugin; select `roles["sdk/mode"] = "example/roguelite"`. The [roguelite preset](../../content/presets/roguelite.json) uses `core/arena` and a fixed seed. Its map needs registered enemy spawn locations; validation checks the player and map requirements.

The mode and its power damage modifier register at staging. Selecting the mode spawns the player and installs session-owned encounter rules. Power and Vitality are applied during the run; there is no permanent progression or player-selected upgrade menu. There is no plugin-specific configuration.

## Verify

Run `node --test tests/roguelite.test.ts` from the repository root.
