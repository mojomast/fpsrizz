---
"@bulkhead/kernel": minor
"@bulkhead/sdk": major
"@bulkhead/std": minor
"@bulkhead/tools": minor
"@bulkhead/platform-web": minor
"create-bulkhead": minor
---

P0.2/P3: npm workspaces (`@bulkhead/kernel`, `sdk`, `platform-web`, `std`, `tools`); shared game vocabulary in
`@bulkhead/sdk/contracts/game.ts` (shooter-only contracts moved to `games/shooter/contracts/shooter.ts`); opt-in
WebGPU renderer (`?renderer=webgpu`, per-preset gate) and `RenderService.backend`; perf HUD layout fix and visible
touch stick; `create-bulkhead` can clone the engine and scaffold outside a checkout.

Breaking: shooter contracts (`Combat`, `Weapons`, `Enemies`, `Pickups`, `World`, `Interactions`, ...) are no longer
exported by `@bulkhead/sdk`. See docs/migrations/sdk-4.md.
