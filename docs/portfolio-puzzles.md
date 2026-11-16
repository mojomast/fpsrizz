# Two Stonewake puzzle campaigns

These independent content campaigns compose the existing Stonewake rules, 3D presentation, board theme and navigation provider. They use the same controls as [Stonewake](stonewake.md): arrows/WASD move and push, Space waits, Z undoes, R restarts, and Q/E orbit. Directions follow the compass, even after orbiting. Every plate must hold a boulder before the explorer can enter the gate. Select Next after each chamber and Play again after the final chamber. Targets are optional turn counts, not deadlines; progress is session-only.

**The Counterweight Atelier** is a quiet spatial-planning sequence with no golems. The Elbow asks for a change of pushing direction; The Crossbench introduces two seals and restricted access; The Three Weights requires three simultaneous placements. The Split Workshop uses a partition and two separated seals to make the order of approaches matter. Avoid leaving a stone against a wall where you cannot get behind it.

**The Watchman's Run** is a pursuit sequence: open the gate and escape before the golems catch you. Far Patrol introduces an open chase, The Divider uses a central wall to shape pursuit, and Two Watches adds a second golem. The Counterwatch combines two seals, a partition and two watchers. Golems take a shortest-path step every second accepted turn. Boulders obstruct them, and undo restores their positions and beat.

Both campaigns use the same plate-and-exit objective, models and movement rules; their distinction is chamber geometry, number of stones, and pursuit pressure. The field guide opens a live compass-oriented text map and hint, including on narrow screens; `*` marks a weighted plate. The boardwalk texture and portraits reuse the pinned Assetrizz art via the existing board theme.

An optional **Show a hint** control gives progressive context on request and resets after the board changes. See
[portfolio assistance](portfolio-assist.md) for the shared card-and-puzzle plugin and its limits.

## Completion routes (spoilers)

Each letter is one accepted compass move; camera rotation does not affect these directions.

| Campaign | Chamber | Route |
|---|---|---|
| Atelier | The Elbow | `NNWNENEEEE` |
| Atelier | The Crossbench | `NWNNEEEESSWNNENNE` |
| Atelier | The Three Weights | `NNNSSWWNNEEESSENNENNE` |
| Atelier | The Split Workshop | `WSEEEWNNWNEEENNEEE` |
| Watchman's Run | Far Patrol | `NNSEENNEEEEE` |
| Watchman's Run | The Divider | `NENSEEENEESWWNNEEE` |
| Watchman's Run | Two Watches | `NEENNEEEESEEEN` |
| Watchman's Run | The Counterwatch | `NNSSWSEEEENNEENNNE` |

`tests/portfolio-puzzles.test.ts` applies each preset to the real headless host, runs every move through the command queue, checks every chamber clears without capture within its target, and exercises restart, mid-route undo/redo, undo/redo of the clearing move, progression and replay.

## Reuse decisions

| Need | Candidate | Decision |
|---|---|---|
| Pushes, reversible turns, gates, campaign progression and pursuit | `puzzle/rules`, `puzzle/chambers` | Reuse the family rules and author new `push-puzzle` data. |
| Pursuit route search | `mechanics/navigation` | Select the existing provider; the family retains occupancy and cadence. |
| Input and 3D presentation | `puzzle/presentation`, `theme/board` | Reuse the existing renderer, UI and art. |
