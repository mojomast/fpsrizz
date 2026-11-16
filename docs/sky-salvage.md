# Sky Salvage

Pilot a courier drone among six floating islands. Recover each colored crate from the northern islands and deliver it to its matching southern beacon. Avoid the red storm drone moving across the center; five impacts destroy an unrepaired hull. The experience uses a free pointer.

## Controls

WASD or arrow keys fly in the world plane. E recovers nearby cargo or unloads at its matching beacon; Space boosts for 1.5 seconds, F repairs, R restarts. The HUD also has buttons for these actions and held direction buttons on touch or narrow screens. Escape opens the host pause menu. Flying is limited to x = -9..9 and z = -8..8.

The drone starts at (0, 0). Crates are at (-6, -4), (0, -5), (6, -4); their respective destinations are (-6, 5), (0, 5), (6, 5). Interaction requires distance at most 1.35 units. One crate fits aboard; delivered crates cannot be recovered again. The storm moves along z=0 with x=4 sin(0.9 t). Collision radius is 0.8 and successive damage is separated by 1.5 seconds. A normal drone flies at 5 units/second; boost doubles that speed.

## Composition and mechanics

Preset `sky/salvage` selects `sky/flight-kit` through `options.mechanicKit` and `sky/cloudline` through `options.route`. The `sky-route` data object has a nonblank `name` (maximum 80 characters) and `deliveries` array of 1–8 entries. Each entry has a unique lowercase local `id`, a `pickup` and a `beacon`; points have finite `x` in [-9,9] and `z` in [-8,8]. Pickup points must be at least 2.7 units from each other, as must beacon points. Unknown fields are rejected. Route definitions are deeply frozen.

The standard `mechanic-kit` must use domain `seconds`, resources `energy`, `hull`, `cargo`, actions `collect`, `deliver`, `boost`, `repair`, and exactly one objective `deliveries`, with target equal to the route's delivery count and no prerequisites. Cargo starts at 0 with maximum 1; collect must gain one cargo and deliver must spend one. Boost spends energy and has a positive cooldown; repair spends energy, gains hull and has a positive cooldown. The shared kit loader imposes its own general format limits. The bundled kit starts energy and hull at 100; boost costs 20 energy with a 4-second cooldown, repair costs 15 energy, restores 20 hull and has an 8-second cooldown. Repair is rejected if the full gain would exceed hull capacity.

Shared providers own resource balances, action transactions and cooldowns, clock time and idempotent delivery progress. The game validates spatial legality before executing each shared action. Successful deliveries record a unique beacon receipt. Hazards debit the same shared hull pool. Simulation system `sky/game.flight` advances the shared clock and processes bounded commands; `sky/presentation.controls` feeds held keys, and `sky/presentation.frame` updates the scene and HUD without changing game state.

Boost duration and collision-immunity windows use shared SDK [deadlines](deadlines.md) borrowing the kit's seconds
clock. Speed, collision legality and hull damage remain Sky rules. The separate action cooldown still controls when
boost may be purchased again. Restart releases the old deadlines alongside the kit before constructing fresh run state.

The SDK registry token `SkyRoutes` has id `sky-route`. The service token `Sky` has id `sky/salvage`, exposing immutable `route` and `kit` definitions, `state()` and `enqueue(command)`. Commands are `{type:'move',x,z}` with finite components in [-1,1] and nonzero vector, or `{type:'collect'|'deliver'|'boost'|'repair'|'restart'}`. At most 32 commands are queued; ingress is rejected during host pause or after disposal. Snapshots include position, cargo index, collected/delivered flags, resources, cooldowns, clock, status, revision and message. Commands are processed one per fixed tick. Restart reconstructs the shared kit and resets the route. The game is playable without rendering, UI or audio services.
