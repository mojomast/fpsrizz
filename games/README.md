# Game families

Each folder is one game family, kept apart from the engine so a new prototype does not drag the others along:

```
games/<family>/
  README.md        player and author guide
  docs/            extra guides (optional)
  contracts/       family-only SDK vocabulary (services, registries, events); not exported by packages/sdk/src/index.ts
  plugins/<name>/  manifest.json + index.ts (code) or content.json (data pack), README.md, reuse.json
  presets/         preset JSON files (listed in src/app/catalog.ts)
  tests/           node:test suites, run by npm test
```

Rules (enforced by `npm run lint`): a game plugin imports only its own folder, `packages/sdk/src/index.ts`, `packages/sdk/src/render.ts`
(with the `render` capability) and its own family's `contracts/`. Contracts import only the SDK entry point and their
own family. Engine code never imports `games/`; only the `src/app` composition root (catalog and preset list) does.
Plugins are discovered automatically (`npm run gen-catalog`).

| Family | Game(s) | Guide |
|---|---|---|
| [`shooter`](shooter/) | The 2.5D shooter reference game and its extensions | [README](shooter/README.md) |
| [`racing`](racing/) | Neon Run plus the Copper and Salt portfolio circuits | [README](racing/README.md), [portfolio](racing/docs/portfolio-racing.md) |
| [`tactics`](tactics/) | Signal Break plus the Breach and Crossfire scenarios | [README](tactics/README.md), [portfolio](tactics/docs/portfolio-tactics.md) |
| [`adventure`](adventure/) | The Last Light plus the Archive and Orchard adventures | [README](adventure/README.md), [portfolio](adventure/docs/portfolio-adventures.md) |
| [`puzzles`](puzzles/) | Stonewake, the Atelier and Watch puzzles, the Ash and Cloud card games, and their assist | [README](puzzles/README.md) |
| [`sky`](sky/) | Sky Salvage (drone courier) and its portfolio resource scenario | [README](sky/README.md) |
| [`verdant`](verdant/) | Verdant Relay (colony restoration) and its portfolio resource scenario | [README](verdant/README.md) |
| [`ember`](ember/) | Ember Bastion (tower defense) | [README](ember/README.md) |
| [`cinder`](cinder/) | Cinder Vault (roguelite shooter) | [README](cinder/README.md), [classes](cinder/docs/classes.md) |
| [`hollowmere`](hollowmere/) | Hollowmere (metroidvania) | [README](hollowmere/README.md) |
| [`sandbox`](sandbox/) | Physics sandbox: the SDK 3 reference composition (Transform3D, render sync, Rapier) | [README](sandbox/README.md) |
| [`expeditions`](expeditions/) | The Silt Archive, The Salt Ledger, Common Ground, plus the shared expedition assist | [README](expeditions/README.md) |

Cross-family guides: [ten-game portfolio](../docs/games/ten-game-portfolio.md) and
[portfolio resource games](../docs/games/portfolio-resource-games.md).

What stays in `src/`: shared mechanics (`mechanics-*`), presentation (`presentation-*`), themes (`theme-*`, used by
several families) and `dungeon-generator`. The shooter's contract stays in `games/shooter/contracts/shooter.ts` (see
[shooter](shooter/README.md)); every other remaining contract there is shared vocabulary (experience, audio,
mechanics, navigation, platforming, room map and so on). See
[docs/cookbook/new-game-family.md](../docs/cookbook/new-game-family.md) to start a family.
