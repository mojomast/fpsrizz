# Packages and workspaces

The engine is an npm workspaces monorepo (`"workspaces": ["packages/*"]` in the root `package.json`). `npm ci` links
every package into `node_modules/@bulkhead/`, so code anywhere in the repository imports the engine by package name.

| Package | Folder | What it holds | Imports allowed |
| --- | --- | --- | --- |
| `@bulkhead/kernel` | `packages/kernel/src` | Plugin host, resolver, ECS, scheduler, registries, bus, snapshots. No DOM. | kernel only |
| `@bulkhead/sdk` | `packages/sdk/src` | The public plugin API: `core.ts`, shared contracts (`contracts/game.ts`, mechanics, input, scene, physics…), `render.ts` | sdk, kernel; `render.ts` may also use `@bulkhead/platform-web/render/mini3` |
| `@bulkhead/platform-web` | `packages/platform-web/src` | Browser platform: input/touch/gamepad, audio, storage, UI, flow, render adapters (mini3 + vendored three), dev tools, perf HUD | platform-web, kernel, sdk |
| `@bulkhead/std` | `packages/std/plugins/<name>` | Shared plugins: `mechanics-*`, presentation, physics (Rapier), render-sync, scene, themes, dungeon generator | the plugin rules below |
| `@bulkhead/tools` | `packages/tools` | The `bulkhead` bin (create, new plugin, add, validate, graph). Forwards to `scripts/` in the checkout. | n/a |
| `create-bulkhead` | `packages/create-bulkhead` | `npm create bulkhead` (publish-ready; see below) | n/a |

The composition root stays outside the packages: `src/app/` (shell, creator tools, inspector, generated catalog) is
the only code that imports both the engine and `games/`. Build, dev, check and the other CLIs stay in `scripts/`.

## Import specifiers

- Engine entry point: `import { definePlugin } from '@bulkhead/sdk';`
- Rendering surface (manifest needs `"render"`): `import { Render, THREE } from '@bulkhead/sdk/render.ts';`
- Deep paths map onto the package folder: `@bulkhead/kernel/host.ts` → `packages/kernel/src/host.ts`,
  `@bulkhead/std/mechanics-clock/index.ts` → `packages/std/plugins/mechanics-clock/index.ts`.
- Inside one package, files use relative imports.

Every package's `exports` points at TypeScript sources (`"./*": "./src/*"`), so nothing is compiled: esbuild bundles
them for the browser, `tsc` resolves them with `moduleResolution: "Bundler"`, and Node's type stripping runs them in
tests (the `node_modules/@bulkhead/*` symlinks resolve to `packages/`, which is outside `node_modules`, so stripping
applies).

## Boundaries

`npm run lint` (`scripts/boundaries.ts`) resolves `@bulkhead/<pkg>/...` to the package folder before checking:

- Plugins (`packages/std/plugins/<name>/`, `games/<family>/plugins/<name>/`) import only their own folder,
  `@bulkhead/sdk`, `@bulkhead/sdk/render.ts` (with the `render` capability), capability-gated vendor packages, their
  family's `contracts/`, and the contracts of families their `family.json` lists in `uses`.
- Game contracts (`games/<family>/contracts/`) import only `@bulkhead/sdk`, their own family's contracts and used
  families' contracts.
- kernel → kernel; sdk → sdk + kernel; platform-web → platform-web + kernel + sdk.

## Family contracts and `family.json`

Contracts that only one game family uses live in that family: for example `games/shooter/contracts/shooter.ts`
(combat, weapons, ammo, enemies and AI, pickups, interactions, doors/triggers and the `World` service). Vocabulary every
genre shares (actor components such as `Transform`, `Health`, `Player`, `Inventory`, `Visual`; world description and
map formats; prefabs; input, flow, settings, audio and UI services; roles, view and theme) is in
`packages/sdk/src/contracts/game.ts` and exported from `@bulkhead/sdk`.

A family that builds on another family's contracts says so in `games/<family>/family.json`
(schema: `schemas/family.schema.json`):

```json
{ "$schema": "../../schemas/family.schema.json", "uses": ["shooter"] }
```

Cinder Vault does this to reuse the shooter's combat, weapon and enemy contracts.

## Tests and demos

Unit tests next to the code they cover: engine tests in `tests/`, family tests in `games/<family>/tests/*.test.ts`
(both run by `npm test`). Family browser demos live in `games/<family>/tests/<name>-demo/` and are listed in
`scripts/browser-suite.mjs`.

## Publishing

Nothing is published yet. `create-bulkhead` is publish-ready (metadata, `files`, README, LICENSE, tested with
`npm pack --dry-run`). The `@bulkhead/*` packages are marked `"private": true` until their public API and npm scope
are settled; flip that and add a Changeset to release them (see `docs/guide/releasing.md`).
