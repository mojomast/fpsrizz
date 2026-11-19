# Experience and levels

`mechanics/progression` registers `ProgressionProviders` and `ProgressionMechanicRole` (`sdk/mechanic-progression`). Enable it and select `"sdk/mechanic-progression": "mechanics/progression"`; [Cinder Vault](../../../games/cinder/presets/cinder-vault.json) is a complete consumer preset.

Resolve `progressionMechanic(ctx)` and create an owned ledger with `startLevel`, `baseXp`, `growth` and optional `maxLevel`. Positive safe-integer `grant` can complete multiple levels; observe current and lifetime XP, level, pending rewards and revision, and call `consumeLevel` after applying each game-defined reward. Changes emit `MechanicProgressionChanged`. See the [SDK](../../sdk/contracts/progression.ts), [consumer](../../../games/cinder/plugins/cinder-game/index.ts) and [progression guide](../../../docs/reference/progression.md).

Handles are disposed explicitly or when either owning scope ends; paused or disposed ledgers reject mutations. The curve is linear and the provider does not choose perks, apply stats, render UI or persist state. Tests: [provider](../../../tests/mechanics-progression.test.ts), [Cinder](../../../games/cinder/tests/cinder-vault.test.ts).
