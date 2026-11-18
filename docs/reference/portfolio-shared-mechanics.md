# Shared outcome ratings

`mechanics/outcome-rating` evaluates ordered, immutable tiers against explicit finite metrics. Each tier has 1–32
conditions, each an inclusive at-most or at-least comparison; the last matching tier wins. It supports 1–32 tiers,
rejects malformed definitions before acquiring identity, and requires every referenced metric on every evaluation.
It does not collect metrics, decide victory, store records, award rewards, or calculate weighted scores.

## Evidence and reuse decision

Discovery: `mechanics/objectives` / `recipe/objective-unlocks` track receipt-deduplicated counters and prerequisites;
`mechanics/progression` / `recipe/experience-levels` accumulate XP on a linear level curve; `recipe/profile-storage`
persists values; `recipe/ordered-rounds` tracks repeated steps. None classifies an already completed outcome from
multiple independent numeric measurements. The new provider fills that gap rather than duplicating these mechanics.

The optional role `sdk/mechanic-outcome-rating` lets `vehicle/racing` report a time-based medal on victory, and
`board/tactics` report a medal based on turns and surviving squad members. Thresholds are currently authored in those
consumers: the race uses fractions of the track limit; tactics uses all survivors and three turns for gold. The game
retains metric collection, success rules, and presentation via Flow. No role preserves the existing results.

The provider factory is resolved lazily on victory, after all plugins have activated, so optional selection needs no
new mandatory activation ordering. Each rating is owned by both the creating game and provider, has a consumer-local
live ID, and is disposed after evaluating. `tests/outcome-rating.test.ts` covers thresholds, invalid input, detached
definitions, lifetime, and end-to-end wins in both real families. Provider and selected role must both be enabled.
