# fpsrizz / Bulkhead: roadmap to a rapid-prototyping game engine

> **Status (branch `engine/p2-tooling`, stacked on `engine/p1-core` and `engine/p0-foundations`, 2026-11-18).** P0 is done
> except the P0.2 leftovers below; P1.1–P1.8 are done (KTX2 *encoding* in `npm run assets` deferred); P2.1–P2.7 are done
> (npm publishing of `create-bulkhead` waits on P0.2 packages). This file is the audit as written, with
> paths as they were at `14a2f15`. Many root documents have since moved (see [docs/README.md](README.md)).
>
> | Item | State |
> |---|---|
> | P0.1 Node pin and preflight | Done: `.nvmrc`, `.node-version`, `packageManager`, `engine-strict`, `scripts/check-node.mjs`, CI uses `.nvmrc`. |
> | P0.6 Browser CI and scheduler contract | Done: `npm run test:browser` + CI job with screenshot artifacts; removal semantics documented and tested. |
> | P2.1 Live / hot reload | Done: esbuild live reload, resume, `?seed=`; step 2: the RunSnapshot survives the reload for all-SDK-3 presets (code, presets and JSON content), config tweaks restart with state kept ([inspector](reference/inspector.md)). |
> | P0.3 Catalog from manifests | Done: `scripts/gen-catalog.mjs` -> `src/app/catalog.generated.ts`. |
> | P0.4 Splitting, art packs, maps, budget | Done: per-plugin chunks, `public/packs/*.pack`, maps in `.sourcemaps/`, `npm run budget`. |
> | P0.2 Engine/games split | Mostly done: all games (11 families) in `games/` with their family-only contracts; `packages/std/plugins` holds only shared plugins. Not done: npm workspaces/`packages/`, moving the shooter contract out of the SDK, browser demos into `games/`. |
> | P0.5 Docs | Done: Guide/Reference/Cookbook/archive, TypeDoc (`npm run docs:api`), `llms.txt`, link checker. |
> | P1.1 Queries | Done: `world.query({ with, without })` with added/removed/changed per handle, `markChanged` ([queries](reference/queries.md)). |
> | P1.2 Transform3D + render sync (SDK 3) | Done: `Transform3D`/`PrevTransform`/`Renderable`, `std/transform`, `std/render-sync` with alpha interpolation, SDK 3.0.0 with `SDK_COMPAT ['2.0.0']`, shooter bridge ([spatial](reference/spatial.md)). |
> | P1.3 Rapier physics | Done: `std/physics-rapier` (rapier3d-compat 0.19.3, lazy vendor chunk): bodies, colliders, sensors, collision events, raycasts, character controller ([physics](reference/physics.md)). rapier2d not added. |
> | P1.4 Assets | Done: `Assets` service, manifest `preload`, `std/assets` (GLTFLoader + Meshopt + KTX2 decode), glTF extras -> components, `npm run assets` (gltf-transform). KTX2 encoding deferred (needs toktx) ([assets](reference/assets.md)). |
> | P1.5 Input v2 | Done: axes, gamepad, touch controls, rebinding in the pause menu persisted to the profile store ([input](reference/input.md)). |
> | P1.6 Audio | Done: `AudioSamples`, buses wired to settings, PannerNode 3D voices, synth fallback ([audio](reference/audio.md)). |
> | P1.7 Snapshots and replays | Done: `ctx.persist`, `host.snapshot/restore` with schema migrations, Rapier world persistence, F6/F9 quicksave, `?record` + F8 `.replay.json`, `tests/helpers/replay.ts` ([snapshots](reference/snapshots.md)). |
> | P1.8 Spatial index and instancing | Done: `SpatialHash`, grid path in `core-world` for 128+ box maps, `Renderable.instanced` -> InstancedMesh ([spatial](reference/spatial.md)). |
> | P2.2 JSON Schemas | Done: `schemas/*.schema.json` (draft 2020-12) for manifests, presets, reuse, content packs, game graphs, replays, snapshots, models, scenes, prefabs; `$schema` in every data file; `npm run schemas` in check; VS Code mapping ([schemas](reference/schemas.md)). |
> | P2.3 CLI + templates | Done: `npm run bulkhead -- create/templates/new plugin/add/validate/graph`; templates blank, platformer, topdown, fps, puzzle, cards (plugin + preset + test + AGENTS.md), each scaffolded and tested in CI; `packages/create-bulkhead` wrapper (unpublished) ([CLI](guide/bulkhead-cli.md)). |
> | P2.4 Prefabs and scenes | Done: `std/scene` with `prefab` (extends/overrides), `scene` (`{prefab, transform, overrides, children}`), `tiled-map` and `ldtk-level` kinds; `spawnScene`, `*.scene.json`; glTF `prefab` extra applies data prefabs ([scenes](reference/scenes.md)). Tile-run merging deferred. |
> | P2.5 Inspector, tweaks, debug draw | Done: creator Inspect tab (entity list, live component editor, config tweak + export preset, time controls hold/run/step/0.25–4×), `debugDraw(ctx)` SDK, collider overlay ([inspector](reference/inspector.md)). Tweakpane not added. |
> | P2.6 Agent protocol + MCP | Done: JSON-RPC 2.0 bridge started by `npm run dev` (world.query, entity.get/set, sim.step/pause/speed, input.press, preset/config, replay.run, screenshot, log.tail, perf.systems), method schemas, stdio MCP server `npm run mcp` ([dev protocol](reference/dev-protocol.md)). |
> | P2.7 Perf HUD and budgets | Done: F3 / `?perf` HUD with GPU timer queries, per-system timings JSON, `npm run perf` + budgets, optional CI perf job (dispatch / `perf` label), Spector.js guide ([performance](guide/performance.md)). stats-gl not added. |

