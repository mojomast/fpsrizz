# Signal Break

Select Raven or Rook, spend AP moving up to three orthogonal cells per AP, and attack enemies within seven Manhattan cells for one AP. Walls block movement and line of sight; a target on cover takes one damage instead of two. Hover a target to preview its shot. End turn to let enemies act deterministically and restore squad AP. Eliminate both enemies to win; losing the squad is defeat. Use the host's restart to retry.

The board can be operated with the mouse or arrow keys and Enter; M switches to move, A to attack, and E ends the turn. Action requests are queued and resolved in order on the next control tick. A request ID is accepted at most once per session. Ingress rejects malformed or paused requests, limits the queue to 128 pending requests, and accepts at most 4,096 distinct IDs per session; restart resets those limits. Waiting and rendering never advance a turn. Invalid actions spend no AP. Sound cues follow committed outcomes, rather than clicks.

Reachability uses the [navigation provider](../../docs/reference/navigation.md) selected under `sdk/mechanic-navigation`; the bundled preset
enables `mechanics/navigation`. Tactics constructs the legal graph from terrain and current living-unit occupancy,
preserving north/west/east/south neighbor order. The provider returns shortest step distances; Tactics converts them
to `ceil(steps / 3)` AP, rechecks at commit, and retains enemy targeting/movement policy. Custom presets need this role
selection; the mission format and public `Tactics` API are unchanged.

## Completion route

Coordinates below are zero-based (column, row). Select Raven, move to (2,3), switch to attack and fire at Guard (6,1). Select Rook, switch to move and move to (3,4); switch to attack and fire at Guard. End turn. Select Raven and fire twice at Sentry (6,3). This wins even after the enemy response. The route is exercised by `games/tactics/tests/turn-tactics.test.ts` through real commands.

## Browser automation

Cells have `[data-cell="x,y"]` selectors and descriptive accessible labels. Actions use `[data-action="move"]`, `[data-action="attack"]`, and `[data-action="end"]`. The forecast and action feedback use `[data-testid="tactics-forecast"]`. Wait for a simulation tick between actions. The interface rejects actions while the host reports that play is paused or in a menu.

The `board-mission` content kind accepts rectangular rows using `.`, `#`, and `C`, and uniquely identified, non-overlapping squad/enemy units on traversable cells. `options.mission` selects the mission. The presentation consumes the selected theme's `tactics-ground`, `tactics-cover`, `tactics-unit`, `tactics-enemy` textures and `tactics-select`, `tactics-move`, `tactics-attack`, `tactics-victory` sounds.
