# Development plan

Status of the five milestones, then the next expansion steps. For what exists today see [SPEC.md](SPEC.md); for the
build's stack deviation (mini3, esbuild and `node --test` instead of Three.js, Vite and Vitest) see
[ARCHITECTURE.md](ARCHITECTURE.md).

For a research-backed, cross-genre plugin and game-slice proposal, see [GAME_PLUGIN_ROADMAP.md](GAME_PLUGIN_ROADMAP.md).
That proposal is not an implementation status or a replacement for the milestones below.

Cross-genre slices now include timed raid, score attack, holdout, key dungeon, stealth, puzzle, horror, seeded gauntlet
and planar racing, with curated Assetrizz art. The staged dependency plan is in [BUILD_ORDER.md](BUILD_ORDER.md).
Experimental vertical geometry queries and a network message codec are isolated prototypes; neither vertical gameplay
nor multiplayer is integrated. Local profile best scores are implemented; full run saving remains planned.

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

1. **Migrate to real Three.js, Vite and Vitest.** Install the packages and update `package-lock.json`; swap the module behind `src/sdk/render.ts` and
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
- Resolve the scheduler's removal contract: `ARCHITECTURE.md` says removals during a tick take effect on the next tick,
  while `src/kernel/scheduler.ts` immediately skips a removed system. Decide the intended behavior and cover it with a
  regression test before aligning implementation and documentation.

## Carried over from the offline build

- The original offline build had no lockfile; development dependencies are now locked in `package-lock.json`.
- GPU performance has not been measured; the smoke test ran with software WebGL2 and checks CPU time per frame only.
- Browser coverage is Chrome only.
- Imported content packs are not persisted across page loads.
