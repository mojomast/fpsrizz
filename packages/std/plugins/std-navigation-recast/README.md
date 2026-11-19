# std/navigation-recast

Navmesh navigation for non-grid 3D worlds on [recast-navigation-js](https://github.com/isaac-mason/recast-navigation-js)
(Recast + Detour, WASM). Provides the `NavMesh` service and walks `NavAgent` entities. Builds from static box
colliders on the first tick unless `autoBuild` is off. See [docs/reference/navmesh.md](../../../../docs/reference/navmesh.md).
