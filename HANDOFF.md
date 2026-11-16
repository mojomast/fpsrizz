# HANDOFF

Historical snapshot from the end of the first build session, not current verification or setup instructions. Start with
`README.md` and `AGENTS.md`; run checks locally for current results.

## What works (verified)

| Check | Command | Result at handoff |
| --- | --- | --- |
| Type check (strict) | `npm run typecheck` | clean |
| Import boundaries | `npm run lint` | OK, 63 source files |
| Unit / integration tests | `npm test` | 401 passed, 0 failed |
| Browser acceptance (headless Chrome) | `npm run build && npm run smoke` | 37 / 37 |
| Creator panel | `node tests/creator-demo/run.mjs` | 67 / 67 |

The smoke run plays the reference game through the real DOM: start screen, movement, wall sliding, firing, weapon
switching, projectiles, pause and resume, focus loss, resize, door, enemies, pickups, switch, exit, victory and defeat
screens, restart, the four extensions, invalid presets, 12 preset switches plus 12 restarts with owned-resource counts
compared against the first session, a frame-time sample and a console-error check. Screenshots land in `.smoke/`.

## Honest limitations

- **Not Three.js, Vite or Vitest.** The build environment had no npm registry access. Rendering is the in-repo WebGL2
  renderer `mini3` (Three-style API subset behind `src/sdk/render.ts` and the render adapter); bundling uses esbuild;
  tests use `node --test`. A lockfile has since been added. Migration path: `devplan.md`, step 1.
- **Performance is not measured on a real GPU.** The only numbers come from headless Chrome on SwiftShader (software
  rendering): about 3 to 5 fps at 1280x720, 37 draw calls, about 1.5k triangles, 20 entities, about 0.8 to 2.4 ms of
  JavaScript per frame. The CPU figure is meaningful; the frame rate is not.
- **Pointer lock is untested.** Automation uses the `?test` mode, which bypasses it. Try it by hand in a real browser.
- **Audio has not been listened to.** Sounds are synthesised with Web Audio; the nodes are created and cleaned up, but
  nobody has heard them.
- **Imported content packs are in memory only** (lost on reload). There are no save games.
- **Code plugins are discovered at build time and are trusted** (no sandbox). A deployed build can import data packs,
  not new JavaScript.
- Art and sound are procedural placeholders (`theme-industrial`).
- Determinism is a design goal for the simulation (fixed step, seeded RNG, tests compare tick-for-tick runs), not a
  cross-browser bit-identical guarantee.

## Defects found and fixed in the last pass (all with tests)

Swept-circle raycasts treated box corners as square; `core/give-ammo` and `core/give-weapon` accepted ids that do not
exist (attack/pickup `validateParams` now receives the registries); a tap on an automatic weapon between two ticks was
lost; enemies that saw the player did not alert neighbours (alarm radius 10 m with line of sight).

## Where things are

`README.md` (start), `SPEC.md` (scope and limits), `ARCHITECTURE.md`, `PLUGINS.md` (authoring guide and API),
`CONTENT_FORMAT.md` (JSON formats), `devplan.md` (milestones and next three steps), `AGENTS.md` (conventions).

## Environment notes

Node >= 22.18 (type stripping). Pinned: esbuild 0.28.2, playwright 1.63.0, typescript ^7.0.2. Without `node_modules`,
`scripts/tools.mjs` finds esbuild and Playwright via `TOOLS_NODE_MODULES` or `/opt/npm-tools/node_modules`, and `tsc`
must be on PATH. `npm run smoke` needs Chrome (`CHROME_PATH`).
