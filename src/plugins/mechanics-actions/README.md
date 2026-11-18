# Resource actions

`mechanics/actions` binds data-defined costs, gains and cooldowns to a resource pool and explicit clock. It registers `ActionMechanicRole` (`sdk/mechanic-actions`) and a `MechanicActionProviders` factory under `mechanics/actions`; use `actionMechanic(ctx)` from the [SDK](../../sdk/contracts/mechanics.ts).

## Compose

Merge this fragment into a complete preset with a consumer and definitions; [Sky Salvage](../../../games/sky/presets/sky-salvage.json) includes a working kit:

```json
{
  "plugins": ["mechanics/resources", "mechanics/clock", "mechanics/actions"],
  "roles": {
    "sdk/mechanic-resources": "mechanics/resources",
    "sdk/mechanic-clock": "mechanics/clock",
    "sdk/mechanic-actions": "mechanics/actions"
  }
}
```

Consumers creating handles during activation declare each needed role in `requiresRoles` and `roleDependencies`. Factory creation validates live compatible handles, unique action IDs, declared resource references, finite nonnegative amounts and cooldowns; turn cooldowns must be safe integers. [Kit content](../mechanics-kits/README.md) is also checked during staging.

Check game-specific range, target and occupancy before `execute`. `preview` is advisory; execution rechecks cooldown and pool state. At the exact ready time the action is eligible. Success commits the resource transaction and emits `MechanicActionCommitted`; failed ordinary transactions restore the cooldown reservation. Reentrant execution on the same handle is rejected. Arbitrary game-local effects or custom callback side effects are not rolled back.

Each owned handle has independent cooldowns; create separate handles for independent actors. Disposal, either scope ending, or disposal of a bound handle invalidates it; mutation rejects while paused. Explicit time and ordered calls make headless operation deterministic without a rendering or DOM service.

See [mechanics semantics](../../../docs/reference/reusable-mechanics.md), [Ember consumer](../../../games/ember/plugins/ember-game/index.ts) and [provider tests](../../../tests/mechanics-providers.test.ts). Run `npm run check` from the repository root.
