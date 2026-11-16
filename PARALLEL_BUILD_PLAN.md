# Distinct experiences: parallel implementation plan

Implementation wave started 2026-11-16. This is the task/dependency record; [SPEC.md](SPEC.md) records delivered scope.
The rationale and broader research are in [GAME_PLATFORM_STRATEGY.md](GAME_PLATFORM_STRATEGY.md).

## Four workstreams

1. Modular experience foundation, including the contained Three.js migration.
2. An overhead arcade racer with its own vehicle, handling, track and presentation.
3. A turn-based squad tactics game with board state, action previews and explicit turns.
4. A narrative puzzle adventure with rooms, dialogue, inventory and a chapter-specific save.

The existing shooter remains a regression reference. New experiences must not enable `core/player`, `core/world`,
`core/combat`, `core/enemies`, `core/content`, `core/hud` or `core/presentation` just to run.

## Model allocation and file ownership

| Task | Model | Owned files | Depends on |
|---|---|---|---|
| Experience, pointer/focus and input contexts | Astra | `src/app/main.ts`, input adapter, experience contract, additive input contract, SDK version/entry, new input tests | Existing host lifecycle |
| Three.js adapter and compatibility | Astra | `src/platform/render/`, `src/sdk/render.ts`, necessary shooter rendering adaptations, vendor tooling/dependencies, new render tests | Existing render boundary |
| Racing simulation/content/presentation | Terra | `vehicle-*` plugins, racing SDK contract, overhead-racing preset and tests | Agreed experience and camera signatures |
| Tactics simulation/content/presentation | Terra | `board-*` plugins, tactics SDK contract, turn-tactics preset and tests | Agreed experience and camera signatures |
| Adventure simulation/content/presentation | Terra | `story-*` plugins, adventure SDK contract, narrative-adventure preset and tests | Agreed experience signature and existing profile service |
| Curated art and sound themes | Sol | `theme-arcade`, `theme-board`, `theme-story`, experience-asset lock/import tooling and assets | Existing ThemeRole/Painter/SoundDef |
| Integration and acceptance | Coordinating agent | Catalog, public contract exports, launcher copy, documentation, cross-experience/browser acceptance | Completed slices |

Astra is concentrated on changes with broad compatibility and lifecycle consequences. Terra owns bounded but complete
game implementations. Sol owns the well-specified asset/provenance and theme task. Agents share the checkout; exclusive
file ownership, additive SDK contracts and a single catalog integrator avoid competing edits.

## Interfaces fixed before parallel implementation

- `ExperienceRole` (`sdk/experience`) selects `{ name, description, pointer: 'locked' | 'free' | 'none', controls? }`.
  No selection preserves the existing locked-pointer shooter behavior.
- `SessionControl` exposes read-only `playing` to presentation event handlers. Paused/menu UI cannot submit gameplay.
- `RenderService.setWorldCamera(ctx, camera)` selects a scoped perspective or orthographic camera. The original
  `render.camera` remains the legacy perspective camera; camera ownership and resize belong to the render adapter.
- Family-specific contracts live in `src/sdk/contracts/` and are exported by `src/sdk/index.ts`. Gameplay and
  presentation communicate through these contracts, not cross-plugin imports.
- Each family owns its state authority and content kind. A board does not pretend to be a shooter collision world.
- Turn/adventure requests enter a bounded semantic command queue and commit at a documented simulation boundary.
  Scheduler ticks can continue servicing input without advancing the board's turns or the adventure's story state.
- Art and sounds are semantic `ThemeRole` keys. Theme assets are pinned to a source revision with transformations,
  hashes and provenance. Simulation does not know file paths.

## Research applied to the tasks

| Best practice | Implementation consequence | Source |
|---|---|---|
| Compose complete experiences, not only match rules | Explicit controls, actor family, presentation and content per game | [Lyra](https://dev.epicgames.com/documentation/en-us/unreal-engine/lyra-sample-game-in-unreal-engine) |
| Ownership and dependencies follow lifetime | Scoped cameras/input/UI/assets; reverse cleanup; no mutable plugin globals | [Godot scene organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html) |
| Contextual mappings arbitrate input | Free cursor and relative lock are separate policies; UI focus consumes actions | [Enhanced Input](https://dev.epicgames.com/documentation/en-us/unreal-engine/enhanced-input-in-unreal-engine) |
| Commands represent actions and their results | Tactics/adventure resolve explicit requests, independent of animation duration | [Command pattern](https://gameprogrammingpatterns.com/command.html) |
| Fixed integration with bounded catch-up | Racing uses the existing tick scheduler; no frame-rate-dependent vehicle rules | [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) |
| Projection and renderer-specific semantics stay in presentation | Orthographic camera support; explicit color management, rotation order and disposal | [Three.js cameras](https://threejs.org/manual/en/cameras.html), [color management](https://threejs.org/manual/en/color-management.html), [cleanup](https://threejs.org/manual/en/cleanup.html) |
| Accessibility is part of control/UI design | Keyboard alternatives, focus visibility, readable previews and non-color-only cues | [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/) |

Research informs these local contracts; adopting Three.js does not require replacing esbuild, `node:test`, the host or
the plugin architecture. Vendored upstream implementation must retain its license, exact version and reproducible
generation rather than widening the import-boundary lint rules.

## Dependency and integration gates

1. **Freeze the seams** above, then implement the two foundation tasks concurrently.
2. **Build each family independently:** headless mechanics, validated content, presentation and a complete route.
   Themes can be curated concurrently using the agreed semantic keys.
3. **Wire the catalog and SDK:** stage all presets; verify the new dependency graphs contain no shooter modules.
4. **Run repository checks:** typecheck, unchanged boundary rules and all existing plus new meaningful tests.
5. **Exercise production:** existing shooter smoke, creator switching, and browser completion paths for each new game.
6. **Inspect actual presentation:** screenshots at desktop and smaller sizes; correct camera, visible actors, UI and
   feedback. Exercise free-pointer games without the `?test` bypass.
7. **Verify lifecycle:** shooter → racer → tactics → adventure → shooter, followed by restarts; no accumulating scene
   roots, UI, input contexts, shared assets, audio or GPU resources.
8. **Update documentation and report actual results,** including any blocked or manual verification.

## Slice-specific acceptance

### Racer

- Visible vehicle and orthographic track view; acceleration, braking and drifting affect its trajectory.
- A normal-input driving route completes an ordered lap. Reverse crossings and skipping gates cannot award a lap.
- Off-track consequences, time pressure, victory/defeat, restart and distinct speed/lap/checkpoint feedback.

### Tactics

- Select a unit; preview a legal move or attack and its AP/damage consequence; commit it exactly once.
- Invalid commands spend nothing. Board state remains unchanged during 30 seconds of deliberation.
- Explicit end-turn resolves deterministic opponents; complete victory and defeat routes; visible cover/selection.

### Adventure

- Complete a multi-room puzzle through inspection, dialogue, item acquisition/combination and contextual use.
- Duplicate pickup or invalid use does not duplicate/consume items. Dialogue and inventory controls are keyboard usable.
- Explicit chapter save/load validates its schema/content identity and handles corrupt/unavailable storage.
  This is not a general engine snapshot or transactional economy.

## Follow-on work

Full renderer feature exposure, asynchronous asset bundles, richer music/loops, graphical genre editors, general run
saves, vertical physics and multiplayer have separate contracts and acceptance gates. Keep their status explicit in
the strategy and scope documents as this first independent-family wave lands.
