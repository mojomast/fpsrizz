# create-bulkhead

Scaffold a game for the [Bulkhead engine](https://github.com/mojomast/fpsrizz) from a genre template.

```sh
npm create bulkhead@latest my-game -- --template fps
cd my-game && npm run dev          # then open /?preset=my-game/default
```

Templates: `blank`, `platformer`, `topdown`, `fps`, `puzzle`, `cards`. Each ships a plugin, a preset, headless
tests and an `AGENTS.md` for coding agents.

- **Inside an engine checkout** (the current folder or a parent has `scripts/scaffold-lib.mjs`), or with
  `--engine <dir>`, the game is added as `games/<name>/` using that checkout's scaffolder.
- **Anywhere else** the engine is cloned into `./<name>` (`git clone --depth 1`, `--ref <tag|branch>` to pin), installed
  with `npm ci` (skip with `--no-install`), and the game is added inside it.
- `--dry-run` prints the steps without running them.

Requires Node 22.18+ and git. Full guide: `docs/guide/bulkhead-cli.md` in the engine repository.
