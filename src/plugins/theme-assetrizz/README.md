# Assetrizz Themes (`theme/assetrizz`)

Registers four `sdk/theme` providers: `theme/assetrizz`, `theme/assetrizz-fantasy`, `theme/assetrizz-cinder`, and `theme/assetrizz-hollowmere`. They combine shared art and sounds with different sci-fi, fantasy, Cinder, and Hollowmere texture sets, including terrain, characters, portraits, icons, and weapons.

## Use

Enable `theme/assetrizz` and select the appropriate provider ID; the [Cinder preset](../../content/presets/cinder-vault.json) selects `theme/assetrizz-cinder`. The plugin has no declared dependencies or config. See its [reuse metadata](reuse.json) and the [Cinder guide](../../../docs/cinder-vault.md) for context.

Registration exposes theme data; a presentation consumer resolves its semantic keys during the session. Headless gameplay can run without rendering these assets. A theme does not supply game rules, and the variants do not promise identical art for every possible key. See [plugin lifecycle](../../../PLUGINS.md), [theme tests](../../../tests/experience-themes.test.ts), and [Assetrizz enemy checks](../../../tests/assetrizz-enemies.test.py). Run `npm test`; browser presentation changes also need `npm run build && npm run smoke`.
