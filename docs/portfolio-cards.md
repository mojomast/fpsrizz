# Ash & Ink and Cloud Cartographer

Two self-contained, deterministic card games use the same selected `sdk/portfolio-card-piles` provider. The card table
uses ordinary focusable buttons (Tab and Enter/Space); the launcher uses a free pointer. Restart is available during play
and after either ending. Both games have fixed 12-card decks and no save or shuffle.

**Ash & Ink:** inscribe the six displayed glyphs in order to break three seals. Each inscription spends one ink; sacrifice
a held card to restore two (up to seven). Win within eight turns with ink remaining; a wrong glyph spends no turn.
The initial winning trace is ash-1, ink-1, ink-2, ember-1; restore ash-3; then ember-2, ash-2.

**Cloud Cartographer:** survey each weather island twice using cards of its weather. Each survey adds one storm; sacrifice
any card to shelter and remove two. A storm of four or ten turns loses. Plan sacrifices around the weather needed to
complete the chart; one winning route is sun-1, wind-1, rain-1 survey; shelter sun-2; survey wind-2, rain-2; shelter
wind-3; survey sun-3.

## Shared capability design and evidence

`portfolio-cards/piles` is selected by `sdk/portfolio-card-piles`. Its factory creates isolated, scope-owned partitions
of 1–256 distinct instance IDs. Index zero is the draw top; a positive integral draw moves exactly that many cards or
nothing, and discard moves a held card to the end of discard. Snapshots are frozen detached copies. Invalid definitions
throw before acquiring an ID. Paused or disposed handles reject mutation; disposal releases both scopes and permits ID
reuse. The provider does not shuffle, reshuffle, define card effects or control turns. Both games supply fixed order and
own their rules and outcomes. `tests/portfolio-cards.test.ts` covers ordered conservation, invalid commands, isolation,
restart and both complete winning and losing routes.

Reuse discovery: `mechanics/inventory` manages item stacks rather than ordered unique draw/hand/discard zones;
`mechanics/sequence` tracks an ordered cursor rather than moving IDs. Neither matches the shared partition contract, so
this pair adds a narrow provider. `createOwnedInstances` handles lifetime and `createCommandQueue` handles pause-aware
command ingress; neither implements game rules. Initial ink, storm, seals and islands remain local, rather than adding
resource or objective kit configuration for these deliberately tiny games. No substitute provider is claimed.
