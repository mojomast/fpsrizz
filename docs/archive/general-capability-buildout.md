# General-capability buildout — implementation and verification

Completed **2026-11-16**, following the [general-plugin research](research/general-plugins-2026-11-16.md).
Four parallel agents implemented resource conformance, command queues and deadlines, and evaluated item possession.
A separate read-only integration review found no correctness/ownership blockers; its documentation correction was applied.

## Delivered

| Capability | Implementation / real consumers | Reuse decision |
|---|---|---|
| Resource behavioral conformance | `tests/helpers/resource-conformance.ts`, `tests/helpers/alternate-resources.ts`; default and independent resource implementations; all three existing game substitution routes retained | Reuse `mechanics/resources` and its role contract; parameterize public behavior assertions instead of adding another production algorithm |
| Owned bounded command queues | `createCommandQueue` in `src/sdk/contracts/command-queue.ts`; Stonewake and The Last Light | Extend the SDK with a small owned helper, reusing `SessionControl` and scopes; keep command schemas, legality and drain cadence local |
| Explicit-clock deadlines | `createDeadline` in `src/sdk/contracts/deadlines.ts`; Sky and Verdant | Reuse `mechanics/clock`; extract pollable windows without changing provider interfaces or replacing action cooldowns |
| Agent discovery and authoring | Two new recipes, updated plugin-local metadata, generated inventory and a [design/evidence template](../cookbook/reusable-capability-template.md) | Extend the existing discovery workflow and metadata schema |
| Item possession | [Decision record](item-possession-decision.md) for keys and Story inventory | Retain local collections: only Story implements the proposed multi-item transaction; binary resources do not preserve its order, overlap rules or silent detached replay |

The SDK additions are compatible with SDK 2. Existing game service signatures, plugin selections, content formats and
system IDs remain compatible. The helpers install no systems and add no kernel gameplay concepts.

## Important behavior and evidence boundaries

- Queue acceptance means pending work, not gameplay success. Stonewake drains one command per tick; Story transfers a
  snapshot batch. Normalizers construct detached commands; games retain outcome authority. Observed paused ingress now
  clears pending work immediately, and retained Story services reject ingress after disposal. Entirely unobserved
  pause/resume cycles cannot be inferred from a boolean pause service. See [queue semantics](../reference/command-queues.md).
- Deadlines borrow a seconds/turn clock and never advance or dispose it. Optional initial duration supports paused
  activation; later arm/cancel operations reject pause. The pre/post-migration tests preserve Sky's exact accumulated
  expiry ticks and Verdant's victory → drain → season ordering. See [deadline semantics](../reference/deadlines.md).
- Eleven reusable resource cases run for each implementation; four original integration cases also run with both, and
  partial-kit failure/retry coverage verifies cleanup. Every existing assertion and game route is retained. Independent
  replacement coverage is for resources; other providers use their defaults. Receipt comparisons are per event type,
  and reactive route drivers are not complete recorded replay tapes. See [conformance evidence](../reference/mechanic-conformance.md).
- The extraction centralizes behavioral rules and ownership; it does not claim net source-line reduction. Consumer
  adapters and local policy remain explicit. There is no new general inventory, status-effect or save/restore framework.

## Integrated verification

All commands ran against the integrated workspace using installed Node **22.19.0**. Browser runs used headless Chrome
**153.0.8010.12** with the repository's SwiftShader configuration and the production `dist/` build.

| Check | Actual result | Evidence |
|---|---|---|
| `npm run index-reuse` | 60 plugins, 121 public SDK runtime values, 9 recipes | `docs/reference/reuse-index.md`, `docs/reuse-index.json` |
| `npm run check` | Typecheck, boundaries, inventory freshness; **635 tests passed**, zero failures/skips | `/tmp/opencode/general-capabilities-check.log` |
| `npm run validate-game -- --bundled` | **23 bundled presets staged** | `/tmp/opencode/general-capabilities-validation.log` |
| `npm run build` | Passed | `/tmp/opencode/general-capabilities-build.log` |
| `npm run smoke` | **37/37 checks passed** | `.smoke/smoke-report.json` |
| `node tests/experience-demo/run.mjs` | **5 acceptance groups passed**, no reported browser errors; includes Story completion/save/load and family switching | `.smoke/experience-report.json` |
| `node tests/reusable-games-demo/run.mjs` | **10 acceptance groups passed**, no reported browser errors | `.smoke/reusable-games-report.json` |
| `node games/puzzles/tests/stonewake-demo/run.mjs` | **5 acceptance groups passed**, no reported browser errors | `.smoke/stonewake-report.json` |

Browser command logs use `/tmp/opencode/general-capabilities-{smoke,experience-browser,games-browser,stonewake-browser}.log`.
These results establish automated production-browser coverage; they do not add hands-on pointer-lock or subjective audio
verification. The capability changes do not alter those adapters.

The running local preview at `http://127.0.0.1:4173/` served the same JavaScript bytes as the production build:
SHA-256 **`756c8f84f1dc2af57b98db1847ed0256c323caee21856a5a00955e1f2a58b5b6`** for `dist/assets/main.js`.

## Discovery entry points

```bash
npm run find-reuse -- "bounded command queue"
npm run find-reuse -- --show recipe/bounded-command-queue
npm run find-reuse -- "temporary effect deadline"
npm run find-reuse -- --show recipe/explicit-deadlines
npm run find-reuse -- --show mechanics/resources
```

The recipes link actual consumers and focused tests. Inventory freshness validates references and covered source inputs;
the named contract/composition cases above provide the behavioral evidence.
