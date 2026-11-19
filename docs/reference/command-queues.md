# Owned bounded semantic command queues

`createCommandQueue` is an SDK helper for **owned, bounded FIFO ingress**. Stonewake and The Last Light share pending
command ownership, capacity enforcement, observed-pause rejection and explicit draining. Their command schemas,
legality, scheduling and gameplay outcomes stay in their respective authorities.

## Public API

Import the runtime helper and companion types from `src/sdk/index.ts`. The declaration is
[`src/sdk/contracts/command-queue.ts`](../../src/sdk/contracts/command-queue.ts).

```ts
interface CommandQueueOptions<T> {
  readonly capacity: number;
  readonly normalize: (input: unknown) => T | undefined;
}
interface CommandQueue<T> {
  readonly size: number;
  enqueue(input: unknown): boolean;
  drainOne(): T | undefined;
  drainBatch(): T[];
  clear(): void;
  dispose(): void;
}
function createCommandQueue<T>(
  owner: Pick<SessionContext, 'scope' | 'services'>,
  options: CommandQueueOptions<T>,
): CommandQueue<T>;
```

There is no selected provider, factory registry, instance ID or new kernel behavior. The helper requires an owning
scope and borrows its service access. `SessionControl` is optional; absence permits headless operation. It installs
one `command-queue` cleanup resource, with no system, event listener, timer or asynchronous task.

### Ingress and normalization

- Capacity must be a **positive safe integer**. Invalid configuration throws `RangeError` before scope registration.
  Capacity is captured at creation and does not preallocate a buffer. Mutating the supplied options later cannot
  replace capacity or the normalizer.
- `enqueue(...) === true` means one normalized command was appended, **not** that an action committed or will be legal when
  processed. `false` means no command from that call was appended: invalid normalization, full queue, observed pause,
  dead owner/queue, recursive ingress, or normalization invalidated by `clear()`.
- Full queues reject the newest request without eviction and without running its normalizer. FIFO is acceptance order.
  The bound covers pending commands, not commands already transferred to the game.
- The caller must validate unknown input and return an **owned copy**. Copy nested mutable fields when present and do
  not retain aliases to the normalized result. The helper does not clone arbitrary values or define a command schema.
  `undefined` is reserved for rejection and cannot be a queued command. Both shipped adapters capture primitive fields
  once, validate those captured values, and construct fresh command objects.
- Normalizer and service-getter exceptions propagate. The helper does not append or transfer a command on such a
  failure and releases its reentry guard. It does not roll back explicit callback side effects such as `clear()` or
  disposal. Command-content errors should ordinarily return `undefined`, rather than throw.

### Pause, callback reentry and lifetime

Each ingress/drain observes `SessionControl.playing`; `false` **drops pending work** and rejects ingress/draining.
Ingress rechecks the gate after normalization. Scope disposal and manual queue disposal also reject operations. Size
is a passive pending count; reading it does not sample the gate. A boolean service cannot reveal a pause/resume that
happened entirely between observations. Applications needing pause epochs must supply a separate host contract;
this helper does not claim to reconstruct them.

Normalizer and service getters can run caller code. During an ingress/drain, nested `enqueue` returns `false`,
`drainOne` returns `undefined`, and `drainBatch` returns an empty array without invoking more callbacks. `clear` and
`dispose` remain available; they invalidate an in-progress enqueue. Checks after callbacks prevent a paused or dead
queue from accepting the callback's result. Games still own any effects of commands already transferred to them.

`dispose()` is idempotent, clears pending commands and releases its scope registration immediately. Owner disposal
does the same automatically. Creating a queue under an already disposed scope produces an inert handle. Separate
queues and owners have independent state; manual disposal/recreation does not grow scope counts. There is no global
registry, persistence format, request deduplication or retained receipt history.

### Explicit drains and game policy

`drainOne()` transfers the oldest pending command. `drainBatch()` transfers **exactly the current FIFO snapshot** and
empties pending storage before the game processes it. Enqueues during processing enter the next batch. `clear()` and
`dispose()` affect pending work only: neither can revoke a returned command or array. A game that needs to stop an
already-transferred batch must decide that locally. The helper has no processing callbacks and publishes no events.

| Consumer | Bound / drain | Local policy retained |
|---|---|---|
| [`puzzle/rules`](../../games/puzzles/plugins/puzzle-rules/index.ts) / Stonewake | 32 pending; `drainOne` in `puzzle/rules.commands` (`control`) | One command per tick; cardinal movement and turn legality; clear pending commands after undo, restart/replay, next (even unsuccessful next), chamber clear and capture; board history and committed cues |
| [`story/adventure`](../../games/adventure/plugins/story-adventure/index.ts) / The Last Light | 128 pending; `drainBatch` in `story/adventure.commands` (`rules`) | Strict command fields; action ID length; original batch continues across save/load/reset; newly enqueued commands wait for the next tick; action prerequisites, inventory, flags, journal, history and replay validation |

Neither game spends turns or advances story state while idle. Stonewake keeps its existing transition clearing sites;
Story resets game state/history without cancelling the rest of its transferred batch or recursively enqueued pending
work. Story's `Profile` callback can enqueue synchronously, but that request cannot enter the batch already executing.
Action outcome events are still game-owned and subject to normal system-event deferral.

