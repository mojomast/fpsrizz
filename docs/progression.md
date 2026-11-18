# Experience and levels

`mechanics/progression` owns an XP ledger, linear level thresholds and the count of completed levels whose game-defined
rewards have not yet been acknowledged. It does not own perks, stat changes, UI, persistence or when a player is allowed
to choose a reward.

## Reuse decision and boundary

Discovery used `xp level experience progression` and `upgrade choice progression`. The closest existing mechanics were
`mechanics/objectives` (one-shot counters and prerequisite DAGs) and `example/roguelite` (three automatic reward choices).
Neither owns repeatable XP thresholds plus pending level rewards. The extracted seam is deliberately smaller than an RPG
character system: consume XP, complete levels and acknowledge reward resolution. Cinder Vault applies its own boons and
keeps combat running while a reward is pending.

## Composition

```json
{
  "plugins": ["mechanics/progression"],
  "roles": { "sdk/mechanic-progression": "mechanics/progression" }
}
```

A consumer declares `sdk/mechanic-progression` in `requiresRoles` and `roleDependencies`, then resolves the selected
factory:

```ts
const levels = progressionMechanic(ctx).create(ctx, 'my-game/levels', {
  startLevel: 1, baseXp: 30, growth: 20, maxLevel: 30,
});
const result = levels.grant(15);
if (result.levels > 0) showOwnGameReward(levels.pending);
```

## API and behavior

| Export | Purpose |
|---|---|
| `ProgressionProviders` | Registry of `MechanicFactory<ProgressionProvider>` entries |
| `ProgressionMechanicRole` | Exclusive role `sdk/mechanic-progression` |
| `progressionMechanic(ctx)` | Resolve the selected factory |
| `ProgressionProvider.create(owner, id, definition)` | Create an independently owned `MechanicProgression` |

The normalized definition has `startLevel` (1..1000), `baseXp` (1..1,000,000,000), `growth` (0..1,000,000,000) and an
inclusive `maxLevel` (startLevel..10,000; default 1000). Level `L` needs `baseXp + (L - startLevel) * growth` XP. Inputs
are copied and frozen. The normalized `xpToNext` is always exposed.

`grant(amount)` accepts a positive safe integer and rejects while paused/disposed. It counts all XP in `totalXp`, applies
as many complete levels as the amount and curve allow, increments `pending` for each completed level, and returns
`{ ok, reason, levels }`. XP stops at the current threshold when `maxLevel` is reached. `consumeLevel()` decrements one
pending reward and rejects when there is none. Neither operation applies gameplay effects or pauses the game.

The handle exposes `id`, `active`, `revision`, `definition`, `level`, `xp`, `xpToNext`, `totalXp` and `pending`.
Successful `grant` and `consumeLevel` operations increment `revision` once and emit `MechanicProgressionChanged` with a
detached snapshot. Definitions and event payloads are frozen. State is not a save/restore protocol.

### Ownership and failures

The provider uses `createOwnedInstances(provider, 'mechanic-progression')`. IDs contain 1..128 characters and are unique
among this provider's live instances in one consumer context. Different consumers can use the same ID. Early disposal
releases both ownership registrations; either scope's disposal invalidates the handle. Retained getters stay readable,
but old handles cannot mutate a reused ID. Invalid definitions and duplicate live IDs throw before ownership is
reserved. Restart creates a fresh provider and fresh ledgers.

## Limits

- Linear `base + growth` curve only; no table, multiplicative curve, respec, XP loss or prestige loop.
- No automatic reward catalog, stat application, queue UI, save/restore or notification policy. Consumers choose whether
  several pending rewards are presented immediately, capped, randomized or ignored.
- The provider accepts XP while rewards are pending. Consumers that want one-at-a-time leveling must gate their own XP
  grants or queue presentation.

## Evidence

| Evidence | Cases |
|---|---|
| `tests/mechanics-progression.test.ts` | Default and independent counted-total providers; initial state; single/multi-level grants; queued pending rewards; max cap; invalid amounts/definitions; pause; frozen definitions; owner isolation; both scopes; ID reuse; restart |
| `games/cinder/tests/cinder-vault.test.ts` | In-level level-up while enemies remain and weapon fire continues; boon selection; queued offers; full three-depth victory under the independent progression provider |
| `tests/helpers/alternate-progression.ts` | Independent algorithm derives level/pending from one accepted-XP total rather than duplicating the production loop |

Focused command:

```sh
node --test tests/mechanics-progression.test.ts games/cinder/tests/cinder-vault.test.ts
```

See also [reuse discovery](../REUSE.md), [reusable mechanics](reusable-mechanics.md), [Cinder Vault](cinder-vault.md) and
the [capability/evidence template](reusable-capability-template.md).
