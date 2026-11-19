# std/assets

Provides `sdk/models`: glTF/GLB models loaded through the host asset service (`sdk/assets`), decoded with the official
Three.js GLTFLoader + Meshopt decoder + KTX2 transcoder, with geometry/materials/textures shared between instances.
Add it to any preset whose `Renderable`s use `model`. See [assets reference](../../../../docs/reference/assets.md).
