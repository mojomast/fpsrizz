# Create a game

This guide connects the existing building blocks into a playable game. Start from the shipped presets and examples;
the detailed contracts are in [docs/guide/plugins.md](plugins.md), [docs/reference/content-format.md](../reference/content-format.md) and
[docs/reference/architecture.md](../reference/architecture.md).

## Choose your ingredients

**Start with [reuse discovery](reuse.md).** Search for each mechanic, not just the proposed game's genre:

```bash
npm run find-reuse -- "resource costs cooldowns"
npm run find-reuse -- --show recipe/resource-actions
```

Inspect the suggested consumer and tests, then record which parts use content, compose a provider, extend an existing
contract, or need genuinely new behavior. [docs/reference/reuse-index.md](../reference/reuse-index.md) lists all source plugins and public SDK values;
`--json` provides structured results. A family-bound implementation can be useful evidence without being a suitable
dependency for a different genre.

For a shared-contract extraction, use the [capability design/evidence note](../cookbook/reusable-capability-template.md) to
state the common rule, ownership and timing promises, differing consumer policies and named verification cases.

1. Pick a base preset from `games/shooter/presets/` (other families keep theirs in `games/<family>/presets/`). `default.json` is the objective game; `survival.json` demonstrates
    a different mode and HUD. A preset selects a map, enabled plugins, exclusive role providers, settings and a seed.
2. Choose existing behavior before writing code. `games/shooter/plugins/example-pack/` adds weapons, enemies, pickups and a map
   using JSON. Definitions reference registered behavior IDs and theme keys, not code paths or asset files.
3. For new behavior, use `npm run new-plugin -- my-game/my-plugin "My Plugin"`. The starter prints the catalog wiring.
   `example-ricochet` shows an attack behavior; `example-survival` shows a mode; `example-hud` replaces a HUD.
   The scaffolder accepts exactly one slash even though the runtime supports deeper IDs. Code plugins are trusted and
    compiled into the app, not installed as runtime JavaScript.
    It also shows related candidates and creates `reuse.json`; document the new capability's limits and reuse examples.

## Compose visually or from JSON

Creator tools now includes a **Canvas** tab. It edits `GameGraph v1` — plugin nodes, dependency projections, exclusive role slots,
options and typed config — and compiles to the normal preset before host-staged validation/apply. Humans can drag nodes and role
ports; agents can edit the same graph JSON without coordinates. See [game-composer.md](../reference/game-composer.md) and
`npm run graph -- --help`. Use this when composing existing plugins and roles; authored content rows/maps still belong in content packs.

## Assemble the game

1. Create a content pack under `src/plugins/`: a `manifest.json` with `kind: "content"` and a `content.json` array.
   Copy the shape from `example-pack`, use fresh namespaced IDs, and follow the content format's validation rules.
   Declare dependencies on the plugins defining the kinds, behaviors and prefabs you reference.
2. Define the map and its player start, spawns, doors and triggers. Match the selected mode's requirements: for
   example, the objective mode requires an exit zone. A mode owns its player and map-spawn setup; adding a map alone
   does not define a new mode. See the core and example maps and `example-survival/index.ts`.
3. The plugin catalog is generated from each folder's `manifest.json` (code plugins have `index.ts`, content packs
   have `content.json`); run `npm run gen-catalog` or just `npm run dev`. Copy a preset to `games/<family>/presets/`, assign it a new ID and select your map. List
   **every** required plugin, including transitive dependencies, and select the exclusive role providers you need.
   Import and add the preset to the `presets` array in the catalog to expose it in the UI.
4. Validate the selection without opening a browser: `npm run validate-game -- games/<family>/presets/my-game.json`.
   Add `--pack path/to/wrapped-pack.json` for each external import-format pack; the preset still must enable the pack
   and its dependencies. `npm run validate-game -- --bundled` checks all shipped presets. This stages registration and
   validation only: it cannot detect activation or gameplay failures.
