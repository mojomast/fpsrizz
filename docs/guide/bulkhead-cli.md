# Bulkhead CLI and game templates

`npm run bulkhead -- <command>` is the single entry point for the authoring scripts (P2.3).

| Command | What it does |
| --- | --- |
| `create <name> [--template T] [--title "Title"]` | Copies `templates/games/T` to `games/<name>`, fills the namespace/title, fixes relative paths, regenerates the catalog. |
| `templates` | Lists the templates. |
| `new plugin <namespace/name> ["Display Name"]` | New shared plugin in `packages/std/plugins` (wraps `new-plugin.mjs`). |
| `add <plugin-id> --preset <preset.json>` | Adds a plugin (e.g. a mechanic) to a preset, then validates the preset. |
| `validate <preset.json \| --bundled>` | Resolves and activates presets headlessly (`validate-game.mjs`). |
| `graph ...` | The GameGraph CLI (`game-graph.mjs`). |

## Templates

Each template is one plugin (`plugins/game`, rules + presentation), `presets/default.json`, a headless test in `tests/game.test.ts` and an `AGENTS.md` with conventions for coding agents. Every game exposes a `<name>/state` service so tests and tools read state without poking at entities.

| Template | Genre | Uses |
| --- | --- | --- |
| `blank` | Empty 3D scene with a spinning cube | transform, render-sync |
| `platformer` | Side-on run/jump/collect, respawn on fall | + physics (character controller, sensors) |
| `topdown` | Arena: seeded gems, patrolling hazards, lives | + physics |
| `fps` | Mouse look, hitscan raycasts at targets | + physics, raycasts |
| `puzzle` | DOM sliding tiles, always-solvable seeded shuffle | DOM UI only |
| `cards` | DOM memory/pairs game | DOM UI only |

```sh
npm run bulkhead -- create moon-hop --template platformer --title "Moon Hop"
node --test games/moon-hop/tests/*.test.ts
npm run dev   # then open /?preset=moon-hop/default
```

`tests/create-bulkhead.test.ts` scaffolds every template into a temp dir and runs its test, so templates cannot rot.

## `npm create bulkhead`

`packages/create-bulkhead` is the unscoped `create-bulkhead` package on npm, so `npm create bulkhead@latest <name> -- --template <t>`
works anywhere. Inside an engine checkout (cwd upwards, or `--engine <dir>`) it runs that checkout's `bulkhead create`.
Elsewhere it runs `git clone --depth 1 --branch v0.1.0` of the engine into `./<name>` (`--ref <tag|branch>` overrides
the pinned release), `npm ci`, then `bulkhead create`. From a checkout you can also run it directly:

```sh
node packages/create-bulkhead/index.mjs moon-hop --template platformer
```
