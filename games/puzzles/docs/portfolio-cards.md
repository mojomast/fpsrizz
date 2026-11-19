# Ash & Ink and Cloud Cartographer

Two self-contained, deterministic card games use the same selected `sdk/portfolio-card-piles` provider. The card table
uses ordinary focusable buttons (Tab and Enter/Space); the launcher uses a free pointer. Restart is available during play
and after either ending. Both games have fixed 12-card decks and no save or shuffle.

**Ash & Ink:** inscribe the six displayed glyphs in order to break three seals. A matching inscription spends one ink;
transcribe any card for two ink to advance the next glyph. Sacrifice a held card to restore two (up to seven). Win within
eight turns with ink remaining; a wrong matching inscription spends no turn. Transcription can run the ink dry.
The initial winning trace is ash-1, ink-1, ink-2, ember-1; restore ash-3; then ember-2, ash-2.

**Cloud Cartographer:** survey each weather island twice using cards of its weather. Each survey adds one storm; sacrifice
any card to shelter and remove two. A bold survey adds up to two marks at the cost of two storm; even a final bold survey
loses if it reaches storm four. A storm of four or ten turns loses. Plan sacrifices around the weather needed to
complete the chart; one winning route is sun-1, wind-1, rain-1 survey; shelter sun-2; survey wind-2, rain-2; shelter
wind-3; survey sun-3.

Each card shows action consequences before selection, including resource changes and rejected targets. The table shows
remaining draw and discard counts, preserves keyboard focus after hand updates, and supports Tab and Enter/Space as well
as pointer or touch. The table uses pinned Assetrizz archive and forest backdrops and two Ash & Ink sigil illustrations
from `public/assetrizz` (see its provenance); remaining emblems are text/CSS illustrations.
Both bundled card presets also offer an optional **Show a hint** button. Hints reveal progressively on request and
reset when the game state changes; see [portfolio assistance](portfolio-assist.md) for behavior and limitations.

## Shared capability design and evidence

`portfolio-cards/piles` is selected by `sdk/portfolio-card-piles`. Its factory creates isolated, scope-owned partitions
of 1–256 distinct instance IDs. Index zero is the draw top; a positive integral draw moves exactly that many cards or
nothing, and discard moves a held card to the end of discard. Snapshots are frozen detached copies. Invalid definitions
throw before acquiring an ID. Paused or disposed handles reject mutation; disposal releases both scopes and permits ID
reuse. The provider does not shuffle, reshuffle, define card effects or control turns. Both games supply fixed order and
own their rules and outcomes. `games/puzzles/tests/portfolio-cards.test.ts` covers ordered conservation, invalid commands, isolation,
restart and both complete winning and losing routes.

Reuse discovery: `mechanics/inventory` manages item stacks rather than ordered unique draw/hand/discard zones;
`mechanics/sequence` tracks an ordered cursor rather than moving IDs. Neither matches the shared partition contract, so
this pair adds a narrow provider. `createOwnedInstances` handles lifetime and `createCommandQueue` handles pause-aware
command ingress; neither implements game rules. Initial ink, storm, seals and islands remain local, rather than adding
resource or objective kit configuration for these deliberately tiny games. No substitute provider is claimed. The action
previews and the transcribe/bold tradeoffs are family-local rules; `recipe/scoped-input` and
`recipe/bounded-command-queue` inform the focus and pause-aware ingress design.
