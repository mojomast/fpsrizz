# Resource mechanic behavioral contract and conformance

This document specifies the observable resource behavior exercised through the public SDK and records its evidence.
The shared resource cases run against **both** `mechanics/resources` and the independent test implementation
`z-test/resources`. This is resource substitution evidence for the named cases below; it does not certify arbitrary
implementations of the other mechanic contracts. The broader mechanic API and content format remain documented in
[reusable mechanics](reusable-mechanics.md).

## Public contract

The declarations are `ResourcePoolProvider`, `ResourcePool`, `ResourceDefinition` and `ResourceTransaction` in
[`packages/sdk/src/contracts/mechanics.ts`](../../packages/sdk/src/contracts/mechanics.ts), exported through `packages/sdk/src/index.ts`.

### Selection, identity and ownership

- A preset selects a factory ID under `ResourceMechanicRole` (`sdk/mechanic-resources`). `resourceMechanic(ctx)` resolves
  that ID in `ResourcePoolProviders`; it does not silently choose an installed default. Consumers needing the factory
  during activation declare `roleDependencies`. The factory starts in its registering provider's session context.
- Factory identity is session-local. `create(consumer, instanceId, definitions)` creates separate live state owned by
  both consumer and provider. Identical instance IDs in different consumer contexts are legal. A duplicate live resource
  ID within one consumer throws. Instance IDs are strings of 1–128 characters.
- `dispose()` is idempotent, releases ownership registrations early and permits the same consumer to reuse the ID.
  An old handle never aliases the replacement. Either consumer or provider teardown invalidates the handle; a retained
  factory cannot create resources after its provider is disposed, including against a new session's consumer.
- Restart creates fresh factories and balances. Separate hosts may use identical plugin and instance IDs without sharing
  balances, revision counters, pause state or event delivery. IDs in events have no incarnation component: consumers
  retaining receipts across restarts must retain their session context separately.
- Disposed handles retain readable definitions, balances and revision, but reject previews and mutations. Queries do not
  revive them. Creating a handle for a disposed consumer/provider throws.

### Definitions and observations

- A resource definition has a unique lowercase local `id` matching `/^[a-z][a-z0-9_.-]{0,63}$/`, a nonblank `label` of at
  most 120 characters, and finite nonnegative JavaScript-number `initial` and `max`, with `initial <= max`. A pool has
  1–64 resources. Zero capacity and fractional quantities are valid. Invalid code-authored definitions throw before
  retaining the requested instance ID or ownership registrations.
- Providers copy and freeze the definitions array and its entries. Mutating the caller's array or entries cannot alter
  balances, IDs or limits. `snapshot()` returns all balances in a detached frozen object; retained snapshots and receipt
  values do not track later commits. These observations are not a persistence/restore format.
- `get(unknownId)` returns zero. That query convenience does **not** authorize a transaction using an unknown key.

### Transactions, previews and pause

- `preview({ spend?, gain? })` is advisory and pure: no balance change, revision, event or reservation. `transact` checks
  current input, current balances, lifetime and the optional pause service anew. An earlier successful preview cannot
  authorize either an intervening overdraft or a subsequently changed input.
- Spend and gain quantities must be finite nonnegative numbers referencing defined keys. Unknown keys reject even when
  their amount is zero. Malformed transactions and amount maps reject; transactions contain only `spend` and `gain`,
  each an optional object of at most 64 resource amounts.
- Every debit must be affordable from the **pre-gain balance**. With five fuel, spending six and gaining six rejects,
  even though its net change is zero. Conversely, spending five and then gaining ten is legal for a maximum of ten:
  the debit makes room for the credit. Final balances must remain finite and in `[0, max]`; overflow rejects rather than
  clamping. Finite operands can still produce a nonfinite result and must reject.
- Any ordinary rejection leaves **all** balances, revision and event count unchanged. A valid debit cannot survive a
  failing later debit/credit. The transaction boundary covers this pool, not game movement, objectives, other pools or
  arbitrary callbacks.
- Every accepted transaction increments the pool's revision once and emits one `MechanicResourcesChanged` fact. This
  includes `{}`, explicit empty amount maps and known zero amounts. Initial creation starts at revision zero and emits
  no transaction event. Optional reasons default to `''`; strings up to 256 characters are accepted, longer/non-string
  reasons reject without spending. Rejection prose is diagnostic, not a stable machine-readable code.
- If `SessionControl.playing === false`, previews and transactions reject, including empty transactions. Queries and
  creation from definitions remain available while paused; disposal also remains available. Without the optional service,
  a live handle may mutate. Resuming permits a fresh check; no queued mutation is implicitly replayed.

### Committed facts and delivery

