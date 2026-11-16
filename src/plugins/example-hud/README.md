# Visor HUD

`example/hud` provides the `example/visor-hud` HUD role: a segmented health arc, compass, weapon and ammunition display, objective text, notices and damage feedback.

## Use

Enable `example/hud` and set `roles["sdk/hud"] = "example/visor-hud"`. The [survival preset](../../content/presets/survival.json) demonstrates a complete composition. Set `config["example/hud"].accent` to `cyan` (default), `amber`, or `green`.

The role registers at staging. When selected with a UI service, it mounts a session-owned HUD and frame updates; without UI it returns early for headless use. It displays available shooter player and flow state, and does not provide gameplay, player creation or a mode.

## Verify

Run `npm run check` from the repository root; browser presentation changes should also be checked with `npm run build && npm run smoke`.
