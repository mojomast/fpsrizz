# Game families

Each folder is one game family, kept apart from the engine so a new prototype does not drag the others along:

```
games/<family>/
  README.md        player and author guide
  docs/            extra guides (optional)
  contracts/       family-only SDK vocabulary (services, registries, events); not exported by src/sdk/index.ts
  plugins/<name>/  manifest.json + index.ts (code) or content.json (data pack), README.md, reuse.json
  presets/         preset JSON files (listed in src/app/catalog.ts)
  tests/           node:test suites, run by npm test
```

Rules (enforced by `npm run lint`): a game plugin imports only its own folder, `src/sdk/index.ts`, `src/sdk/render.ts`
(with the `render` capability) and its own family's `contracts/`. Contracts import only the SDK entry point and their
own family. Engine code never imports `games/`; only the `src/app` composition root (catalog and preset list) does.
Plugins are discovered automatically (`npm run gen-catalog`).

| Family | Game(s) | Guide |
|---|---|---|
| [`sky`](sky/) | Sky Salvage (drone courier) | [README](sky/README.md) |
| [`verdant`](verdant/) | Verdant Relay (colony restoration) | [README](verdant/README.md) |
| [`ember`](ember/) | Ember Bastion (tower defense) | [README](ember/README.md) |
| [`cinder`](cinder/) | Cinder Vault (roguelite shooter) | [README](cinder/README.md), [classes](cinder/docs/classes.md) |
| [`hollowmere`](hollowmere/) | Hollowmere (metroidvania) | [README](hollowmere/README.md) |
| [`expeditions`](expeditions/) | The Silt Archive, The Salt Ledger, Common Ground, plus the shared expedition assist | [Silt](expeditions/docs/silt-archive.md), [Salt](expeditions/docs/salt-ledger.md), [Common Ground](expeditions/docs/common-ground.md), [assist](expeditions/docs/expedition-assist.md) |

Not moved yet: the shooter reference game and its examples (their `shooter` contract is shared by about 40 plugins, the
app and the render SDK), and the racing, tactics, adventure, puzzle and portfolio games (their contracts are shared
with portfolio variants). See [docs/cookbook/new-game-family.md](../docs/cookbook/new-game-family.md) to move or start one.
