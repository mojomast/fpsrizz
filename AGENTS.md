# Guidance for coding agents

Bulkhead is a plugin-driven TypeScript game foundation with a 2.5D shooter reference game and independent racing,
turn-tactics, narrative-adventure, 3D push-puzzle, drone-courier, tower-defense and colony-restoration families. The last
three share role-selected resource/action/clock/objective plugins; see `docs/reusable-mechanics.md`. The public SDK is version 2; production rendering uses official Three.js
0.187.0. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing
structure, [PLUGINS.md](PLUGINS.md) before writing plugins, and [CREATE_GAME.md](CREATE_GAME.md) for the complete game-creation workflow.

## Reuse first — before implementing a mechanic

1. Read [REUSE.md](REUSE.md). Break the request into capabilities and search each with
   `npm run find-reuse -- "stamina cooldown"` (substitute the actual need). Use several short phrases for compound needs.
2. Inspect promising results with `npm run find-reuse -- --show <id>`. Read the linked SDK declaration, working consumer
   and tests. Results label cross-genre providers versus family-bound behavior; respect those limits.
3. Prefer existing content/config, then provider composition, then existing extension points. Add a new contract/provider
   only for a concrete missing behavior; do not copy resource, cooldown, objective, input or ownership algorithms.
4. Record the chosen candidate IDs and reuse/extend/new rationale in task notes or the implementation summary. A name
   mismatch or a search returning no hits is not evidence that the behavior is absent; consult `REUSE_INDEX.md` too.
5. Maintain plugin-local `reuse.json` and relevant recipes when adding/changing reusable behavior. Run `npm run index-reuse`
   after source/catalog/metadata changes; `npm run check` rejects stale generated references and broken metadata links.

Use the [capability design/evidence note](docs/reusable-capability-template.md) for new shared contracts. Existing SDK
helpers include owned bounded `createCommandQueue` ingress and `createDeadline` over a borrowed explicit clock;
inspect their recipes and consumer policies before creating another queue or effect-duration timer. Resource provider
changes should exercise the shared [conformance cases](docs/mechanic-conformance.md) against both implementations.
Search `mechanics/navigation` for deterministic ordered unit-edge graph queries and `mechanics/sequence` for ordered
steps repeated over finite rounds. Games retain occupancy/cost/crossing policy. Stateful factories can use
`createOwnedInstances` for consumer-local live IDs and dual-scope cleanup instead of copying lifetime bookkeeping.

For structured discovery: `npm run -s find-reuse -- "query" --json --limit 5`. Start with targeted results rather than
loading the complete `docs/reuse-index.json`. The CLI observes trusted registration without activating gameplay.

## Layout

| Path | Purpose |
|---|---|
| `src/kernel` | Runtime kernel: host, registries, entity store, buses, scheduler, scopes, validation. No game concepts, no DOM. |
| `src/sdk` | SDK 2 public API: `index.ts` (entry), `core.ts` (generic), `contracts/` (shooter, experience, vehicle, tactics, adventure and audio vocabulary), `render.ts` |
| `src/platform` | Browser adapters (input, audio, storage, ui, flow, render host); official Three.js behind the historical `render/mini3/index.ts` facade, vendored in `render/mini3/vendor/`; `legacy.ts` retains the old renderer for fixtures |
| `src/app` | Composition root: `main.ts` (frame loop), `catalog.ts` (presets; re-exports the generated `catalog.generated.ts`), `shell.ts`, `creator.ts` |
| `src/plugins/<ns>-<name>` | One folder per plugin or content pack: `manifest.json`, `index.ts` and/or `content.json` |
| `src/content/presets` | Preset JSON files |
| `tests` | `*.test.ts` run by `npm test`; `helpers/` harness; subfolders with browser demo scripts run by hand |
| `scripts` | build, dev, preview, smoke, boundary checker, reuse discovery/indexing, plugin scaffolder, tool resolution |
| `assets/weapons` | Blender weapon sources, GLB exports, first-person renders and an agent authoring workflow |
| `assets/experiences` | Curated racing, board and story theme images with pinned source/hash provenance |
| `docs/` | Independent family guides and formats: `overhead-racing.md`, `turn-tactics.md`, `narrative-adventure.md` |

## Import boundaries (enforced by `npm run lint`)

- A plugin imports only its own folder and `src/sdk/index.ts`. It may also import `src/sdk/render.ts` if and only if its
  manifest lists `"render"` in `capabilities`. Never the kernel, platform, app, another plugin or an npm package.
