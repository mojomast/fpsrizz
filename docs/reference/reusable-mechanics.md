# Reusable gameplay mechanics

The four mechanic providers implement gameplay state independently of camera, input, renderer and genre. Their public
interfaces are in `src/sdk/contracts/mechanics.ts`, exported from `src/sdk/index.ts`. They register no tick or frame
systems. A composing game queues UI ingress, validates its own spatial/target rules in simulation, executes a shared
action, and commits its local outcome only when the result is successful.

## Composition and substitution

| Role | Default provider / factory ID | Registry |
|---|---|---|
| `sdk/mechanic-resources` | `mechanics/resources` | `ResourcePoolProviders` |
| `sdk/mechanic-clock` | `mechanics/clock` | `MechanicClockProviders` |
| `sdk/mechanic-actions` | `mechanics/actions` | `MechanicActionProviders` |
| `sdk/mechanic-objectives` | `mechanics/objectives` | `ObjectiveProviders` |

Consumers list these roles in both manifest `requiresRoles` (selection requirement) and `roleDependencies` (activation
ordering after the selected provider's owner). They do not depend on concrete default provider plugins. The preset
explicitly enables implementations and selects their IDs under `roles`. A replacement registers the same public
factory interface and its own role metadata, then is selected by the preset. `mechanics/kits` checks that every selected
mechanic role has a factory registered under that exact selected ID; metadata alone fails staging.

Content packs depend on `mechanics/kits`. In a game's activation:

```ts
import { createMechanicKit } from '../../sdk/index.ts';
const kit = createMechanicKit(ctx, 'my-game/kit', 'run');
// Later, inside the game's simulation:
kit.clock.advance(dt); // seconds; a turn game explicitly advances whole turns instead
if (targetIsLegal && kit.actions.execute('repair').ok) applyLocalRepairOutcome();
```

The helper resolves selected factories lazily through owner-bound `ctx.instantiate`. Independently composed mechanics
are available through `resourceMechanic(ctx)`, `clockMechanic(ctx)`, `actionMechanic(ctx)` and `objectiveMechanic(ctx)`;
each provider's `create` takes the consumer `SessionContext` and an instance ID. Actions take explicit resource/clock
handles. Compatible alternate implementations are accepted structurally; there is no default-provider brand check.
The contract cannot prove foreign handle ownership or make arbitrary custom callbacks transactional; trusted providers
must honor the synchronous transaction and monotonic-clock contracts.

## Ownership and state

- Each factory keeps live instance IDs separately for each consumer context. Different consumers may use the same ID;
  duplicates within one consumer and mechanic type throw. Instance IDs are 1–128 characters.
- `dispose()` is idempotent and releases both ownership registrations early. Either consumer or provider disposal
  invalidates the handle. Disposed IDs may be reused. Session restart creates fresh factory state.
- Definitions are copied and deeply frozen; snapshots are detached/frozen. Retained snapshots never track later writes.
- Mutations reject disposed handles and reject when optional `SessionControl.playing` is false. Queries remain readable.
  Creation is permitted while the launcher is paused; initial values come from definitions, not mutations.
- Events carry consumer plugin ID and instance ID, with immutable payloads. Revisions advance on successful operations.
  There are no hidden global mutation queues, persistence, DOM dependencies or automatic time advancement.

## Resource pools

Resources have `id`, `label`, `initial`, `max`. Quantities are finite nonnegative JavaScript numbers and may be fractional;
`initial <= max`. `get` returns zero for an unknown key, but transactions reject all unknown keys, including zero amounts.
`snapshot()` returns all current balances.

`preview({ spend?, gain? })` performs a pure availability check. `transact(transaction, reason?)` rechecks all inputs,
debits against **pre-gain** balances, then credits against each maximum. Any invalid amount, overdraft or overflow rejects
the whole operation. Gains cannot finance spending in the same transaction. No clamping silently discards credits.
An accepted empty transaction is a successful revision/event. Reasons are strings of at most 256 characters.

## Clocks and actions

Clocks start at zero. Only `advance(amount)` changes time: positive finite representable increments for seconds,
positive safe integers for turns. Turn totals must also remain safe integers. Idle scheduler ticks never advance either
domain. Zero, negative, nonfinite or numerically non-increasing advances reject.

Actions define `id`, `label`, `cooldown`, optional `spend` and `gain`. Cooldowns are finite and nonnegative; turn cooldowns
are safe integers. `preview(id)` is advisory and pure. `execute(id)` always rechecks the pool, cooldown and lifetime.
At exactly the ready time, an action is eligible. `remaining(id)` returns nonnegative time (zero for unknown IDs).

Execution reserves cooldown and action revision **before** invoking the pool transaction, so even immediate out-of-tick
resource observers see committed balances with their corresponding action state. Synchronous reentrant execution on
that action handle is rejected, including zero-cooldown actions. An ordinary `{ ok: false }` transaction rejection restores
the reservation and revision. Throwing custom providers/observers are not promised arbitrary side-effect rollback.
Successful execution emits `MechanicActionCommitted` after the pool transaction. Spatial legality and game-local effects
are outside this transaction and remain the caller's responsibility.

## Objective tracks

Objectives define `id`, `label`, positive safe-integer `target` and optional `requires` IDs. Unknown prerequisites,
duplicates and cycles reject. An empty track is complete. `record(id, amount = 1, receipt?)` requires an unlocked,
incomplete objective and positive safe-integer progress, capped at the target. Each objective completes only once.

Successful receipts are unique across the entire track, not merely one objective. Invalid, locked and already-complete
attempts do not consume a receipt. Receipt strings are 1–128 characters. At 4096 remembered successful receipts, new
receipted records reject instead of evicting old IDs and allowing replay. Records without receipts remain available.
Snapshots expose progress, completion and computed unlock state; successful records emit `MechanicObjectiveChanged`.

## Strict `mechanic-kit` content

```json
{
  "name": "Shared example",
  "domain": "turns",
  "resources": [{ "id": "water", "label": "Water", "initial": 4, "max": 12 }],
  "actions": [{ "id": "restore", "label": "Restore", "cooldown": 2, "spend": { "water": 2 } }],
  "objectives": [
    { "id": "grow", "label": "Grow", "target": 2 },
    { "id": "relay", "label": "Restore relay", "target": 1, "requires": ["grow"] }
  ]
}
```

These are the exact top-level fields, all required. Unknown fields at any definition level fail staging. Bounds:

| Field | Bound |
|---|---|
| Name and labels | Nonblank, at most 120 characters |
| Local resource/action/objective IDs | 1–64 characters, `/^[a-z][a-z0-9_.-]{0,63}$/`, unique within their category |
| Resources | 1–64 |
| Actions | 0–128 |
| Objectives | 0–128 |
| Each spend/gain map | At most 64 entries; references declared resources only |
| Each prerequisite list | At most 128 unique declared objective IDs; acyclic |
| Targets | 1 through `Number.MAX_SAFE_INTEGER` |
| Resource values and second cooldowns | Finite nonnegative numbers |
| Turn cooldowns | 0 through `Number.MAX_SAFE_INTEGER`, integral |

Content errors use path-bearing reporters and prevent staging, preserving the prior session. Runtime provider creation
also validates code-authored definitions, including bounds, IDs, references, cooldown domain and objective cycles.

## Cross-genre reuse matrix

All three bundled consumers use the same implementations. Headless substitution coverage completes each with both
the defaults and an independently implemented `z-test/resources` test provider, with the default resource plugin removed.
Final authoritative state and the per-event-type resource/action/objective arrays match under the same route policy.
The routes react to current game state; they are not recorded fixed command tapes, and separate arrays do not assert
total interleaving across event types. The test provider demonstrates the resource seam; the other mechanic roles use
their defaults in these routes. It is not another shipped production implementation.

| Game | Genre | Shared resources/actions | Explicit clock | Shared objectives |
|---|---|---|---|---|
| Sky Salvage | Drone courier/recovery | Energy, cargo, hull; boost/repair/unload | Seconds | Distinct beacon deliveries |
| Ember Bastion | Tower defense/building | Scrap, core integrity; build/repair/pulse and independent tower fire | Seconds | Authored wave defense |
| Verdant Relay | Colony restoration | Water, biomass, charge; harvest/convert/restore | Turns | Island relay restoration |

`tests/mechanics-providers.test.ts` exercises owner isolation, early/provider disposal and restart, pause, atomic
transactions, fractional resources, stale preview rechecks, both explicit clock domains, immediate observer reentry,
alternate pools, objective deduplication/capacity, and malformed content/provider staging. `tests/reusable-games.test.ts`
compares complete game routes under both providers, including owner-tagged receipts and every tower's cooldown.
The shared [resource conformance runner](mechanic-conformance.md) exercises the same public promises against both
implementations. Its named cases and limits distinguish behavioral compatibility from matching TypeScript signatures.
`node tests/reusable-games-demo/run.mjs` exercises the production browser UI, 3D scenes, viewport fitting, pause,
winning/losing routes and repeatable ownership across replays and shooter switches; results go to
`.smoke/reusable-games-report.json`.

## Shared orchestration helpers

Additional selectable providers are described in their own contracts:

| Role | Default implementation | Responsibility / current consumers |
|---|---|---|
| `sdk/mechanic-navigation` | `mechanics/navigation` | Pure ordered unit-edge graph search; Stonewake pursuit and Signal Break reachability |
| `sdk/mechanic-sequence` | `mechanics/sequence` | Owned ordered step/round cursors; NEON RUN and Foundry Circuit |
| `sdk/mechanic-progression` | `mechanics/progression` | XP curves, level ledgers and pending rewards; Cinder Vault's in-level boons |
| `sdk/mechanic-inventory` | `mechanics/inventory` | Bounded stacks and equipment slots; Cinder Vault's pack, gear and loot |
| `sdk/mechanic-crafting` | `mechanics/crafting` | Known atomic item recipes over the selected inventory; Cinder Vault's forge and Ember Shards |

See [navigation](navigation.md), [sequences](sequences.md), [progression](progression.md), [inventory](inventory.md) and
[crafting](crafting.md) for exact composition and evidence. Navigation is a pure registration-time role; sequence,
progression and inventory are owner-bound factories. None is added implicitly to a `MechanicKit`. Clock, sequence,
progression and inventory factories reuse [owned-instance leases](owned-instances.md) for identity and disposal.

`TurnControl` (`sdk/turn-control`) is a presence-only service for modes that own discrete actor actions. While it is
installed, `core/enemies` suppresses its autonomous think/separation systems; the mode must perform enemy turns itself.
Cinder Vault provides it for one-tile action-point turns and telegraphed enemy actions. Absence restores real-time AI for
all other games.

The SDK also exports two consumer-owned helpers used by different families, without new plugin selections or systems:

| Helper | Current consumers | Shared responsibility | Game-owned policy |
|---|---|---|---|
| `createCommandQueue` | Stonewake; The Last Light | Bounded FIFO ingress, lifetime/pause checks, explicit draining | Command normalization, legality, one-command versus snapshot-batch cadence, transition clearing |
| `createDeadline` | Sky Salvage; Verdant Relay | Arm/cancel/due/remaining over a borrowed seconds/turn clock | Clock advancement, temporary-effect consequences, rearming, victory/drain/season precedence |

Read [command queues](command-queues.md) and [deadlines](deadlines.md) for exact signatures, ownership and boundary cases.
Action cooldown eligibility remains in `MechanicActions`; an active effect's duration is a separate deadline. Queue
acceptance is not a committed action or completed game outcome. These helpers preserve the existing family service APIs.

For another shared capability, start with the [design/evidence template](../cookbook/reusable-capability-template.md). The
[item-possession decision](../archive/item-possession-decision.md) illustrates retaining a small local rule when current consumers
do not justify another public abstraction.

See the [integrated buildout and verification record](../archive/general-capability-buildout.md) for the current cross-family
helper migrations, conformance coverage, production-browser results and discovery entry points.
