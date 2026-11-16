# The Silt Archive rules

`silt/game` loads validated `silt-archive` content and publishes the `Silt` service for a deterministic turn-based
dungeon expedition. It owns district assembly, movement, enemy intents, tides and the extraction outcome; its selected
room-map, inventory, crafting and progression providers own their respective reusable state. See the
[player and composition guide](../../../docs/silt-archive.md).

Use the [bundled preset](../../content/presets/silt-archive.json), which enables the content and presentation plugins,
selects `silt/archive` for `sdk/experience`, and selects `mechanics/room-map`, `mechanics/inventory`,
`mechanics/crafting` and `mechanics/progression` for their SDK roles. `options.archive` selects an installed archive.
The public [contract](../../sdk/contracts/silt-archive.ts) supplies detached snapshots and bounded semantic commands.

The authority is headless and session-owned. It is not a general procedural dungeon provider, and does not persist
in-progress expeditions. See the guide for its exact combat, item, crafting and environment limitations. Run
`node --test tests/silt-archive*.test.ts` for validation, deterministic assembly, combat, crafting, real bundled routes,
pause and restart coverage.
# Combat conditions

Spitter windups announce exposure: an unbraced hit applies exposed for five valid turns, increasing incoming hit damage by one. Avoid the marked cell or spend one charge on brace to clear exposure and halve the next hit; a braced spitter hit does not apply it. Invalid actions and paused sessions do not advance the turn clock. Restart clears conditions. The selected `sdk/mechanic-clock` and `sdk/mechanic-conditions` providers own timing and the ledger; this game owns damage and counterplay.