- `src/kernel` imports only `src/kernel` and never uses `document.` or `window.`.
- `src/sdk` imports only `src/sdk` and `src/kernel`; only `src/sdk/render.ts` may import `src/platform/render/mini3`.
- `src/platform` imports only `src/platform`, `src/kernel` and `src/sdk`.
- `src/app` is unrestricted.

If a plugin needs something it cannot import, add it to the SDK contract (see below); do not widen the lint rules.
The checker is not a security sandbox or a proof of determinism, ownership, or absence of import-time effects. Code
plugins are trusted. Review those invariants explicitly; lint examines only the import and DOM forms it recognizes.
The boundary-approved mini3 path now exports official Three.js; it does not authorize direct npm or vendor imports from
plugins or the SDK. Regenerate the pinned runtime, WebGL/core declarations, licenses and hashes with `npm run vendor-three`.

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`.
- **Erasable syntax only** (`erasableSyntaxOnly`, because Node strips types): no `enum`, no parameter properties, no
  `namespace`. Use string unions, plain fields and objects.
- **Explicit `.ts` extensions** on relative imports. Use `import type` for type-only imports.
- JSON imports use import attributes: `import m from './manifest.json' with { type: 'json' }`.
- **No mutable module-scope state in plugins** and no side effects at import time. Tokens (`defineComponent`, `defineEvent`,
  ...) at module scope are fine. All state lives in closures created in `activate` or in a factory's `start`.
- **Everything is owned through `ctx`**: `ctx.systems.add`, `ctx.events.on`, `ctx.services.provide`, `ui.mount(ctx, ...)`,
  `render.createRoot(ctx, ...)`, `render.own(ctx, ...)`; for anything else `ctx.scope.add(cleanup, 'kind')`. Wrap awaits
  in `ctx.guard(...)`.
- Simulation code must not touch the DOM or rendering: use `ctx.services.tryGet(Ui)` and `tryGet(Render)` and return early
  when absent, so the plugin runs headless in tests.
- Determinism: gameplay randomness from `ctx.rng`, time from `ctx.time.now`. No `Math.random`, `Date.now` or
  `performance.now` in simulation. `ctx.cosmeticRng` is for visuals and audio only.
- Gameplay refers to theme keys (`"enemy-grunt"`, `"pistol-fire"`), never to file paths or textures.
- Independent families cooperate through `Race`, `Tactics`, `Adventure` or `PushPuzzle` SDK services; their graphs have no shooter-plugin
  dependencies. Use their `docs/` guides for `vehicle-track`, `board-mission`, `adventure-chapter` and `push-puzzle` data.
- `Sky`, `Ember` and `Verdant` compose shared mechanic providers through roles, not concrete provider imports/dependencies.
  Use manifest `roleDependencies` when factories are needed during activation; `requiresRoles` is selection-only.
  Keep seconds and turn clocks explicit, validate target legality before shared action commit, and own every instance.
- Select optional `ExperienceRole` for pointer policy (`locked`, `free`, `none`) and launcher controls; absence retains FPS
  behavior. Own `InputContexts` through `ctx`, and guard UI command ingress with `SessionControl.playing` when available.
- Select perspective or orthographic world cameras through scoped `render.setWorldCamera(ctx, camera)` leases. Use native
  Three.js `Color` setters such as `.setHex(...)`; do not assign numeric values over `Color` objects.
- Content errors are reported through a `Reporter` with a path and an actionable message, never thrown for bad data.
- Tests use `node:test` and `node:assert/strict`. The only Node modules typed for tests are those declared in
  `scripts/node-shim.d.ts` (`node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url`); there is no
  `@types/node`. Headless gameplay tests use `tests/helpers/game.ts`.

## Checks

```bash
npm run index-reuse                # refresh discovery after source/catalog/metadata changes
npm run check                      # typecheck + boundaries + reuse-index freshness + tests
npm run validate-game -- --bundled  # stage bundled presets; no activation
npm run build && npm run smoke     # browser acceptance run against dist/ (needs Chrome; CHROME_PATH overrides the path)
```

Run `npm run check` after every change. Run the smoke test when touching the app, platform, presentation, HUD, host
lifecycle or anything the browser exercises. For creator-panel changes also run `node tests/creator-demo/run.mjs`.
Browser scripts need Playwright and Chrome; CI runs check and build, not browser acceptance. Record actual results and
any environmental failures. Changes to audio or pointer lock also need manual verification in a real browser.

| Task | Start here | Verification / documentation |
|---|---|---|
| Host, lifecycle, scheduling | `src/kernel/host.ts`, `scope.ts`, `scheduler.ts` | `tests/host-lifecycle.test.ts`, kernel tests, `ARCHITECTURE.md` |
| Gameplay or SDK contracts | `src/sdk/contracts/`, provider and consumer plugins | `tests/helpers/game.ts`, extension tests, `PLUGINS.md` |
| Content or preset | content-kind plugin, `src/app/catalog.ts`, `src/content/presets/` | content tests, `CONTENT_FORMAT.md`, game guide |
| Browser UI or rendering | `src/app/`, `src/platform/`, relevant presentation plugin | build and smoke; creator test for panel changes |

Registration survives restart; activation runs again per session. A failed staging operation preserves the old session,
but failure during activation after commit does not restore it. Factories run lazily in their registering owner's
context, and selected roles activate after all plugins; see the lifecycle notes in `PLUGINS.md`.

## Adding a plugin

1. Complete reuse discovery above. `npm run new-plugin -- <namespace/name> "Display Name"` shows related existing
   candidates and creates `src/plugins/<namespace>-<name>/` with a manifest, starter `index.ts` and unreviewed `reuse.json`.
   The catalog discovers it automatically. Fill in the capability, scope, public entry points, limits and examples.
2. The plugin catalog is generated from manifests (`npm run gen-catalog`; dev/build/check run or verify it). Add the plugin id to a preset's `plugins` (or tick it
   in the creator panel). Dependencies are never auto-enabled: list every required plugin in the preset and in the
   manifest's `dependencies`.
3. If it provides an exclusive role (controller, camera, mode, HUD, theme, experience), select it in the preset's `roles`.
4. Data-only additions need no code: add a content pack (`manifest.json` with `"kind": "content"` plus `content.json`).
5. Update the docs (below) and regenerate the reuse index.

## Rules that must not be broken

- **Never weaken, skip or delete a test to make a change pass**, and never loosen a lint rule. If a test or rule blocks
  you, the design is wrong or the test is revealing a bug: fix the cause.
- **Never move gameplay into the kernel.** The kernel stays generic. If plugins cannot cooperate, extend the shared
  contract in `src/sdk/contracts` (and bump `SDK_VERSION` when a contract changes incompatibly) rather than adding
  shortcuts, global state or cross-plugin imports.
- Do not edit a plugin's behaviour from another plugin's folder; extend through registries, roles, events and services.
- Keep `README.md`, `SPEC.md` and the other docs truthful: describe planned work as planned.

## Documentation map (keep in sync)

| File | Update it when you change |
|---|---|
| `PLUGINS.md` | The public SDK, extension points, lifecycle rules or API signatures |
| `CONTENT_FORMAT.md` | Any JSON format, content kind, parameter range or the persistence keys |
| `ARCHITECTURE.md` | Layers, boundaries, ownership, simulation order and systems, rendering, key decisions |
| `SPEC.md` | Implemented scope, limitations, extension boundaries, reference-game content |
| `README.md` | Commands, controls, presets, layout |
| `devplan.md` | Milestone status and next steps |
| `docs/overhead-racing.md`, `docs/turn-tactics.md`, `docs/narrative-adventure.md` | Independent family content formats, controls, progression and family-specific persistence |
| `docs/stonewake.md` | 3D push-puzzle rules, chamber format, controls, asset use and completion routes |
| `REUSE.md`, plugin `reuse.json`, `docs/reuse-recipes.json` | Capability scope, search vocabulary, composition recipes, SDK entry points and examples |
| `REUSE_INDEX.md`, `docs/reuse-index.json` | Generated only: run `npm run index-reuse` after source/catalog/metadata changes |

When you add or rename a system, update the system tables in `ARCHITECTURE.md`. When you change the arena, weapons or
enemies, update the reference-game section of `SPEC.md`.

## Environment notes

- Install the locked development dependencies with `npm ci` when network access is available. Node >= 22.18 is required.
- `scripts/tools.mjs` resolves esbuild and Playwright from the project's `node_modules`, then from `TOOLS_NODE_MODULES`
  (a path list), then from `/opt/npm-tools/node_modules`. `tsc` comes from `node_modules/.bin` or the `PATH`.
- The build is not Vite and the tests are not Vitest; do not write config for them.
- `npm run dev` writes to `.dev/`; `.dev/`, `dist/` and `.smoke/` are ignored.
- `window.__bulkhead` is a debugging and automation handle for the smoke script, not API; plugins must not use it.
