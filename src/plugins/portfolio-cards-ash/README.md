# Ash & Ink

`portfolio-cards/ash` is a deterministic glyph-seal game and the `sdk/experience` provider of the same ID. Its manifest requires `sdk/experience` and `sdk/portfolio-card-piles`, with an activation-time role dependency on piles. It has no content files or plugin config.

## Play and compose

Use [`portfolio-cards-ash.json`](../../content/presets/portfolio-cards-ash.json): enable `portfolio-cards/piles`, `portfolio-cards/ash` and `portfolio-cards/presentation`; select `sdk/experience: portfolio-cards/ash` and `sdk/portfolio-card-piles: portfolio-cards/piles`. The experience uses a free pointer. Inscribe six glyphs in order to break three seals; each matching inscription costs one ink. Transcribe any card for two ink, or sacrifice a card to restore two up to seven. Finish in eight turns with ink remaining. Wrong matching inscriptions cost no turn.

The SDK [`PortfolioCards`](../../sdk/contracts/portfolio-cards.ts) service exposes `state()` and `enqueue(command)`. Action IDs in the state use `play:<card>`, `transcribe:<card>` and `restore:<card>`; `restart` starts a fresh duel. For example, after the initial hand is drawn, `enqueue('play:ash-1')` requests the first inscription. Commands enter a bounded queue and are processed in the control phase; the runtime checks legality.

## Ownership, tests and limits

The game owns its pile instance, command queue and state through the session; restart disposes the old pile. Initial drawing waits until play is allowed. The 12-card deck is fixed: no shuffle or save. It supplies rules and state, not a card-table UI; the presentation plugin is optional to headless use. Run `node --test tests/portfolio-cards.test.ts`; see the [card guide](../../../docs/portfolio-cards.md) for complete winning and losing routes.
