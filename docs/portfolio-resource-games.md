# Resource games portfolio

## Crosswind Dispatch

Fly four emergency instruments across a storm corridor. Pickups run from west to east along the north edge, while their matching beacons are reordered on the south edge, forcing longer diagonal crossings rather than parallel north–south trips. Each crate must reach its own colored beacon, and the one-slot hold forces separate journeys. A moving storm drone damages the hull. This airframe has 80 energy, a 25-energy boost with a six-second cooldown, and a 20-energy repair with a ten-second cooldown; energy does not regenerate, so boosts compete with repairs.

Use WASD/arrows to fly, E to collect or deliver, Space to boost, F to repair and R to restart. The on-screen controls also work on touch. The four deliveries are barometer (-7,-6) → (7,6), medic (-2,-5) → (2,6), filter (3,-6) → (-7,6), and radio (8,-5) → (-2,6). Coordinates are (x,z). Any order is legal; the headless test completes them in that order and verifies rejection at a wrong beacon.

## Last Rain Conservatory

Restore Seedbank, Aquifer and Glasshouse across a triangular archipelago before an eleven-day season ends. Begin with only 3 water, 2 biomass and no charge. Collect water or biomass (+3, two-turn cooldown), convert 1 water and 1 biomass into 2 charge, and spend 1 water, 2 biomass and 2 charge per restoration. Every third accepted day costs one water; failing to pay loses. Restoring the last station wins before the final day's wind and deadline checks. Choose a station in the scene or with station buttons, then use the action buttons.

One verified last-day route: biomass, convert, restore Seedbank, water, convert, biomass, restore Aquifer, water, convert, biomass, restore Glasshouse. Invalid actions do not advance the day. Eleven waits also lose to dry wind.

## Reuse and integration

Both are data-only compositions: `recipe/resource-actions`, `mechanics/kits`, `mechanics/resources`, `mechanics/actions`, `mechanics/clock` and `mechanics/objectives` supply the shared economy, cooldowns, explicit clock and progress; `sky/game` and `verdant/game` supply their distinct movement and turn-based rules. Sky's family requires a single matching-delivery objective; Verdant requires exactly three stations and one restoration objective. Station locations are visual/selectable, not travel distances. The in-game headers use the selected route and world names; the launcher also identifies the underlying family.

Both packs and presets are registered in the bundled catalog. `node --test tests/portfolio-resource-games.test.ts` exercises activation, legal and rejected commands, and winning routes on Node >= 22.18.
