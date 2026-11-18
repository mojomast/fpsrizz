# Cross-genre mechanic reuse: implementation wave

Completed 2026-11-16. Research: `docs/research/reusable-mechanics-2026-11-16.md`.
This file records the agreed contracts, parallel ownership and verified integration results.

## Goal and acceptance

Deliver three new, visibly different 3D games using the **same implemented gameplay plugins**, with demonstrations
of seconds-based and turn-based use, per-consumer ownership, rejected actions without partial spending, replaceable
providers, staged content errors and repeatable disposal/restart. Shared themes alone do not count as mechanic reuse.

## Agreed seam

The authoritative TypeScript interfaces are in `src/sdk/contracts/mechanics.ts`, exported from `src/sdk/index.ts`.

- `mechanics/resources`: atomic bounded multi-resource debit/credit pools, no inventory/spatial/genre assumptions.
- `mechanics/clock`: explicitly advanced seconds or turns; no implicit scheduler system advances a turn clock.
- `mechanics/actions`: declarative resource costs/gains and cooldowns against an injected pool and clock.
- `mechanics/objectives`: bounded progression, prerequisites and idempotent successful receipts.
- `mechanics/kits`: strict `mechanic-kit` content loading and selected-provider registry validation.

Each implementation registers a factory and an exclusive mechanic role under its own plugin ID. A preset selects
`sdk/mechanic-resources`, `sdk/mechanic-clock`, `sdk/mechanic-actions` and `sdk/mechanic-objectives`. Game manifests
require the roles, **not concrete default mechanic implementation IDs**. Their content packs depend on `mechanics/kits`
for the JSON loader. Helpers resolve factories through the existing owner-bound `ctx.instantiate`; factories create
separate handles tied to each consumer scope. Alternate implementations can be selected without editing a game plugin.
The additive manifest `roleDependencies` field opts into generic role-aware session activation ordering: selected
provider owners activate before their consumers, regardless of plugin names. Existing `requiresRoles` remains a
selection requirement only (the shooter world/mode graph needs this distinction). Registration retains its concrete
dependency order. Cycles among explicit role dependencies fail staging before commit. Factories keep the existing
owner-bound instantiation semantics.

`createMechanicKit(ctx, definitionId, instanceId)` assembles all four. Games validate spatial/target legality in their own
simulation, call `actions.execute`, then commit local outcomes; presentation only queues commands. All mutation is
synchronous. Shared providers validate inputs and reject stale/paused writes when `SessionControl` is available.
Resource credits reject overflow, so games must check capacity or choose a smaller credit before collecting.

Factory instance IDs are namespaced by consumer plugin and type; duplicate live IDs are developer errors. Handles
dispose idempotently, reject writes after either consumer/provider disposal, and are independently usable. Definitions
are copied/frozen, snapshots detached, events emitted after commit with owner and instance IDs. Queueing belongs to
game authorities, not hidden global mechanic queues.

## New games and overlap

| Game / preset | Genre | Resources/actions | Clock | Objectives |
|---|---|---|---|---|
| Sky Salvage / `sky/salvage` | Real-time drone courier/recovery | Energy, cargo, hull; boost, repair, unload | seconds | Deliver supplies to distinct beacons |
| Ember Bastion / `ember/bastion` | Real-time tower defense/building | Scrap, core integrity; build, repair, pulse, independent tower fire | seconds | Defend authored waves |
| Verdant Relay / `verdant/relay` | Turn-based colony restoration | Water, biomass, charge; harvest, convert, restore | turns | Restore the island relays |

The games have separate presentation, content, controls, winning/losing routes, restart and headless suites. Their lit
3D models are original procedural geometry; Sky also uses the selected board theme's pinned floor painter. They share
the implemented resource/cooldown/objective algorithms and do not enable the original shooter/family authorities.

## Parallel file ownership

- Coordinator: SDK contracts/exports, catalog wiring, top-level docs, integration and browser acceptance.
- Foundation agent: `src/plugins/mechanics-{resources,clock,actions,objectives,kits}/`, `tests/mechanics*.test.ts`,
  `docs/reusable-mechanics.md`. Report contract changes before making them.
