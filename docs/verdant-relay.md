# Verdant Relay

A turn-based 3D colony-restoration game: revive three island relays before the 18-day season ends. Use the station buttons to select a relay, then choose collect water, harvest biomass, generate charge, restore, or wait. Restart begins a fresh season. The archipelago visibly grows as relays return to life.

Reserves start at 4 water, 3 biomass and 2 charge, each capped at 12. Water and biomass collection each add 3 and have a two-turn cooldown; generation spends 1 water and 1 biomass for 2 charge; restoration spends 1 water, 2 biomass and 2 charge. Every third completed day dry wind drains 1 water. If that drain cannot be paid, or the day budget expires, the colony loses; restoring all three relays wins immediately before the drain. The forecast announces the next day's drain.

Only accepted actions advance time. The exact boundary is: validate target, execute shared action at the **current** turn, record a unique restoration receipt if applicable, advance the shared turn clock by one, then check victory, dry wind, and the day limit in that order. Rejected actions, paused commands, rendering and idle simulation ticks do not advance cooldowns or time. Wait is an explicit accepted action. Collection that exceeds capacity is rejected atomically. Restart disposes and recreates the complete shared kit, not a local-only rewind.

Dry-wind and season boundaries use shared SDK [deadlines](deadlines.md) borrowing the kit's turn clock. The game rearms
dry wind explicitly and retains the victory → drain → season ordering above. Restart releases the old deadline handles
and creates fresh boundaries with the new kit; the helper never advances turns or applies weather consequences.

One winning route (action, station for restoration): `restore reed`, `biomass`, `convert`, `restore canopy`, `water`, `biomass`, `convert`, `restore tide`. A losing route is `wait` 15 times: the fifth dry wind cannot be paid. Restores cannot target a relay twice.

The `verdant-world` content defines `name`, `kit`, `days`, and exactly three unique stations (`id`, `name`, `x`, `z`). The kit is a standard `mechanic-kit` in the `turns` domain; it must define resources `water`, `biomass`, `charge`, actions `water`, `biomass`, `convert`, `restore`, `wait`, and exactly one objective: an unlocked `relays` objective targeting all stations. Game logic uses the selected shared providers for resources, action cooldowns and costs, explicit clock and objective receipts; weather and target legality remain game-specific.

SDK service `Verdant` (`verdant/relay`) exposes the authored world, shared immutable `actionDefinitions`, detached `state()` snapshots, a revision, and bounded `enqueue()` commands (`{type:'act', action, station?}` or `{type:'restart'}`). Select islands using the station buttons or by clicking their 3D terrain; the gold ring marks the selection. The simulation system is `verdant/game.commands`; browser frame systems are `verdant/presentation.scene` and `verdant/presentation.ui`.