5. Add focused headless tests using `tests/helpers/game.ts`. `games/shooter/tests/ext-pack.test.ts` and `games/shooter/tests/ext-ricochet.test.ts`
   show catalog entries, preset composition and assertions. The helper's preset overrides are shallow: specifying
   `plugins` replaces the default list. Test activation, gameplay and restart/disposal as appropriate. UI and rendering
   are optional in headless sessions and need browser verification.
6. Update relevant reuse metadata/recipes, run `npm run index-reuse` and `npm run check`, then
    `npm run build && npm run smoke` for browser-facing changes. Run
   `node tests/creator-demo/run.mjs` when changing the creator panel. Play the new preset in the browser and exercise
   its actual objectives; the standard smoke test covers the shipped presets, not arbitrary new games.

The creator panel can import a wrapped data-only pack and select a preset without a rebuild. Imported packs are held
in memory only and must be imported again after reload; exporting a preset and exporting a pack are separate operations.
For a reproducible shipped game, register the pack and preset in the build-time catalog. See `docs/reference/content-format.md` for
the wrapper format and persistence details.

## Lifecycle and debugging

### Building a new game family

Start from the experience brief and integration gates in [docs/archive/game-platform-strategy.md](../archive/game-platform-strategy.md) and
[docs/archive/parallel-build-plan.md](../archive/parallel-build-plan.md). The shooter plugin graph is one composition, not a prerequisite for
every game. A family can define a track, board or room-graph content kind and its own authoritative state service.
Keep simulation, presentation and authored content independently replaceable; shared public types/tokens belong in
`src/sdk/contracts/` and are exported through `src/sdk/index.ts`.

For parallel implementation, agree on those contracts, role IDs, theme keys and content ownership first. Give each
agent distinct plugin folders and one integrator ownership of the catalog and public exports. Require an actual
completion route plus rejection, pause, restart and disposal checks for each slice.

### Reusing mechanics across genres

Keep a family service for its movement, targeting and win rules; compose shared mechanics beneath it. Read
[the cross-genre implementation plan](../archive/reusable-mechanics-plan.md) and
[the dated research](../archive/research/reusable-mechanics-2026-11-16.md). The resource, clock, action and objective contracts
live in `src/sdk/contracts/mechanics.ts`. Their implementations are selected by exclusive roles, and per-consumer
instances own their state separately from registered definitions.

Declare selected mechanic roles in `roleDependencies` when factories are needed during activation. This lets a preset
swap implementations without hardcoding the default plugin ID in a game manifest. A turn-based game advances its own
turn clock after a committed decision; a realtime game advances its seconds clock from simulation `dt`. Rendering
never advances either clock. Validate spatial/target legality before committing a shared action, and treat previews
as advisory. Prove reuse with shared committed events and complete winning routes, including provider substitution
and rejection without partial spending; enabling the same theme is not sufficient evidence.

For route queries, select [NavigationRole](../reference/navigation.md) and supply a finite legal graph from the game authority.
For repeated ordered progression, select a [sequence factory](../reference/sequences.md); spatial crossings and timeout policy
remain local. Both providers have bundled working consumers and explicit preset fragments. Reuse
[owned-instance leases](../reference/owned-instances.md) when a new stateful factory needs consumer-local IDs and cleanup by
either owner. Pure query providers need no artificial instance lifetime.

### Host lifecycle

The host stages dependency resolution, registration and validation before replacing a running session. A staging error
preserves that session, but an activation failure after commit does not roll it back. Registration survives restart;
session activation is repeated. Factories start lazily in the registering plugin's context and selected role providers
activate only after plugin activation. Own resources through `ctx`, guard asynchronous work, and use seeded RNG and
simulation time in gameplay. Consult the lifecycle section of `docs/guide/plugins.md` before coordinating plugins.

Report validation errors with their plugin, field path and message. Typical causes are a missing enabled dependency,
unselected role, unknown behavior/prefab, or a map incompatible with its mode. Lint checks import boundaries but does
not prove lifecycle safety or determinism.
