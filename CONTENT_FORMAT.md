# Content formats

All content is JSON, validated before it can affect a running game. Nothing here is executed: no scripts, no
expressions, no remote URLs. Assets are referenced by **theme key** and must already be provided by the selected
theme.

Schema versions: manifest `1`, preset `1`, content pack `1`, grid map `1`. Unknown versions are rejected.

Validation errors always carry the pack/plugin id, a field path and an explanation, for example:

```
[example/pack] content[1](weapon "example/burst-pistol").data.cooldown: must be >= 0.03, got 0
[example/pack] weapon "example/burst-pistol".behavior: unknown attack behaviour "core/laser". Installed: core/hitscan, core/projectile, core/melee
```

General rules: numbers must be finite; ids are namespaced (`pack-name/thing`: lowercase letters, digits, `-`, at
least one `/`); duplicate ids are rejected; arrays and strings have size limits; every referenced behaviour, prefab,
ammo type, door or map must exist among the **enabled** plugins.

## 1. Content pack file

The unit of import/export. A pack is a manifest plus content entries.

```json
{
  "schema": 1,
  "manifest": {
    "schema": 1,
    "id": "example/pack",
    "name": "Example Pack",
    "version": "1.0.0",
    "kind": "content",
    "sdk": "^1.0.0",
    "dependencies": { "core/combat": "^1.0.0", "core/enemies": "^1.0.0", "core/world": "^1.0.0" }
  },
  "content": [
    { "kind": "weapon", "id": "example/burst-pistol", "data": { } }
  ]
}
```

A pack must depend on the plugins that define the content kinds it uses (`weapon`/`ammo`/`pickup` → `core/combat`,
`enemy` → `core/enemies`, `map` → `core/world`) and on any plugin whose behaviours or prefabs it references.

Built-in packs live in `src/plugins/<dir>/manifest.json` + `content.json` (the `content` array) and are listed in
`src/app/catalog.ts`.

## 2. Content kinds

### `ammo`

```json
{ "kind": "ammo", "id": "core/bullets-ammo", "data": { "name": "Bullets", "max": 200, "start": 48 } }
```

`start` = rounds in the default loadout (default 0).

### `weapon`

```json
{
  "kind": "weapon",
  "id": "core/pistol",
  "data": {
    "name": "Service Pistol",
    "slot": 1,
    "starter": true,
    "behavior": "core/hitscan",
    "params": { "damage": 20, "range": 60, "spread": 0.012 },
    "ammoType": "core/bullets-ammo",
    "ammoPerShot": 1,
    "cooldown": 0.27,
    "auto": false,
    "view": "weapon-pistol",
    "fireSound": "pistol-fire",
    "recoil": 0.45,
    "flash": "#ffd27a"
  }
}
```

| Field | Notes |
|---|---|
| `slot` | 1–9, unique among enabled weapons |
| `starter` | part of the default loadout (default false) |
| `behavior` + `params` | a registered attack behaviour and its parameters (validated by the behaviour) |
| `ammoType` | an `ammo` id, or `""`/omitted for infinite |
| `ammoPerShot` | rounds per shot, integer 0–100 (default 1) |
| `cooldown` | seconds between shots, ≥ 0.03 |
| `auto` | hold to fire |
| `view`, `fireSound` | theme keys (texture for the first-person sprite, sound) |
| `recoil` | 0–1 cosmetic kick; `flash` muzzle colour |

Built-in attack behaviours:

| Behaviour | Params (`*` required) |
|---|---|
| `core/hitscan` | `damage*`, `range` (60), `spread` radians (0), `pellets` (1), `kind`, `impact`, `impactActor`, `impactSound`, `impactActorSound` |
| `core/projectile` | `damage*`, `speed*`, `radius` (0.15), `range` (60), `kind`, `visual` (theme visual key), `impact`, `impactSound` |
| `core/melee` | `damage*`, `range` (1.4), `kind`, `impactActor`, `impactActorSound` |

Unknown parameters are rejected.

### `pickup`

```json
{ "kind": "pickup", "id": "core/medkit", "data": { "name": "Medkit +25", "effect": "core/heal", "params": { "amount": 25 }, "visual": "pickup-health", "sound": "pickup-health", "radius": 0.5 } }
```

