# Ordered card piles

`portfolio-cards/piles` provides the `sdk/portfolio-card-piles` role and `CardPilesProviders` factory. It has no manifest dependencies or content/config. The real consumers are [Ash & Ink](../portfolio-cards-ash/README.md) and [Cloud Cartographer](../portfolio-cards-cloud/README.md); both select this provider in their bundled presets.

## Contract and composition

Enable `portfolio-cards/piles` and select `"sdk/portfolio-card-piles": "portfolio-cards/piles"`; see [`portfolio-cards-ash.json`](../../content/presets/portfolio-cards-ash.json). From a session context, use the SDK exports in [`portfolio-cards.ts`](../../sdk/contracts/portfolio-cards.ts):

```ts
const piles = cardPilesMechanic(ctx).create(ctx, 'example', ['sun-1', 'rain-1']);
piles.draw(1);       // moves sun-1 to hand
piles.discard('sun-1');
const state = piles.snapshot(); // detached, frozen draw/hand/discard arrays
piles.dispose();
```

Import `cardPilesMechanic` from `../../sdk/index.ts` in a plugin. `create(owner, id, cards)` requires 1–256 unique nonblank string IDs, each at most 128 characters; bad input throws. Draw takes a positive safe integer and moves exactly that many cards from the front or fails without mutation. Discard moves a held ID to the end of discard; both return `{ ok, reason }`.

## Lifetime, tests and limits

Instances are consumer-local, owned by both consumer and provider, and release their live ID on disposal. Mutation is rejected while disposed or when `SessionControl.playing` is false. Order is deterministic; there is no shuffle, reshuffle, card effect, turn policy or automatic refill. The consumer owns those rules. Run `node --test tests/portfolio-cards.test.ts`; see the [card guide](../../../docs/games/portfolio-cards.md) and [owned instances](../../../docs/reference/owned-instances.md).