Audit date: 2026-11-18. Audited commit: `14a2f15` on `main` ("Bust stale production bundle caches").
Scope: a read-only audit of the repo plus a review of current best practices. Nothing was pushed.

---

## 1. Current state

### What it is
Bulkhead (`package.json` name `fpsrizz`) is a **browser-only, strict-TypeScript, plugin-driven game platform**.

- **Kernel.** `packages/kernel/src/` is about 2.5k LOC and has no game or DOM concepts.
- **SDK.** `packages/sdk/src/` is the public API, currently SDK `2.0.0`.
- **Platform adapters.** `packages/platform-web/src/` holds the input, Web Audio, storage, UI and render host adapters.
- **Renderer.** Official **Three.js 0.187** is vendored under `packages/platform-web/src/render/mini3/vendor/`.
- **Plugins.** About 130 plugins live in `packages/std/plugins/`.
- **Presets.** About 50 JSON presets live in `src/content/presets/`.
- **Games.** It ships roughly 25 playable experiences across genres:
  - an FPS
  - a metroidvania (Hollowmere)
  - a roguelite (Cinder Vault)
  - racing, tactics, adventure, a 3D puzzle, tower defense, cards, an RPG and a life-sim
- **Toolchain.**
  - esbuild handles the build and dev server (`scripts/build.mjs`, `scripts/dev.mjs`).
  - `node --test` runs the TS tests directly, which needs Node ≥ 22.18.
  - TypeScript 7 runs `tsc --noEmit`.
  - Playwright drives the browser smoke tests (`scripts/smoke.mjs`, `tests/*-demo/run.mjs`).
  - GitHub Actions CI (`.github/workflows/ci.yml`) runs `check` and `build` only.

### Verified locally (box, Node 22.23.5)
- `npm ci`: OK.
- `npm run check` (typecheck + boundary lint + reuse-index freshness + tests): **853/853 pass** in about 9.5 s.
- `npm run build`: OK in under 1 s. **But `dist/assets/main.js` is 6.0 MB, or 2.0 MB gzipped, as a single chunk.** A 10.5 MB sourcemap ships alongside it, and `dist/` totals 32 MB.
- **On Node 20, the box default, `npm run check` fails at `lint`** with `ERR_UNKNOWN_FILE_EXTENSION ".ts"`. npm only prints an `EBADENGINE` warning, and there is no `.nvmrc` or preflight check.
- I did not run the browser suites (smoke/demos). Per the README, CI doesn't run them either.

