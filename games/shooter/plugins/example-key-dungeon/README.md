# Key Dungeon

`example/key-dungeon` is a data-only map and pickup pack demonstrating an actor-specific key opening a locked gate. The `example/key-dungeon` map places `example/dungeon-key`, the `vault-door`, a keyed-gate interaction and an exit.

## Use

Enable `core/world`, `core/combat`, and `example/keys` with this pack. The [key-dungeon preset](../../presets/key-dungeon.json) selects this map and the `example/escape` mode. In [content.json](content.json), the key pickup uses `example/give-key` with `key: "vault"`, matching the gate's `key` and `door: "vault-door"` parameters.

The pack registers content at staging; it has no role, runtime system or configuration. Gate behavior comes from `example/keys` and the end condition from the selected mode.

## Verify

Run `node --test games/shooter/tests/key-dungeon.test.ts games/shooter/tests/keys-gates.test.ts` from the repository root. See [content formats](../../../../docs/reference/content-format.md).
