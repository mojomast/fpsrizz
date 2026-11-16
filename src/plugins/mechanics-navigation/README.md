# Deterministic graph navigation

`mechanics/navigation` provides synchronous shortest unit-edge distances and canonical first hops over a caller-supplied directed graph. Stonewake uses it for pursuit; Signal Break uses it for movement reachability. It is a pure advisory query: the game owns adjacency, occupancy, costs and movement commits.

## Compose

Merge this fragment into a complete preset, such as [Stonewake](../../content/presets/stonewake.json):

```json
{ "plugins": ["mechanics/navigation"], "roles": { "sdk/mechanic-navigation": "mechanics/navigation" } }
```

Consumers declare `sdk/mechanic-navigation` in `requiresRoles` and resolve `ctx.role(NavigationRole)!.provider` from the [SDK](../../sdk/contracts/navigation.ts). This registration-time role is a pure object, not a factory registry; it needs no `roleDependencies` activation edge.

Call `search(nodes, origin, maxSteps?)` with unique nonblank node IDs and ordered neighbor arrays referencing declared nodes. Breadth-first discovery returns frozen, detached visits including the origin; equal-length ties follow neighbor order. `maxSteps` is inclusive and must be a nonnegative safe integer. Invalid graphs or origins throw `TypeError`; invalid depth throws `RangeError`, even when malformed graph data is outside the requested radius. Rebuild legality before committing a move.

There are no handles, clocks, pause gates, systems, cache or DOM dependencies; queries work headlessly and retain no session state. Edges all cost one: weighted routing, collision, path smoothing and movement are outside its scope.

See the [navigation guide](../../../docs/navigation.md), [consumer](../board-tactics/index.ts), [provider tests](../../../tests/mechanics-navigation.test.ts) and [consumer tests](../../../tests/navigation-consumers.test.ts). Run `npm run check` from the repository root.
