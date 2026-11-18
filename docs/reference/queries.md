# Entity queries and change detection

`ctx.world.query({ with, without })` (SDK 3) returns a cached view of the entities that have every `with` component
and none of the `without` components. Create queries in `activate()`; the host disposes the handle with the plugin's
session scope.

```ts
const Moving = ctx.world.query({ with: [Transform3D, Velocity], without: [Frozen] });
ctx.systems.add({ id: 'my/move', phase: 'world', update: (dt) => {
  Moving.each((e) => { const t = ctx.world.get(e, Transform3D)!, v = ctx.world.get(e, Velocity)!; t.position.x += v.x * dt; });
  const { added, removed, changed } = Moving.drain();   // since the last drain of this handle
  for (const e of added) createVisual(e);
  for (const e of removed) disposeVisual(e);
}});
```

Semantics:

- **Membership** is updated incrementally on `add`, `remove` and `destroy`, so `each` costs O(matches), not a join.
  A destroyed entity leaves every query at once (before the end-of-system flush). Iteration order is the order
  entities started matching, which is deterministic for a deterministic simulation.
- **Tracking is per handle.** Two plugins asking for the same spec share membership but each sees its own
  `added` / `removed` / `changed`, cleared only by its own `drain()`. A query created late sees existing members but no
  backlog of changes.
- **`changed`** lists members whose `with` component was replaced by `add()` or flagged by
  `ctx.world.markChanged(e, Token)` after an in-place mutation. Components are plain mutable objects, so in-place
  writes are not detected automatically. `changed` never repeats an id in `added`.
- An entity that enters and leaves between drains is not reported; one that leaves and re-enters is reported as
  `changed`.

Cost (`npm run bench:ecs`, box CPU, Node 22): a `pos + vel, not tag` pass over 10,000 entities (4,000 matching) takes
about 0.3 ms with `query.each` versus 0.9 ms for a manual `each` + `has` + `get` join; at 50,000 entities, 2.5 ms
versus 5.7 ms. The store stays a map per component; if a prototype needs 100k+ entities per tick, a structure-of-arrays
ECS such as bitECS is the next step (see the roadmap).
