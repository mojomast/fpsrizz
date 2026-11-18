# story/chapter

`story/chapter` 1.0.0 is an SDK 2 data-only pack depending on `story/adventure` ^1.0.0. The adventure plugin registers the `adventure-chapter` kind and supplies the `Adventure` service; this pack supplies neither runtime behavior nor a role of its own.

## The Last Light

`story/last-light` is a version 2 chapter starting at the quay, with a workshop and lantern room. Speak with Mara to obtain the key, polish the clouded lens with a cloth, learn the shutter catch from the log, then install the lens and light the beacon. The opening conversations record different flags but both allow completion. The definition includes room art and motif keys, item icons, journal entries, action sound keys and victory text; these are semantic theme keys, not asset paths.

The bundled [`narrative-adventure.json`](../../presets/narrative-adventure.json) enables `story/adventure`, `story/presentation`, `story/chapter` and `theme/story`, selects `story/adventure` as `sdk/experience` and `theme/story` as `sdk/theme`, and sets `options.chapter` to `story/last-light`. The pack has no own configuration. Enable dependencies and select roles explicitly.

## Authoring and validation

Entries use `kind: "adventure-chapter"`, an ID, and chapter `data` containing rooms, items, actions, start and victory. Actions may require or exclude flags, require items, consume/add items, set flags, move rooms, and add journal entries. Consumed items must be required. Staging checks bounds, unknown fields and references; referenced flags must be produced by an action or declared in `initialFlags`. Increasing the chapter version deliberately makes existing saved snapshots incompatible. Structural validation does not establish that a complete playthrough exists.

Run `npm run validate-game -- --bundled` and `node --test games/adventure/tests/narrative-adventure.test.ts tests/adventure-pack.test.ts`; `npm run check` covers the full project. See the [adventure guide](../../README.md), [SDK contract](../../contracts/adventure.ts), and [`story/adventure`](../story-adventure).
