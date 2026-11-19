# Item-possession pilot: implementation decision

Date: **2026-11-16**. Scope: the conditional third pilot in
[general-plugin research](research/general-plugins-2026-11-16.md#pilot-c-item-possession-only-if-the-shared-invariant-earns-its-cost).
This is a source/test review and decision record; the API and migration below are evaluated proposals, not implemented features.

## Decision: retain the existing local collections

**Do not implement the item-possession extraction in this buildout.** Keep the actor-owned plain-data keyring and
Story's ordered `inventory` array. Neither binary resource composition nor an owned inventory service earns its
adapter cost here. A small **pure array transformation** is the only plausible extraction, but the current consumers
share too little nontrivial behavior to justify adding that public contract now.

The decisive distinction is between *two collections* and *two implementations of the transaction*: Key Dungeon has
duplicate-checked single-item acquisition and membership queries; Story alone has multi-item require/remove/add.
Story already uses the **same `apply` function** for live actions and detached save replay. Extracting replay would
not remove a second algorithm. The existing presentation repeats Story's eligibility predicates, but is an observer
in the same family, not a second transactional consumer.

Reconsider a pure helper when a second authority actually needs multi-item transactions with the same pre-state
rules, or when an observed eligibility-drift bug justifies centralizing those predicates. This decision does not
depend on waiting for an equipment, slot, item-instance or recipe framework.

## Discovery and evidence

Read `AGENTS.md`, `docs/guide/reuse.md`, the research pilot, relevant architecture/SDK ownership rules, the compact
`docs/reference/reuse-index.md`, and the [capability design/evidence template](../cookbook/reusable-capability-template.md).
Targeted live discovery used Node 22 via:

```bash
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH npm run -s find-reuse -- "inventory" --json --limit 5
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH npm run -s find-reuse -- "keyed door" --json --limit 5
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH npm run -s find-reuse -- "resource" --json --limit 5
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH npm run -s find-reuse -- --show mechanics/resources
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH npm run -s find-reuse -- --show example/keys
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH npm run -s find-reuse -- --show story/adventure
```

All six discovery commands succeeded. They inspect registration, not activated gameplay.

| Discovered ID | Decision and reason |
|---|---|
| `mechanics/resources` | Reuse for numeric balances; reject composition for these inventories. Fixed definitions, numeric transactions and notification/lifetime semantics do not supply their full behavior. |
| `example/keys` | Reuse its existing `example/give-key` pickup effect and `example/keyed-gate` prefab for shooter maps. Keep actor ownership, interaction policy and small key array here. |
| `story/adventure` | Reuse chapter content and its existing `apply`/replay path for narrative combinations. Keep flags, journal, room legality, history and persistence here. |
| `sdk/Inventory`, `core/combat` | Shooter weapons/ammunition/fire timing, not the keyring or Story inventory. Do not repurpose this component or introduce shooter dependencies into Story. |
| `mechanics/actions`, `recipe/resource-actions`, `recipe/independent-actor-actions` | Costs/cooldowns and per-owner handles do not resolve ordering, item predicates or silent detached replay. More composition does not close the gap. |
| `core/world` | Existing shooter gate/interaction authority. Its reach, facing and door rules remain family-bound. |

Primary inspected implementation evidence:

- [`example-keys/index.ts`](../../games/shooter/plugins/example-keys/index.ts): `Keyring`, pickup factory, keyed-gate `use`.
- [`story-adventure/index.ts`](../../games/adventure/plugins/story-adventure/index.ts): `initial`, `apply`, detached `state()`, load replay.
- [`story-adventure/validation.ts`](../../games/adventure/plugins/story-adventure/validation.ts): unique lists, item references, consumed-items requirement.
- [`story-presentation/index.ts`](../../games/adventure/plugins/story-presentation/index.ts): inventory display order and action readiness.
- [`contracts/adventure.ts`](../../games/adventure/contracts/adventure.ts), [`contracts/mechanics.ts`](../../src/sdk/contracts/mechanics.ts),
  [`contracts/shooter.ts`](../../src/sdk/contracts/shooter.ts): public state, transaction and inventory shapes.
- [`mechanics-resources/index.ts`](../../src/plugins/mechanics-resources/index.ts),
  [`verdant-game/index.ts`](../../games/verdant/plugins/verdant-game/index.ts): actual provider and working resource consumer.
- [`keys-gates.test.ts`](../../tests/keys-gates.test.ts), [`key-dungeon.test.ts`](../../tests/key-dungeon.test.ts),
  [`narrative-adventure.test.ts`](../../games/adventure/tests/narrative-adventure.test.ts),
  [`mechanics-providers.test.ts`](../../tests/mechanics-providers.test.ts): existing behavioral assertions.

## Semantics an extraction must preserve

### Actor keyrings

- `Keyring` is a private component `{ keys: string[] }`; the entity store supplies actor isolation and session reset.
- Acquisition rejects a non-string, whitespace-only key or dead actor, then rejects an already-held key. Successful
  acquisition appends exactly once. `false` means the pickup was not consumed.
- Keys are exact strings, not registered resource definitions. Authored keys accept non-whitespace text up to 60
  characters, including spaces and capitals; the runtime effect additionally accepts dynamically supplied strings
  without requiring advance enumeration. It checks `.trim()` for emptiness but stores the original string.
- Gate use only checks presence. It neither removes the key nor changes acquisition order. Range, facing, candidate
  priority, locked/open state and notifications are separate shooter policy.

### Story possession and transaction boundary

- `AdventureState.inventory` is an ordered, unique `string[]`. `state()` returns detached copies of inventory, flags
  and journal. The presentation renders items in array order.
- Before changing anything, `apply` checks room, once/required/missing flags, **all required items present**, and
  **all added items absent in the original inventory**. Failure leaves all action state unchanged and creates no
  accepted-history entry or `AdventureActionResolved` event.
- Success removes consumed IDs while retaining survivor order, then appends added IDs in authored order. Presence-only
  requirements stay in the array. There is no sorting, counting, reordering of survivors or duplicate-add success.
- Validation makes each item list unique, checks definitions/references, and requires `consume` to be a subset of
  `items`. A chapter can define up to **128** items; each action list is bounded at **64** entries.
- **Overlapping consume/add is not replacement.** For an action requiring, consuming and adding `lens`, an owned
  `lens` causes duplicate-add rejection before removal. An absent `lens` causes required-item rejection. The loader
  currently allows that cross-list overlap; the action is simply ineligible. Do not make it succeed or newly reject
  the chapter during staging as an incidental refactor.
- The accepted live action updates item state, flags, journal, room, message and completion synchronously, records its
  ID, then emits `AdventureActionResolved`. A helper's item result would not itself commit that broader story outcome.

### Save and replay

- Save schema 1 contains chapter ID, chapter version and accepted action history, **not an inventory snapshot**.
- Load creates a fresh `initial()` state and evaluates every saved action through the same `apply` used by live play.
  The entire candidate state and history replace live state only after complete success.
- Successful and failed replay emit **no `AdventureActionResolved` events**. On failure, inventory, room, flags,
  journal, completion and accepted history stay intact; the user-facing message changes to report the failure.
- Array snapshots, replay candidates and live state must stay detached. A live collection captured by `apply` would
  violate this even if a successful final restore appeared correct.

## Can binary resources preserve this without shadow state?

**Not through the current public resource contract.** Some individual operations fit; their composition does not
preserve the whole contract without reintroducing the item policy and additional state/adapters.

| Requirement | What a 0/1 pool can do | Remaining mismatch/cost |
|---|---|---|
| Unique single acquisition | `gain: { key: 1 }`, maximum 1, rejects overflow | Good numerical match for a predefined ID; does not establish ordered identity semantics. |
| Presence-only requirement | Query `get(id) === 1` | A local guard can work immediately before a synchronous transaction, but is still the item predicate being extracted. Encoding presence as spend+gain creates a revision/event even when nothing changes. |
| Atomic remove/add | One transaction checks all debits and credits | `spend: { lens: 1 }, gain: { lens: 1 }` succeeds when held. Story rejects it. Additional pre-state absence guards are mandatory. |
| Acquisition order | Snapshot all balances | Current snapshots follow definition/object-key order, not acquisition order. Final binary balances contain no acquisition history. An ordered side array/event history recreates the authoritative collection as shadow state. |
| Dynamic key IDs | Create a pool with definitions | No API to add definitions. Rebuilding pools or allocating a pool per key requires actor-to-handle mappings and lifecycle coordination. Keys also accept strings outside the resource ID regex. |
| Chapter item capacity | One definition per item | Resources require 1–64 definitions; valid chapters can have 0–128 item definitions. Sharding loses a single cross-shard transaction boundary. |
| Detached replay | `preview` checks one prospective transaction | Preview cannot advance candidate state. `transact` advances state but emits `MechanicResourcesChanged`, including empty transactions. There is no silent fork/restore/replay mode. |
| Plain-data component | Keep IDs or arrays in the component | Storing a live handle violates the plain-data convention; external handles plus an array duplicate authority. Storing only an opaque ID adds a lookup/lifetime layer for two array operations. |

A locally guarded synchronous transaction is not inherently non-atomic: the game can check item predicates and then
call the pool without yielding. The problem is that the guards remain the existing item rule, ordering still needs
state, and a temporary replay pool still publishes successful partial transactions even if the overall save is later
rejected. Disposing that pool does not retract published events. Fabricating an alternate `SessionContext`, event bus
or pause service for replay would be inappropriate coupling; adding resource-provider silent restoration solely for
this pilot would be a much larger contract change.

Binary resources remain a good choice for predefined unordered access tokens when their numeric and notification
semantics are actually desired. That narrower use is not equivalent to these two current implementations.

## Measurable value versus adapter cost

Counts below refer to the audited source expressions, not total file lengths or a claimed performance benchmark.

| Existing code | Actual repeated rule |
|---|---|
| Keys: duplicate check + `push` | Two collection statements implementing single acquisition. |
| Keys: gate `includes` | One presence expression. |
| Story `apply`: two item predicates + filter + append loop | Four collection expressions, occupying three source lines. Only this authority implements multi-item transactions. |
| Story presentation: two item predicates | One additional source line repeating eligibility, not mutation. |
| Story live action and load | Two calls to the same `apply`; **zero duplicated transaction implementation**. |

The authoritative total is **seven collection expressions in six source lines**. A pure-helper migration replaces
the five mutation/precondition lines with roughly three result/check/assignment statements in each authority,
plus an import in each file, a public export, types and helper implementation. Gate membership is still just
`includes`. Even the compact sketch below adds code rather than reducing that total. Centralized semantics could
still be valuable, but only the pre-add duplicate rule is currently duplicated across the two mutating consumers.

The presentation predicate is real duplication worth acknowledging. A planning call could replace it, at the cost
of allocating a candidate array for readiness; alternatively a second predicate API could avoid allocation but
enlarge the API. Neither eliminates room/flag/once policy. There is no demonstrated bug requiring that expansion.

An owned helper adds instance lifetime, disposal, snapshots and possible actor-handle mapping to this cost. A
resource composition additionally requires provider selection/startup wiring, definition/ID mapping, ordering and
replay adapters. **The smallest current implementation is the local one.** This is a maintenance-cost conclusion,
not a claim that a pure helper cannot work or that tiny collections should always remain local.

## Concrete minimal API evaluated and deferred

If later evidence approves extraction, use a **pure transformation over caller-owned plain arrays**. Do not create
a service, registry, selectable plugin, component holding methods, or second mutable collection. A possible additive
export from `src/sdk/contracts/possession.ts` through `src/sdk/index.ts` is:

```ts
export interface ItemPossessionChange {
  readonly require?: readonly string[];
  readonly remove?: readonly string[];
  readonly add?: readonly string[];
}

// Input IDs are opaque strings. The caller supplies an already-unique current array
// and validates its own content schema. This function never mutates its arguments.
export function planItemPossession(
  current: readonly string[], change: ItemPossessionChange,
): string[] | undefined {
  const add = change.add ?? [];
  if (change.require?.some(id => !current.includes(id)) ||
      add.some(id => current.includes(id)) || new Set(add).size !== add.length) return undefined;
  return [...current.filter(id => !change.remove?.includes(id)), ...add];
}
```

Contract: `undefined` means rejected; every success, including an empty result, returns a detached array. All
requirements and add conflicts are checked against `current`. Surviving items retain order; additions retain their
provided order. Duplicate requested additions reject. Removing a missing ID is a no-op unless explicitly required;
Story's existing loader remains responsible for requiring every consumed item. Overlap therefore has the current
Story meaning for all valid chapters. No item-ID normalization, capacity, catalog, clock, pause checks, events or
persistence are implicit. Runtime content diagnostics still belong to each existing validator/`Reporter`.

This sketch is intentionally enough to evaluate cost, not a new supported API. It does not enforce uniqueness of
an invalid `current` supplied by arbitrary external code; either retain that documented caller precondition or
justify an extra validation check before publishing. It must not silently deduplicate malformed saved state.
Save replay should continue reconstructing validated state from history rather than accepting a raw inventory.

## Exact integration sequence if the parent later approves extraction

**Recommended disposition is documentation-only retention.** The following is a contingent, sequential plan,
not a request to start overlapping work with the queue agent.

1. Wait for the Story queue migration to finish. Re-read `story-adventure/index.ts` and its tests; use symbols and
   action semantics rather than old line offsets. Preserve the resulting ingress, batch-drain and transition policy.
2. Add the pure helper and focused contract tests, export it through `src/sdk/index.ts`, and document its caller-owned
   arrays and exact pre-state semantics. Keep it separate from numeric mechanic provider contracts. No kernel changes.
3. In `example-keys/index.ts`, preserve key validation, live-actor check and lazy `{ keys: [] }` component creation.
   Replace only duplicate-check/append with `next = planItemPossession(ring.keys, { add: [key] })`, reject on
   `next === undefined`, then assign `ring.keys = next`. Keep gate `includes`, all interaction policy and pickup return
   semantics. No external actor map or handles. The component remains plain data and the sole source of truth.
4. In Story's `apply(s, action)`, retain room/flag/once checks before item work. Call
   `planItemPossession(s.inventory, { require: action.items, remove: action.consume, add: action.add })`; reject on
   `undefined`, otherwise assign `s.inventory`. Continue flags/journal/move/message/completion afterward. The helper
   must use `s.inventory`, never close over live `state.inventory`. Both live and replay calls keep using this `apply`.
5. Keep `AdventureState`, `state()` array copies, `initial()`, save schema/version, temporary replay state, accepted
   history and action event sites as they are. The helper holds no state to dispose, serialize, fork or synchronize.
   A successful item plan is only data until the caller assigns it; it publishes no partial facts.
6. Presentation can retain its existing predicates in the initial pilot. If readiness sharing is an explicit goal,
   replace only its item predicates with a pure planning result check, retain local flag conditions and recheck in
   authoritative `apply`. Count that adapter and candidate allocation in the pilot evaluation.
7. Run the preservation cases below. Review the final diff against the six-line authoritative baseline, including
   types, imports, adapters and lifetime code; report semantic centralization honestly rather than claiming line savings.
8. Only for an actual implementation: update `docs/guide/plugins.md` and relevant architecture/family documentation, review the
   two consumers' `reuse.json` entry points/examples/tests, and run `npm run index-reuse`. Keep family scope labels
   truthful. An additive helper need not change the existing `Adventure` or numeric-provider interfaces. Run required
   `npm run check`, bundled validation, build and browser smoke in the implementing parent session.

## Preservation cases and evidence gaps

These are the concrete oracles for a future migration, not tests claimed to have run during this review.

| Case | Expected result / location |
|---|---|
| Duplicate key and actor isolation | Existing `keys-gates.test.ts` checks effect returns `true`, then `false`, and another actor cannot unlock until it acquires its own key. Retain this and the dungeon route/restart tests. |
| Actual duplicate pickup retention | Add a second physical pickup with the same key; collecting the first consumes it, encountering the duplicate leaves that entity present. Existing test verifies the effect's boolean rather than that full physical duplicate scenario. |
| Dynamic exact key IDs | Use a valid key such as `Blue key / 7` supplied at runtime, verify successful single acquisition, duplicate rejection, and distinction from differently cased strings. Dead actors and invalid/blank input still reject. |
| Acquisition order and nonconsuming requirements | Existing lighthouse route expects `['key', 'lens']`, then `['key', 'cloth', 'clear-lens']` after polish. Keep those exact-array checks. Required `cloth` and `key` survive. |
| Required-item failure | Start with `['a', 'b']`; require `['a', 'missing']`, remove `['a']`, add `['c']`. Reject without changing either array or any story fields/history/events. |
| Pre-add rejection | Start with `['a', 'b']`; require/remove `a`, add already-held `b` and fresh `c`. Reject the whole action; `a` is not spent and `c` is not acquired. Use a synthetic action without `once` so that the inventory guard is actually tested. |
| Overlapping remove/add | A valid synthetic chapter action has `items: ['a']`, `consume: ['a']`, `add: ['a']`. Staging succeeds; execution rejects both when `a` is held and when absent. No accepted history or event, flags/journal/move untouched. |
| Multiple additions and reacquisition | From `['a', 'b', 'c']`, require/remove `b`, add `['e', 'd']` yields `['a', 'c', 'e', 'd']`. A later separate add of `b` appends it at the end. Duplicate IDs within `add` are rejected by chapter staging (and by the sketch's helper contract). |
| Snapshot isolation | Mutate the arrays returned by `Adventure.state()` and verify later state remains intact. For a pure helper, mutate its result and confirm input and another candidate are unaffected. An empty array result is success, not rejection. |
| Partial replay failure | Load a same-version history with a valid prefix such as `speak-kind`, `workshop-door`, `take-lens`, followed by illegal `light-beacon`. Start from visibly different live progress. Preserve live inventory/order, room, flags, journal, completion and accepted history; update only failure message; emit zero action events. |
| History survives failed restore | Save live history as a baseline, inject the failing candidate, attempt load, then save again and compare accepted histories. This detects a replay that preserved visible items but partially replaced history. |
| Successful detached replay | Load a valid saved route, compare ordered inventory and other progression fields to the original (allow restore message), and assert zero action events during load. Subsequent live actions still emit once after committing. |
| Valid content bounds | If an implementation introduces any definitions or limits, exercise a chapter with more than 64 defined items and a chapter with no items. Both are currently valid; do not accidentally inherit pool limits. |

Current tests already establish the full lighthouse route, waiting/pause behavior, exact inventory checkpoints,
key ownership/restart, resource atomic rejection, save across restart and several corrupt-save cases. They do **not**
fully characterize overlapping item effects, a failed replay after a mutating valid prefix, preservation of journal/
completion/history on failed load, or absence of replay events. Those gaps matter if this code is changed; the
existing green suite alone would not establish equivalence for an extraction.

## Verification and handoff

This task changed only `docs/archive/item-possession-decision.md`. Discovery commands completed successfully; source and
tests were inspected. A final source reread observed Story's concurrent `createCommandQueue` migration and confirmed
that `apply`, detached snapshots and the replay/commit boundary still have the semantics described above.
No source, tests, queue work, shared documentation or metadata were edited, and no build,
check, heavy test run or child agent was started. The recommended implementation decision is **retain**, so there
is no item-possession source migration to schedule behind the queue work unless the parent deliberately revisits
the measured tradeoff above.
