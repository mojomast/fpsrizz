# Outcome ratings

`mechanics/outcome-rating` provides `sdk/mechanic-outcome-rating`, a deterministic classifier for explicitly supplied numeric outcome metrics. It has no manifest dependencies or content/config. Real optional consumers are `vehicle/racing` and `board/tactics`; they collect their own metrics and select the provider in the [portfolio racing](../../../../games/racing/presets/portfolio-salt-racing.json) and [tactics](../../../../games/tactics/presets/portfolio-breach-tactics.json) presets.

## SDK contract

Enable the plugin and select `"sdk/mechanic-outcome-rating": "mechanics/outcome-rating"`. Import `outcomeRatingMechanic` from `@bulkhead/sdk` in a plugin; the types and registry are defined in [`outcome-rating.ts`](../../../sdk/src/contracts/outcome-rating.ts).

```ts
const rating = outcomeRatingMechanic(ctx).create(ctx, 'mission-result', {
  tiers: [
    { id: 'bronze', conditions: [{ metric: 'turns', operator: 'at-most', value: 10 }] },
    { id: 'gold', conditions: [
      { metric: 'turns', operator: 'at-most', value: 4 },
      { metric: 'survivors', operator: 'at-least', value: 2 },
    ] },
  ],
});
const tier = rating.evaluate({ turns: 3, survivors: 2 }); // 'gold'
rating.dispose();
```

Definitions have 1–32 uniquely identified tiers, each with 1–32 conditions; IDs and metric names must be nonblank and at most 128 characters, and thresholds finite. Comparisons are inclusive. All conditions in a tier must match; the **last** matching tier wins, or `undefined` if none match. Every referenced metric must be present and finite, even if an earlier tier matches. Invalid definitions and metrics throw.

## Lifetime, tests and limits

Definitions are copied and frozen; instances are owned by consumer and provider, have consumer-local live IDs and release them on disposal. Evaluating a disposed handle throws. The provider does not collect metrics, decide victory, persist records, award rewards or calculate weighted scores. Run `node --test tests/outcome-rating.test.ts`; see the [shared outcome guide](../../../../docs/reference/portfolio-shared-mechanics.md) and [owned instances](../../../../docs/reference/owned-instances.md).
