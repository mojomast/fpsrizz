# Industrial Theme (`theme/industrial`)

Provides the `theme/industrial` implementation of `sdk/theme`: procedural industrial science-fiction textures, sprite visuals, and synthesized sound definitions keyed for gameplay presentation.

## Use

Enable this plugin and select `"sdk/theme": "theme/industrial"` alongside a presentation plugin, as in the [default preset](../../content/presets/default.json). It declares no plugin dependencies or configuration. Gameplay refers to semantic theme keys; presentation resolves them through the selected theme.

The provider is registered with the host and used by presentation during a session; the theme alone does not start gameplay or require a renderer in headless simulation. Its visuals and sounds are a specific aesthetic and key set rather than a universal asset library. See [plugin roles and lifecycle](../../../docs/guide/plugins.md), [architecture](../../../docs/reference/architecture.md), and [theme composition tests](../../../tests/experience-themes.test.ts). Run `npm test` and, for presentation changes, `npm run build && npm run smoke`.
