# Explicit-clock deadlines

`createDeadline` is an additive SDK 2 helper exported from `src/sdk/index.ts`. It owns one pollable deadline over a
**borrowed** `MechanicClock`. Sky uses it for boost and collision immunity; Verdant uses it for dry-wind and the season.
It adds no provider, role, required clock method, scheduler system or event. Clock selection continues through the
existing `ClockMechanicRole` / `clockMechanic` / `createMechanicKit` composition.

## Decision and discovery

Following the [capability design note](reusable-capability-template.md), discovery searched `deadline duration immunity`
and `clock turns cooldown`, inspected `mechanics/clock` and `mechanics/actions` with `find-reuse -- --show`, and checked
`REUSE_INDEX.md`. The inspected declarations/implementations were `src/sdk/contracts/mechanics.ts`, the clock/action
providers, Sky/Verdant consumers, `tests/mechanics-providers.test.ts` and `tests/reusable-games.test.ts`.

| Need | Candidate | Decision |
|---|---|---|
| Explicit seconds and successful-turn time | `mechanics/clock` | Reuse its structural `MechanicClock`; the game advances it. |
| Costs and reuse eligibility | `mechanics/actions`, `recipe/resource-actions`, `recipe/independent-actor-actions` | Preserve action transactions/cooldowns. Effect duration is a distinct concern. |
| Duration windows | `sky/game`, `verdant/game` | Extract only arm/cancel/remaining/due into an owned SDK helper. Speed, collision, drain and outcome ordering remain local. |
| General status effects | `example/ward` | Family-bound shooter damage modifier; no cross-genre stacking/attribute engine is justified by this pilot. |

The extraction replaces Sky's two raw end timestamps and Verdant's weather/season boundary queries with shared
validation, cancellation and lifetime semantics. It deliberately adds a little explicit handle/reset plumbing rather
than hiding when either game advances time or checks victory. It is a shared contract, not a claim of net line reduction.

## Public API and semantics

Defined in `src/sdk/contracts/deadlines.ts`:

```ts
createDeadline(owner: SessionContext, clock: MechanicClock, initialDuration?: number): Deadline

type DeadlineResult = { readonly ok: true }
  | { readonly ok: false; readonly code: 'disposed' | 'paused' | 'invalid-duration' };

interface Deadline {
  readonly active: boolean;
  readonly domain: 'seconds' | 'turns';
  readonly armed: boolean;
  arm(duration: number): DeadlineResult;
  cancel(): DeadlineResult;
  remaining(): number;
  due(): boolean;
  dispose(): void;
}
```

- Creation without a duration is unarmed. The optional duration initializes the deadline relative to the borrowed
  clock's current `now`; this is allowed during paused activation, like initial resource values. It never advances time.
  Invalid construction throws before acquiring a scope registration. A disposed owner/clock or incompatible domain/time
  rejects construction. The domain must be seconds or turns; `now` must be finite and nonnegative, and safe-integral for turns.
- `arm(duration)` atomically replaces the stored endpoint with `clock.now + duration`. Seconds require a positive finite
  duration and a finite, strictly greater representable endpoint. Turns also require safe-integer duration and endpoint.
  **Zero is invalid**, not an immediate deadline or cancellation alias. Negative, nonfinite, overflowing or rounded-away
  durations reject. Fractional seconds and representable positive subnormal values are valid.
- Mutation rejection precedence is disposed, then paused, then invalid duration. Rejected operations preserve the prior
  endpoint, including one already due. The result codes are stable machine-facing values; there are no human-text reasons.
- `cancel()` disarms; repeated cancellation of a live unpaused handle succeeds. Paused cancellation rejects even when
  already unarmed. `dispose()` is always permitted, including while paused.
- An armed active deadline is due **exactly when `clock.now >= endpoint`**. No epsilon or rounding is applied.
  `remaining()` is `max(0, endpoint - now)`. Due queries are repeatable observations, not acknowledgements: a due deadline
  stays armed until cancelled or rearmed. Overshoot leaves it due; it creates no implicit repeats or catch-up work.
- Unarmed and inactive handles report `remaining() === 0`, `due() === false`, `armed === false`. `active` describes
  lifetime, not whether the window is still running; an expired live handle remains active. Reads do not throw after
  disposal or conceal an already-due deadline while paused. No snapshot or save/restore protocol is supplied.
- Optional `SessionControl.playing === false` rejects arm/cancel. Without that service, writes are allowed. The helper
  does not implement a separate pause clock: the composing authority must stop advancing its clock while paused.

## Ownership and composition

Each creation owns one `deadline` entry in the caller's scope, with independent closure state and no ID registry.
Early/idempotent `dispose()` releases that entry and clears the endpoint. Owner disposal invokes the same cleanup.
It never calls the borrowed clock's `advance` or `dispose`, so several deadlines can share one clock across owners.

Borrowed-clock disposal immediately makes all dependent deadline queries inactive and mutations rejected. The clock
contract has no disposal subscription; its loss is observed through `clock.active`. The deadline's own registration is
released by explicit deadline disposal or the owner's eventual teardown. Games explicitly dispose old deadlines before
replacing their kit on replay, preserving stable resource counts. Session restart creates fresh closures and clocks;
old handles cannot rearm. No provider identity/brand or default implementation import is required.

Trusted clocks must honor the existing monotonic, immutable-domain, permanent-disposal contract. The helper cannot
turn a malicious/throwing getter into a conforming clock. It invokes no gameplay callbacks or observers, performs no
resource transaction, and publishes no completion event. There is therefore no cross-plugin transaction/rollback claim.

## Preserved consumer timing

### Sky Salvage: accumulated seconds

