# verdant/content

`verdant/content` 1.0.0 is an SDK 2 data-only pack depending on `verdant/game` and `mechanics/kits` ^1.0.0. The dependencies register the `verdant-world` and `mechanic-kit` kinds; the pack provides no roles, systems or plugin configuration. The game publishes the `Verdant` SDK service.

## Included world and kit

`verdant/islands` references `verdant/kit`, has an 18-day season, and contains Reed Haven (-4,1), Canopy Reach (0,-2), and Tide Crown (4,1), in X/Z coordinates. The turns-domain kit starts water/biomass/charge at 4/3/2, each capped at 12. Water and biomass actions gain 3 with two-turn cooldowns; convert spends one of each to gain two charge; restore spends 1 water, 2 biomass and 2 charge; wait is free. Convert and restore have one-turn cooldowns. The `relays` objective targets all three stations.

The bundled [`verdant-relay.json`](../../content/presets/verdant-relay.json) selects `options.world: "verdant/islands"`; the world itself selects its kit. It enables `verdant/game`, `verdant/presentation`, this pack, `theme/board`, `mechanics/kits`, and the resources, clock, actions and objectives providers. It selects `verdant/relay` as `sdk/experience`, `theme/board` as `sdk/theme`, and the four corresponding `mechanics/*` providers under `sdk/mechanic-*` roles. Enable dependencies and select providers explicitly.

## Validation and limits

A world has a name, kit ID, 3–100 integer days and exactly three uniquely identified stations with coordinates from -10 to 10; unknown world and station fields are rejected. The referenced kit must be installed, use turns, contain water, biomass and charge and the five named actions, and have exactly one unlocked `relays` objective targeting the station count. The shared kit loader validates the individual definitions and references. Weather, turn advancement and target legality are game rules; valid data alone does not guarantee a winnable season.

Run `npm run validate-game -- --bundled`, `node --test tests/verdant-relay.test.ts tests/reusable-games.test.ts`, and `npm run check` for full checks. See the [Verdant guide](../../../docs/verdant-relay.md), [mechanics guide](../../../docs/reusable-mechanics.md), [SDK contract](../../sdk/contracts/verdant.ts), and [`verdant/game`](../verdant-game/).
