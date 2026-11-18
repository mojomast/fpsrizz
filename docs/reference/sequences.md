# Ordered sequences and finite rounds

`mechanics/sequence` owns an ordered cursor that accepts the expected step, repeats the same definition for a finite
number of rounds and reaches a terminal state. `vehicle/racing` and `example/racing` compose the provider while retaining
their own crossing detection, time limits, movement, presentation and victory decisions.

## Reuse decision and boundary

Discovery used `ordered checkpoint sequence` and `stage wave lap`, and inspected `vehicle/racing`, `example/racing`,
`mechanics/objectives`, `ember/game` and `example/survival`, their SDK contracts and working tests.

`mechanics/objectives` already supports a one-shot sequence expressed as target-1 objectives chained by prerequisites.
Keep that provider for objective DAGs, counters and receipt deduplication. Its progress is monotonic: giving gates a
target equal to the lap count requires all occurrences of one gate before unlocking the next, rather than A,B,A,B.
Unrolling lap-specific objectives also exceeds its 128-definition limit for valid 128-gate, 20-lap tracks. Recreating
objective tracks on each lap would retain round/cursor bookkeeping in the game. The extracted capability is this
repeatable ordered cursor, not a replacement for objective progress.

The consumers are independent-vehicle and shooter-backed compositions, both racing games. The mechanism is genre-neutral;
the exercised consumer evidence is two composition families, not two different genres. Ember retains its existing
objective authority and wave events. Survival's start/clear/intermission semantics remain game-local. Cinder Vault no
longer consumes this provider after moving to XP/level offers and dungeon depth transitions.

## Composition and compatibility

Add this fragment to presets using either race authority:

```json
{
  "plugins": ["mechanics/sequence"],
  "roles": { "sdk/mechanic-sequence": "mechanics/sequence" }
}
```

This is a fragment, not a complete playable preset. The bundled `overhead-racing.json` and `racing.json` include it.
**Custom presets selecting `vehicle/arcade-race` or mode `example/race` now need an enabled sequence provider and its role
selection.** `Race` service signatures, track/map content schemas, controls and race rules are unchanged. A different
provider can be selected without changing consumer source.

Both consumers validate during staging that the selected `SequenceMechanicRole` ID also exists in `SequenceProviders`.
Role metadata alone is insufficient; there is no fallback. `vehicle/racing` creates its handle in plugin activation and
declares `roleDependencies: ["sdk/mechanic-sequence"]` so the factory owner is active first. `example/racing` creates its
handle in the selected mode callback, after all plugins activate. Its validator requires the provider only when
`example/race` is selected. Using only `example/racing-controller` with another mode still needs no sequence role.

For a new consumer, use only `src/sdk/index.ts` and own the instance with its session context:

```ts
const sequence = sequenceMechanic(ctx).create(ctx, 'my-game/course', {
  steps: ['start-gate', 'bridge', 'finish-gate'],
  rounds: 2,
});
// In the simulation, after this game's spatial or other legality checks:
const result = sequence.advance(crossedGateKey);
if (result.ok && sequence.complete) finishThisGame();
```

The factory is registered under the same ID as its role provider. `sequenceMechanic(ctx)` resolves it lazily via
`ctx.instantiate` in the registering plugin's context. SDK code performs resolution only; the state transition algorithm
lives in the plugin. No content kind, clock, system or event is installed by the provider. `MechanicKit` is unchanged.

## API and behavioral contract

Authoritative types: [`src/sdk/contracts/sequence.ts`](../../src/sdk/contracts/sequence.ts).

| Export | Purpose |
|---|---|
| `SequenceProviders` | Registry of `MechanicFactory<SequenceProvider>` entries |
| `SequenceMechanicRole` | Exclusive role `sdk/mechanic-sequence` |
| `sequenceMechanic(ctx)` | Resolve the selected factory |
| `SequenceProvider.create(owner, id, definition)` | Create an independently owned `MechanicSequence` |

The definition contains `steps: readonly string[]` and `rounds: number`. Steps must form a nonempty array of unique,
nonblank string keys, each at most 128 characters. Keys are matched exactly, without trimming or renaming; they need not
use objective-ID syntax. Sparse arrays and nonstring entries are invalid. Rounds must be a positive safe integer, and
`steps.length * rounds` must also be a safe integer. Memory scales with the definition, not the number of rounds; there
is no expanded lap-by-step list. Definitions and their arrays are copied and frozen before acquiring ownership.

The frozen handle exposes live, read-only getters:

| Member | Meaning |
|---|---|
| `id`, `definition` | Instance identity and detached frozen definition |
| `active` | Both the provider and consumer still own this instance, and it has not been disposed |
| `revision` | Number of accepted advances; begins at zero |
| `round` | One-based current round, retained at the final round on completion |
| `index` | Zero-based next step; terminal sentinel is `definition.steps.length` |
| `complete` | The final step of the final round was accepted |
| `advance(step)` | Return `MechanicResult` (`ok`, diagnostic `reason`) |
| `dispose()` | Idempotently release both scope registrations and the live identity |

