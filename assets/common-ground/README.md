# Common Ground cottage visuals

Eight visually reviewed Assetrizz originals, copied byte for byte to `public/assetrizz/`.
The complete source paths, source/output SHA-256 hashes, dimensions and manifest pivots
are in [provenance.json](provenance.json). All are 384 × 384 RGBA PNGs, non-tileable,
with source metadata pivot (0.5, 1). No resizing, cropping or re-encoding is performed.

The source is `https://github.com/mojomast/assetrizz` at revision
`05339c228f55ac95ad21b5c947db0c6e36207cd4`, with manifest SHA-256
`7bd35841acdb06c6b21bd882718d7eb63ad936433c383afa8e301ebf3e816e33`.
The manifest describes the license as **“original, generated for Kyle Durepos”**;
this is not a general public license grant. Confirm permission for intended distribution
and derivatives. The repository's code license does not establish image rights.

## Review and integration

| URL under `/assetrizz/` | Review / suggested use |
| --- | --- |
| `common-ground-bed.png` | Ornate curtained four-poster, pale green bedding; a readable sleep target, but artwork touches the top and bottom of the canvas. |
| `common-ground-simple-bed.png` | Modest single bed in a three-quarter view, better suited to everyday housing. |
| `common-ground-hutch.png` | Warm wooden kitchen hutch with crockery and plant; nearly frontal and contains baked-in props. |
| `common-ground-dining-table.png` | Bare wooden table viewed from above and the side, useful for meals. |
| `common-ground-cooking-pot.png` | Lidded dark metal pot, more realistic and darker than the furniture; reads as a prop, not a stove. |
| `common-ground-armchair.png` | Cream upholstered chair, useful for a living area. |
| `common-ground-bookshelf.png` | Nearly frontal wooden shelving with books and plant already drawn in. |
| `common-ground-wooden-chair.png` | Three-quarter wooden chair compatible with the dining table's palette. |

These are individual static images with transparent margins, not a matched animation or
rotation set. The frontal bed, hutch and bookshelf differ in viewpoint from the three-quarter
table and chair. Use as stylized dollhouse illustrations rather than promising exact isometric
alignment; verify occlusion and apparent scale in the actual scene. The canvas pivot is
metadata, not a measured physical footprint, and object sizes should be tuned independently.
Keep gameplay IDs, interaction labels, hit areas and depth ordering separate from file paths;
reserve dimensions when loading and provide text equivalents for meaningful objects. No
resident sprites are included.

## Reproduce / verify

From the repository root, with Python 3 and network access:

```sh
python3 scripts/common-ground-assets.py import
python3 scripts/common-ground-assets.py check
```

`import` downloads the pinned manifest and sources, validates manifest hash, each record's
hash, dimensions, license, pivot and tileability, and validates the PNG header and source
bytes before writing the copies. An upstream checkout containing `assets/manifest.jsonl`
and the original PNG tree can instead be supplied with `import --library /path/to/assetrizz`.
`check` works offline and verifies output PNG headers, dimensions and hashes against the
recorded identical source hashes. Importing again intentionally replaces only the eight
`common-ground-*` files listed in the provenance document.
