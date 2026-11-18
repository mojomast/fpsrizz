# shooter/transform3d

Optional SDK 3 adapter for the planar shooter: every entity with the shooter's `Transform` also gets a
`Transform3D` (y = 0 unless you set it) and a matching `PrevTransform`, updated at the end of each tick. Add it with
`std/render-sync` to draw extra `Renderable`s on shooter entities, or with `std/physics-rapier` to give them
sensors. The planar `Transform` stays the source of truth; writes to the mirrored Transform3D's x, z or rotation are
overwritten. It is safe alongside `std/transform`, which rewrites PrevTransform at tick start to the same pose.
