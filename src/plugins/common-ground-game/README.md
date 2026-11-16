# Common Ground rules

`common/game` validates `hearth-household` content and publishes the `Hearth` service for a deterministic, turn-based
household simulation. Three residents have independent needs, jobs, autonomy and relationships; the household manages
money, an editable lot, furnishings, projects, debt and a neighborhood gathering. See [the game guide](../../../docs/common-ground.md).

## Compose

Use [the bundled preset](../../content/presets/common-ground.json): enable the rules, household content, presentation,
and `mechanics/resources`, `mechanics/clock`, `mechanics/actions`, `mechanics/objectives` and `mechanics/relationships`; select each provider for
its corresponding `sdk/mechanic-*` role. `options.household` selects an installed household. The presentation provides
`sdk/experience` as `common/presentation`.

Consumers read detached `Hearth.state()` observations and enqueue semantic commands through the SDK contract in
[`hearth-sim.ts`](../../sdk/contracts/hearth-sim.ts). Accepted activities advance 30 minutes, while invalid commands
do not. The simulation owns its clock, resource pools, action and objective handles and command queue; it runs headless.
The game is turn-based and has no in-progress save, spatial routing or continuous autonomous clock.
House construction, room zoning, surface finishes and single-square furniture placement use the same owned resource
pool; they are family-specific build rules and do not advance the household clock. Validate occupancy before spending.

## Needs, relationships and work

Each resident's scheduled occupation and personal career progress are independent. A shift with energy or nourishment
below 20 pays 80% and does not advance their career; otherwise every three successful shifts promotes them, up to rank 3,
and each rank adds 10 credits to subsequent pay (including the promotion shift). The existing work-furniture bonus still
applies. Rest and food before the next shift restore the opportunity to progress.

Chat while either participant has energy or comfort below 20 causes an argument (relationship -12) instead of a
successful conversation. Below -20, chat is blocked; both participants need at least 20 energy and comfort to reconcile
for +10. Successful chats add 4. At a score of 30, residents become friends and successful conversations restore 20 connection to each participant instead of 15; dropping below 30 removes that benefit until repaired. At midnight, each pair whose members are both strained loses 8 relationship if either
also has connection below 35. These setbacks never consume money. Successful conversations, not arguments, contribute
to Shared Story. Autonomous residents seek their strongest relationship and attempt reconciliation when necessary;
wait turns also allow the selected resident to take autonomous care actions. The event history reports arguments,
overnight friction, low-needs shifts and promotions. After both guests are greeted, clearing debt or repairing
relationships can still achieve the highest gathering tier.

Run `node --test tests/common-ground-content.test.ts tests/common-ground-simulation.test.ts` and
`npm run validate-game -- --bundled` from the project root.
