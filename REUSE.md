# Find and reuse existing elements

**Start here before designing a mechanic or scaffolding a plugin.** The runtime catalog says what can be enabled;
the reuse inventory says what capability exists, how to consume it, and where its limits are.

## Search by the behavior you need

```bash
npm run find-reuse -- "stamina costs cooldowns"
npm run find-reuse -- "crafting conversion"
npm run find-reuse -- "quest prerequisites"
npm run find-reuse -- "keyed door"
npm run find-reuse -- "dialogue inventory"
npm run find-reuse -- "input focus pause"
npm run find-reuse -- "camera picking"
npm run find-reuse -- "graph shortest path"
npm run find-reuse -- "ordered steps rounds"
npm run find-reuse -- "xp levels pending rewards"
npm run find-reuse -- "seeded dungeon rooms"
npm run find-reuse -- "inventory stacks equipment loot"
npm run find-reuse -- "known crafting recipes item output"
npm run find-reuse -- "isometric camera view toggle"
```

Results include the matching terms, scope, public SDK entry points, implementation path, limitations, documentation
and working examples. Search is deterministic keyword/name matching with curated vocabulary—not an embedding service
or a guarantee that a proposed algorithm already exists. Try two or three smaller phrases for a compound mechanic.

Inspect a candidate to get its actual registrations, configuration, dependencies, required roles, example presets,
test paths and related recipes:

```bash
npm run find-reuse -- --show mechanics/actions
npm run find-reuse -- --show recipe/resource-actions
npm run find-reuse -- --show recipe/experience-levels
npm run find-reuse -- --show recipe/stack-inventory
npm run find-reuse -- --show recipe/known-crafting
npm run find-reuse -- --show recipe/isometric-camera-toggle
npm run find-reuse -- --show dungeon/generator
npm run find-reuse -- --show ResourcePoolProviders
npm run find-reuse -- --show Render
```

For agents/scripts, use `-s` to suppress npm's banner:

```bash
npm run -s find-reuse -- "stamina cooldown" --json --limit 3
npm run -s find-reuse -- --show recipe/resource-actions --json
npm run find-reuse -- "inventory" --type plugin
npm run find-reuse -- "cooldown" --scope cross-genre
npm run find-reuse -- --list --type recipe
```

The checked-in [compact reference](REUSE_INDEX.md) and [machine-readable inventory](docs/reuse-index.json) are useful
without running a command. Prefer targeted CLI searches to loading the entire JSON into an agent's context.

## Decide what kind of reuse fits

| Result scope | Meaning | Next action |
|---|---|---|
| `cross-genre` | Documented small provider or recipe with reusable contracts, examples and tests | Compose it; check its limits and select its roles |
| `family` | Behavior exists inside a particular game family's authority/contracts | Use its supported content/extensions, or extract a shared contract if the dependency is genuinely inappropriate |
| `presentation` | Visual/UI functionality, not authoritative gameplay | Replace presentation around the existing simulation contract |
| `content` | Declarative definitions using existing behavior | Copy/adapt the data format with fresh IDs; keep the existing loader/behavior |
| `unreviewed` | Source is discoverable, but reusable scope has not been documented | Inspect implementation and tests before deciding it is portable |
| `contract` | Public SDK value/helper/token | Find its provider or host adapter; importing a token does not enable an implementation |

Examples of important distinctions:

- **Stamina, mana, money or water costs:** `mechanics/resources` + `mechanics/actions`; names and numbers belong in data.
- **A separate cooldown for every tower:** separate action handles, as demonstrated by `ember/game`.
- **Deterministic reachability or first steps:** `mechanics/navigation`; supply the legal ordered graph and keep
  occupancy, geometric collision and AP rules in the game. Its unit edges are not a weighted navigation mesh.
- **Ordered checkpoints repeated over laps:** `mechanics/sequence`; use `mechanics/objectives` for prerequisite
  counters, and the sequence provider when a repeating canonical cursor is required.
- **Quest prerequisites:** `mechanics/objectives`; game-specific rewards and story consequences stay in orchestration.
- **A locked shooter door:** `example/keys` already registers the pickup effect and keyed prefab.
- **A narrative item combination:** `story/adventure` implements this within an adventure chapter; numeric resource
  conversion belongs to shared resource/actions. Neither is a general unique-item inventory system. The
  [item-possession decision](docs/item-possession-decision.md) explains ordering, overlap and detached-replay differences.
- **Input, camera ownership, HUD mounting and profile storage:** host/SDK facilities already exist; inspect their recipes.

### Reuse-first decision record

For each requested mechanic, record a small table in the task notes or final implementation summary:

| Need | Existing candidate / example | Decision |
|---|---|---|
| Dash uses stamina and a cooldown | `mechanics/actions`; `recipe/resource-actions` | Reuse costs/cooldown; implement only this game's movement legality |
| Restore a relay after two goals | `mechanics/objectives` | Add objective definitions with prerequisites |
| Unique items with spatial inventory slots | `mechanics/resources`, `story/adventure` | Neither supplies these semantics; justify a new contract/provider |

