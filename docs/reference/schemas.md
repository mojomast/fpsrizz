# JSON Schemas for data files

Every engine data format has a JSON Schema (draft 2020-12) in [`schemas/`](../../schemas). Editors use them for
autocomplete and inline errors; `npm run check` validates every tracked JSON file against them.

| Schema | Files |
| --- | --- |
| [`plugin-manifest`](../../schemas/plugin-manifest.schema.json) | `**/manifest.json` (plugins, content packs, `templates/plugin-starter`) |
| [`preset`](../../schemas/preset.schema.json) | `games/*/presets/*.json` |
| [`reuse`](../../schemas/reuse.schema.json) | `**/reuse.json` |
| [`content-pack`](../../schemas/content-pack.schema.json) | `**/content.json` (the `{ kind, id, data }` envelope) |
| [`replay`](../../schemas/replay.schema.json) | `**/*.replay.json` |
| [`models`](../../schemas/models.schema.json) | `assets/models.json` |
| [`reuse-recipes`](../../schemas/reuse-recipes.schema.json) | `docs/reuse-recipes.json` |
| [`game-graph`](../../schemas/game-graph.schema.json) | GameGraph v1 exports from the composer |
| [`snapshot`](../../schemas/snapshot.schema.json) | quicksaves / `host.snapshot()` output |

- **`$schema` in every object file.** Each covered file starts with a relative `"$schema"`, which VS Code and most
  JSON editors follow. The runtime ignores the key. `content.json` files are arrays and cannot carry `$schema`;
  `.vscode/settings.json` (`json.schemas`) maps them, and every other format, by file pattern.
- **Commands.** `npm run schemas` validates (also in `npm run check`). `npm run schemas -- --write` adds or fixes
  `$schema` references and regenerates the VS Code mapping. A JSON file no schema covers fails the check until it
  is added to `SCHEMA_MAP` or the tool-file list `NOT_DATA` in `scripts/schemas.mjs`.
- **Schemas describe shape; TypeScript keeps the semantics.** Dependency resolution, semver ranges, config default
  types, role providers, content-kind `data` and reuse entry points are still checked by the kernel and
  `scripts/reuse-lib.mjs`. The schemas are hand-written next to those validators; tests keep both in agreement on
  every committed file.
