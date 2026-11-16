# Neon Courier arcade theme

`theme/arcade` registers a `ThemeRole` (`sdk/theme`) provider with synth-styled track imagery, an original top-down vehicle painter and synthesized arcade cues. Race rules, checkpoints and timing remain with the game.

## Compose

Merge this fragment into a complete preset, such as [NEON RUN](../../content/presets/overhead-racing.json):

```json
{ "plugins": ["theme/arcade"], "roles": { "sdk/theme": "theme/arcade" } }
```

The generated textures include `track-surface`, `race-backdrop`, `race-marker` and `race-vehicle-badge`; `race-vehicle` uses the separate original vehicle painter. Sound keys are `race-checkpoint`, `race-finish`, `race-skid` and `race-engine`. Consumers use theme keys instead of file paths; a replacement must supply the keys its presentation expects.

Registration provides a role value, not a factory registry or owned simulation state. Generated painters reproduce pinned pixels deterministically without runtime network access; sounds are synthesis definitions. The theme can be selected headlessly without a renderer or audio device, while painting and playback require adapters. Staging validates role selection; track data validation remains the racing content loader's responsibility.

See the [asset provenance](../../../assets/experiences/README.md), [overhead racing guide](../../../docs/overhead-racing.md), [theme contract](../../sdk/contracts/experience.ts), [presentation consumer](../vehicle-presentation/index.ts) and [theme tests](../../../tests/experience-themes.test.ts). Run `npm run check` from the repository root.
