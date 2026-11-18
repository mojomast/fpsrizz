# Owned factory instances

`createOwnedInstances` shares per-consumer live-ID and dual-scope lifetime bookkeeping for plugin factories. It is
exported through `src/sdk/index.ts`; implementation: `src/sdk/contracts/owned-instances.ts`. The clock provider in
`src/plugins/mechanics-clock/index.ts` is a working consumer.

## Reuse decision

Reuse **`Scope`** for idempotent cleanup, early release, abort signals and resource diagnostics, and **`ctx.instantiate`**
for one lazy factory per registration per session, created in its provider's context. Neither facility reserves an
instance ID separately for each consumer or links an instance to both provider and consumer lifetimes. This small SDK
composition supplies those two rules, avoiding copied ID sets and dual-registration bookkeeping in each provider.
It introduces no new role, service, kernel mechanism or gameplay authority.

## API and use

```ts
interface OwnedInstance {
  readonly active: boolean;
  dispose(): void;
}

function createOwnedInstances(provider: SessionContext, kind: string): {
  acquire(owner: SessionContext, id: string): OwnedInstance;
};
```

Create **one pool in the registered factory's `start(provider)`**, then call `acquire` for each consumer instance.
`kind` labels both scope registrations and duplicate-ID diagnostics; it is not a global namespace. Separate pools
provide separate namespaces even when their provider, kind, consumer and ID match. Creating a pool on every acquisition
would defeat duplicate detection. Pools and leases have frozen public surfaces and no module-global state.

- **Identity:** IDs are exact, nonempty strings of at most 128 JavaScript string code units. They are not trimmed,
  lowercased or restricted to content-ID syntax. Uniqueness is per pool and consumer **context object**, not plugin ID.
  Different consumers can simultaneously use the same ID.
- **Acquisition:** a disposed provider or consumer, invalid ID, or duplicate live ID throws before registering anything.
  Disposed-scope rejection precedes ID checks. Creating a pool alone reserves no IDs or scope entries; acquisitions
  through a retained pool—or a new pool over a disposed provider—still reject.
- **Ownership:** each acquired lease registers exactly **two** cleanups: one in the consumer scope and one in the
  provider scope, including when both are the same scope. This preserves existing mechanic resource diagnostics:
  a four-handle default mechanic kit adds eight registrations.
- **Early release:** `dispose()` immediately invalidates the lease, releases its ID and unregisters both scope entries.
  Repeated calls are harmless. A replacement may reuse the ID; disposing the old lease cannot invalidate the replacement
  or release its reservation.
- **Teardown:** disposing either scope invalidates the lease and releases its counterpart's registration. `active` is
  already false inside that scope's abort listeners, before its cleanup callbacks run. Either teardown order, nested
  teardown from an abort listener and provider-as-consumer ownership are supported. Restart creates a fresh factory;
  retained old factories reject acquisition even with a new consumer context.

The lease owns **identity and lifetime only**. Validate and copy definitions before acquisition; those rules remain in
the provider. If construction can fail after acquisition, catch the failure, dispose the acquired lease and rethrow.
Provider handles should consult `lease.active` before mutations and delegate their lifetime disposal to the lease.
Gameplay state cleanup, where needed, stays explicit in the provider; the helper accepts no cleanup callbacks.

There is no pause gate, time advancement, expiration, game state, snapshot/restore, event emission or system installation.
Acquisition and disposal work during paused activation. Providers retain their own `SessionControl` mutation policy,
finite arithmetic, borrowed-handle checks and gameplay results. Multiple hosts are isolated by their own contexts and
factory instances; this helper is not a cross-session handle-transfer or authorization protocol.

## Evidence

`tests/owned-instances.test.ts` uses actual host-created `SessionContext`s, registered factories and `ctx.instantiate`:

| Cases | Observable guarantee |
|---|---|
| Equal IDs across consumers; duplicate and invalid input | Correct namespace, failed acquisition adds no registrations |
| Repeated early release, ID reuse and stale handles | Both scope counts return to baseline; replacements and unrelated IDs survive |
| Consumer/provider-first and nested abort teardown | Immediate invalidation during abort, counterpart cleanup, no retained registrations |
| Provider equals consumer; identical-kind independent factories | Exactly two entries per lease; factory namespaces remain independent |
| Disposed contexts, paused activation, interleaved hosts and restart | Stale factories cannot acquire; no pause/gameplay coupling or cross-session interference |

Clock integration regressions use the existing `tests/mechanics-providers.test.ts`, `tests/deadlines.test.ts` and
`tests/deadline-consumers.test.ts`: exact kit `+8` counts, partial-kit cleanup/retry, explicit-clock arithmetic and cooldowns,
borrowed-clock disposal, and Sky/Verdant deadline boundary and restart traces. These tests exercise real consumers;
the lease tests do not copy their algorithms or claim independent-provider substitution for the helper.
