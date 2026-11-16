# Portfolio racing

Two independent overhead arcade time trials use the existing vehicle family. Accelerate with W/Up, brake or reverse with S/Down, steer with A/D or Left/Right, and hold Space to drift. Cross the illuminated gates **in order and in their indicated direction**. Off-road driving applies heavy drag; a missed gate must be approached again from its negative side. The last gate completes each lap. Finish all laps before the clock expires; restart from the result screen.

| Game | Course | Goal |
| --- | --- | --- |
| **Salt Flats — Endurance Loop** | Broad, elongated 12-metre loop with long straights and chamfered ends. Preserve speed and repeat a consistent line. | Five gates per lap, three laps, 150 seconds. |
| **Copper Switchback — Canyon Sprint** | Narrow 8-metre asymmetrical course, with an inward bend and a longer return leg. Set up for consecutive changes of direction. | Seven gates, one lap, 90 seconds. |

These are track identities, not new terrain simulations: both use the existing arcade theme, car, overhead presentation, motion and clock. There are no AI opponents or terrain hazards. The selected shared outcome-rating provider awards a time-based medal at the finish.

## Composition and verification

Both presets enable `portfolio/racing`, `vehicle/racing`, `vehicle/presentation`, `theme/arcade`, `mechanics/sequence` and `mechanics/outcome-rating`, selecting the appropriate providers in their respective roles. `portfolio/racing` supplies only `vehicle-track` content. Reuse decisions: `vehicle/track` supplies the format example; `vehicle/racing` supplies motion, crossing legality and timed win/loss; `mechanics/sequence` and `recipe/ordered-rounds` supply ordered gates and laps; `mechanics/outcome-rating` classifies the final time.

`tests/portfolio-racing.test.ts` stages and activates each complete preset with a local catalog, drives every lap using input, checks the terminal cursor, then verifies restart and timeout. Run with Node 22.18 or newer:

```sh
node --test tests/portfolio-racing.test.ts
```

The pack and presets are registered in `src/app/catalog.ts`. Headless tests do not verify browser presentation or manual driving.