### Strengths (keep these)
- **A real kernel architecture.** It has:
  - scoped ownership with reverse-order disposal (`packages/kernel/src/scope.ts`)
  - a manifest-validated plugin graph checked *before import* (`packages/kernel/src/manifest.ts`, `resolver.ts`)
  - staged registries that commit atomically (`packages/kernel/src/host.ts`)
  - roles for exclusive systems
  - typed event, command and service buses (`packages/kernel/src/bus.ts`)
- **Deterministic sim foundations.**
  - A fixed 1/60 s step with spiral-of-death protection and an interpolation alpha (`packages/kernel/src/scheduler.ts`).
  - Per-plugin seeded mulberry32 RNG (`packages/kernel/src/rng.ts`).
  - Per-tick input snapshots (`packages/platform-web/src/input.ts`).
- **Strong test culture.** There are 853 node tests, plus browser demos that assert owned-resource counts don't grow across restarts.
- **Enforced import boundaries.** `scripts/boundaries.ts` runs as `npm run lint`.
- **Agent-friendly from day one.**
  - `AGENTS.md` and `docs/guide/reuse.md`.
  - A capability search (`npm run find-reuse -- "..." --json`) and a generated `docs/reuse-index.json`.
  - A `GameGraph` JSON composer with a CLI (`npm run graph`, `src/app/game-graph.ts`).
  - A plugin scaffolder (`npm run new-plugin`, `templates/plugin-starter/`).
  - `npm run validate-game`.
- **In-game creator tools.** `src/app/creator.ts` provides:
  - preset and plugin toggles
  - content-pack import and export
  - a composition canvas
  - a Debug tab with per-system cost, entities per owner and resource counts
- **Provenance discipline for assets** (`docs/reference/spec.md` §7, `vendor/provenance.json`).

### Weaknesses (what blocks "rapid prototyping engine")

| # | Problem | Evidence |
|---|---|---|
| W1 | **Engine and ~25 games live in one tree.** The SDK carries game-specific contracts, so a new game means forking the whole repo. | `packages/sdk/src/contracts/` has 35 files, including `cinder.ts`, `ember.ts`, `verdant.ts`, `sky.ts`, `silt-archive.ts`, `salt-ledger.ts`, `hearth-sim.ts`, `metroidvania.ts`, and `shooter.ts` at 735 LOC. |
| W2 | **The plugin catalog is hand-maintained.** Adding a plugin means editing a 295-line import list. | `src/app/catalog.ts` |
| W3 | **The bundle is monolithic.** `load: () => import()` exists, but esbuild runs without `splitting`, so every game ships in one file. About 4 MB of images are inlined as base64 *TypeScript*. | `scripts/build.mjs`; `packages/std/plugins/theme-assetrizz/{cinder-weapons,fantasy-generated,fantasy-weapons,weapons,generated}.ts`; `theme-story/generated.ts` |
| W4 | **There's no hot reload, not even live reload.** esbuild rebuilds on save, but you refresh by hand and lose game state. | `scripts/dev.mjs` (no `/esbuild` EventSource; no `import.meta.hot`) |
| W5 | **The ECS is minimal.** It has one Map per component and `each(token)` over a single component, with no multi-component queries, no change detection, no prefab inheritance and no serialization beyond `snapshot()`. | `packages/kernel/src/ecs.ts` |
| W6 | **The world model is planar and shooter-specific.** `Transform` is `x, z, yaw`. Collision is brute-force circle-vs-AABB. There's no 3D physics and no vertical movement. | `docs/reference/spec.md` §5, `games/shooter/plugins/core-world/collision.ts` |
| W7 | **There's no asset pipeline.** There's no async loader, no glTF loading, and no texture compression. GLBs in `assets/weapons/` aren't wired up, and content refers to art only by theme key. | `docs/reference/spec.md` §5, `docs/reference/architecture.md` §9 |
| W8 | **Input is keyboard and mouse only.** There's no gamepad, no touch and no rebinding. | `docs/reference/spec.md` §5 |
| W9 | **Audio is synthesis only.** There's no sample playback, no buses and no PannerNode spatialization. | `packages/platform-web/src/audio.ts` |
| W10 | **Content formats have no JSON Schema.** Validation is hand-written TS (`Reporter`), so editors and agents get no autocomplete or schema validation. | `packages/kernel/src/validate.ts` ("No schemas-as-code") |
| W11 | **There are no general saves and no input record/replay**, even though the sim is deterministic. | `docs/reference/spec.md` §5, `docs/archive/devplan.md` |
| W12 | **Docs sprawl.** There's about 1.1 MB of Markdown across 20 top-level files. Some of it is stale: `docs/archive/handoff.md` says "Not Three.js", which contradicts `docs/reference/architecture.md`. That burns agent context. | repo root |
| W13 | **CI gaps.** There's no Node pin and no browser tests in CI. Coverage is Chrome only. There's no deploy workflow, although a `gh-pages` branch exists. | `.github/workflows/ci.yml` |
| W14 | **A known spec/impl mismatch.** System removal during a tick behaves differently in the docs and the code. | `docs/archive/devplan.md` "Resolve the scheduler's removal contract" |
| W15 | **GPU performance has never been measured.** The only numbers come from SwiftShader. There's no spatial index and no instancing. | `docs/archive/handoff.md`, `docs/archive/devplan.md` |

