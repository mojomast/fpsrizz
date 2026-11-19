# Portfolio card table

`portfolio-cards/presentation` renders the shared `PortfolioCards` service as a browser HUD for [Ash & Ink](../portfolio-cards-ash/README.md) and [Cloud Cartographer](../portfolio-cards-cloud/README.md). Its manifest lists both games as optional dependencies, declares the `ui` capability, and supplies no roles, content or config.

## Compose and use

Enable it with **one** card game and a selected piles provider; the complete examples are [`portfolio-cards-ash.json`](../../presets/portfolio-cards-ash.json) and [`portfolio-cards-cloud.json`](../../presets/portfolio-cards-cloud.json). A game must provide the [`PortfolioCards`](../../contracts/portfolio-cards.ts) service even though manifest dependencies are optional. The table reads `state()`, updates when `revision` changes, and sends action IDs and `restart` through `enqueue()`.

The HUD presents instructions, status, hand actions and an announced message. Buttons support keyboard focus and activation, and redraw attempts to retain focus. For example, a game's action ID `play:ash-1` is passed through unchanged; the game decides whether it is legal.

## Ownership, tests and limits

The UI mount, styles, input listener and frame system are session-owned. If `Ui` is absent the plugin returns after resolving the game service. It implements no gameplay or random decisions and does not persist a game. Run `node --test games/puzzles/tests/portfolio-cards.test.ts` for game integration and `npm run build && npm run smoke` for browser acceptance; see the [card guide](../../docs/portfolio-cards.md).
