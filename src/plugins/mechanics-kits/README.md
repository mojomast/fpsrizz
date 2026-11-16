# Mechanic kit content

`mechanics/kits` registers the `mechanic-kit` content kind and validated definitions in `MechanicKits`. A kit combines resources, an explicit clock domain, actions and objectives; it supplies content, not runtime providers or a playable game. The SDK's `createMechanicKit(ctx, definitionId, instanceId)` resolves the four selected factories and creates owned handles.

## Compose

Merge this fragment into a complete preset with a game and content pack; see [Sky Salvage](../../content/presets/sky-salvage.json) and its [kit data](../sky-content/content.json):

```json
{
  "plugins": ["mechanics/kits", "mechanics/resources", "mechanics/clock", "mechanics/actions", "mechanics/objectives"],
  "roles": {
    "sdk/mechanic-resources": "mechanics/resources",
    "sdk/mechanic-clock": "mechanics/clock",
    "sdk/mechanic-actions": "mechanics/actions",
    "sdk/mechanic-objectives": "mechanics/objectives"
  }
}
```

Content packs depend on `mechanics/kits`. Consumers creating kits during activation declare the four roles in both `requiresRoles` and `roleDependencies`. The loader reports path-bearing errors for malformed data; unknown fields, invalid bounds, unknown resource references and cyclic prerequisites fail staging. Its validator also checks that any selected mechanic role has a factory registered under the selected ID. See the [content format](../../../CONTENT_FORMAT.md) and [kit specification](../../../docs/reusable-mechanics.md#strict-mechanic-kit-content) for exact fields and limits.

The consumer owns legality checks, clock advancement and local effects. The default providers own per-consumer handles, reject paused mutations and dispose with either scope. They have no automatic systems or renderer/DOM requirement, so kits can be used headlessly; deterministic behavior follows explicit operation and clock-advance order. Kits do not add navigation or sequence providers.

See [SDK contracts](../../sdk/contracts/mechanics.ts), [Verdant consumer](../verdant-game/index.ts), [provider tests](../../../tests/mechanics-providers.test.ts) and [reusable game tests](../../../tests/reusable-games.test.ts). Run `npm run check` from the repository root.