**Bottom line.** The *runtime design* is already better than most hobby engines. What's missing is the **prototyping loop**: a new game in one command, edit-and-see in under a second, a generic 3D entity/physics/asset stack, and schemas and tools that agents can drive. Most of the work is restructuring and tooling, not a rewrite.

---

## 2. Prioritized checklist

Effort: **S** ≈ ≤1 day, **M** ≈ 2–5 days, **L** ≈ 1–3 weeks (agent-assisted).

### P0: Foundations (do first; everything else builds on these)

- [ ] **P0.1 Pin and preflight the toolchain.** S
  - *Why:* On Node < 22.18 the checks fail with a cryptic `.ts` extension error. New contributors and agent sandboxes hit this first.
  - *Change:*
    - Add `.nvmrc` / `.node-version` (`22`) and a `packageManager` field.
    - Add a version guard in `scripts/tools.mjs` that prints "Node ≥22.18 required".
    - Set `engine-strict=true` in `.npmrc`.
    - Pin `node-version: 22.x` in CI. CI currently says `22` and already works.
- [ ] **P0.2 Separate the engine from the games (workspaces).** L
  - *Why:* You can't prototype a new game without dragging along 25 games and their contracts (W1).
  - *Change:* Convert to npm workspaces:
    - `packages/kernel`
    - `packages/sdk`, core only
    - `packages/platform-web`
    - `packages/std` for shared `mechanics-*` providers, `presentation-camera-modes`, etc.
    - `packages/tools` for build/dev/graph/reuse CLIs
    - `games/<family>/` for each game family *and its contracts*
  - Move `cinder.ts`, `ember.ts`, `verdant.ts`, `sky.ts`, `silt-archive.ts`, `salt-ledger.ts`, `hearth-sim.ts`, `metroidvania.ts` and `shooter.ts` out of `packages/sdk/src/contracts/` into their families. Contracts that several families truly share stay in `std`.
  - Extend `scripts/boundaries.ts` to package boundaries.
  - Source: npm workspaces https://docs.npmjs.com/cli/using-npm/workspaces
- [ ] **P0.3 Auto-discover plugins.** M
  - *Why:* Editing a 295-line import list per plugin adds friction, and agents often forget it (W2).
  - *Change:* Generate `catalog.generated.ts` from `**/manifest.json` with a small esbuild plugin or a `scripts/gen-catalog.mjs` run by `dev`/`build`/`check`.
  - Keep the "manifest validated before code import" invariant by emitting `{ manifest, load: () => import(...) }` entries.
  - Drop the hand-written list.
