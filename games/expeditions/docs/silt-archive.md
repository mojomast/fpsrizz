# The Silt Archive

Explore three flooded districts, collect their fragments, and bring the Heart Register back to an extraction point. The layout is assembled afresh from authored chamber templates each run. Every district has a connected nine-room graph; the district survey shows visited rooms and revealed neighbors. Chamber doors with no connection are dimmed.

## Controls

- Move one cell with **WASD**, **arrow keys**, the direction buttons, or by clicking an adjacent cell. A connected door transfers you to the neighboring chamber.
- Click an enemy to select it; the encounter panel reports its health and current target. Strike an adjacent enemy; heavy attack also requires 2 charge and deals 3 extra damage. Arc requires 3 charge, reaches up to three cells in a clear cardinal line, and deals 1 extra damage. Successful attacks grant 1 charge, up to 6. Brace spends 1 charge to halve the next hit.
- Enemies approach, announce a windup, strike the outlined cells on the next valid turn, and recover. Move out of the marked area or brace. Rushers move quickly; spitters attack at range; armored foes resist ordinary strikes outside recovery; drainers can take air. Bosses include a tougher warden and ranged area attacks. The encounter panel shows the selected enemy's intent.
- An unbraced spitter hit leaves you **exposed** for five valid turns: incoming hits deal one extra damage. Avoid the
  marked attack, or brace to clear exposure and prevent that braced hit from applying it. The HUD shows remaining turns.
- Use **Interact** in a fragment room to collect its fragment, in a cleared optional room to discover supplies, or in a cleared passage to lower the district's water by two levels. Bandages restore up to 8 health; air supplies restore up to 5 air.
- Defeating enemies and collecting discoveries or fragments earns progress toward an upgrade every three awards. Choose health, air, or damage before continuing. Upgrades are immediate and do not advance a turn.
- Find both fragments, then use **Descend** in the lift. In the third district the boss also holds the Heart Register. Extract from the entry at any time or from a lift once both fragments are collected. Extract with the Register for victory; extracting without it ends the expedition early. Restart begins a fresh run.

Valid movement, attacks, interactions, consumables, bracing and waiting advance time. Invalid commands have no effect. Water rises one level every eight turns in the current district, to a maximum of four. Entering a flooded tile when water is present costs one air; at level four, ending a turn on a flooded tile costs another air. Missing air causes health damage. Vent tiles are currently visual markings and have no separate hazard. The presentation uses the game service's message and intent; it does not simulate independent effects or a persistent save.

## Composition

Enable `silt/game`, `silt/presentation`, `silt/content`, the room-map provider selected by `sdk/room-map`, and the inventory, crafting and progression providers described below; select `silt/archive` for `sdk/experience` and set `options.archive` to `silt/archive`. The content pack registers that ID under the `silt-archive` kind. Each district contains three 9×9 templates with four cardinal door sockets and connected dry paths. Room purpose and encounter placement come from the authority rather than the template name.

The interface is optional in headless sessions and uses the existing `Silt`, `Ui`, and `InputContexts` contracts. Its backdrop and wall texture use existing relative Assetrizz files under `public/assetrizz`; their upstream provenance and license are recorded there.

## Inventory and pump workbench service

The authority uses an eight-stack inventory with separate tool and suit slots. Enemy defeats yield scrap; cleared pumps and optional discoveries yield seal fiber. A cleared passage pump becomes a workbench after interaction. Its known recipes make bandages, air supplies, cutters, conductors, diving suits and plate suits. A cutter adds two damage; a conductor adds three damage to arc attacks; a diving suit prevents air loss on entering flooded tiles; plate reduces incoming damage by one (minimum one). Level-four end-of-turn flood exposure still costs air in a diving suit. Material pickups that cannot fit are left behind; an unclaimed optional discovery can be retried.

The `Silt` service and interface expose inventory stacks, equipment, progression and recipe previews, plus `equip`,
`unequip`, `drop` and `craft` commands. Equipping, dropping and crafting do not advance a turn; crafting requires an
activated, cleared pump. Recipe previews check ingredients, while the actual craft also checks output capacity and
rolls inputs back on failure. Upgrade choices consume provider-backed level rewards. Restart resets equipment, supplies
and progression.

The bundled preset enables `mechanics/inventory`, `mechanics/crafting` and `mechanics/progression` and selects their
respective `sdk/mechanic-inventory`, `sdk/mechanic-crafting` and `sdk/mechanic-progression` roles, alongside room-map.
