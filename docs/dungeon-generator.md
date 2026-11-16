# Seeded dungeon rooms

`dungeon/generator` registers the shooter-family map format `dungeon/generator`. A recipe produces one bounded
`WorldDescription` containing one to three isolated dungeon wings. Each wing has interconnected rooms, corridors, room
markers, lights and a descent pad. The consuming game decides what spawns, what opens the descent and how a party moves
between wings.

This is intentionally **not** a runtime map loader. It lets a game keep one immutable world for the session while making
three large dungeon levels out of separate wings and teleporting between their markers.

## Recipe

```json
{
  "kind": "map",
  "id": "cinder/depths",
  "data": {
    "schema": 1,
    "format": "dungeon/generator",
    "name": "The Cinder Depths",
    "seed": 27841,
    "cellSize": 2,
    "wallHeight": 4,
    "floorWidth": 30,
    "floorHeight": 30,
    "gap": 2,
    "floors": [
      { "name": "The Ash Gate", "rooms": 7 },
      { "name": "The Hollow Court", "rooms": 8 },
      { "name": "The Cinder Sanctum", "rooms": 9 }
    ],
    "markerPrefab": "dungeon/marker",
    "surfaces": {
      "border": "wall-brick", "wall": "wall-panel", "room": "floor-concrete",
      "corridor": "floor-plate", "ceiling": "ceiling-panel"
    },
    "ambient": { "color": "#c9b89b", "intensity": 0.9 },
    "fog": { "color": "#241e1b", "near": 8, "far": 46 },
    "torch": { "color": "#ffbc64", "intensity": 1.5, "distance": 12 }
  }
}
```

`floors` is 1..3. Each floor has 4..12 rooms. `floorWidth`/`floorHeight` are 18..48, `gap` is 1..4, and the resulting
map must fit within the 96-cell `core/grid` limit per dimension. Example widths: three 30-cell wings with 2-cell gaps
produce a 94×30 map. A layout is deterministic for its seed. The map format emits an inner border and solid void between
wings, so wings are not accidentally connected.

## Rooms and markers

The generator divides each wing into a slot grid, places a non-overlapping room inside each used slot, carves
single-cell L-corridors through a nearest-room spanning tree, and may add one extra loop. It then selects the farthest
room pair as start/exit and the room farthest from the start (excluding the exit) as the warden room.

Every room receives an inert spawn marker using `markerPrefab` (default `dungeon/marker`, registered by this plugin):

| Tag | Meaning |
|---|---|
| `dungeon-room` | One room marker |
| `dungeon-depth-N` | Wing/depth, one-based |
| `dungeon-role-start` | Player start for that wing |
| `dungeon-role-exit` | Descent room |
| `dungeon-role-warden` | Intended elite/boss room |
| `dungeon-role-loot` | Other rooms |
| `dungeon-spawn` | Shared marker tag |

Spawn `params` include `room`, `depth` and `role`. The start marker's yaw faces the nearest corridor exit from its room,
so a teleported player does not begin staring at a wall. Each wing also has a zone trigger tagged `exit`,
`dungeon-exit` and `dungeon-depth-N`. The existing presentation renders it as a glowing exit pad. The game owns the
rule that makes it usable (for example, Cinder opens it when the wing's warden dies) and checks proximity before teleporting.

Lights are placed in the start, warden and exit rooms. No entities are spawned by the format itself; a game iterates the
markers to populate enemies, caches or other content. The marker prefab produces an empty entity only if a mode chooses
to spawn it, so it is safe as a validation placeholder.

## Limits

- Shooter-family `WorldDescription` output only; it is not available to board, racing or narrative map formats.
- No runtime map swap, doors, keys, stairs geometry, secret rooms, cave topology, prefab placement or encounter logic.
- The layout seed is content-defined, not per-run. Games should vary encounter composition, hazards and rewards by run
  seed while reusing the generated topology.
- It does not guarantee gameplay balance, spawn density or that every marker is useful.

## Evidence

`tests/dungeon-generator.test.ts` covers deterministic same-seed output, different-seed variation, one-wing and
three-wing maps, sealed borders, room-marker connectivity per wing, role/descent markers, declared points in free space,
and invalid recipes (room count, wing count, dimensions and seed). `tests/cinder-vault.test.ts` composes the generated map
with three populated depths and transitions.
