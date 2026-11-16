# Reusable capability design and evidence note

Use this short template when extracting a shared rule or extending a public contract. Keep it alongside the capability's
documentation and link it from existing `reuse.json` fields. For a small helper, several answers can fit in one paragraph.
This is an authoring aid; it adds no manifest fields or runtime requirements.

## Decision

- **Need and consumers:** Name the repeated rule and the real games that need it. Describe their differing policies.
- **Discovery:** Record search terms, candidate IDs, the inspected SDK declarations, consumers and tests.
- **Choice:** Reuse content/config, compose providers, extend an existing seam, extract a helper, or introduce a provider.
  Explain the concrete missing behavior and what duplication the choice removes.
- **Boundary:** State what the capability owns and what each consumer still decides. Identify a case outside its scope.

## Behavioral contract

| Concern | What to specify |
|---|---|
| Public surface | SDK exports, inputs/results, definition validation and ordinary rejection versus exceptions |
| State and ownership | Authored definitions versus runtime state; creator/consumer/provider lifetime; owned versus borrowed handles; identity scope |
| Mutation | Authoritative entry point; copied input/snapshot rules; preview versus commit; fields changed atomically |
| Time and ordering | Seconds/turns, clock authority, exact boundaries, pause, idle behavior and ordering relative to game-local effects |
| Notifications and callbacks | Immediate/deferred semantics, reentry, callback failures, and what a committed event actually certifies |
| Disposal and reset | Repeated disposal, early cleanup, old-handle behavior, recreation, restart and failure partway through construction |
| Composition | Required roles/dependencies, startup ordering, optional services and their absence behavior |
| Compatibility | Observable promises to consumers and implementors; persistence/restore support or explicit limits |

Specify only applicable concerns. An owned queue does not need a factory registry or ID namespace merely because a
resource provider has one. A deadline can borrow a clock without owning or advancing it. An observation snapshot does
not become a complete save unless the restore protocol is also defined.

## Evidence record

```text
Claim:
Contract: SDK symbol + semantic documentation section
Composition: real consumer/preset; selected roles and implementations
Cases: test file + named case, expected observable and defect it would expose
Oracle: hand-derived example / invariant / independent model / differential / UI result
Dimensions: time domains, shared/isolated state, success/rejection, relevant lifecycle transitions
Independence: does a replacement import or delegate to the implementation being replaced?
Replay: seed, content/provider identity, fixed step and command tape, if claiming exact replay
Run: command, environment and actual pass/fail/blocked/not-run result
Known gaps:
Reuse decision and rationale:
```

Choose evidence to match the claim:

- **Discoverable:** Valid metadata and reachable contracts/examples make a candidate inspectable.
- **Contract-exercised:** Named observable assertions run against a real implementation.
- **Composition-exercised:** Different consumers exercise materially different demands through the same public seam.
- **Substitution-exercised:** A separate implementation exercises the relevant contracts and consumers with the default absent.

These descriptions are prose, not new `reuse.json` properties or a certification scale. Record browser, lifecycle,
replay and compatibility coverage explicitly. A screenshot, staging result or successful search establishes its own
limited claim; it does not replace gameplay assertions. Preserve existing coverage when extracting test runners.

## Publication

Use existing metadata fields (`summary`, `keywords`, `entryPoints`, `useWhen`, `limitations`, `docs`, `examples`, `tests`)
and a composition recipe where useful. Prefer working consumers over copied sample implementations. Run the repository's
required checks, regenerate the inventory after covered changes, and record actual results. The inventory validates
references and freshness; descriptions and evidence still need review.

See [reuse discovery](../REUSE.md) and [the research and source record](research/general-plugins-2026-11-16.md).
