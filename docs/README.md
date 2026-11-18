# Bulkhead documentation

Three kinds of document, plus game guides and history. Agents: start with [`llms.txt`](../llms.txt) and
[`AGENTS.md`](../AGENTS.md).

## Guide (how to build things)

- [Create a game](guide/create-a-game.md): from preset to playable family, end to end.
- [Plugins](guide/plugins.md): the SDK, manifests, lifecycle, roles, registries, events and services.
- [Reuse](guide/reuse.md): find and compose existing capabilities before writing new ones.

## Reference (what exists, exactly)

- [Architecture](reference/architecture.md): layers, boundaries, ownership, tick order, rendering.
- [Spec](reference/spec.md): implemented scope, limits and the reference shooter.
- [Content format](reference/content-format.md): every JSON format and content kind.
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

- Families in [`games/`](../games/README.md): Sky Salvage, Verdant Relay, Ember Bastion, Cinder Vault, Hollowmere and
  the expeditions (Silt Archive, Salt Ledger, Common Ground).
- Games still in `src/plugins`: [Neon Run](../games/racing/README.md), [Signal Break](games/turn-tactics.md),
  [The Last Light](games/narrative-adventure.md), [Stonewake](games/stonewake.md), and the
  [ten-game portfolio](games/ten-game-portfolio.md) ([adventures](games/portfolio-adventures.md),
  [assist](games/portfolio-assist.md), [cards](games/portfolio-cards.md), [puzzles](games/portfolio-puzzles.md),
  [racing](../games/racing/docs/portfolio-racing.md), [resource games](games/portfolio-resource-games.md),
  [tactics](games/portfolio-tactics.md)).

## Roadmap and archive

- [Roadmap](roadmap.md): the engine roadmap (P0–P3) and its status.
- [Archive](archive/README.md): build plans, hand-offs and research notes kept for history. They can be stale; the
  guide and reference win when they disagree.
