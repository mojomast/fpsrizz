# Capability ledger

`mechanics/capabilities` provides `CapabilityRole` (`sdk/capabilities`), a reusable ledger of named unlocks and consumer-defined ranks. Select `"sdk/capabilities": "mechanics/capabilities"` and enable the plugin; [Hollowmere](../../../../games/hollowmere/presets/hollowmere-ascent.json) demonstrates composition and activation role dependencies.

Resolve `capabilityMechanic(ctx)` and call `create(owner, id, definitions)`. The owned set offers `has`, `rank`, monotonic `unlock`, `snapshot`, revision and `dispose`; successful changes emit `CapabilityUnlocked`. Snapshots expose the definitions and current ranks without implementing their effects. See the [SDK contract](../../../sdk/src/contracts/capabilities.ts) and [Hollowmere consumer](../../../../games/hollowmere/plugins/hollowmere-game/index.ts).

Sets are session state, cleaned up with their owner or explicit disposal. The consumer supplies definitions, decides when unlocks occur and implements effects, prerequisites, costs and persistence. See [Hollowmere abilities](../../../../games/hollowmere/README.md) and [provider tests](../../../../tests/mechanics-metroidvania-providers.test.ts).
