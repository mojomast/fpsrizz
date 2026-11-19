# Networking design (P3.7, design only, nothing implemented)

Status: **proposal**. This document picks a direction and a build order so multiplayer can be started later
without re-deciding the basics. No code, package or transport exists yet. Decisions that need Kyle are in the last
section.

## 1. Goals and non-goals

Goals:

- 2–8 player **co-op and small PvP** prototypes on the existing presets (shooter, sandbox, tactics, racing).
- Keep the single-player path unchanged: a plugin written today must keep working offline with no network code.
- One simulation codebase: the same plugins run on clients and, where used, a headless server.
- Testable in-process: two or more hosts in one Node test with simulated latency, loss and jitter.

Non-goals (for the first version): MMO scale, matchmaking/lobbies as a product, anti-cheat beyond server
authority, cross-play guarantees between different builds, voice chat.

## 2. What the engine already gives us

| Have | Where | Why it matters |
| --- | --- | --- |
| Fixed 60 Hz tick, phases in a fixed order | `PHASES`, kernel scheduler | Every peer can agree on "tick N". |
| Seeded per-plugin RNG with saved stream positions | `kernel/rng.ts`, snapshots | Randomness is reproducible from (seed, tick). |
| Run snapshots: entities, components, RNG, `ctx.persist` state, Rapier world bytes | `host.snapshot()` / `restore()` | The basis for join-in-progress, resync and rollback. |
| `hashSnapshot()` (FNV-1a over tick + RNG + entities) | `kernel/snapshot.ts` | Desync detection: peers compare hashes every K ticks. |
| Input recording as tick-stamped events, replays re-simulate bit-exactly | `platform-web/replay.ts` | The same event format can be sent over the wire. |
| Headless host (all unit tests run sessions in Node) | `PluginHost` | A server is "a host without a renderer". |

## 3. What is missing (and blocks any netcode)

1. **Single-player assumptions.** `Player` is effectively a singleton; the `Input` service has one `tick` view per
   session; `Flow` ends the whole session; HUD/camera plugins look up "the" player. Networking needs player slots.
2. **Per-player input.** Systems read `ctx.services.get(Input).tick`. They need `input.for(slot)` (or an input
   component on the player entity) so the same system drives every player.
3. **Network identity.** Entity ids are host-local counters. Spawns must be deterministic (same order on every peer)
   or mapped through a `NetId`.
4. **Cross-machine determinism.** Rapier's standard build is only *locally* deterministic. JS `Math.sin/cos/exp/pow`
   are not specified to be bit-identical across engines (V8 vs SpiderMonkey vs JavaScriptCore). Lockstep and
   rollback across browsers need `@dimforge/rapier3d-deterministic-compat` and a fixed-point or `fdlibm`-style math
   shim for simulation code.
5. **Snapshot speed.** Snapshots are JSON. Fine for saves and joins, far too slow to save every tick for rollback
   (target: < 0.5 ms per save/restore for a typical scene). Needs a binary, delta-friendly encoding.

## 4. Options considered

| Model | How | Good for | Cost here |
| --- | --- | --- | --- |
| **Deterministic lockstep** | Peers exchange inputs; tick N runs when all inputs for N arrived. | Tactics, puzzles, turn-based, RTS-like. | Low code; needs cross-machine determinism (§3.4); latency = slowest peer. |
| **Rollback (GGPO-style)** | Predict missing remote input, simulate ahead, on correction restore snapshot at N and re-simulate. | Fighting, platformers, small-arena action, racing. | Needs fast snapshots (§3.5) and determinism; CPU spikes on long rollbacks. |
| **Server-authoritative snapshots + client prediction** | Server simulates; sends state deltas at 20–30 Hz; clients predict own player and interpolate others. | Shooters, co-op, anything with > 2 players or untrusted clients. | Needs a server process and replication; does not need cross-machine determinism. |

**Recommendation:** build the shared foundation (§5 N0–N2), then ship **server-authoritative** first (it fits the
shooter-heavy catalog, tolerates float differences, and works across browsers), and add **lockstep** for turn-based
presets because it is nearly free once inputs are per-player. Treat rollback as a later, opt-in mode for presets that
pass a cross-browser determinism test.

## 5. Proposed architecture

