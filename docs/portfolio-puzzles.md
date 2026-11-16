# Two Stonewake puzzle campaigns

These independent content campaigns compose the existing Stonewake rules, 3D presentation, board theme and navigation provider. They use the same controls as [Stonewake](stonewake.md): arrows/WASD move and push, Z undoes, R restarts, and Q/E orbit. Every plate must hold a boulder before the explorer can enter the gate. Select Next after each chamber and Play again after the final chamber. Pars are optional turn targets; progress is session-only.

**The Counterweight Atelier** is a quiet spatial-planning sequence with no golems. The Elbow asks for a change of pushing direction; The Crossbench introduces two seals and a wall restricting access; The Three Weights requires three simultaneous placements. Avoid leaving a stone against a wall where you cannot get behind it.

**The Watchman's Run** is a pursuit sequence: open the gate and escape before the golems catch you. Far Patrol introduces an open chase, The Divider uses a central wall to shape pursuit, and Two Watches adds a second golem. Golems take a shortest-path step every second accepted turn. Boulders obstruct them, and undo restores their positions and beat.

Both campaigns use the same plate-and-exit objective, models, HUD, and movement rules; their distinction is chamber geometry, number of stones, and pursuit pressure. They do not introduce new mechanics or bespoke assets.

## Completion routes (spoilers)

Each letter is one accepted compass move; camera rotation does not affect these directions.

| Campaign | Chamber | Route |
|---|---|---|
| Atelier | The Elbow | `NNWNENEEEE` |
| Atelier | The Crossbench | `NWNNEEEESSWNNENNE` |
| Atelier | The Three Weights | `NNNSSWWNNEEESSENNENNE` |
| Watchman's Run | Far Patrol | `NNSEENNEEEEE` |
| Watchman's Run | The Divider | `NENSEEENEESWWNNEEE` |
| Watchman's Run | Two Watches | `NEENNEEEESEEEN` |

`tests/portfolio-puzzles.test.ts` applies each preset to the real headless host, runs every move through the command queue, checks every chamber clears without capture within par, and checks replay.

## Reuse decisions

| Need | Candidate | Decision |
|---|---|---|
| Pushes, reversible turns, gates, campaign progression and pursuit | `puzzle/rules`, `puzzle/chambers` | Reuse the family rules and author new `push-puzzle` data. |
| Pursuit route search | `mechanics/navigation` | Select the existing provider; the family retains occupancy and cadence. |
| Input and 3D presentation | `puzzle/presentation`, `theme/board` | Reuse the existing renderer, UI and art. |
