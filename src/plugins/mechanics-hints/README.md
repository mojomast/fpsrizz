# Hint reveal ledger

`mechanics/hints` supplies the `sdk/mechanic-hints` role. Select `mechanics/hints` for that role and declare it in a consuming plugin's `roleDependencies`. From `activate`, call `hintMechanic(ctx).create(ctx, 'local-id', [{ id: 'door', levels: 2 }])`. Call `reveal('door')` only after the consumer determines a hint is eligible, and use `level('door')` to select its own authored text. `reset('door')` returns that topic to zero; it is idempotent. No text or eligibility is stored in the ledger.

Topics have unique nonblank IDs of up to 128 characters, with 1–128 levels; there must be 1–128 topics. Reveals advance one level, reject unknown or exhausted topics, and never advance automatically. A successful change increments `revision`; rejected calls and no-op resets do not. Mutation is rejected while `SessionControl.playing` is false or after disposal. Consumer-local live IDs are unique; owner and provider scopes both dispose the instance. Early disposal releases its ID. State is session-only.

See [composition and rationale](../../../docs/portfolio-assist.md) and `tests/portfolio-assist.test.ts`.
