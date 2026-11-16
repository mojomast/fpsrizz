# Keys and Gates

`example/keys` implements actor-specific key pickups and keyed door interactions. It registers the `example/give-key` pickup effect and the `example/keyed-gate` prefab.

## Use

Enable `core/world`, `core/combat`, and this plugin. The [key-dungeon preset](../../content/presets/key-dungeon.json) demonstrates the complete setup: a pickup with `params: { "key": "vault" }` and a gate with `params: { "door": "vault-door", "key": "vault" }`. See the actual [content definitions](../example-key-dungeon/content.json).

Registration installs the effect, prefab and map validation. Gate interactions and keyring state belong to their session and actor. The gate references a map door; this plugin does not supply the map, player, or game mode.

## Verify

Run `node --test tests/keys-gates.test.ts tests/key-dungeon.test.ts` from the repository root.
