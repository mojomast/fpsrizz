# Hollowmere game

`hollowmere/game` owns the side-scrolling metroidvania simulation and provides `ExperienceRole` as `hollowmere/ascent` and the `Metroidvania` service. It loads `metroidvania-world` content, validates composition, and orchestrates traversal, ability gates, combat, NPCs, checkpoints and the final boss. Its public observations and commands are defined in the [SDK](../../contracts/metroidvania.ts).

Use the complete [Hollowmere preset](../../presets/hollowmere-ascent.json): enable game, content, presentation, theme and the four mechanic plugins; select the experience, HUD, theme, platformer, capabilities, room-map and inventory roles, and set `options.world` to `hollowmere/world`. The game declares activation dependencies on the four mechanic roles and owns their handles, command ingress and fixed-step state. It explicitly disposes the inventory, map and capability handles with its scope.

Checkpoint saves are schema-versioned and profile-backed; they are not mid-room snapshots or cloud sync. The authored graph and game-specific combat/doors are not a general level editor, and validation cannot prove physical reachability. See [game guide and controls](../../README.md), [content](../hollowmere-content/content.json), [game tests](../../tests/hollowmere.test.ts) and [browser demo](../../../../tests/hollowmere-demo/run.mjs).
