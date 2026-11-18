# The Quiet Index

`portfolio/archive-adventure` is an SDK 2 content pack for an archive investigation. It depends on `story/adventure`; it declares no roles or plugin configuration. Its single `adventure-chapter`, **`portfolio/quiet-index`**, follows a missing register from the reading room through the stacks and bindery to a public or private hearing.

## Use and author

Enable the pack with the adventure runtime, presentation and theme; select `sdk/experience: story/adventure` and `sdk/theme: theme/story`, and set `options.chapter` to `portfolio/quiet-index`. The complete, runnable composition is [`portfolio-archive-adventure.json`](../../presets/portfolio-archive-adventure.json).

[`content.json`](content.json) uses version 1 chapter data: a start room, rooms, keyed items, ordered actions and a victory flag. Actions can require flags or items, consume/add items, move rooms, set flags and record journal entries. For example, this **action fragment** could be added to an appropriate room in a new chapter:

```json
{ "id": "read-note", "label": "Read the note", "room": "reading-room", "text": "A name is underlined.", "flags": ["note-read"], "once": "note-read" }
```

Keep room and item references valid and make the winning flag reachable. See the [adventure format](../../README.md) and [portfolio guide](../../docs/portfolio-adventures.md).

## Exercise and limits

Run `node --test games/adventure/tests/portfolio-adventures.test.ts` and `npm run validate-game -- --bundled`. In the preset, obtain the pass, restore the fragment and choose an ending. This pack contributes data, not its own simulation, UI or persistence; the adventure runtime owns session state and evaluates its deterministic authored actions.
