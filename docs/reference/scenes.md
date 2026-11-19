# Prefabs, scenes and level import (SDK 3, P2.4)

Enable `std/scene` (and `std/transform`; `std/physics-rapier` for bodies) and describe entities as data. The format is
modelled on Godot's `.tscn`: small, diff-friendly JSON that people and agents can edit by hand.

## Prefabs

```json
{ "kind": "prefab", "id": "game/block", "data": { "components": { "renderable": { "shape": "box", "color": "#336699" }, "game/tag": { "hp": 3 } } } }
{ "kind": "prefab", "id": "game/crate", "data": { "extends": "game/block", "components": { "body": { "type": "dynamic" }, "collider": { "shape": "box" } } } }
```

- `components` maps a component id (`"game/coin"`) or an alias to its data. Aliases: `transform` (a scene transform used as the default pose), `renderable`, `body` (RigidBody), `collider` (PhysicsCollider), `character` (CharacterController).
- `extends` names a base prefab. Components merge base-first: objects merge key by key, other values replace, `null` removes a component.
- `children` are scene nodes spawned under every instance.
- Renderable colours may be `"#rrggbb"` strings.

## Scenes

```json
{ "kind": "scene", "id": "game/room", "data": { "nodes": [
  { "prefab": "game/crate", "name": "crate-a", "transform": { "position": [2, 0.5, 0] }, "overrides": { "renderable": { "color": "#ff0000" } } },
  { "name": "shelf", "transform": { "position": [0, 2, -3], "rotation": [0, 90, 0] }, "children": [ { "prefab": "game/block", "props": { "title": "Atlas" } } ] }
] } }
```

Node fields: `prefab`, `name`, `transform` (`position` [x,y,z]; `rotation` Euler degrees [x,y,z] in YXZ order or a quaternion [x,y,z,w]; `scale` number or [x,y,z]), `overrides` (deep-merged into the prefab's components), `props` (free-form data) and `children`.

```ts
import { spawnScene, spawnSceneFile, SceneNodeInfo } from '../../src/sdk/index.ts';
const { root, byName, entities } = spawnScene(ctx, 'game/room', { at: pose });
await spawnSceneFile(ctx, 'levels/room.scene.json'); // standalone file through the asset service
```

Every spawned entity gets `SceneNodeInfo { name, prefab?, scene?, props? }`. Entities with a body or collider are spawned in world space (Rapier bodies cannot be parented); a collider without a body gets a fixed body. Standalone files named `*.scene.json` / `*.prefab.json` are checked by `schemas/scene.schema.json` / `schemas/prefab.schema.json` (`npm run schemas`).

## Tiled and LDtk

Paste the editor's JSON export into a content entry (or call `importTiled` / `importLdtk` yourself and `spawnScene` the result):

```json
{ "kind": "tiled-map", "id": "game/level-1", "data": { "map": { "...": "Tiled JSON" }, "cellSize": 1, "plane": "xz", "tiles": { "wall": "game/wall" }, "objects": { "player": "game/player" } } }
{ "kind": "ldtk-level", "id": "game/world", "data": { "project": { "...": "LDtk JSON" }, "level": "Level_0", "entities": { "Player": "game/player" }, "intGrid": { "Collision.wall": "game/wall" } } }
```

- `plane: "xz"` (default) is top-down: editor y runs along +z. `plane: "xy"` is side-on: editor y runs down -y and the bottom row sits at y = 0. One editor cell is `cellSize` metres.
- Mapping: Tiled tiles by class/type, `"<tileset>:<local id>"` or gid; Tiled objects by class/type or name; LDtk entities by identifier; IntGrid cells by `"<layer>.<value identifier>"`; LDtk tiles by `"<layer>.<tile id>"`. A custom property / field named `prefab` set in the editor wins over the tables.
- Other custom properties go to `props`; properties whose name is a component id (`"game/team"`, JSON strings parsed) become overrides. Each layer (and LDtk level) becomes a group node.
- Unmapped things are counted in the importer's `unmapped` result and skipped, so you can map a level gradually.
- Limits: orthogonal Tiled maps with CSV/array data and embedded tilesets; LDtk projects with embedded levels. Flip flags are ignored; one entity per tile.

## glTF

A glTF node whose `prefab` extra names a registered data prefab gets that prefab's components (its own transform and mesh are kept). Otherwise `prefab` still names a `RenderablePrefabs` factory. See [assets.md](assets.md).
