# Pair relationships

Select `mechanics/relationships` for `sdk/mechanic-relationships` and declare that role in the consumer's `roleDependencies`. Resolve `relationshipMechanic(ctx)` in activation and create an owned ledger with explicit unordered actor pairs, initial scores and finite bounds. Scores clamp on finite changes. Snapshots are detached, frozen and retain definition order; actor order within a pair is canonical. Unknown pairs are never created implicitly.

The consumer decides actor identity, interaction legality, milestones, consequences and persistence. There is no time, graph traversal, event system, automatic decay or directed relationship. Instances are isolated by consumer and disposed with either scope; a disposed handle cannot affect a replacement. See `common/game` and `tests/mechanics-relationships.test.ts`.
