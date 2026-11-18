# Stealth guard prefab

Compile this plugin into the catalog and enable `example/stealth` and its dependency `core/world` in the preset. Place a spawn in a `core/grid` map, for example:

```json
{ "id": "guard-1", "prefab": "example/stealth-guard", "cell": [3, 4], "yaw": 0,
  "params": { "range": 8, "angle": 90, "delay": 1 } }
```

Map yaw is in degrees (0 faces −Z); the prefab API uses radians. `range` is metres (0–1000, default 8), `angle` is the full cone angle in degrees (0–360, default 90), and `delay` is continuous sight in seconds (0–3600, default 1; zero detects on the first tick). Invalid values fall back to defaults; the prefab API has no parameter-validation hook. Losing sight resets the timer. The mode must spawn map spawns (the built-in objective mode does). Sustained sight ends the run in defeat via Flow.

Guards are stationary, non-solid, invulnerable visual markers, not core enemies; their sprite uses the theme key `enemy-grunt`. Sight is planar, tests player centres against walls and doors, and ignores actors, lighting, sound, concealment and elevation. No patrol or combat is implemented. Other core enemies retain their own perception; omit them for a pure stealth map.
