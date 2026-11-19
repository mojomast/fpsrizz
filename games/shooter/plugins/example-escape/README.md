# Escape Mode

`example/escape` provides a minimal `sdk/mode`: reach an exit to win; player death ends the run. It is useful for maps whose route is controlled by other mechanics.

## Use

Enable `core/world`, this plugin, and the provider of your player prefab; select `roles["sdk/mode"] = "example/escape"`. The [key-dungeon preset](../../presets/key-dungeon.json) combines it with keys and a locked gate. `config["example/escape"].playerPrefab` defaults to `core/player`; the selected map must contain a zone tagged `exit`.

Registration supplies the role and validates the player prefab and map. On selection the mode spawns the player and map entities and subscribes to trigger and death events for the session. Escape itself does not implement keys, combat, or an objective-switch requirement.

## Verify

Run `node --test games/shooter/tests/escape-mode.test.ts` from the repository root.
