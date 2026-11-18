# Neon Run

An independent fixed-tick arcade time trial. Accelerate with W/Up, brake and reverse with S/Down, steer with A/D or the arrow keys, and hold Space to reduce lateral grip. Leave the road and drag sharply limits speed. Cross each illuminated gate in order and in its indicated direction, completing two laps before the timer expires. Restart from the result screen.

The `vehicle/racing` plugin owns the only vehicle motion and progression system (`vehicle/racing.drive`). It publishes a read-only `Race` service. `vehicle/presentation` consumes that service for an overhead camera, vehicle and circuit geometry, HUD and discrete synthesized audio cues. It has no shooter-plugin dependencies; rendering and UI are optional in headless sessions. Audio uses short engine and skid cues because the audio service does not yet expose managed loops.

`vehicle/track` is a data-only pack. The `vehicle-track` content kind accepts `name`, `width` (4–30), integer `laps` (1–20), `timeLimit` in seconds (5–3600), `start` (`x`, `z`, `yaw`), `points` (3–128 closed polyline vertices), and `gates` (2–128 ordered `{x,z,dx,dz,width}` objects). X/Z are metres; yaw is in radians, zero faces −Z, and positive turns left (forward is `(-sin(yaw), -cos(yaw))`). Gate direction is normalized, width is 2–50 metres, and a car must cross its plane from the negative side to the positive side within its width. The last gate completes a lap. The start and gate centers must lie on the road; adjacent points and adjacent gates, including the closing pair, must be distinct. Unknown properties are rejected. Select a registered track using preset `options.track`.

The bundled recipe selects experience `vehicle/arcade-race`, theme `theme/arcade`, track `vehicle/neon-circuit`, and plugins `vehicle/racing`, `vehicle/track`, `vehicle/presentation`, `theme/arcade`, and `mechanics/sequence`. `vehicle/racing` requires its own experience selection and a selected sequence factory at staging. The presentation asks the theme for `track-surface`, `race-marker`, `race-vehicle` and sounds `race-checkpoint`, `race-finish`, `race-skid`, `race-engine`.

Ordered gate/lap progression uses the [sequence provider](../../docs/reference/sequences.md) selected under `sdk/mechanic-sequence`.
The game retains directional gate geometry and its one-expected-crossing-per-tick policy. At completion, the public
lap remains the final lap and `nextGate` is the gate-count sentinel; a final crossing is evaluated before timeout.
Custom presets must enable and select a sequence implementation; track data and the `Race` service are unchanged.

`games/racing/tests/overhead-racing.test.ts` exercises the real host without rendering, including a complete two-lap input-driven route, direction and order, timeout, restart, determinism, off-track handling, and data validation.