`MechanicResourcesChanged` carries the consumer plugin ID as `owner`, the pool's `instance` ID, committed `revision`,
caller-supplied `reason` and complete committed `values`. The event and its values are frozen. It describes that commit,
not whatever a later query might see.

Outside a fixed system, observers may run before `transact` returns and see the committed balance/revision. Inside a fixed
system, the host delivers events after the system returns. Two commits in one system therefore retain two distinct
receipt snapshots even though both observer queries see the final state. Delivery timing is a host contract, not a
resource-provider-specific queue. The existing action integration case also checks that immediate resource observers see
the action's reserved cooldown/revision and that reentry on that action handle is rejected.

Ordinary `{ ok: false }` rejection is covered. Exceptions thrown by observers or custom providers are not a promise of
arbitrary rollback; this suite does not establish recursive resource-observer mutation or disposal-during-notification
semantics.

## Test organization and independence

- [`tests/helpers/alternate-resources.ts`](../../tests/helpers/alternate-resources.ts) contains the extracted
  `z-test/resources`. Its Map-backed candidate-state implementation has no production-provider import, delegation or
  shared resource algorithm. Extraction preserved its existing behavior. It remains a test implementation, not a shipped
  provider or general reference oracle.
- [`tests/helpers/resource-conformance.ts`](../../tests/helpers/resource-conformance.ts) exports
  `registerResourceConformance(candidate)` and the two provider catalog entries. Each case creates a real host, registers
  only the candidate resource provider plus two consumer plugins, selects the role and resolves it in actual activation
  contexts. Catalog registration is not a direct call to a provider's private implementation.
- [`tests/mechanics-providers.test.ts`](../../tests/mechanics-providers.test.ts) invokes that suite for both providers. Four
  existing cases now also run with both resource selections: owner/factory lifetime, invalid atomic transactions,
  pause/stale action previews and immediate action-observer reentry. Their original assertions are retained. Other
  original clock/action/objective/content assertions remain, including the default kit's exact `+8` scope-count check.
  The shared suite compares each provider to its own pre-operation ownership baseline rather than imposing the default
  provider's allocation counts on alternatives.
- [`tests/reusable-games.test.ts`](../../tests/reusable-games.test.ts) imports the extracted provider and retains all three
  route drivers, every game/result/receipt assertion and its two original resource isolation/teardown cases.

## Named resource cases and hand-derived oracles

Each case below has the test-name prefix **`<provider-id> resource contract:`** and runs for both provider IDs.

| Case name | Inputs and asserted evidence |
|---|---|
| `pre-gain affordability, whole-transaction rejection and finite boundaries` | Five fuel/zero ore: an unaffordable net-zero trade, later failing debit/credit, unknown zero keys, negative/nonfinite amounts and sampled malformed inputs leave every value/revision/receipt unchanged. Spend-five/gain-ten reaches ten; spend-ten/gain-half leaves zero fuel/half ore. `MAX_VALUE` addition rejects while full debit/recredit succeeds. Zero capacity rejects `MIN_VALUE`; fractional definition bounds reach exactly 1.5 and reject overflow. |
| `preview is pure and stale previews never authorize a later transaction` | Repeated preview of spend-four/gain-two has no effect; an intervening debit leaves only three fuel and invalidates it. Editing previewed input to gain eleven also rejects. A fresh legal spend-one/gain-two ends at two fuel/two ore; later input changes cannot mutate that state. |
| `empty commits advance revisions and publish immutable receipts with bounded reasons` | Empty, empty-map and zero-amount transactions produce revisions 1/2/3 with exact owner, instance, reason and unchanged values. A 256-character reason succeeds; 257 characters/non-string reject. A later debit produces revision 4 while the first receipt remains unchanged. Immediate observer state matches each receipt. |
| `definitions and snapshots are copied, frozen and readable after disposal` | Caller edits every definition field and appends a definition; the pool retains the original ID/initial/limit. Frozen snapshot mutation throws. A quarter-unit debit leaves 4.75 while the earlier snapshot stays at five. Disposal preserves queries and rejects writes. |
| `runtime definition bounds reject without retaining IDs or ownership` | Empty/65-entry arrays, duplicate/invalid/overlong local IDs, invalid labels, nonfinite/negative bounds and initial-above-max throw with no ownership growth. Retry of the same ID succeeds. One/128-character instance IDs and 64 resources with maximum-length local ID/labels succeed; empty/129-character instance IDs reject. |
| `live IDs are owner-local and early disposal permits reuse without stale writes` | Same ID in two consumers and a sibling pool remain independent. Duplicate live ID throws. Dispose/recreate starts at five/revision zero; stale writes/disposal cannot affect the replacement. Twenty early-disposal cycles return to the same ownership baseline. |
| `paused creation is allowed but previews and writes reject until resume` | Initial creation while paused works. Empty and nonempty mutations/previews reject without effects. Pause after a successful preview prevents the commit. Resume permits one debit; dispose/recreate while paused remains possible. |
| `consumer and provider lifetimes invalidate handles and restart creates fresh factories` | Missing optional pause service permits mutation. Consumer teardown invalidates its two pools but not a second consumer's pool. Provider teardown invalidates that survivor. Restart supplies fresh factory/context/balances; old factories and handles remain stale. Receipt revisions restart at one, with the correct consumers. |
| `fixed-system receipts retain each commit while queries see the settled state` | One tick spends one fuel, then gains two ore. No observer runs mid-system; receipts retain `(4,0)` and `(4,2)` at revisions 1/2 while both queries see `(4,2)`. Session remains running. |
| `missing role or enabled provider never silently falls back` | Removing selection or disabling the selected provider fails validation and preserves the running session/pool. An optional consumer with an installed but unselected provider receives the SDK's selection error. The original metadata-only-provider staging case remains separately covered. |
| `interleaved hosts isolate identities, pause, receipts, restart and teardown` | Two hosts use the same owner/instance IDs. Left debit/pause/restart and right gain/debit/stop keep independent state and event streams. Old-left writes fail; right teardown leaves new-left live. |

