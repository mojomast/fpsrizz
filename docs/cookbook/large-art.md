# Ship large art without bloating the bundle

Small images can live in a theme plugin as code. Anything bigger than a few kilobytes must not be inlined as base64 in
TypeScript: it lands in the JavaScript bundle and is parsed on every load.

- **Generated painters** (theme pixel art from `scripts/weapon-painters.py`, `scripts/assetrizz.py` and
  `scripts/import-experience-assets.mjs`) keep their pixel data in gzip-compressed, content-hashed files under
  `public/packs/<plugin>/<module>.<hash>.pack`. The TypeScript module only holds the decoder and a top-level
  `await loadStaticAsset('packs/…', { gunzip: true })`, so the data is fetched when the theme's chunk loads.
  The generators call the packer for you; to repack by hand run `npm run pack-painters`.
- **Other static files** (images, audio, JSON) go under `public/` and are copied to `dist/` as is. Load them with
  `loadStaticAsset(path)` from the SDK (relative to the page in the browser, from `public/` under Node tests), or as a
  URL for an `<img>`/texture.
- **Check the cost.** `npm run build` writes `.build/meta.json`, and `npm run budget` (part of `npm run check`) fails
  when initial JavaScript, the largest chunk or total JavaScript exceed the limits in `scripts/bundle-budget.mjs`.
