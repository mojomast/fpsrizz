# Arcade Racing

`example/racing` provides a planar driving controller and a timed checkpoint mode on shooter-grid maps. W/Up accelerates, S/Down brakes or reverses, and A/D or arrows steer. Cross numbered checkpoints in order and then the finish before the deadline.

## Use

Enable `core/world`, `core/player`, this plugin, and a sequence provider. The [racing preset](../../presets/racing.json) selects `sdk/controller: example/racing-controller`, `sdk/mode: example/race`, `sdk/mechanic-sequence: mechanics/sequence`, and `options.map: example/foundry-circuit`.

`config["example/racing"].timeLimit` defaults to 90 seconds (1–3600). The map must define properly numbered `race/checkpoint/N` zone tags and a `race/finish` zone; validation checks the course, player prefab and sequence provider. See the [course content](../example-race-track/content.json).

Actions and roles register at staging; selection installs the session-owned driving and rules systems and creates an owned sequence. This is a single timed run, not the independent overhead-racing family or a multi-lap race.

## Verify

Run `node --test tests/racing.test.ts tests/race-track.test.ts` from the repository root.
