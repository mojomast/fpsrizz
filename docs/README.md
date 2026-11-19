# Bulkhead documentation

Three kinds of document, plus game guides and history. Agents: start with [`llms.txt`](../llms.txt) and
[`AGENTS.md`](../AGENTS.md).

## Guide (how to build things)

- [Create a game](guide/create-a-game.md): from preset to playable family, end to end.
- [Plugins](guide/plugins.md): the SDK, manifests, lifecycle, roles, registries, events and services.
- [Reuse](guide/reuse.md): find and compose existing capabilities before writing new ones.
- [Bulkhead CLI and templates](guide/bulkhead-cli.md): `npm run bulkhead -- create <name> --template fps|platformer|topdown|puzzle|cards|blank`.
- [Prefabs, scenes and level import](reference/scenes.md): data prefabs, scene trees, Tiled and LDtk importers.
- [Inspector and debug draw](reference/inspector.md): entity inspector, live component editing, config tweaks, Debug.draw, time controls, state-preserving hot reload.
- [Dev protocol and MCP server](reference/dev-protocol.md): JSON-RPC to a running dev build, MCP tools for agents.

## Reference (what exists, exactly)

- [Architecture](reference/architecture.md): layers, boundaries, ownership, tick order, rendering.
- [Spec](reference/spec.md): implemented scope, limits and the reference shooter.
- [Content format](reference/content-format.md): every JSON format and content kind.
- [Entity queries](reference/queries.md): multi-component queries with added/removed/changed tracking.
- [Spatial](reference/spatial.md): SDK 3 `Transform3D`, interpolation and `std/render-sync`.
- [Physics](reference/physics.md): `std/physics-rapier` bodies, sensors, raycasts and the character controller.
- [Input v2](reference/input.md): axes, gamepads, touch controls, the default map and rebinding.
- [Audio](reference/audio.md): sample sounds, mixer buses, 3D positioning and the synth fallback.
- [Snapshots, saves and replays](reference/snapshots.md): `ctx.persist`, quicksave (F6/F9), `.replay.json` record/replay and replay regression tests.
- [JSON Schemas](reference/schemas.md): `schemas/`, `$schema` in data files, `npm run schemas`, VS Code mapping.
- [Assets](reference/assets.md): the asset service, manifest preloads, `std/assets` glTF models, Blender custom
  properties as components and the `npm run assets` build step.
- SDK API: generated from TSDoc by `npm run docs:api` into `docs/reference/api/` (not committed).
- [Reuse index](reference/reuse-index.md): generated list of plugins, recipes and contracts (`npm run index-reuse`).
- Mechanics: [reusable mechanics](reference/reusable-mechanics.md), [conformance](reference/mechanic-conformance.md),
  [command queues](reference/command-queues.md), [deadlines](reference/deadlines.md),
  [owned instances](reference/owned-instances.md), [sequences](reference/sequences.md),
  [navigation](reference/navigation.md), [inventory](reference/inventory.md), [crafting](reference/crafting.md),
  [progression](reference/progression.md), [dungeon generator](reference/dungeon-generator.md),
  [outcome ratings](reference/portfolio-shared-mechanics.md).
- Presentation and tools: [camera modes](reference/camera-modes.md), [weapon rig](reference/weapon-rig.md),
  [game composer](reference/game-composer.md).

## Cookbook (short recipes)

- [The edit loop: live reload, resume and `?seed=`](cookbook/edit-loop.md)
- [Start a new game family in `games/`](cookbook/new-game-family.md)
- [Ship large art without bloating the bundle](cookbook/large-art.md)
- [Building-block plugins](cookbook/building-block-plugins.md)
- [Reusable capability design note](cookbook/reusable-capability-template.md)

## Games

Every game lives in [`games/`](../games/README.md): the shooter reference game, Neon Run (racing), Signal Break
(tactics), The Last Light (adventure), Stonewake and the card games (puzzles), Sky Salvage, Verdant Relay, Ember
Bastion, Cinder Vault, Hollowmere and the expeditions. Cross-family guides stay here:
[ten-game portfolio](games/ten-game-portfolio.md), [portfolio resource games](games/portfolio-resource-games.md).

## Roadmap and archive

- [Roadmap](roadmap.md): the engine roadmap (P0–P3) and its status.
- [Archive](archive/README.md): build plans, hand-offs and research notes kept for history. They can be stale; the
  guide and reference win when they disagree.
