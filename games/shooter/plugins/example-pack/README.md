# Example Pack: Scattergun, Brute and the Annex

`example/pack` is a data-only shooter pack: `example/scattergun`, `example/brute`, `example/shell-box`, and the two-room `example/annex` map. The scattergun uses core hitscan and bullets; the brute uses core chaser and melee behavior.

## Use

Enable `core/world`, `core/combat`, `core/enemies`, and `core/content` with the pack. The [Annex preset](../../presets/annex.json) selects `example/annex` and `core/objective`; the [extended preset](../../presets/extended.json) demonstrates using the pack with another map. In [content.json](content.json), the Annex override opens the locked vault and the vault contains an exit.

Content registers during staging; there is no pack-specific role, configuration, or activation system. The weapon, enemy and pickup reuse existing providers and visual keys, which must be present in the chosen composition.

## Verify

Run `node --test tests/ext-pack.test.ts` from the repository root. See [content formats](../../../../docs/reference/content-format.md).
