# Explicit mechanic clocks

`mechanics/clock` provides consumer-advanced seconds or turn clocks. It registers `ClockMechanicRole` (`sdk/mechanic-clock`) and `MechanicClockProviders` under `mechanics/clock`; use `clockMechanic(ctx)` from the [SDK](../../sdk/contracts/mechanics.ts) to resolve the selected factory.

## Compose

Merge into a complete preset, such as [Verdant Relay](../../content/presets/verdant-relay.json):

```json
{ "plugins": ["mechanics/clock"], "roles": { "sdk/mechanic-clock": "mechanics/clock" } }
```

Consumers creating clocks during activation declare this role in both `requiresRoles` and `roleDependencies`. Create a clock with the consumer context, an instance ID and `seconds` or `turns`; it starts at zero. Only explicit `advance(amount)` changes it. Seconds require positive finite representable increments; turns require positive safe integers and a safe total. Invalid advances, paused sessions and disposed handles reject. Idle scheduler ticks do not advance time.

IDs are unique per consumer among live clocks. Disposal is idempotent, and either provider or consumer scope disposal invalidates the handle. With no automatic ticking, callbacks, recurring timer or DOM dependency, clock behavior is deterministic for the caller's advances and works headlessly. For a pollable temporary duration, the SDK's `createDeadline` borrows a compatible clock; action cooldowns remain in [mechanics/actions](../mechanics-actions/README.md).

See [mechanics semantics](../../../docs/reusable-mechanics.md), [deadlines](../../../docs/deadlines.md), [Sky consumer](../sky-game/index.ts), [provider tests](../../../tests/mechanics-providers.test.ts) and [deadline tests](../../../tests/deadlines.test.ts). Run `npm run check` from the repository root.
