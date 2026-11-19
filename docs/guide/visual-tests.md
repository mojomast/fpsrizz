# Visual regression and cross-browser tests (P3.3)

`npm run test:visual` takes one golden screenshot per genre template (`templates/games/*`) plus a few built-in
presets (`sandbox/physics`, `sandbox/navmesh`, `core/default`, `ember/bastion`) and compares them with Playwright
[`toHaveScreenshot`](https://playwright.dev/docs/test-snapshots).

How it works (`scripts/visual.mjs`):

1. Scaffolds every template into `games/zz-visual-<template>/` (gitignored), exactly like `bulkhead create`.
2. Builds the app with them into `.build/visual-dist/` (`DIST_DIR`; the bundle budget is reported, not enforced).
3. Removes the scaffolds and regenerates the catalog, so the working tree is unchanged.
4. Runs `tests/visual/scenes.spec.mjs`. Each case loads the page with `?test=&touch=0`, applies the preset, plays,
   then holds the simulation (`sim.pause` / `sim.step`) at tick 60 so the frame is deterministic, and screenshots it.

Goldens live in `tests/visual/__screenshots__/<project>-<platform>/`. Rendering is software WebGL2 (SwiftShader in
Chromium) so goldens do not depend on a GPU. Tolerances: `maxDiffPixelRatio: 0.02`, per-pixel `threshold: 0.25`.

```sh
npm run test:visual                                   # all three projects (needs firefox + webkit installed)
npm run test:visual -- --project=chromium
npx playwright install --with-deps firefox webkit     # once, for the other engines
npm run test:visual -- --project=firefox --update-snapshots=missing
npm run test:visual -- --update-snapshots             # after an intended visual change; review the PNG diff in the PR
```

Failures write `actual`/`expected`/`diff` PNGs to `.build/visual-results/` and an HTML report to
`.build/visual-report/`.

CI: the `visual` job runs a matrix of chromium/firefox/webkit and uploads the report and goldens as `visual-<project>`
artifacts. It is non-blocking (`continue-on-error`) for now. Only chromium-linux goldens are committed; Firefox and
WebKit goldens are bootstrapped by CI with `--update-snapshots=missing` — download the artifact, review the images and
commit them to make those projects compare too. (With `missing`, Playwright still marks a case whose golden it
just wrote as failed; the rerun passes.) Font rendering can differ between a local machine and the hosted
runner; if the chromium job reports small text-only diffs, regenerate the chromium goldens from the CI artifact.

Add a case: append to `cases` in `tests/visual/scenes.spec.mjs`, run with `--update-snapshots`, and commit the PNG.
