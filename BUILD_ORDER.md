# Cross-genre build order

This is an implementation plan, not a claim that every milestone is complete. Actual shipped scope belongs in
`SPEC.md`; the broader plugin research and game recipes are in `GAME_PLUGIN_ROADMAP.md`.

The mode-first wave below produced the current planar slices. For the next wave, follow
[GAME_PLATFORM_STRATEGY.md](GAME_PLATFORM_STRATEGY.md): remove forced shooter dependencies and prove an overhead racer,
turn-based tactics and narrative adventure with distinct controls, simulation and presentation. This updates the
priority toward architectural contrast; the remaining persistence, vertical and networking dependencies still apply.

The concrete parallel task assignments, fixed integration contracts and acceptance gates for this wave are in
[PARALLEL_BUILD_PLAN.md](PARALLEL_BUILD_PLAN.md).

## Dependency order

1. **Planar game slices in parallel:** time trial, arena score attack, a switch-and-exit puzzle, and a scarce-supplies
   horror map. Each needs a preset, a valid map, a mode, clear success/failure behavior and headless and browser checks.
2. **Interactions before key-and-gate games:** single-consumer Use arbitration must coexist with existing switches and
   doors; then implement keys, locks and a dungeon slice. A denied interaction consumes the press.
3. **Alternative movement and view before racing:** controller and camera policies, visible player/vehicle art and
   swept ordered checkpoints lead to a planar racer. Ordinary trigger zones report player entry, not continuous
   occupancy or guaranteed high-speed crossing.
4. **Prove reuse before extracting:** implement holdout and another encounter consumer, then extract a director shared
   with survival. Add small effect/ability primitives before a seeded single-session roguelite. Strict turn-based
   dungeon rules require every participating actor and hazard to honor the turn contract.
5. **Deeper games:** a replaceable enemy perception seam precedes stealth and stalking. A coherent weapon firing
   pipeline precedes magazines/reload and tactical equipment. General inventory plus interactions precede extraction.
6. **Persistence:** versioned profile storage precedes persistent scores and progression. Durable stash and extraction
   additionally need atomic, idempotent settlement. Full run saves need tick-boundary capture and restoration of
   world, scheduler, RNG, queued work and plugin-owned state; ECS snapshots alone are not enough.
7. **Separate engine projects:** design versioned height-aware world, movement, collision, combat, AI and rendering
   together for true platforming and stacked floors. For multiplayer first establish server authority, player-specific
   input, network identity and replication; fixed ticks alone do not provide multiplayer or rollback.

These tracks can proceed concurrently when they do not compete for the same SDK and lifecycle contracts. Their
integration must be tested in the dependency order above. Use Assetrizz assets through curated, pinned theme keys;
image data and Blender exports do not by themselves provide gameplay behavior.

## Definition of a complete slice

- All plugin and pack dependencies are explicit, the catalog and preset are wired, and invalid data reports useful paths.
- Headless tests cover the game's principal loop, failure, deterministic timing and restart/cleanup.
- The preset is validated and actually exercised in a browser, including presentation, input and theme switching.
- The relevant SDK, content, architecture and player-facing docs describe the implemented behavior and limits.

## Research references

- [Continuous collision detection](https://docs.bepuphysics.com/ContinuousCollisionDetection.html) for high-speed
  movement and checkpoints.
- [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology) for
  atomic local persistence and [schema upgrades](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).
- [Client-side prediction and reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
  and [snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/) for an authoritative network design.
