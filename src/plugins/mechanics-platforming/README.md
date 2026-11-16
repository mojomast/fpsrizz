# Side-scrolling platform physics

`mechanics/platforming` provides the cross-genre `PlatformerRole` (`sdk/platformer`). Its stateless provider creates a configured handle for deterministic, axis-separated AABB movement in coordinates where +x is right and +y is down. It covers acceleration, gravity, coyote time, buffered and variable-height jumps, double jump, dash, wall slide/jump and one-way drop-through.

## Composition and use

Enable the plugin and select `"sdk/platformer": "mechanics/platforming"`; consumers needing it during activation should declare the role dependency. [Hollowmere's preset](../../content/presets/hollowmere-ascent.json) is a complete example. Resolve `platformerMechanic(ctx)`, create a handle with optional overrides of `PLATFORMER_DEFAULTS`, and construct a consumer-owned body with `createPlatformerBody`. Call `step(body, input, abilities, collisionQuery, dt)` each simulation tick; it mutates the body and returns movement events. See the [SDK contract](../../sdk/contracts/platforming.ts) and [consumer](../hollowmere-game/index.ts).

The game owns bodies, collision queries, ability policy, animation and time steps. This is not a full physics engine: there are no slopes, moving platforms, ladders or continuous sweep guarantees. See [Hollowmere movement](../../../docs/hollowmere.md) and [provider tests](../../../tests/mechanics-metroidvania-providers.test.ts).