- [ ] **P0.4 Real code splitting, with assets out of the JS.** M
  - *Why:* A 6 MB single bundle hurts load time and the Pages deploy, and every prototype pays for every game (W3).
  - *Change:*
    - Turn on esbuild `splitting: true` with `outdir`, ESM only, so each plugin's `load()` becomes its own chunk.
    - Move the base64 images in `theme-assetrizz/*.ts` and `theme-story/generated.ts` to `public/` files with content-hashed names, resolved through the asset service.
    - Emit `sourcemap: 'external'` and stop deploying maps, or upload them privately.
    - Add a bundle-size budget check, using the esbuild `metafile`, to `npm run check`.
  - Source: esbuild splitting https://esbuild.github.io/api/#splitting
- [ ] **P0.5 Consolidate the docs for humans and agents.** M
  - *Why:* About 1.1 MB of overlapping and partly stale docs costs agent context and creates contradictions (W12).
  - *Change:*
    - Keep `README.md` (pitch + quickstart), `AGENTS.md` (short and normative) and `docs/` in three sections: Guide / Reference / Cookbook.
    - Move `docs/archive/handoff.md`, `docs/archive/parallel-build-plan.md`, `docs/archive/build-order.md`, `docs/archive/devplan.md` history and `docs/archive/research/*` to `docs/archive/`.
    - Generate the SDK reference from TSDoc with TypeDoc.
    - Add an `llms.txt` index that points agents at the minimal set of files.
  - Sources: llms.txt https://llmstxt.org/ · AGENTS.md convention https://agents.md/ · TypeDoc https://typedoc.org/
- [ ] **P0.6 CI that exercises the browser, plus the scheduler contract fix.** M
  - *Why:* The browser suites are the real acceptance tests, but they run only by hand (W13). The known removal mismatch is a latent bug (W14).
  - *Change:*
    - Add a CI job: `npm run build && npm run smoke` plus one demo per family with Playwright Chromium. Upload `.smoke/` screenshots as artifacts.
    - Decide on the removal semantics, add a regression test, and align `scheduler.ts` with `docs/reference/architecture.md`.
  - Source: Playwright CI https://playwright.dev/docs/ci

### P1: Engine core

- [x] **P1.1 ECS queries and change detection.** M
  - *Why:* Single-component `each` forces manual joins and makes generic systems such as physics sync, render sync and inspectors awkward (W5).
  - *Change:*
    - Add cached `world.query({ with: [A, B], without: [C] })` backed by per-entity bitsets or archetype buckets.
    - Add `added` / `removed` / `changed` views per query.
    - Keep owner tagging and deferred destroy.
    - Benchmark before considering an external ECS. bitECS (SoA) is the throughput pick at 10k+ entities. Koota and miniplex favour DX.
  - Sources:
    - https://github.com/NateTheGreatt/bitECS
    - https://github.com/pmndrs/koota
    - https://github.com/hmans/miniplex
    - benchmarks https://github.com/ooflorent/ecs-benchmark
- [x] **P1.2 A generic 3D transform plus render sync (SDK 3).** L
  - *Why:* Planar `x, z, yaw` blocks platformers, flight, third-person and anything vertical (W6). Each 3D family currently hand-rolls its presentation.
  - *Change:*
    - Add core `Transform3D` (position, quaternion, scale, optional parent) and `PrevTransform` components.
    - Add a std `render-sync` system that maps entities to `Object3D`s and interpolates with the scheduler's `alpha`.
    - Add a `Renderable` component (mesh/prefab/glTF ref).
    - Keep the planar shooter as a family-level adapter.
    - Bump the SDK major version per `docs/reference/spec.md` §6.
  - Source: Fix Your Timestep (interpolating render state with alpha) https://gafferongames.com/post/fix_your_timestep/
