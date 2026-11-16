# Experience theme assets

Curated images come from Assetrizz at revision `05339c228f55ac95ad21b5c947db0c6e36207cd4`.
The upstream manifest labels them **original, generated for Kyle Durepos**; this is
provenance, not an MIT license grant. No broader license is asserted here.

`scripts/experience-assets.json` records each source, source hash, crop, orientation,
and output dimensions. `provenance.json` additionally records actual alpha ranges,
upstream frame metadata, output pixel hashes, and generated module hashes.

Run `node scripts/import-experience-assets.mjs --library /path/to/assetrizz` to
reproduce from a checkout, or omit `--library` to fetch only the pinned manifest and
the twelve curated PNGs. Python 3 and Pillow are required. `--check` verifies the
checked-in resized images and regenerates painters in memory without network access.
The generated synchronous palette/RLE painters require no runtime image downloads.

Arcade uses cyan/coral synth imagery; Board uses warm miniature voxel explorers,
chalk golems and stone cover; Story uses indigo ink/watercolor observatory imagery
with a brass key from the hand-painted pack. The synth scooter is a side-view badge;
the gameplay vehicle is explicitly procedural and top-down. The pennant crop removes
a second unrelated fragment in the supplied PNG. Images are single frames, not
animation strips. Audio is original synthesized SoundDef data, not Assetrizz samples
or sampled music loops.
