# Snapshots, saves and replays (SDK 3)

Three related tools, all built on the deterministic fixed-step simulation:

| Tool | What it is | Where |
| --- | --- | --- |
| **Run snapshot** | Plain-JSON image of a running session: tick, entities + components, per-plugin RNG positions and each plugin's `ctx.persist()` state. | `host.snapshot()` / `host.restore(s)`, `src/kernel/snapshot.ts` |
| **Quicksave** | A snapshot in `localStorage` (`fpsrizz/quicksave/<preset>`). **F6** saves, **F9** loads. | `src/app/main.ts` |
| **Replay** (`*.replay.json`) | Preset + seed + every input call, tick-stamped, plus a final-state hash. Replaying re-simulates the run. | `src/platform/replay.ts`, `tests/helpers/replay.ts` |

## The SDK 3 rule: state outside components goes through `ctx.persist`

Components are saved automatically. Anything else a plugin keeps (closure counters, velocities, engine worlds)
must be registered:

```ts
let vy = 0;
ctx.persist({
  save: () => ({ vy, padEntries: state.padEntries }),
  load: (data, fromVersion) => { const d = data as { vy: number; padEntries: number }; vy = d.vy; state.padEntries = d.padEntries; },
});
```

- `load` runs after entities, tick and RNG were restored, in activation order. Entity ids are preserved, so
  stored ids stay valid.
- `fromVersion` is the plugin version that wrote the data; migrate when it differs from your manifest version.
- Queries see a restore as "every entity left and re-entered" (reported as `changed` to existing handles).
- `std/physics-rapier` persists Rapier's own world snapshot (bit-exact: contacts, sleeping, solver state) and
  rebuilds character controllers.

Quicksave is offered only when **every** active plugin targets SDK 3 (`"sdk": "^3.x"`), because SDK 2 games keep
state in closures that a snapshot cannot see. `host.snapshot()` itself works anywhere (useful for debugging).

## Snapshot format

`{ format: 'fpsrizz-snapshot', schema: 1, sdk, preset: { id, seed }, plugins: { id: version }, tick,
nextEntityId, rng: { pluginId: state }, entities: [{ id, owner, components }], state: { pluginId: json } }`

`migrateSnapshot()` validates the envelope and upgrades older schemas (the `MIGRATIONS` table in
`kernel/snapshot.ts`). `restore()` refuses (HostError stage `restore`, nothing touched) when the preset id or
the active plugin set differs. `hashSnapshot()` is an FNV-1a hash of `stableStringify({ tick, rng, entities })`.

## Replays

Open the game with `?record` (optionally `&seed=N`). Every session records its input; **F8** (or
`__bulkhead.replay.download()`) downloads `<preset>-<seed>.replay.json`:

```json
{ "format": "fpsrizz-replay", "version": 1, "sdk": "3.0.0", "preset": "sandbox/physics", "seed": 3, "ticks": 247,
  "events": [[0, "k", "KeyD", ["sandbox/right"]], [60, "ku", "KeyD"], [94, "an", "gamepad:left", -1, -0.8]],
  "hash": "d34e269a" }
```

Each event is `[tick, kind, ...args]`, applied before the input snapshot of that tick. Kinds: `p`/`r` (action
press/release), `k`/`ku` (physical key with its resolved actions), `l` (look delta), `ptr` (pointer),
`an` (analog stick), `c` (clear). Record from the start of a session: a replay starts from a fresh session.

### Replays as regression tests

```ts
import { assertReplay, recordRun } from '../../../tests/helpers/replay.ts';
const spec = { preset, plugins: ['src/plugins/std-transform', 'src/plugins/std-physics-rapier', 'games/x/plugins/game'] };
await assertReplay(spec, 'games/x/tests/boss-fight.replay.json'); // re-simulates and compares the hash
```

`recordRun(spec, (run) => { run.input.press('a'); run.ticks(30); })` scripts a new one. After an intended
simulation change, `UPDATE_REPLAYS=1 npm test` rewrites the hashes of path-based replays. Headless specs leave
out drawing-only plugins (render-sync, presentation); see `games/sandbox/tests/replay.test.ts`.
