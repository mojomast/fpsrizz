# Ricochet Rifle

`example/ricochet` registers the `example/ricochet` attack behavior and the slot 3 `example/ricochet-rifle` weapon. Its projectile reflects off walls, damages an actor on contact, and ends when its range or bounce budget is exhausted.

## Use

Enable `core/world`, `core/combat`, `core/content`, and this plugin. The [extended preset](../../presets/extended.json) is a complete example. `config["example/ricochet"].bounces` sets the default bounce count (3, range 0–8); weapon behavior parameters can specify their own values. See [index.ts](index.ts) for validated attack parameters and the registered weapon definition.

The behavior and weapon register during staging; the behavior's session-owned simulation system advances projectiles when started. Projectile movement is planar and bounds work per update; this is not a general-purpose 3D ballistics model.

## Verify

Run `node --test games/shooter/tests/ext-ricochet.test.ts` from the repository root.