Additional named case, also run for both resource providers:
**`partial kit construction releases earlier handles and permits retry (<provider-id>)`**. A live objective handle blocks
the final kit construction step after resources, clock and actions were acquired. Three failed attempts return ownership
to the same baseline, keep the blocker and an existing kit intact, and emit no resource events. Disposing the blocker
allows a successful same-ID kit, whose work action spends two fuel/gains one ore; disposing it returns to baseline.
This tests the SDK composition helper's cleanup using actual providers, not simulated disposers.

## Game substitution evidence retained

Each alternate route catalog excludes the default resource implementation. All other mechanic
providers remain the defaults. Each route compares final authoritative state and the complete resource/action/objective
receipt arrays across the two resource providers, retaining actual-cost, tower-cooldown, owner and completion assertions.

| Route | Resource / action / objective receipts per provider | Fixed ticks in the exercised route | Limits |
|---|---|---|---|
| Sky | 8 / 6 / 3 | 623 | Boost and repair are not executed. |
| Ember | 91 / 70 / 3 | 2009 | Three builds and 67 firing commits; pulse, repair and loss are not exercised. |
| Verdant | 10 / 8 / 3 | 128 | Eight accepted decisions after 120 idle ticks; alternate-provider loss/restart routes are not exercised here. |

The drivers are state-reactive rather than a recorded tick-indexed command tape. Equality is checked within each event
type, not across a merged resource/action/objective event ordering. This supports the named resource substitutions,
not universal deterministic replay, all game routes or interchangeability of every mechanic provider.

## Reuse decision and verification

Discovery used `atomic resource transaction` and `ownership lifecycle`, followed by `--show mechanics/resources`,
`--show ResourcePoolProviders` and `--show recipe/resource-actions`. The inspected SDK, resource implementation,
Verdant consumer and existing provider/substitution tests establish the following decisions:

| Candidate | Decision |
|---|---|
| `mechanics/resources` | Reuse the existing production behavior; broaden evidence through the public role seam. No new gameplay provider or algorithm is needed. |
| `sdk/ResourcePoolProviders`, `resourceMechanic`, `ResourceMechanicRole` | Reuse actual registration/activation/selection contexts for conformance; no fake context or private-helper tests. |
| `recipe/resource-actions`, `createMechanicKit` | Reuse existing composition and verify partial-construction cleanup. Actions/clocks/objectives remain the shipped implementations. |
| Existing test-only `z-test/resources` | Extract unchanged into a reusable helper and apply the same contract oracles. Its independence challenges consumer assumptions rather than delegating back to the implementation under test. |

Targeted command (Node 22.19.0 in the implementation environment):

```bash
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH \
  node --test tests/mechanics-providers.test.ts tests/reusable-games.test.ts
```

The implementation run passed **45 tests, zero failed/skipped**, preserving all original assertions. Logs are in
`/tmp/opencode/resource-conformance-tests.log`. `npm run typecheck` also passed; its log is
`/tmp/opencode/resource-conformance-typecheck.log`. No resource production fix was necessary. The
[integrated verification record](../archive/general-capability-buildout.md) reports full check/index/build/browser results.

Remaining gaps are explicit: no independent replacement clock/action/objective implementation, no generated exhaustive
transaction/model exploration, no complete recorded replay, no resource persistence/restore, and no promise of rollback
after arbitrary thrown provider/observer effects. Runtime malformed-input cases are representative, not an adversarial
JavaScript object/proxy/getter suite. Partial kit construction covers a final-step ordinary creation error, not throwing
cleanup functions. Browser presentation and generic host staging/async fault behavior use their existing separate tests.