```
packages/net            transport-agnostic session layer (new workspace package, @bulkhead/net)
  transport.ts          interface Transport { send(peer, bytes, reliable?), onMessage, peers }
  transports/loopback   in-process, with latency/loss/jitter knobs (tests)
  transports/websocket  client <-> server
  transports/webrtc     peer <-> peer DataChannels (signalling via the server)
  session.ts            NetSession: slots, clock sync, input exchange, snapshot/delta channel, hash checks
packages/std/plugins/std-net-replication   SDK-facing plugin: Replicated components, NetId, ownership
packages/sdk/src/contracts/net.ts          PlayerSlot, NetId, Replicated, NetRole, NetEvents (contracts only)
scripts/net-server.mjs                     headless host + WebSocket transport (Node)
```

SDK contracts (sketch, not final):

```ts
interface PlayerSlot { slot: number; local: boolean }          // component on each player entity
interface NetId { id: number; owner: number /* slot or -1 = server */ }
interface Replicated { components: string[]; rateHz?: number; interpolate?: boolean }
interface NetService {
  readonly role: 'offline' | 'host' | 'client' | 'peer';
  readonly localSlot: number;
  readonly slots: readonly number[];
  inputFor(slot: number): InputTick;   // offline: the local input for slot 0
}
```

Rules that keep single-player unchanged:

- Offline, `NetService.role === 'offline'`, there is one slot (0) and `inputFor(0)` is today's `Input.tick`.
- Plugins opt in per component with `Replicated`; everything else stays local (cosmetics, particles, UI).
- Gameplay systems iterate players by `PlayerSlot` instead of assuming one `Player`; a lint rule (boundaries) can
  flag new `Player` singleton lookups in plugins that declare the `net` capability.

Server-authoritative data flow (per tick):

1. Clients sample input, apply it locally (prediction), and send `[tick, slot, inputEvents]` (unreliable, redundant
   last 3 ticks).
2. Server applies inputs for tick N (late ones are dropped or applied next tick), simulates, and every 2–3 ticks sends
   a delta of `Replicated` components since the client's last acked tick (reliable-ordered baseline + unreliable
   deltas).
3. Client applies the authoritative state at tick N, re-simulates its own player from N to now with buffered input
   (local reconciliation using `host.snapshot`/`restore` of only the predicted entities), and interpolates remote
   entities ~100 ms in the past.
4. Every K = 60 ticks, server sends `hashSnapshot` of replicated state; mismatches trigger a full baseline resend.

Join in progress: the server sends a full snapshot (existing JSON format, compressed), then deltas. Disconnect: slot
kept for a grace period; the server keeps simulating its player with neutral input.

Transport defaults: WebSocket to a Node server for v1 (simplest, works everywhere, also on itch.io via an external
host); WebRTC DataChannels for peer lockstep later; WebTransport when Safari support is dependable.

## 6. Build order (agent-sized)

| Step | Deliverable | Test |
| --- | --- | --- |
| N0 | Player slots and per-player input in the SDK, offline only; port sandbox + one shooter preset to iterate players | Existing suites unchanged; a two-local-players sandbox test |
| N1 | Binary snapshot/delta encoder for components (+ benchmark) | Round-trip equals JSON snapshot; < 0.5 ms for the sandbox |
| N2 | `@bulkhead/net` with loopback transport, clock sync, input exchange, hash checks | Two hosts in one test reach identical hashes with 100 ms latency and 5 % loss |
| N3 | Server-authoritative replication plugin + Node server + WebSocket transport; sandbox co-op preset | Browser test: two pages, one server, both see each other move; reconnect |
| N4 | Lockstep mode for turn-based presets (tactics) | Two hosts, identical end hash, deliberate desync detected |
| N5 | (Optional) rollback for presets that pass a cross-browser determinism test (Chromium/Firefox/WebKit identical hashes over a recorded replay) | Rollback of 8 ticks under 2 ms |

## 7. Risks

- Retrofitting `PlayerSlot` touches many shooter plugins (HUD, camera, pickups, AI targeting). Do N0 family by family.
- Determinism across browsers is the single biggest risk for lockstep/rollback; measure it early with the P3.3
  cross-browser runner (same replay, compare hashes) before promising those modes.
- A server needs hosting, which is outside GitHub Pages and itch.io; the static deploys stay single-player.

## 8. Decisions for Kyle

1. Server-authoritative first (recommended) vs. peer lockstep first.
2. Hosting for a game server (a small Node host, Fly.io/Render, or self-hosted) and whether public demos should
   include multiplayer at all.
3. Which preset is the multiplayer pilot (suggested: sandbox co-op, then a 2–4 player shooter arena).
4. Whether to adopt Rapier's deterministic build globally (slower, larger) or only for net presets.