- [x] **P1.3 A physics module (Rapier).** L
  - *Why:* Prototypes need rigid bodies, triggers, raycasts and a character controller without bespoke collision code (W6).
  - *Change:*
    - Add a `std/physics-rapier` plugin using `@dimforge/rapier3d-compat` (and `rapier2d` for 2D), stepped inside the fixed tick.
    - Add `RigidBody` / `Collider` components, collision events on the bus, and a kinematic character controller.
    - Optionally use the `-deterministic` build for replays/netcode.
    - Keep `core-world` AABB as the lightweight grid option.
  - Sources:
    - https://www.npmjs.com/package/@dimforge/rapier3d-compat (build flavours: standard is locally deterministic; `-deterministic` is cross-platform)
    - https://rapier.rs/docs/user_guides/bevy_plugin/determinism/
- [x] **P1.4 An async asset pipeline (glTF, KTX2, Meshopt).** M–L
  - *Why:* You can't drop in a model today. The GLBs in `assets/weapons/` are unused (W7).
  - *Change:*
    - Add a scoped `Assets.load(ctx, url)` service on top of `kernel/assets.ts` refcounting, with progress and preload lists in manifests.
    - Support `GLTFLoader` + `MeshoptDecoder` + `KTX2Loader`.
    - Add an `npm run assets` step using `gltf-transform optimize` for `assets/ → public/`.
    - Map glTF `extras` (Blender custom properties) to components, so Blender works as a level and prefab editor.
  - Sources:
    - https://threejs.org/docs/pages/GLTFLoader.html
    - https://gltf-transform.dev/
    - Blender glTF exporter (custom properties → extras) https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html
- [x] **P1.5 Input mapping v2.** M
  - *Why:* Keyboard/mouse-only input with no rebinding limits genres and playtesting (W8).
  - *Change:*
    - Add action maps with **axes** (move/look vectors) on top of existing `InputContexts`.
    - Support Gamepad API polling in `beginTick()`, touch/virtual sticks and rebinding persisted via `profile-store`.
    - Ship default maps per template.
  - Source: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API
- [x] **P1.6 Sample-based audio with buses.** M
  - *Why:* Synth-only `SoundDef`s are fine as placeholders, but prototypes need real SFX and music (W9).
  - *Change:*
    - Add `AudioBuffer` loading through the asset service.
    - Add master/music/sfx/ui gain buses wired to settings.
    - Add PannerNode spatial audio driven by the listener transform.
    - Keep the synth as a fallback. Optionally wrap Howler.js.
  - Sources: Web Audio https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API · https://howlerjs.com/
- [x] **P1.7 Snapshots, saves and input record/replay.** M–L
  - *Why:* Determinism already exists but isn't cashed in (W11). Replays give one-file bug repros, deterministic regression tests and agent-verifiable gameplay.
  - *Change:*
    - Define `RunSnapshot { tick, rngStates, ecs.snapshot(), plugin state via serialize/restore hooks }`.
    - Record per-tick input snapshots to a `.replay.json`.
    - Add a `node --test` helper that replays and asserts end state or hash.
    - Version snapshots with migrations, building on `story/adventure`'s chapter-save pattern.
  - Source: Gaffer On Games, deterministic lockstep https://gafferongames.com/post/deterministic_lockstep/
- [x] **P1.8 Spatial index and instancing.** M
  - *Why:* Brute-force queries are sized for "a few hundred boxes" (W15).
  - *Change:*
    - Add a uniform-grid/spatial-hash broadphase for the grid world, or rely on Rapier.
    - Use an `InstancedMesh` path in render-sync for repeated renderables.
  - Source: https://threejs.org/docs/pages/InstancedMesh.html

### P2: Prototyping tooling (the speed multiplier)

