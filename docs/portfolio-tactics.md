# Portfolio tactics missions

Two standalone, small tactical encounters reuse the board family. Select a squad unit, use **M** to move or **A** to attack, and press **E** to end the turn; clicking or arrow keys and Enter operate the board. Eliminate every enemy to win. Movement costs one AP per three orthogonal steps, walls block movement and shots, and a target standing on cover takes one damage instead of two. Attacks cost one AP and have a seven-cell Manhattan range. Enemy turns are deterministic.

## Glasshouse Breach

Three agents assault a conservatory divided by an impassable wall with one central opening. Kill the central Warden before crossing and manage the two defenders, including Thorn on cover. The narrow gap restricts the squad's approach and line of sight.

Tested route (coordinates are zero-based): Fern moves to (3,3) and shoots Warden; Moss moves to (2,3) and shoots Warden; Ash moves to (2,2). End turn. Fern moves to (5,3) and shoots Thorn; Moss shoots Briar twice; Ash moves to (3,3) and shoots Thorn. End turn; Ash shoots Thorn. The squad can lose Fern on this route and still win.

## Salt Flats Crossfire

Two scouts start surrounded by four raiders on an open salt flat. The eastern and western raiders occupy cover, while northern and southern enemies are exposed. Eliminate the exposed pair quickly, then concentrate fire on the covered flanks while absorbing the enemy response.

Tested route: Dune shoots North Raider twice; Salt shoots South Raider twice; end turn. Dune shoots West Raider twice; Salt shoots West Raider once and East Raider once; end turn. Dune shoots East Raider twice.

## Reuse and limitations

| Need | Candidate | Decision |
| --- | --- | --- |
| Missions, combat, turn and victory rules | `board/tactics`, `board/mission`, `sdk/TacticsMissions` | Author new content; reuse family behavior and board presentation. |
| Reachability | `mechanics/navigation`, `recipe/ordered-navigation` | Select the existing shared navigation provider; the tactics authority supplies occupancy and AP policy. |
| Board visuals and sound | `board/presentation`, `theme/board` | Reuse the existing interface and theme. |

Both games share elimination as the only implemented victory objective, the same combat rules and visuals. The selected outcome-rating provider awards a medal based on turns and surviving squad members. Unit starting AP is authored but squad AP refreshes to two and enemy AP is set to two each turn. These missions do not implement capture, evacuation, special unit abilities, persistent progression, or alternate AI.

## Integration

Both content packs and presets are registered in the bundled catalog. `tests/portfolio-tactics.test.ts` activates the complete presets and exercises the routes against an explicit headless catalog.