Initial state is `(round=1, index=0, complete=false, revision=0)`. An advance commits exactly one expected key. A
nonfinal step increments the index. Finishing a nonfinal round atomically increments the round and resets index to zero.
The final advance retains the final round, sets index to the terminal sentinel, and marks complete. Every successful
advance increments revision exactly once. Completion does not dispose the readable handle.

For `steps=['A','B'], rounds=2`, the accepted trace is:

```text
initial: round 1, index 0, revision 0
A:       round 1, index 1, revision 1
B:       round 2, index 0, revision 2
A:       round 2, index 1, revision 3
B:       round 2, index 2, revision 4, complete
```

Unknown, wrong-order or malformed keys, calls after completion/disposal, and calls while `SessionControl.playing` is
false reject with no state or revision change. Absence of `SessionControl` permits headless use. The handle does not
advance with time and does not gate unrelated movement in a consumer. Consumers call it from their simulation after
checking local legality. Diagnostic reason strings are not a machine-readable branching protocol.

Step keys are **not receipts**: a key is intentionally accepted again on a later round. A single-step definition with
multiple rounds advances on every valid call. External message deduplication, stale event detection, checkpoints entered
twice, and other semantic eligibility remain the caller's responsibility. There is no skip, rewind, reset, preview,
bulk advance, branching graph, callback or emitted event.

### Ownership and failures

The provider uses `createOwnedInstances(provider, 'mechanic-sequence')` for identity and lifetime. IDs contain 1..128
characters and are unique among live instances in the same consumer context for this provider. Different consumers can
use the same ID. Early disposal releases both ownership registrations; disposal of either scope invalidates the handle.
Retained getters remain readable, but old handles cannot mutate recreated same-ID instances.

Invalid definitions/IDs, duplicate live IDs and creation in a disposed scope are programming errors and throw. Validate
definitions before acquiring an identity so failed construction leaks no resources and reserves no ID. Content loading
continues to report authored errors through staging reporters at their paths; runtime factory errors are not a
replacement for content validation. Restart creates a fresh provider and fresh cursors. Observation getters are not a
save/restore protocol; there is no persistence or reset API.

## Consumer policies preserved

- **Neon Run:** the drive system checks only the currently expected directional gate once per tick. A crossing commits
  the sequence; `Race.lap` and `Race.nextGate` read its round and index. `Race.revision` stays game-local because timeout
  independently changes it. On victory lap remains the authored final lap and nextGate is one past the final gate.
  A final crossing is processed before timeout in the same tick, and winning time still includes the whole tick.
- **Foundry Circuit:** the mode computes all circle-sweep entries, rejects starting-inside cases, sorts by travel
  fraction and gate index, and sends entries to the sequence in that order. Rejected out-of-order hits are never retried
  retroactively. Multiple gates can commit in one tick. Each hit must fit the remaining fractional time budget; a winning
  finish uses its own entry fraction, not the whole tick. `Flow` keeps the existing objective/status/result interface.
Cinder Vault's former five-trial consumer was removed when the game moved to in-level XP/boon progression and generated
dungeon depths. Its historical test coverage is not claimed as current sequence evidence.

## Evidence and verification

`tests/helpers/alternate-sequence.ts` contains an independent test implementation: a single accepted-count authority
derives round and index by division/remainder, while production stores the round/index cursor explicitly. It shares
only the public lifetime helper and contract, and does not import or delegate to the production progression algorithm.
Provider cases and both real consumer routes run with each implementation; replacement fixtures install only the
replacement, with the default registry entry absent.

| Evidence | Cases / defect guarded against |
|---|---|
| `tests/mechanics-sequence.test.ts` | Hand-derived A,B × 2 trace, one-step repeated rounds, malformed definitions/keys, safe totals, detached frozen input, owner isolation, absent/present pause service, failed-construction cleanup, early release, duplicate-ID rejection, stale same-ID handles, both scopes, restart |
| `tests/overhead-racing.test.ts` | Existing input-only circuit victory, direction/order checks, drift and timeout, deterministic restart; terminal cursor; one gate per tick and final-crossing-before-timeout boundary; missing selection/factory staging failures |
| `tests/racing.test.ts` | Existing multigate sweep, timeout, wall-respecting controller and content rejection; physical-order non-retroactivity, fractional deadlines, controller-only composition, missing selection/factory staging failures preserving the live session |
| `tests/race-track.test.ts` | Existing sealed Foundry map and real-controller collision-clearance route to victory |

All original gameplay assertions in these three consumer test files are retained and exercised under both providers.
This establishes contract, composition and independent substitution evidence, not equivalence for every possible
custom provider. Browser acceptance remains part of the repository-wide build/smoke workflow.

Focused command:

```sh
node --test tests/mechanics-sequence.test.ts tests/overhead-racing.test.ts tests/racing.test.ts tests/race-track.test.ts
```

See also [reuse discovery](../guide/reuse.md), [mechanic composition](reusable-mechanics.md) and the
[capability/evidence template](../cookbook/reusable-capability-template.md).
