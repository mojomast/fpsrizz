# Guidance for coding agents

Bulkhead is a plugin-driven 2.5D shooter foundation in TypeScript. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing
structure and [PLUGINS.md](PLUGINS.md) before writing plugins.

## Layout

| Path | Purpose |
|---|---|
| `src/kernel` | Runtime kernel: host, registries, entity store, buses, scheduler, scopes, validation. No game concepts, no DOM. |
| `src/sdk` | Public API: `index.ts` (entry), `core.ts` (generic), `contracts/shooter.ts` (shooter vocabulary), `contracts/audio.ts`, `render.ts` |
| `src/platform` | Browser adapters (input, audio, storage, ui, flow, render host) and the mini3 renderer |
| `src/app` | Composition root: `main.ts` (frame loop), `catalog.ts` (compiled-in plugins and presets), `shell.ts`, `creator.ts` |
| `src/plugins/<ns>-<name>` | One folder per plugin or content pack: `manifest.json`, `index.ts` and/or `content.json` |
| `src/content/presets` | Preset JSON files |
| `tests` | `*.test.ts` run by `npm test`; `helpers/` harness; subfolders with browser demo scripts run by hand |
| `scripts` | build, dev, preview, smoke, boundary checker, plugin scaffolder, tool resolution |

## Import boundaries (enforced by `npm run lint`)

- A plugin imports only its own folder and `src/sdk/index.ts`. It may also import `src/sdk/render.ts` if and only if its
  manifest lists `"render"` in `capabilities`. Never the kernel, platform, app, another plugin or an npm package.
- `src/kernel` imports only `src/kernel` and never uses `document.` or `window.`.
- `src/sdk` imports only `src/sdk` and `src/kernel`; only `src/sdk/render.ts` may import mini3.
- `src/platform` imports only `src/platform`, `src/kernel` and `src/sdk`.
- `src/app` is unrestricted.

If a plugin needs something it cannot import, add it to the SDK contract (see below); do not widen the lint rules.

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
- Content errors are reported through a `Reporter` with a path and an actionable message, never thrown for bad data.
- Tests use `node:test` and `node:assert/strict`. The only Node modules typed for tests are those declared in
  `scripts/node-shim.d.ts` (`node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url`); there is no
  `@types/node`. Headless gameplay tests use `tests/helpers/game.ts`.

## Checks

```bash
npm run check                      # typecheck + lint (boundaries) + tests
npm run build && npm run smoke     # browser acceptance run against dist/ (needs Chrome; CHROME_PATH overrides the path)
```

Run `npm run check` after every change. Run the smoke test when touching the app, platform, presentation, HUD, host
lifecycle or anything the browser exercises.

## Adding a plugin

1. `npm run new-plugin -- <namespace/name> "Display Name"` creates `src/plugins/<namespace>-<name>/` with a manifest and
   a starter `index.ts`, and prints the catalog line to add.
2. Add the manifest import and catalog entry to `src/app/catalog.ts`; add the plugin id to a preset's `plugins` (or tick it
   in the creator panel). Dependencies are never auto-enabled: list every required plugin in the preset and in the
   manifest's `dependencies`.
3. If it provides an exclusive role (controller, camera, mode, HUD, theme), select it in the preset's `roles`.
4. Data-only additions need no code: add a content pack (`manifest.json` with `"kind": "content"` plus `content.json`).
5. Update the docs (below).

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

When you add or rename a system, update the system tables in `ARCHITECTURE.md`. When you change the arena, weapons or
enemies, update the reference-game section of `SPEC.md`.

## Environment notes

- The project was built without network access. Do not assume `npm install` works; there is no `node_modules` or
  `package-lock.json` in the repository.
- `scripts/tools.mjs` resolves esbuild and Playwright from the project's `node_modules`, then from `TOOLS_NODE_MODULES`
  (a path list), then from `/opt/npm-tools/node_modules`. `tsc` comes from `node_modules/.bin` or the `PATH`.
- The build is not Vite and the tests are not Vitest; do not write config for them.
- `npm run dev` writes its output to `.dev/`, which is not listed in `.gitignore`; do not commit it. `dist/` and `.smoke/`
  are ignored.
- `window.__bulkhead` is a debugging and automation handle for the smoke script, not API; plugins must not use it.