Effects: `core/heal` `{ amount* }`, `core/give-ammo` `{ ammoType*, amount* }`, `core/give-weapon` `{ weapon*, ammoType, amount }`.
A prefab with the pickup's id is registered automatically, so maps can spawn it. `name` is shown on the HUD when
collected; `visual` and `sound` are theme keys; `radius` (0.1–4, default 0.5) is the collection distance.

### `enemy`

```json
{
  "kind": "enemy",
  "id": "core/spitter",
  "data": {
    "name": "Spitter",
    "health": 40,
    "speed": 2.5,
    "radius": 0.38,
    "sightRange": 22,
    "ai": "core/ranged",
    "aiParams": { "preferredRange": 8 },
    "attack": {
      "behavior": "core/projectile",
      "params": { "damage": 10, "speed": 9, "radius": 0.2, "visual": "fx-fireball" },
      "cooldown": 1.7,
      "range": 15,
      "windup": 0.45,
      "sound": "enemy-shoot"
    },
    "visual": "enemy-spitter",
    "tint": "#66ccff",
    "scale": 1,
    "painChance": 0.6,
    "score": 150,
    "sounds": { "alert": "enemy-alert", "hurt": "enemy-hurt", "die": "enemy-die" }
  }
}
```

Ranges: `health` ≥ 1, `speed` 0–30, `radius` 0.1–2, `scale` 0.25–4, `painChance` 0–1, `attack.cooldown` ≥ 0.1.

AI behaviours: `core/chaser` (melee pursuit), `core/ranged` (`aiParams.preferredRange`; attacks only with line of
sight). `visual` is a theme visual key; on death the visual `<visual>-corpse` is shown. `tint` and `scale` let a
variant reuse existing art. A prefab with the enemy's id is registered automatically.

### `map` (format `core/grid`)

```json
{
  "kind": "map",
  "id": "example/annex",
  "data": {
    "schema": 1,
    "format": "core/grid",
    "name": "Annex",
    "cellSize": 2,
    "wallHeight": 3,
    "legend": {
      "#": { "solid": true, "wall": "wall-panel" },
      ".": { "floor": "floor-plate", "ceiling": "ceiling-panel" }
    },
    "grid": [
      "#######",
      "#.....#",
      "#.....#",
      "#######"
    ],
    "playerStart": { "cell": [1, 1], "yaw": 90 },
    "doors": [{ "id": "gate", "cell": [3, 1], "locked": true, "surface": "door" }],
    "triggers": [
      { "id": "override", "kind": "switch", "cell": [1, 2], "face": "s", "opens": "gate", "tags": ["objective"] },
      { "id": "exit", "kind": "zone", "cell": [5, 1], "radius": 0.9, "tags": ["exit"] }
    ],
    "spawns": [{ "id": "g1", "prefab": "core/grunt", "cell": [4, 2], "offset": [0, 0.2], "yaw": 180, "tags": ["enemy"], "params": {} }],
    "lights": [{ "id": "l1", "cell": [3, 1], "color": "#ffb060", "intensity": 1.2, "distance": 10, "y": 2.4 }],
    "ambient": { "color": "#8a94ad", "intensity": 0.42 },
    "fog": { "color": "#07090d", "near": 6, "far": 38 }
  }
}
```

Rules:

- `grid`: 3–96 rows of equal width (3–96). Row index is Z (first row is north), column index is X. Every character
  must be in the `legend`. **The border must be solid.**
- Legend entries are either solid (`"solid": true` + `wall` texture key) or walkable (`floor`, optional `ceiling`).
- Positions use `cell: [column, row]` on a walkable cell, plus optional `offset: [dx, dz]` in cell fractions
  (−0.45…0.45). `yaw` is in degrees (−360…360): 0 faces north (−Z), 90 faces west, positive turns left.
- `doors`, `triggers`, `spawns`, `lights`, `ambient` and `fog` are optional; `playerStart` is required.
- `doors`: must sit in a one-cell gap between two walls (west+east or north+south). `locked` doors open only through
  a trigger's `opens`.
- `triggers`: `switch` is mounted on the `face` (`n`/`s`/`e`/`w`) wall of its cell and fires on Use; `zone` fires
  when the player enters `radius`. `opens` names a door of the same map. `once` defaults to true for switches.
