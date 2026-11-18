# Portfolio assist

Opt-in `portfolio/assist` adds a compact keyboard-accessible hint button for games exposing `PushPuzzle` or `PortfolioCards`. It requires a selected `sdk/mechanic-hints` provider. Both plugins are in the compiled catalog; add their IDs to the desired preset and select `mechanics/hints` for `sdk/mechanic-hints`. The two portfolio puzzle and two card presets include them; see [the integration guide](../../docs/portfolio-assist.md).

No hint is revealed until requested. The first request summarizes current context; the second gives the authored chamber hint or a card-game-specific observation. Hints clear when the observed game revision changes, including in-game restart; session restart disposes the UI and ledger. Paused clicks do nothing. When no supported active state or UI exists, the plugin stays quiet. It reads game services only, inserts game text through `textContent`, and does not submit game commands.
