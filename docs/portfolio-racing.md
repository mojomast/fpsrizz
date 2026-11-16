# Portfolio racing

Two independent overhead arcade time trials use the existing vehicle family. Accelerate with W/Up, brake or reverse with S/Down, steer with A/D or Left/Right, and hold Space to drift. Cross the illuminated gates **in order and in their indicated direction**. Off-road driving applies heavy drag; a missed gate must be approached again from its negative side. The last gate completes each lap. Finish all laps before the clock expires; restart from the result screen.

Drifting at speed turns the car more sharply but preserves more sideways momentum: use it to rotate into bends, then release it to regain grip. Braking before a corner and keeping all four wheels near the road are often faster than sliding wide. The HUD shows the next gate and its straight-line distance, warns when the car is on its far side, and highlights the final ten seconds. The arrow marks the active gate's crossing direction; it does not calculate a route around the track.

| Game | Course | Goal |
| --- | --- | --- |
| **Salt Flats — Endurance Loop** | Broad, elongated 12-metre loop with long straights and chamfered ends. Preserve speed and repeat a consistent line. | Five gates per lap, three laps, 150 seconds. |
| **Copper Switchback — Canyon Sprint** | Narrow 8-metre asymmetrical course, with an inward bend and a longer return leg. Set up for consecutive changes of direction. | Seven gates, one lap, 90 seconds. |

These are track identities, not new terrain simulations: both use the existing arcade theme, car, overhead presentation, motion and clock. There are no AI opponents or terrain hazards. The selected shared outcome-rating provider awards a time-based medal at the finish.

Gold requires a finish within half the time limit (75s on Salt, 45s on Copper), silver within three quarters (112.5s and 67.5s), and bronze for any other finish. Results include the fastest lap and approximate off-road time, giving returning players extra targets. These figures are session results, not persistent records. Finish and lap times are measured to the simulation tick; a final crossing is processed before timeout on the same tick. The scene reuses the arcade theme's pinned track, marker, backdrop and vehicle imagery, including its vehicle badge.

## Composition and verification

Both presets enable `portfolio/racing`, `vehicle/racing`, `vehicle/presentation`, `theme/arcade`, `mechanics/sequence` and `mechanics/outcome-rating`, selecting the appropriate providers in their respective roles. `portfolio/racing` supplies only `vehicle-track` content. Reuse decisions: `vehicle/track` supplies the format example; `vehicle/racing` supplies motion, crossing legality and timed win/loss; `mechanics/sequence` and `recipe/ordered-rounds` supply ordered gates and laps; `mechanics/outcome-rating` classifies the final time.

`tests/portfolio-racing.test.ts` stages and activates each complete preset with a local catalog, drives every lap using input, checks the terminal cursor, then verifies restart and timeout. It also checks drift's handling tradeoff and a fractional deadline. Run with Node 22.18 or newer:

```sh
node --test tests/portfolio-racing.test.ts
```

The pack and presets are registered in `src/app/catalog.ts`. Headless tests do not verify browser presentation or manual driving.
