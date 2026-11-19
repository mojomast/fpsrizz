# Inspector, tweak panel, debug draw and time controls (P2.5)

Open creator tools (backquote) and pick **Inspect**. The tab is a separate lazily loaded chunk and drives the same
dev-tools core as the [dev protocol](dev-protocol.md), so everything here is also scriptable.

| Section | What it does |
| --- | --- |
| Time | **Hold** freezes the simulation, **Run** keeps it running while menus and panels are open, **Auto** returns to normal (runs only while playing). **Step 1 / Step 10** run fixed ticks while held. **Speed** scales real time (0.25×–4×; ticks stay fixed-size, so runs stay deterministic). |
| Debug | **Debug draw** shows `debugDraw(ctx)` primitives; **Colliders** outlines every PhysicsCollider (yellow = sensor; boxes are drawn axis-aligned). **System timings JSON** downloads per-system ms; **Screenshot** saves a PNG. |
| Entities | Filter by name (`sdk/scene-node`), owner, component id or entity id. Click a row to edit it. |
| Components | One JSON editor per component, refreshed live until you start typing. **Apply** replaces the component in place (systems holding the object see it) and flags it changed for queries; **Remove** deletes it; **Add** attaches any component id. |
| Tweak plugin config | Every config field of the active plugins (sliders for numbers). A change restarts the preset with the new value and **keeps the run's state** through a snapshot when the preset is all SDK 3; **Export preset** downloads the tweaked preset JSON. |

## Debug draw (SDK)

```ts
import { debugDraw } from '@bulkhead/sdk';
const dd = debugDraw(ctx);                       // no-op when headless or switched off
if (dd.enabled) {
  dd.line(eye, hit.point, { color: 0xff4444 });  // until the next tick (draw it every tick)
  dd.box(center, { x: 1, y: 2, z: 1 });
  dd.sphere(target, 0.5, { seconds: 2 });        // lasts 2 s of simulation time
  dd.text(above, `hp ${hp}`, { frame: true });   // one rendered frame (for frame systems)
}
```

Drawn on a 2D overlay without depth testing. Turn it on with the Inspect tab, `?debugdraw` in the URL, or
`draw.set` over the protocol. The buffer is capped at 20 000 primitives.

## State-preserving hot reload (P2.1 step 2)

`npm run dev` reloads the page after every rebuild (code, presets, JSON content). When the running preset is all
SDK 3, the app stores a RunSnapshot before reloading and restores it afterwards, so you keep your place in the game
("Reloaded — state kept"). If the plugin set or preset id changed, or a plugin's `ctx.persist` data no longer fits,
the game restarts fresh as before. Plugins keep state across reloads by keeping it in components or `ctx.persist`.
