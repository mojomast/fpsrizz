# Objective tracks

`mechanics/objectives` tracks bounded counters, prerequisite unlocks and optional idempotent receipts. It registers `ObjectiveMechanicRole` (`sdk/mechanic-objectives`) and an `ObjectiveProviders` factory under `mechanics/objectives`; resolve it via `objectiveMechanic(ctx)` from the [SDK](../../../sdk/src/contracts/mechanics.ts).

## Compose

Merge into a complete preset, such as [Verdant Relay](../../../../games/verdant/presets/verdant-relay.json):

```json
{ "plugins": ["mechanics/objectives"], "roles": { "sdk/mechanic-objectives": "mechanics/objectives" } }
```

Consumers creating tracks during activation declare the role in `requiresRoles` and `roleDependencies`. Definitions allow up to 128 objectives with unique IDs, positive safe-integer targets and declared, unique, acyclic prerequisites. Factory creation validates code-authored definitions; [mechanics/kits](../mechanics-kits/README.md) validates authored kit content at staging.

`record(id, amount, receipt?)` accepts positive integral progress only for unlocked, incomplete objectives and caps it at the target. Successful receipts are unique across the whole track; rejected attempts do not consume them. At 4096 remembered receipts, new receipted records reject rather than evicting earlier ones. Success emits `MechanicObjectiveChanged`; snapshots are detached and frozen. Empty tracks are complete.

Track IDs are unique per consumer among live instances. Disposal is idempotent; either owning scope ending invalidates the handle, and paused mutation rejects. These deterministic session-only counters work headlessly without rendering. They do not persist a quest journal or implement rewards, victory rules or a repeating ordered cursor; use [sequence](../mechanics-sequence/README.md) for the latter.

See [mechanics semantics](../../../../docs/reference/reusable-mechanics.md), [Verdant consumer](../../../../games/verdant/plugins/verdant-game/index.ts) and [provider tests](../../../../tests/mechanics-providers.test.ts). Run `npm run check` from the repository root.
