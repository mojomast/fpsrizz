# vehicle/presentation

Overhead circuit, vehicle, HUD and audio for [`vehicle/racing`](../vehicle-racing/README.md). It reads `Race`; the racing authority owns motion, gate progression and outcomes. Render, UI and audio are optional services, allowing a headless session. Visual resources and frame systems must remain scoped to the plugin context.

The [`portfolio/salt-racing` preset](../../presets/portfolio-salt-racing.json) enables this plugin and its racing dependency, selects `vehicle/arcade-race` for `sdk/experience`, `mechanics/sequence` for `sdk/mechanic-sequence`, and `theme/arcade` for `sdk/theme`. It selects its track through `options.track`. W/Up accelerates, S/Down brakes or reverses, A/D or arrows steer, and Space drifts. Track content is documented in the [racing guide](../../README.md); this presentation requests semantic track, vehicle, marker and sound keys from the theme. Audio cues are discrete rather than managed loops.

See [portfolio racing](../../docs/portfolio-racing.md) for the two time trials. Verify rules with `node --test games/racing/tests/overhead-racing.test.ts games/racing/tests/portfolio-racing.test.ts`, and browser integration with `npm run build && npm run smoke` and `node tests/portfolio-demo/run.mjs`.
