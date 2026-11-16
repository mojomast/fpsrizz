# Enemies (`core/enemies`)

Registers enemy definitions and same-ID prefabs, the `core/chaser` and `core/ranged` AI behaviors, and team-immunity damage handling. Enemy systems handle state and movement; ranged behavior considers line of sight.

## Use

Enable `core/world` and `core/combat`, its declared dependencies, then provide enemy definitions and spawn them from a map or mode. [Bulkhead Station](../core-content/content.json) and the [default preset](../../content/presets/default.json) show a complete composition. No role selection or plugin configuration is declared.

Registration installs content kinds and behaviors; activation publishes the enemy service and owns simulation systems. The normal AI and movement updates defer when `TurnControl` is present, allowing a turn-based game to drive its own policy. No renderer is required. See [content format](../../../CONTENT_FORMAT.md), [game combat tests](../../../tests/game-combat.test.ts), and [Cinder tests](../../../tests/cinder-vault.test.ts); run `npm test`.
