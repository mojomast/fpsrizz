# vehicle/track

Data-only SDK 2 content pack (`vehicle/track` 1.0.0), depending on `vehicle/racing` ^1.0.0. It supplies no role, systems, or plugin configuration; the racing plugin registers and consumes the `vehicle-track` kind and exposes the `Race` SDK service.

## Shipped track and composition

`vehicle/neon-circuit` is an eight-point closed circuit, 8 metres wide, with five ordered directional gates, two laps and a 150-second limit. The start is at (-12, 12), facing east. The last gate completes each lap. `content.json` is the authoritative definition; the pack ID and track ID are distinct.

The bundled [`overhead-racing.json`](../../content/presets/overhead-racing.json) enables `vehicle/racing`, `vehicle/track`, `vehicle/presentation`, `theme/arcade` and `mechanics/sequence`. It selects `vehicle/arcade-race` as `sdk/experience`, `theme/arcade` as `sdk/theme`, `mechanics/sequence` as `sdk/mechanic-sequence`, and sets `options.track` to `vehicle/neon-circuit`. Dependencies and roles must be enabled/selected explicitly.

## Authoring and validation

Add entries with `kind: "vehicle-track"`, a unique content ID, and a `data` object. Width is 4–30 metres, laps 1–20, time limit 5–3600 seconds, points 3–128 and gates 2–128. Positions are X/Z metres; start yaw is radians, zero faces −Z and positive turns left. Each gate has `x`, `z`, `dx`, `dz`, `width`; it is crossed from its negative to positive side in order. Centers must lie on the road; adjacent points and gates, including the closing pair, must be distinct. Unknown fields are rejected. Validation checks geometry, not whether a track is enjoyable to drive.

Run `npm run validate-game -- --bundled` for staging and `node --test tests/overhead-racing.test.ts` for headless racing coverage; `npm run check` runs the project checks. See the [racing guide](../../../docs/overhead-racing.md), [SDK contract](../../sdk/contracts/racing.ts), and [`vehicle/racing`](../vehicle-racing/).
