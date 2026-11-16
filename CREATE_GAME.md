# Create a game

This guide connects the existing building blocks into a playable game. Start from the shipped presets and examples;
the detailed contracts are in [PLUGINS.md](PLUGINS.md), [CONTENT_FORMAT.md](CONTENT_FORMAT.md) and
[ARCHITECTURE.md](ARCHITECTURE.md).

## Choose your ingredients

1. Pick a base preset from `src/content/presets/`. `default.json` is the objective game; `survival.json` demonstrates
   a different mode and HUD. A preset selects a map, enabled plugins, exclusive role providers, settings and a seed.
2. Choose existing behavior before writing code. `src/plugins/example-pack/` adds weapons, enemies, pickups and a map
   using JSON. Definitions reference registered behavior IDs and theme keys, not code paths or asset files.
3. For new behavior, use `npm run new-plugin -- my-game/my-plugin "My Plugin"`. The starter prints the catalog wiring.
   `example-ricochet` shows an attack behavior; `example-survival` shows a mode; `example-hud` replaces a HUD.
   The scaffolder accepts exactly one slash even though the runtime supports deeper IDs. Code plugins are trusted and
   compiled into the app, not installed as runtime JavaScript.

## Assemble the game

1. Create a content pack under `src/plugins/`: a `manifest.json` with `kind: "content"` and a `content.json` array.
   Copy the shape from `example-pack`, use fresh namespaced IDs, and follow the content format's validation rules.
   Declare dependencies on the plugins defining the kinds, behaviors and prefabs you reference.
2. Define the map and its player start, spawns, doors and triggers. Match the selected mode's requirements: for
   example, the objective mode requires an exit zone. A mode owns its player and map-spawn setup; adding a map alone
   does not define a new mode. See the core and example maps and `example-survival/index.ts`.
3. Add manifest imports and catalog entries in `src/app/catalog.ts`. For code plugins supply `load`; for content
   packs supply `content`. Copy a preset to `src/content/presets/`, assign it a new ID and select your map. List
   **every** required plugin, including transitive dependencies, and select the exclusive role providers you need.
   Import and add the preset to the `presets` array in the catalog to expose it in the UI.
4. Validate the selection without opening a browser: `npm run validate-game -- src/content/presets/my-game.json`.
   Add `--pack path/to/wrapped-pack.json` for each external import-format pack; the preset still must enable the pack
   and its dependencies. `npm run validate-game -- --bundled` checks all shipped presets. This stages registration and
   validation only: it cannot detect activation or gameplay failures.
5. Add focused headless tests using `tests/helpers/game.ts`. `tests/ext-pack.test.ts` and `tests/ext-ricochet.test.ts`
   show catalog entries, preset composition and assertions. The helper's preset overrides are shallow: specifying
   `plugins` replaces the default list. Test activation, gameplay and restart/disposal as appropriate. UI and rendering
   are optional in headless sessions and need browser verification.
6. Run `npm run check`, then `npm run build && npm run smoke` for browser-facing changes. Run
   `node tests/creator-demo/run.mjs` when changing the creator panel. Play the new preset in the browser and exercise
   its actual objectives; the standard smoke test covers the shipped presets, not arbitrary new games.

The creator panel can import a wrapped data-only pack and select a preset without a rebuild. Imported packs are held
in memory only and must be imported again after reload; exporting a preset and exporting a pack are separate operations.
For a reproducible shipped game, register the pack and preset in the build-time catalog. See `CONTENT_FORMAT.md` for
the wrapper format and persistence details.

## Lifecycle and debugging

The host stages dependency resolution, registration and validation before replacing a running session. A staging error
preserves that session, but an activation failure after commit does not roll it back. Registration survives restart;
session activation is repeated. Factories start lazily in the registering plugin's context and selected role providers
activate only after plugin activation. Own resources through `ctx`, guard asynchronous work, and use seeded RNG and
simulation time in gameplay. Consult the lifecycle section of `PLUGINS.md` before coordinating plugins.

Report validation errors with their plugin, field path and message. Typical causes are a missing enabled dependency,
unselected role, unknown behavior/prefab, or a map incompatible with its mode. Lint checks import boundaries but does
not prove lifecycle safety or determinism.
