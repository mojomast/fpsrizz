# Ordered steps and rounds

`mechanics/sequence` owns a cursor over a fixed ordered list, repeated for a finite number of rounds. Racing consumers supply gate-crossing legality and decide when a finished sequence wins; the provider does not detect movement or track time.

## Compose

Merge into a complete preset, for example [NEON RUN](../../../../games/racing/presets/overhead-racing.json):

```json
{ "plugins": ["mechanics/sequence"], "roles": { "sdk/mechanic-sequence": "mechanics/sequence" } }
```

The `sdk/mechanic-sequence` role selects a factory registered in `SequenceProviders` under the same ID. Consumers resolve `sequenceMechanic(ctx)` from the [SDK](../../../sdk/src/contracts/sequence.ts). Declare the role in `requiresRoles`; if creating during activation, also declare it in `roleDependencies` so the selected factory owner starts first.

```ts
const cursor = sequenceMechanic(ctx).create(ctx, 'course', { steps: ['start', 'finish'], rounds: 2 });
// After the game has validated a crossing:
if (cursor.advance('start').ok) { /* apply game-local effects */ }
```

Definitions require nonempty, unique, nonblank keys of at most 128 characters and positive safe-integer rounds with a safe total step count. Only the expected key advances; wrong steps, completion, disposal and a paused `SessionControl` reject without mutation. Keys intentionally repeat between rounds and are not receipts. There is no branching, rewind, spatial detection, persistence or automatic clock.

Definitions are copied and frozen. Live instance IDs are unique per consumer and provider, and are released on idempotent disposal or either owning scope's disposal. State transitions are deterministic and headless; no rendering or UI service is needed.

See the [sequence guide](../../../../docs/reference/sequences.md), [racing consumer](../../../../games/racing/plugins/vehicle-racing/index.ts), [provider tests](../../../../tests/mechanics-sequence.test.ts) and [racing tests](../../../../games/racing/tests/overhead-racing.test.ts). Run `npm run check` from the repository root.