Before this migration, Sky stored absolute `boostUntil`/`hitUntil` timestamps. The migration preserves those timestamp
operations and the accumulated mechanic clock, including its existing floating-point boundary behavior.

Each active flight tick advances the kit clock by `dt` **before** handling its command, then checks the storm hazard.
A successful boost arms 1.5 seconds at that newly advanced time. Boosted movement uses an armed, not-due window. A
successful collision debit arms 1.5 seconds of immunity; the initial unarmed window allows a first-tick hit. Rejected
boosts do not refresh the window. Movement speed, damage amount and action cooldowns are unchanged local rules.

The pre-migration test trace for a first-tick boost/hit (`dt = 1 / 60`) was:

| Flight tick | Actual accumulated clock | Endpoint / result |
|---|---|---|
| 1 | `0.016666666666666666` | Arm at `1.5166666666666666`; boost costs 20 energy; initial collision costs 20 hull. |
| 90 | `1.4999999999999996` | Before expiry: movement `10 / 60`; immunity still protects. |
| 91 | `1.5166666666666662` | Still below the endpoint: movement `10 / 60`; immunity still protects. |
| 92 | `1.5333333333333328` | Due: movement `5 / 60`; next overlapping collision is eligible. |

The post-migration tests assert the same exact time values and eligible ticks. A follow-the-hazard command tape keeps
overlap through the boundary. Its 120 paused scheduler ticks leave flight time/hull unchanged, so that flight's second
hit is scheduler tick 212 but flight tick 92. The tiny binary remainder at tick 91 is existing gameplay; an epsilon would
change it by one tick. The helper's exact-equality cases additionally use representable increments (1.75 + 0.25 seconds).
These assertions do not promise invariance under arbitrary timestep repartitioning.

Idle active Sky ticks advance seconds; rejected gameplay commands still pass through an active flight tick. Observed
pause clears queued commands and advances nothing. A replay command resets the kit/windows and returns without
advancing the fresh clock. The HUD's `boostRemaining` continues to be the **action cooldown**, not the active window.

### Verdant Relay: accepted decisions

Creation initializes dry-wind at turn 3 and the season at `world.days`, including while the launcher is paused. A
successful action commits its local restoration/objective effects and then advances exactly one turn. Idle ticks,
rejected/cooling-down actions, duplicate restoration and invalid targets do not advance that clock. Pause clears observed
queued work and leaves time unchanged. The next-day forecast uses dry-wind remaining equal to one.

After the turn advances, outcome precedence remains:

1. Completed objectives win, even on the final day; no water drain occurs.
2. A due dry-wind attempts one water debit. Failure loses to dry wind, even when the season is also due.
3. Successful wind work explicitly rearms its deadline three turns from now; season expiry then loses if due.
4. Otherwise the game continues with its ordinary message.

Dry-wind therefore still drains on accepted turns 3, 6, 9, …; the helper performs no recurrence. The game always advances
one turn, so there is no missed-turn catch-up policy. A successful final-day drain is committed before season loss. Three
short-season tests distinguish final-day victory with zero water remaining, failed wind, and successful wind followed by
season loss, after both paused host activation and paused host restart. Replay recreates both deadlines at turn zero.

## Evidence and limits

**Claim:** one pollable deadline contract supports seconds-based effect windows and successful-turn environmental
boundaries without moving clock authority or gameplay outcomes into the helper. Evidence is contract- and
composition-exercised; a forwarding structural clock wrapper is not an independent production clock implementation.

| Evidence | Cases / oracle |
|---|---|
| `tests/deadlines.test.ts` | Real role-selected clocks in both domains; unarmed/before/equality/overshoot; rearm/cancel; positive representability/overflow/safe turns; paused initialization and write rejection; owner isolation, early/provider/borrowed disposal and restart; structural public-clock forwarding with zero hidden advance/dispose calls. |
| `tests/deadline-consumers.test.ts` | Public-state baseline assertions first passed before migration and pass after; exact Sky values/ticks and cooldown distinction; paused overlap tape; Verdant before/at/after drain, explicit rearm, final-day precedence; repeated replay stable ownership and stale services after host restart. |
| Existing game/provider suites | Sky/Verdant full routes, rejection/loss, resources/actions/objectives; existing independent-resource complete-route comparison remains applicable. |

Focused command (installed Node 22; no browser required):

```bash
PATH=/home/mojo/.local/node_modules/node/bin:/opt/emurizz/bin:$PATH \
  node --test tests/deadlines.test.ts tests/deadline-consumers.test.ts \
  tests/mechanics-providers.test.ts tests/sky-salvage.test.ts \
  tests/verdant-relay.test.ts tests/reusable-games.test.ts
```

The first pre-migration consumer run passed all six cases after correcting a new test's ownership oracle to account for
its observer being released on restart. The post-migration focused run passed **38 tests, zero failures/skips**. Logs:
`/tmp/opencode/deadlines-before.log` and `/tmp/opencode/deadlines-focused.log`. After extending the final-day cases to
paused activation and paused host restart, both deadline suites passed **14 tests**, logged in
`/tmp/opencode/deadlines-final.log`. `npm run typecheck` passed after correcting the new test fixture's instance-ID parameter
type (`/tmp/opencode/deadlines-typecheck.log`). The [integrated verification record](general-capability-buildout.md)
reports full checks, reuse-index regeneration and production-browser acceptance.

Limits: no recurrence, callbacks, catch-up, persistence, arbitrary clock rewind, effect stacking, attribute modifiers or
action-cooldown replacement. Browser presentation and independent clock-provider substitution are separate evidence
dimensions, not established by the structural forwarding test. Retained disposed helper observations are neutral rather
than historical snapshots. Commands in these boundary tests are fixed short tapes or bounded hazard-following inputs;
they do not establish universal deterministic save/replay compatibility.
