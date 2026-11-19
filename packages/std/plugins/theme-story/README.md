# The Indigo Observatory story theme

`theme/story` registers a `ThemeRole` (`sdk/theme`) provider with ink-watercolor observatory imagery and original synthesized glass-like sound cues. It supplies presentation data; chapter state and story rules remain in the adventure game.

## Compose

Merge this fragment into a complete preset, such as [The Last Light](../../../../games/adventure/presets/narrative-adventure.json):

```json
{ "plugins": ["theme/story"], "roles": { "sdk/theme": "theme/story" } }
```

Texture keys are `story-room`, `story-portrait`, `story-key` and `story-lens`; sound keys are `story-inspect`, `story-take`, `story-reveal` and `story-victory`. Consumers use theme keys rather than asset paths. A substitute theme must supply the keys its chosen presentation expects.

Registration provides a role value rather than a factory registry or mutable gameplay handles. Generated painters reproduce pinned pixels deterministically without runtime network access, and sounds are synthesis definitions. Selection works headlessly without renderer or audio services; actual painting and playback need the corresponding adapters. Staging validates role selection; chapter content validation belongs to the adventure content loader.

See the [asset provenance](../../../../assets/experiences/README.md), [narrative adventure guide](../../../../games/adventure/README.md), [theme contract](../../../sdk/src/contracts/experience.ts), [presentation consumer](../../../../games/adventure/plugins/story-presentation/index.ts) and [theme tests](../../../../tests/experience-themes.test.ts). Run `npm run check` from the repository root.