Two deliberate ingress tightenings accompany extraction: observing pause in **enqueue** clears pending commands
immediately (previously the game system had to observe pause to clear them), and a retained Story service rejects
after its owning session is disposed. A previously transferred batch is not a resumable or revocable transaction.

## Discovery and design decision

Searches: `command queue`, `input focus pause`; then targeted `--show` inspection and the compact `docs/reference/reuse-index.md`.

| Candidate ID | Inspected evidence | Decision |
|---|---|---|
| `recipe/scoped-input`, `sdk/SessionControl`, `sdk/InputContexts` | SDK experience/input declarations; puzzle presentation; `tests/experience-input.test.ts`; ownership and ingress sections in `docs/guide/plugins.md` / `docs/reference/architecture.md` | Reuse host pause and scope facilities. Input contexts manage physical bindings/focus, not pending semantic commands. |
| `sdk/defineCommand` | `src/sdk/core.ts` and the command-bus contract | Immediate single-handler dispatch does not supply bounded deferred ingress. Keep that mechanism unchanged. |
| `puzzle/rules`, `sdk/PushPuzzle` | Puzzle command declaration, rules authority and `games/puzzles/tests/stonewake.test.ts` | Extract pending FIFO plumbing; preserve single-command/transition policy in the game. |
| `story/adventure`, `sdk/Adventure` | Adventure command declaration, authority and `games/adventure/tests/narrative-adventure.test.ts` | Use the same helper with snapshot batch transfer. Inventory and save replay remain local. |

The concrete missing seam was owned semantic buffering shared by these two authorities. An SDK helper avoids a new
plugin selection or ID namespace for state that is already private to a consumer. Tactics' accepted request-ID memory,
objective receipts, general input routing and arbitrary gameplay transactions are outside this contract. This is an
additive SDK 2 export; family service command signatures are unchanged.

### Duplication measurement

The extraction replaces **two local queue arrays**, **two capacity checks**, **four pause-check sites** (ingress and
system in each consumer), **one raw abort check**, and **two direct array drain operations** with the shared helper.
Both manual enqueue append/boolean plumbing blocks now delegate to `queue.enqueue`. The four Stonewake transition
clear sites remain local calls to `queue.clear`; command normalization remains local in both consumers.

This is not a source-size reduction: before the pilot, the two authority `index.ts` files contained 77 and 130 physical
lines (207 total); afterward they contain 76 and 132 (208 total). The helper adds 74 physical lines, including types
and contract comments, plus one SDK export line: **76 more production-source lines overall**, excluding metadata,
documentation and tests. The gain is one tested lifetime/capacity/reentry invariant replacing repeated private rules,
not a claimed net LOC saving. The adapters deliberately retain game-specific validation and ordering.

## Evidence and limits

Claim: shared bounded ingress works under the two named consumer policies. This has contract and composition
evidence; there is no interchangeable provider or substitution claim.

- [`tests/command-queue.test.ts`](../../tests/command-queue.test.ts): nine public-contract cases cover capacity, nested
  payload detachment by the normalizer, FIFO, single versus batch transfer, observed and unobserved pause, independent
  owners, 50 early-disposal/recreation cycles, late creation, recursive callbacks, captured options, callback mutation,
  dead handles and exceptions. Oracles are exact returned command sequences, acceptance booleans and scope counts.
- [`tests/command-queue-consumers.test.ts`](../../tests/command-queue-consumers.test.ts): six real-host cases cover detached
  moves and one-tick cadence; all Stonewake queue-clearing transitions; Story's 128-command batch and local legality;
  reset/save/load ordering without replay receipts; synchronous profile callbacks deferred to the next batch; observed
  pause and three restarts per family with stable ownership counts and rejected stale ingress. These run the authored
  `puzzle/sleeping-ruins` and `story/last-light` content, explicit scheduler ticks and fixture seed 1.
- Existing [`games/puzzles/tests/stonewake.test.ts`](../../games/puzzles/tests/stonewake.test.ts) and
  [`games/adventure/tests/narrative-adventure.test.ts`](../../games/adventure/tests/narrative-adventure.test.ts) remain intact, retaining full legal routes,
  idle behavior, undo, replay, save corruption and storage-error coverage.

Focused run under Node 22.19.0:

```bash
node --test tests/command-queue.test.ts tests/command-queue-consumers.test.ts games/puzzles/tests/stonewake.test.ts games/adventure/tests/narrative-adventure.test.ts
```

**29 passed, 0 failed, 0 skipped.** Typechecking, boundary lint and live discovery inspection of `createCommandQueue`
passed. Logs: `/tmp/opencode/command-queues-tests.log`, `/tmp/opencode/command-queues-typecheck.log`,
`/tmp/opencode/command-queues-lint.log`, `/tmp/opencode/command-queues-discovery.log`.
The [integrated verification record](../archive/general-capability-buildout.md) reports full checks, inventory regeneration and
production-browser acceptance. These focused headless cases do not establish hands-on pointer-lock verification,
complete saved queues, arbitrary provider substitution or a general deterministic replay protocol.
