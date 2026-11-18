# std/transform

Keeps `PrevTransform` one tick behind `Transform3D` (SDK 3) so renderers can interpolate. Add it to any preset that
uses `Transform3D`; `std/render-sync` and `std/physics-rapier` expect it. Do not move transforms in the `input`
phase. After a teleport call `snapTransform(ctx.world, e)` to skip interpolation for that frame. See
[spatial reference](../../../docs/reference/spatial.md).
