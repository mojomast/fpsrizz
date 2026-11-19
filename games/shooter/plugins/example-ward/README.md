# Timed Ward

`example/ward` registers a pickup effect and damage modifier that temporarily scale incoming damage on a living target. A later ward replaces and refreshes the earlier one.

## Use

Enable `core/combat` and this plugin, then define a pickup using effect `example/ward`. The [Blackout preset](../../presets/blackout.json) includes the [adventure pack](../example-adventure-pack/content.json), which supplies a ward pickup. Its effect parameters require `duration` in seconds (0.1–3600) and `multiplier` (0–1); for example `{"duration": 5, "multiplier": 0.5}` halves incoming damage for five seconds.

Effect and modifier factories register at staging. Activation installs a session-owned expiry system using simulation time; the modifier also checks expiry when damage is applied. Dead or healthless targets cannot collect the effect. The plugin supplies no pickup content or game mode by itself.

## Verify

Run `node --test games/shooter/tests/ward-effect.test.ts games/shooter/tests/adventure-pack.test.ts` from the repository root.
