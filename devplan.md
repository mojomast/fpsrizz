# Development plan

Status of the five milestones, then the next expansion steps. For what exists today see [SPEC.md](SPEC.md); for the
build's stack deviation (mini3, esbuild and `node --test` instead of Three.js, Vite and Vitest, no lockfile) see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Milestones

| # | Stage | Status | What it delivered |
|---|---|---|---|
| 1 | Shell, SDK, host, lifecycle tests | **Done** | Runtime kernel (scopes, registries, entity store, buses, scheduler, resolver, validation), plugin host with staged loading, public SDK, application shell, import-boundary lint, lifecycle and resolver test suites |
| 2 | One room, movement, one weapon | **Done** | Grid world with collision, controller and camera, hitscan weapon, mini3 renderer and presentation, HUD, input and audio adapters |
| 3 | Full reference game, validated content | **Done** | Bulkhead Station arena, two weapons, two enemy types with navigation, pickups, doors and switches, objective mode, JSON content kinds with cross-reference validation, theme with procedural art and sound |
| 4 | Four extensions and creator tools | **Done** | Data pack, ricochet behaviour, visor HUD, survival mode, four presets, creator panel (plugin toggles, preset picker, import and export, debug views) |
| 5 | Cleanup and failure verification, browser playthrough, performance, handoff | See `HANDOFF.md` | |

## Next three expansion steps

Ordered; each is independent of the later ones.

1. **Migrate to real Three.js, Vite and Vitest, with a lockfile.** Do this as soon as an environment with npm registry
   access exists. Install the packages and commit `package-lock.json`; swap the module behind `src/sdk/render.ts` and
   `src/platform/render/service.ts`; fix the colour, Euler-order and lighting differences listed in the mini3 section of
   ARCHITECTURE.md; replace the esbuild scripts with Vite and port or keep the `node --test` suites; update the lint rules
   that currently restrict bare imports. Keep the render adapter and the SDK `THREE` export so plugins do not change.
   Re-measure frame time on a real GPU.
2. **Vertical gameplay as a versioned SDK extension.** Add height to the world description and to `Transform`, a new
   controller and camera provider with pitch and jumping, and 3D collision and ray queries. This changes shared contracts,
   so it ships as an SDK version bump (SDK 2) with manifests declaring the range; v1 plugins keep working on a planar
   world. Extend the grid format (or add a new map format) for floor and ceiling heights.
3. **Creator tooling.** A graphical grid-map painter that writes the existing map JSON, persistence of imported content
   packs alongside the selected preset, and versioned save games (the design is in CONTENT_FORMAT.md: plugin and pack
   versions recorded, refusal to load on mismatch).

## Roadmap and ideas

Not scheduled; none of these exist.

- Visual scripting for map triggers and simple modes.
- More themes (alternative art and sound packs behind the existing `sdk/theme` role).
- Gamepad support and key rebinding.
- Audio occlusion from the world's line-of-sight queries.
- Light culling in the renderer (today the nearest 16 point lights are shaded per frame).
- A spatial hash for collision and queries on larger maps (today every query tests every box).
- A frustum-culling pass and instancing for sprites if actor counts grow.
- Recording and replay of per-tick input, building on the deterministic fixed-step simulation.
- Runtime installation of third-party code plugins, which would first require a sandboxing model (today code plugins are
  compiled in and fully trusted).

## Carried over from the offline build

- No `package-lock.json`; devDependency versions are pinned in `package.json`.
- GPU performance has not been measured; the smoke test ran with software WebGL2 and checks CPU time per frame only.
- Browser coverage is Chrome only.
- Imported content packs are not persisted across page loads.
