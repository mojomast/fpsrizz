# Cloud Cartographer

`portfolio-cards/cloud` provides the `sdk/experience` role for a deterministic weather-card expedition. Its manifest requires `sdk/experience` and `sdk/portfolio-card-piles`, including an activation-time dependency on the piles role. There are no content files or plugin config.

## Play and compose

Use [`portfolio-cards-cloud.json`](../../content/presets/portfolio-cards-cloud.json): enable `portfolio-cards/piles`, `portfolio-cards/cloud` and `portfolio-cards/presentation`; select `sdk/experience: portfolio-cards/cloud` and `sdk/portfolio-card-piles: portfolio-cards/piles`. The experience uses a free pointer. Survey each of three weather islands twice. Each survey raises storm by one; a bold survey adds up to two marks and raises storm by two. Sacrifice a card to shelter and lower storm by two. Storm four or ten turns ends the expedition.

The SDK [`PortfolioCards`](../../sdk/contracts/portfolio-cards.ts) service exposes `state()` and `enqueue(command)`. State action IDs use `survey:<card>`, `bold:<card>` and `shelter:<card>`; `restart` begins again. For example, once the first hand is drawn, `enqueue('survey:sun-1')` requests a sun survey. Commands enter a bounded queue and execute in the control phase with game-side legality checks.

## Ownership, tests and limits

The session owns the pile, queue and game state; restart disposes the prior pile. Initial draw waits until play is allowed. The 12-card deck is fixed, with no shuffle or save. Rules and state can run headlessly; browser UI is supplied separately. Run `node --test tests/portfolio-cards.test.ts`; the [card guide](../../../docs/games/portfolio-cards.md) gives a full winning route.