Prefer, in order: **existing content/config → existing provider composition → existing extension point → shared
contract extension/extraction → a new provider for a demonstrated gap**. Read a working consumer and its tests before
implementing. Do not copy a provider's private algorithm into a game, or import another plugin's folder.

## Example: compose costs and cooldowns

`--show recipe/resource-actions --json` exposes a directly reusable `plugins`/`roles` fragment. Merge it into the
game preset. In the consumer manifest, declare the content-loader dependency and selected-provider startup needs:

```json
{
  "dependencies": { "mechanics/kits": "^1.0.0" },
  "roleDependencies": [
    "sdk/mechanic-resources", "sdk/mechanic-clock",
    "sdk/mechanic-actions", "sdk/mechanic-objectives"
  ]
}
```

This is a **fragment**, not a complete manifest. Copy a compatible kit from
`src/plugins/verdant-content/content.json` (turns) or `src/plugins/sky-content/content.json` (seconds), then inspect its
consumer. `createMechanicKit(ctx, definitionId, instanceId)` resolves selected implementations; the game owns target
legality and local effects. `roleDependencies` orders provider owners before the consumer; `requiresRoles` alone
only requires selection. See [complete mechanic semantics](docs/reusable-mechanics.md).

`enable` in plugin results includes **concrete dependencies only**. It does not choose providers for roles, enable
optional dependencies, resolve conflicts or construct a playable game. A complete composition still needs:

```bash
npm run validate-game -- src/content/presets/your-game.json
```

Then exercise actual activation, gameplay and lifecycle through the normal checks.

## Keep discovery current

### Plugin-local metadata

Optional `src/plugins/<folder>/reuse.json` describes semantics that names/manifests cannot infer:

```json
{
  "schema": 1,
  "scope": "cross-genre",
  "summary": "Atomic resource balances for costs and conversions.",
  "keywords": ["stamina", "money", "conversion"],
  "entryPoints": ["ResourcePoolProviders", "resourceMechanic"],
  "useWhen": "Named numeric resources need bounded atomic transactions.",
  "limitations": ["Not a slotted or unique-item inventory."],
  "docs": ["docs/reusable-mechanics.md"],
  "examples": ["src/plugins/verdant-game/index.ts"],
  "tests": ["tests/mechanics-providers.test.ts"]
}
```

All fields above are required when a sidecar exists. `scope` is one of the first five scope values in the table.
Unknown fields, duplicate/blank list entries, missing file paths and nonexistent public SDK value names fail checks.
Cross-genre claims require entry points, examples, tests and stated limitations. Entry points name exported runtime
values (tokens/helpers), not TypeScript-only interfaces; their source files contain the companion type definitions.

Add genuinely useful synonyms and distinguish what the element **does** from what it **does not do**. Do not claim
cross-genre portability just because imports pass lint. Existing plugins without sidecars remain visible through their
manifests and observed registrations, explicitly marked unreviewed (or content). New scaffolds include an unreviewed
sidecar and print related existing candidates before creation.

### Composition recipes

`docs/reuse-recipes.json` contains searchable task-level recipes. Each has the same semantic fields plus `id`, `name`,
`plugins`, `roles` and ordered `steps`. Empty plugin fragments represent host-provided facilities. References, enabled
dependencies and role selections are checked; tests stage the shipped recipe fragments through the actual host.
Recipes link working code instead of maintaining duplicate implementations.

### Generation and checks

```bash
npm run index-reuse              # regenerate REUSE_INDEX.md and docs/reuse-index.json
npm run index-reuse -- --check   # fail if references are stale or metadata is invalid
npm run check                   # includes the freshness check and discovery tests
```

The live CLI observes each built-in plugin's registration in an isolated stage with concrete dependencies and default
configuration. It loads trusted code and content but **does not activate a session**, run role callbacks or validate a
complete game's cross-references. Configuration-dependent registrations may differ in a chosen preset. Source-only
scaffolds appear with `builtIn: false` and no observed registrations until added to the app catalog.

The generated artifacts are deterministic, with no timestamps or machine-local paths. A source digest covers catalog,
plugin/SDK/kernel/preset sources, sidecars and recipe data. Changes require review of relevant metadata and regeneration.
CI catches drift and broken references; it cannot prove semantic descriptions or detect every duplicate algorithm.

## Designing the next reusable capability

The [general-plugin research guide](docs/research/general-plugins-2026-11-16.md) combines primary-source guidance with
an audit of current consumers. It covers mechanism versus game policy, behavioral contracts, ownership/time semantics,
conformance and substitution evidence, and a short design-note template. Its proposed pilots and evidence labels are
recommendations; the current metadata schema remains the one documented above.

Use the [capability design and evidence template](docs/reusable-capability-template.md) for concrete implementation
decisions. It connects the public behavioral promise to real consumers and named tests using the existing metadata fields.
