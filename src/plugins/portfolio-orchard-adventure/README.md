# The Night Orchard

`portfolio/orchard-adventure` supplies the `adventure-chapter` **`portfolio/night-orchard`** for `story/adventure` (its manifest dependency). It declares no roles or plugin configuration. Explore a seedship, prepare a viable cutting and decide which specialist to wake.

## Use and author

Enable this pack, `story/adventure`, `story/presentation` and `theme/story`; select `sdk/experience: story/adventure` and `sdk/theme: theme/story`, with `options.chapter: portfolio/night-orchard`. See the complete [`portfolio-orchard-adventure.json`](../../content/presets/portfolio-orchard-adventure.json).

The version 1 chapter in [`content.json`](content.json) defines rooms, items, actions, a start room and a victory flag. Actions express movement, prerequisites, inventory changes, flags, one-time actions and journal entries. For example, this **action fragment** adds an observation to the existing atrium:

```json
{ "id": "inspect-leaf", "label": "Inspect a leaf", "room": "atrium", "text": "Salt crystals edge the leaf.", "flags": ["leaf-seen"], "once": "leaf-seen" }
```

See the [adventure format](../../../docs/narrative-adventure.md) and [portfolio guide](../../../docs/portfolio-adventures.md) for reference and progression rules.

## Exercise and limits

Run `node --test tests/portfolio-adventures.test.ts` and `npm run validate-game -- --bundled`. In play, filter water, prepare the cutting and choose a sleeper. The pack contains authored data only; the adventure runtime owns session state, deterministic action evaluation, presentation integration and persistence.