- [x] **P2.1 Live reload now, state-preserving hot reload next.** S, then M
  - *Why:* An edit, save and see loop under 1 s is the number-one prototyping feature (W4).
  - *Change, step 1 (S):* Add esbuild live reload (`new EventSource('/esbuild')…location.reload()`) behind `__DEV__`. Auto-resume the last preset and seed via `?dev`.
  - *Change, step 2 (M):* On change, take a `RunSnapshot` (P1.7), restage the changed plugins through the host (staged commit already exists), and restore. Alternatively, move the dev server to Vite and use `import.meta.hot.accept/dispose/data` per plugin module, keeping esbuild for prod if desired. Hot-reload JSON presets and content without a restart.
  - Sources:
    - https://esbuild.github.io/api/#live-reload
    - https://vite.dev/guide/api-hmr
- [x] **P2.2 JSON Schemas for every data format.** M
  - *Why:* Editors, the composer and agents get autocomplete and validation for free, and hand-written validators drift (W10).
  - *Change:*
    - Publish schemas for `manifest.json`, presets, `GameGraph`, `reuse.json` and each content kind.
    - Either define the formats in Zod and generate JSON Schema (`z.toJSONSchema`), or emit schemas from the existing validators.
    - Add `$schema` to every JSON file and a VS Code `json.schemas` mapping.
    - Keep the semantic cross-reference checks in TS.
  - Sources:
    - https://zod.dev/json-schema
    - https://json-schema.org/
    - https://code.visualstudio.com/docs/languages/json#_json-schemas-and-settings
- [x] **P2.3 A `create-bulkhead` scaffolding CLI with genre templates.** M
  - *Why:* "New game in one command" is the norm for web engines (W1). An example is Phaser's `npm create @phaserjs/game@latest`.
  - *Change:*
    - Add `npm create bulkhead@latest my-game -- --template fps|platformer|topdown|puzzle|cards|blank`, producing a standalone repo that depends on the engine packages from P0.2.
    - Each template is about 200 LOC plus a preset and has its own `AGENTS.md`.
    - Add `bulkhead add <mechanic>`, `bulkhead new plugin`, `bulkhead validate` and `bulkhead graph`, folding in the current `new-plugin`, `validate-game` and `graph` scripts.
  - Sources:
    - https://www.phaser.io/tutorials/create-game-app
    - https://github.com/phaserjs/create-game
- [x] **P2.4 Prefabs and a generic scene/level format.** L
  - *Why:* Grid maps are the only level format, and entity definitions are per family.
  - *Change:*
    - Add a data-driven `prefab` content kind: component bags with `extends` and overrides, validated by schema.
    - Add a `scene` format: an entity list of `{ prefab, transform, overrides, children }`.
    - Add importers for Tiled and LDtk JSON (2D/top-down) and glTF extras (3D, from P1.4).
    - Model the scene format on Godot's text scene format (diff-friendly, human- and agent-editable).
  - Sources:
    - https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html
    - https://doc.mapeditor.org/en/stable/reference/json-map-format/
    - https://ldtk.io/json/
- [x] **P2.5 A runtime entity inspector, tweak panel and debug draw.** M
  - *Why:* Tuning by editing JSON and reloading is slow. The Debug tab shows stats but can't edit.
  - *Change:*
    - Extend `creator.ts` Debug into an entity list → component editor (live edit through commands).
    - Bind plugin config to Tweakpane, with an export-to-preset button.
    - Add a `Debug.draw` SDK (lines, boxes, spheres, text) for colliders, nav paths and triggers.
    - Add time controls: pause, step one tick, 0.25×/4× speed.
  - Sources:
    - https://tweakpane.github.io/docs/
    - Babylon Inspector (reference for scope) https://doc.babylonjs.com/toolsAndResources/inspector
- [x] **P2.6 An agent control protocol plus an MCP server.** M–L
  - *Why:* You build with agents. Today `window.__bulkhead` is an undocumented test hook. A versioned remote protocol lets agents inspect and modify a running game, step it and take screenshots.
  - *Change:*
    - Add a dev-only JSON-RPC 2.0 endpoint over WebSocket from the dev server. Methods: `world.query`, `entity.get/set`, `sim.step(n)`, `sim.pause`, `preset.apply`, `replay.run`, `screenshot`, `log.tail`.
    - Publish method schemas and a thin MCP server wrapper.
    - Document pairing with Chrome DevTools MCP / Playwright MCP for perf traces and UI driving.
    - Model it on the Bevy Remote Protocol and its MCP bridges.
  - Sources:
    - https://docs.rs/bevy/latest/bevy/remote/
    - https://github.com/Nub/bevy_mcp
    - https://docs.rs/crate/bevy_brp_mcp/latest
    - https://github.com/ChromeDevTools/chrome-devtools-mcp
    - https://github.com/microsoft/playwright-mcp
    - https://modelcontextprotocol.io/
