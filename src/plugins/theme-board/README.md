# Chalk & Timber board theme

`theme/board` registers a `ThemeRole` (`sdk/theme`) provider with curated voxel-style board textures and original synthesized tactile sounds. It is presentation data, not board rules or a simulation provider.

## Compose

Merge this fragment into a complete game preset; [Signal Break](../../../games/tactics/presets/turn-tactics.json) and [Stonewake](../../../games/puzzles/presets/stonewake.json) are working examples:

```json
{ "plugins": ["theme/board"], "roles": { "sdk/theme": "theme/board" } }
```

The role contains `tactics-ground`, `tactics-unit`, `tactics-enemy` and `tactics-cover` painters, plus `tactics-select`, `tactics-move`, `tactics-attack` and `tactics-victory` sound definitions. Puzzle texture and sound keys alias these assets, with extra gate and caught cues. Consumers request theme keys rather than asset paths; this theme does not supply every possible game's keys.

Registration supplies a role value, not a factory registry or owned gameplay instances. The generated painters reproduce pinned pixels deterministically and do not fetch assets at runtime; sounds are synthesis definitions. The theme can be selected in headless sessions without a renderer or audio device, although actual painting and playback need their respective adapters. Preset staging validates the role selection; inspect the consumer's expected keys when substituting themes. Gameplay state, timing and validation remain with the game.

See the [asset provenance](../../../assets/experiences/README.md), [turn-tactics guide](../../../games/tactics/README.md), [Stonewake guide](../../../games/puzzles/docs/stonewake.md), [theme contract](../../sdk/contracts/experience.ts), and [theme tests](../../../tests/experience-themes.test.ts). Run `npm run check` from the repository root.
