# Deploy and export

`npm run build` writes a static site to `dist/` with relative URLs only, so it runs from any folder or host.

## GitHub Pages

`.github/workflows/deploy-pages.yml` builds (`npm ci`, `npm run check`, `npm run build`) and publishes `dist/` with
the official Pages actions. It runs **only on manual dispatch**: Actions → *Deploy to GitHub Pages* → *Run workflow*,
optionally with a branch, tag or SHA.

One-time setup: repository Settings → Pages → Source: **GitHub Actions**. This replaces publishing from the old
`gh-pages` branch; leave that branch alone until the first workflow deploy is verified.

## itch.io

```sh
npm run export:itch                         # zip the current dist/ -> .export/bulkhead-itch.zip
npm run export:itch -- --build              # build first
npm run export:itch -- --preset sandbox/physics   # the zip boots straight into one preset
```

The script checks itch.io's HTML5 rules (index.html at the zip root, no root-relative URLs, ≤ 1000 files, each file
< 200 MB) and skips source maps. Upload the zip as an HTML project and tick "This file will be played in the browser";
1280×720 with "Fullscreen button" works well. The game loads assets relative to `index.html`, so itch's subfolder
hosting needs no changes.

`.github/workflows/deploy-itch.yml` (manual dispatch only) builds the zip, attaches it to the run as an artifact, and,
if the repository secret `BUTLER_API_KEY` exists, pushes it with butler to the `user/game:channel` you enter.

## Not done yet

- PWA (offline install) and a Tauri desktop wrapper from the roadmap are not implemented.