- [x] **P2.7 Perf HUD and budgets.** M
  - *Why:* GPU performance is unmeasured (W15). Prototypes need a visible frame budget.
  - *Change:*
    - Add an FPS/CPU/GPU overlay: stats-gl on WebGL, or the three.js `Inspector` if moving to WebGPURenderer.
    - Export per-system timings, which the Debug tab already collects, as JSON.
    - Add an optional CI perf job with frame-time thresholds on a GPU runner.
    - Add a Spector.js how-to.
  - Sources:
    - https://github.com/RenaudRohlinger/stats-gl
    - https://github.com/mrdoob/three.js/pull/31869
    - https://spector.babylonjs.com/

### P3: Polish and ecosystem

- [ ] **P3.1 One-command deploy and export.** S–M
  - *Change:*
    - Add a GitHub Pages deploy workflow, since there's currently no workflow despite a `gh-pages` branch.
    - Add `npm run export:itch`, which zips `dist/` with relative paths.
    - Make it an optional PWA, with an optional Tauri desktop wrapper.
  - Sources:
    - https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
    - https://itch.io/docs/creators/html5
    - https://v2.tauri.app/
- [ ] **P3.2 WebGPURenderer path.** M
  - *Why:* three.js's new features land there, and it falls back to WebGL2 automatically. WebGLRenderer is maintained but gets no big new features.
  - *Change:*
    - Make it an opt-in renderer behind `packages/sdk/src/render.ts` with `await renderer.init()`.
    - Port any custom GLSL to TSL.
    - Gate it per preset until parity tests pass.
  - Source: https://threejs.org/manual/pages/webgpurenderer.html
- [ ] **P3.3 Visual regression and cross-browser tests.** M
  - *Change:* Use Playwright `toHaveScreenshot` per template, with Firefox and WebKit projects (W13).
  - Source: https://playwright.dev/docs/test-snapshots
- [ ] **P3.4 Versioned releases of the engine packages.** S
  - *Change:* Use Changesets for semver, an SDK changelog and migration notes per major version.
  - Source: https://github.com/changesets/changesets
- [ ] **P3.5 Navmesh for non-grid worlds.** M
  - *Change:* Add a `std/navigation-recast` plugin (recast-navigation-js) for scenes from P2.4. Keep A* for grids.
  - Source: https://github.com/isaac-mason/recast-navigation-js
- [ ] **P3.6 A plugin and mechanic gallery.** M
  - *Change:* Generate a browsable page from `docs/reuse-index.json` plus live preset links, so people and agents can see what exists.
- [ ] **P3.7 Networking (later).** L
  - *Change:* Build only after P1.7. Snapshot/replay plus deterministic physics is the prerequisite. See the multiplayer row in `docs/archive/game-plugin-roadmap.md`.

---

## 3. Suggested order of attack (agent-sized chunks)

1. P0.1, P0.6 (scheduler fix), P2.1 step 1 (live reload). Quick wins that make every later step faster.
2. P0.3, then P0.4. Discovery and splitting. Mechanical changes, easy to test.
3. P0.2 workspaces split, together with P0.5 docs. The big restructure; do it before adding features.
4. P2.2 schemas, P1.1 ECS queries, P1.7 snapshot/replay. They unlock hot reload and agent tooling.
5. P1.2 + P1.3 + P1.4. The 3D entity/physics/asset stack, as SDK 3.
6. P2.3 CLI + templates, P2.5 inspector, P2.6 agent protocol. Then the rest of P1/P3.
