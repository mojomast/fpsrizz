# Resource pools

`mechanics/resources` provides independently owned, bounded numeric balances and atomic multi-resource transactions for stamina, currency, cargo and similar quantities. It registers `ResourceMechanicRole` (`sdk/mechanic-resources`) and a `ResourcePoolProviders` factory under `mechanics/resources`; resolve the selected implementation with `resourceMechanic(ctx)` from the [SDK](../../sdk/contracts/mechanics.ts).

## Compose

Merge this fragment into a complete preset; [Sky Salvage](../../content/presets/sky-salvage.json) shows the full kit composition:

```json
{ "plugins": ["mechanics/resources"], "roles": { "sdk/mechanic-resources": "mechanics/resources" } }
```

Consumers creating handles during activation declare the role in `requiresRoles` and `roleDependencies`. A pool definition has 1–64 uniquely named resources, nonblank labels and finite nonnegative `initial`/`max` with initial at most max. Runtime creation validates code-authored definitions; [mechanics/kits](../mechanics-kits/README.md) additionally validates authored content during staging.

`preview` is advisory; `transact` rechecks and applies all spends before gains. Unknown resources, invalid amounts, overdrafts and overflow reject the whole transaction; gains cannot fund the same transaction's spend. Fractional values are allowed. Successful transactions increment revision and emit `MechanicResourcesChanged` with owner and instance identity. This is not a slotted or unique-item inventory.

Definitions and snapshots are detached and frozen. IDs are unique among live pools per consumer; idempotent disposal or either consumer/provider scope ending invalidates the handle. Mutations reject while paused. No clock, renderer or DOM is required, so the pool runs headlessly and deterministically for a given operation order.

See [mechanics semantics](../../../docs/reusable-mechanics.md), [resource conformance](../../../docs/mechanic-conformance.md), [Sky consumer](../sky-game/index.ts) and [provider tests](../../../tests/mechanics-providers.test.ts). Run `npm run check` from the repository root.