- `spawns`: `prefab` must be registered by an enabled plugin or pack; spawns cannot overlap walls or doors.
- Ids of doors, spawns, triggers and lights are unique within the map (lowercase, digits, `-`).
- Tags used by the built-in modes: switch `objective` (must be fired before the exit counts), zone `exit` (required
  by `core/objective`), spawn `enemy`.

Texture keys in the industrial theme: `wall-panel`, `wall-brick`, `wall-tech`, `wall-hazard`, `floor-plate`,
`floor-concrete`, `ceiling-panel`, `door`. Visual keys: `enemy-grunt`, `enemy-spitter`, `pickup-health`,
`pickup-bullets`, `pickup-cells`, `fx-plasma`, `fx-fireball`, `fx-ricochet`, `fx-spark`, `fx-blood`.
An unknown *texture* key (including a weapon `view`) renders as a magenta checker and logs a warning; an unknown enemy, pickup or projectile visual key is simply not drawn (warning logged), and an unknown sound key is ignored with one warning (it is not a validation error, because themes are
swappable).

The grid is an *authoring* format. The `core/world` plugin translates it into the authoritative `WorldDescription`
(solids, doors, spawns, triggers, lights) that rendering, collision, line of sight and navigation all read. A
different authoring format is a new `MapFormats` entry in a code plugin.

## 3. Game preset

```json
{
  "schema": 1,
  "id": "core/default",
  "name": "Bulkhead Station — Objective",
  "plugins": ["core/world", "core/combat", "core/player", "core/enemies", "core/modes", "core/hud", "core/presentation", "theme/industrial", "core/content"],
  "roles": {
    "sdk/controller": "core/fps-controller",
    "sdk/camera": "core/fp-camera",
    "sdk/mode": "core/objective",
    "sdk/hud": "core/hud",
    "sdk/theme": "theme/industrial"
  },
  "options": { "map": "core/arena" },
  "config": { "core/player": { "moveSpeed": 5.4 } },
  "seed": 1337
}
```

- `plugins`: every plugin to enable, including dependencies (nothing is auto-enabled).
- `roles`: exactly one provider id per exclusive role.
- `options.map`: the map id to play.
- `config`: per-plugin overrides of manifest `config` fields; unknown keys and out-of-range values are rejected.
- `seed`: gameplay RNG seed (0…4294967295).

Built-in presets live in `src/content/presets/` and are listed in `src/app/catalog.ts`.

## 4. Import and export

Creator panel (**`** key) → *Content*:

- **Import** accepts a content pack file (section 1) or a preset (section 3). The candidate is staged: the complete
  selection is resolved, registered and validated in isolated registries. On any error the list of issues is shown
  and the running game is left exactly as it was. Only on success is the pack added to the catalog and the session
  restarted.
- **Export** writes the active preset, or any installed content pack, as JSON in the formats above.

Out of scope for this milestone: archives, new art/sound assets inside packs, scripts, remote installation.

## 5. Persistence

`localStorage` keys `shooter-foundation/settings` (`{ schema: 1, sensitivity, volume, pixelRatioCap }`) and
`shooter-foundation/preset` (`{ schema: 1, preset }`). Corrupt or unknown-schema data falls back to defaults; a stored
preset that no longer validates falls back to the default preset.

Imported packs are held in memory for the session only (planned: persist them alongside the preset).

**Future save games (planned, not implemented):** entities and components are already plain JSON
(`EntityStore.snapshot()`). A save file will record `{ saveSchema, sdkVersion, preset, plugins: { id: version },
contentPacks: { id: version }, tick, seed, entities }` and refuse to load when a required plugin or pack is missing or
outside the saved major version.

## Limits enforced by the validators (quick reference)

- Creator import: files and pasted JSON are limited to 1 MB.
- Weapon `cooldown`: 0 to 10 seconds.
- Grid maps: `cellSize` 1 to 8, `wallHeight` 2 to 8.
- Ids are `namespace/name`; the name part may contain several `/` segments plus `.` and `_`.
- `core/give-ammo` and `core/give-weapon` pickups must name ammo types and weapons that exist in the installed registries.
