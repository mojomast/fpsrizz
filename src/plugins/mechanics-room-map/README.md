# Explorable room map

`mechanics/room-map` supplies `RoomMapRole` (`sdk/room-map`), a validated authored room graph with current, visited and revealed state. Enable it and select `"sdk/room-map": "mechanics/room-map"`; [Hollowmere's preset](../../../games/hollowmere/presets/hollowmere-ascent.json) shows a complete composition.

Use `roomMapMechanic(ctx).create(owner, id, definition)` with rooms, map rectangles, links and a start room. The owned handle provides `enter`, `reveal`, `neighbors`, detached `state`, revision and `dispose`; entering reveals neighbors, and changes emit `RoomMapChanged`. See the [SDK](../../sdk/contracts/room-map.ts) and [consumer](../../../games/hollowmere/plugins/hollowmere-game/index.ts).

The consumer owns transitions, room geometry, map presentation and persistence. Validation does not prove physical reachability or ability gates; the provider does not generate links or calculate shortest paths. See [Hollowmere's map](../../../games/hollowmere/README.md), [navigation queries](../../../docs/reference/navigation.md), and [provider tests](../../../tests/mechanics-metroidvania-providers.test.ts).