- Host agent: generic selected-role activation ordering in the kernel and focused host lifecycle tests.
- Sky agent: `src/plugins/sky-{game,presentation,content}/`, `games/sky/contracts/sky.ts`,
  `games/sky/presets/sky-salvage.json`, `games/sky/tests/sky-salvage.test.ts`, `docs/sky-salvage.md`.
- Ember agent: corresponding `ember-{game,presentation,content}`, `contracts/ember.ts`, `ember-bastion.json`,
  `games/ember/tests/ember-bastion.test.ts`, `docs/ember-bastion.md`.
- Verdant agent: corresponding `verdant-{game,presentation,content}`, `contracts/verdant.ts`, `verdant-relay.json`,
  `games/verdant/tests/verdant-relay.test.ts`, `docs/verdant-relay.md`.
- Research agent: `docs/research/reusable-mechanics-2026-11-16.md`.

Do not edit another owner's files. No concurrent production builds or heavy browser suites; coordinator sequences them.
Redirect full checks to unique files under `/tmp/opencode` to avoid transport overflow. Run `npm run check` after edits;
report integration failures caused by in-progress shared files rather than weakening rules/tests.

## Integration proof

1. Stage every bundled preset; both old and new graphs must activate headlessly.
2. Run same resource/action/objective contract tests with multiple owners and both time domains.
3. Replace at least one mechanic role provider in a composed new game without changing its code.
4. Verify each game actually commits shared actions/progression through owner-tagged events and shared resource state.
5. Complete all three games in production browser, test rejection/pause/restart and cross-game ownership counts.
6. Run repository check, production build, reference smoke and creator acceptance if creator code changes.
7. Record results and remaining limitations; update architecture system tables, SDK/content guides and playable links.

## Verified delivery

- `npm run check`: strict typecheck, boundary lint and **570 tests passed**.
- `npm run validate-game -- --bundled`: all **23 presets staged** successfully.
- `npm run build`: production bundle built successfully.
- `npm run smoke`: **37/37 checks passed**, including reference-game completion and repeated ownership cycles.
- `node tests/reusable-games-demo/run.mjs`: **10 acceptance groups passed**, completing all three games through
  keyboard/HUD input and accelerated real simulation ticks. Covered defeat/replay, pause ingress, Sky held direction
  controls, Ember/Verdant 3D picking, all picking targets visible at 1280×720, 800×600 and 390×844, and two shooter
  switching cycles per game with identical owned-resource counts. No browser/network errors or pointer-lock requests.
- Inspected screenshots and corrected Ember phone camera/header framing and Verdant's status overlay blocking replay.
- `tests/reusable-games.test.ts`: removed the default resource plugin and completed every route with an independent
  late-sorting selected provider. Final authoritative states and all owner-tagged resource/action/objective receipts
  matched. Ember emitted 67 shared fire commits across independent towers; Verdant action timestamps were exactly 0–7.
- The Tailscale production preview at `https://mail.tailec998.ts.net:8447/` serves the matching local bundle, verified by
  SHA-256. JavaScript hash: `65a31abd1d09b5ea24f87a8db8e44fd9547a637aaeeb6be07fad2b807a57f2f7`.

Reports: `.smoke/reusable-games-report.json`, `.smoke/smoke-report.json`; screenshots: `.smoke/reuse-*.png`.
Logs: `/tmp/opencode/reuse-final-check.log`, `reuse-final-build.log`, `reuse-final-smoke.log`, `reuse-browser3.log`,
`reuse-validation.log` in the same directory.

Scope: these are complete small scenarios with session-only progression. The replacement provider is a test fixture.
The shared transaction covers resources and action cooldown, not rollback of arbitrary game-local effects. Existing
families have not all been migrated to these providers. Browser verification used headless Chrome/SwiftShader;
hands-on pointer-lock/audio review from the earlier wave remains separate. No public GitHub Pages deployment was made.
