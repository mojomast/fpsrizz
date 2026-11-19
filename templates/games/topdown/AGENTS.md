# __TITLE__ — agent notes

Scaffolded from the `topdown` template (`npm run bulkhead -- create <name> --template topdown`). Top-down arena: collect seeded gems, avoid patrolling hazards, three lives.

## Layout
- `plugins/game/` — one plugin with rules and presentation. Its manifest declares the role, capabilities and dependencies.
- `presets/default.json` — the playable preset (roles, plugin list, seed). Open it with `?preset=__NS__/default`.
- `tests/game.test.ts` — headless gameplay test using `tests/helpers/replay.ts` (`startRun`, `run.ticks`, `run.input`).

## State for tests and tools
The `__NS__/state` service (`Game` export) exposes `player`, `gems`, `collected`, `lives`, `won`. Read it in tests instead of poking at entities.

## Rules
- Plugins import only from `packages/sdk/src` (the boundaries check enforces it). Rendering imports (`sdk/render`) need the `render` capability.
- Gameplay goes in simulation systems (fixed step, `ctx.rng` for randomness), so runs are deterministic and replayable. Use `ctx.time.now`, never `Date.now()` or `Math.random()`.
- UI is optional and skipped headless (`ctx.services.tryGet(Ui)`); mutate state only through queued commands or input actions.
- Keep `ctx.persist` save/load in sync with new state so quicksave and hot reload keep working.

## Tips
Gem/hazard layout is seeded from the preset `seed`; change counts and speeds at the top of the file.

## Loop
1. `node --test games/<name>/tests/*.test.ts` while iterating.
2. `npm run bulkhead -- validate` and `npm run check` before committing.
3. `npm run dev` and open the preset to play it.
