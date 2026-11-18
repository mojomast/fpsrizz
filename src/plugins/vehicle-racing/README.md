# vehicle/racing

Headless authority for arcade driving and ordered-gate time trials. It registers `vehicle-track` content and publishes the read-only `Race` service; presentation is supplied separately by [`vehicle/presentation`](../vehicle-presentation/README.md). Public types are in [`src/sdk/contracts/racing.ts`](../../sdk/contracts/racing.ts).

## Compose and play

Start with [`portfolio/salt-racing`](../../content/presets/portfolio-salt-racing.json): enable the track pack, this plugin, `mechanics/sequence`, presentation and theme; select `vehicle/arcade-race` as `sdk/experience`, `mechanics/sequence` as `sdk/mechanic-sequence`, and `theme/arcade` as `sdk/theme`. The preset also selects optional outcome rating. `options.track` chooses `portfolio/salt-flats`. W/Up accelerates, S/Down brakes or reverses, A/D or arrows steer, and Space drifts. Cross gates in order and direction before time expires. This is a time trial, not opponent racing.

`vehicle-track` describes a closed polyline, width, start, ordered directional gates, laps and time limit. The game owns driving and crossing geometry; the selected sequence provider tracks gates and laps. See the [racing guide](../../../docs/games/overhead-racing.md) for bounds, coordinate conventions, validation and the reference recipe, and [portfolio racing](../../../docs/games/portfolio-racing.md) for the authored scenarios. Use semantic theme keys rather than asset paths.

Simulation runs without render or UI; state and resources belong to the plugin session. Use the SDK service rather than importing plugin internals. Verify with `node --test tests/overhead-racing.test.ts tests/portfolio-racing.test.ts` and `npm run check`.
