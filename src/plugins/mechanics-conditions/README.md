# Timed conditions

Select `sdk/mechanic-conditions` as `mechanics/conditions`, and provide a live explicit seconds or turns clock. Each owned ledger stores up to 256 independent target/name pairs. Apply replaces the deadline; snapshots show remaining time in insertion order; expiration is exact at `clock.now >= deadline`. Removal and application reject while paused. Dispose the ledger before its borrowed clock; either owning scope also disposes it. The game advances the clock and implements consequences, targeting, stacking policy, and presentation. There are no callbacks or periodic damage.

The Silt Archive uses the ledger for a telegraphed exposure condition. See `tests/mechanics-conditions.test.ts` and `tests/silt-archive-combat.test.ts`.
