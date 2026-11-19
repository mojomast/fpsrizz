# Dev protocol and MCP server (P2.6)

A dev build can be queried, stepped, tweaked and screenshotted by agents and scripts while it runs, modelled on
[Bevy's Remote Protocol](https://bevy.org/news/bevy-0-15/#bevy-remote-protocol-brp). Development only: the bridge is
started by `npm run dev` and production builds never connect to it.

```
agent ──HTTP POST /rpc or ws /agent──▶ dev bridge (127.0.0.1:<dev port + 1>) ◀──ws /game── game page (dev build)
```

- `npm run dev` serves the game on 127.0.0.1:5173 and the bridge on 5174 (`--no-rpc` turns it off; standalone: `npm run dev:rpc`).
- The page connects by itself (`?devrpc=off` opts out, `?devrpc=ws://host:port/game` points elsewhere). The newest page wins.
- Safety: the bridge binds 127.0.0.1, refuses browser `Origin`s other than the dev server's, and requires `Content-Type: application/json`, so other web pages cannot drive your game.

## Methods (JSON-RPC 2.0)

The machine-readable list with parameter schemas is [schemas/dev-protocol.methods.json](../../schemas/dev-protocol.methods.json) (also returned by `rpc.discover`).

| Method | Params | Result |
| --- | --- | --- |
| `sim.state` | – | preset, tick, time, mode (auto/run/hold), speed |
| `world.query` | `with`, `without`, `owner`, `name`, `limit`, `offset` | `{ total, entities: [{ id, owner, name?, components }] }` |
| `entity.get` | `id`, `components?` | `{ id, owner, components: { id: json } }` |
| `entity.set` | `id`, `component`, `value`, `merge?` | replace / deep-merge; `value: null` removes |
| `sim.pause` / `sim.resume` | `paused?` | hold or keep running / back to normal |
| `sim.step` | `n` | runs n ticks now and stays held |
| `sim.speed` | `speed` (0–16) | real-time multiplier |
| `input.press` | `key`, `down?` | synthetic key/button (`KeyW`, `Space`, `Mouse0`, `GamepadA`) through the bindings |
| `preset.get` / `preset.apply` | `preset`, `keepState?` | current preset / validate and start one |
| `config.describe` / `config.set` | `plugin`, `key`, `value`, `keepState?` | plugin config fields / live tweak with state kept |
| `replay.run` | `file` (a `.replay.json`) | re-simulates headlessly in the page: `{ hash, expected, match }` |
| `screenshot` | – | `{ dataUrl }` PNG of the game view (+ debug overlay) |
| `log.tail` | `n` | host log entries |
| `perf.systems` | – | per-system average ms per tick |
| `draw.set` | `enabled?`, `colliders?` | debug drawing toggles |

```sh
curl -s localhost:5174/rpc -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"sim.step","params":{"n":60}}'
curl -s localhost:5174/rpc -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"world.query","params":{"with":["sdk/rigid-body"]}}'
```

Errors use JSON-RPC codes: -32601 unknown method, -32602 bad params, -32000 game error, -32001 no game connected, -32002 timeout (30 s).
In the page the same methods are available as `(await __bulkhead.dev())['world.query']({})`.

## MCP server

`scripts/mcp-bulkhead.mjs` (`npm run mcp`) is a dependency-free stdio MCP server exposing each method as a tool
(`world_query`, `entity_get`, `entity_set`, `sim_step`, `sim_pause`, `preset_apply`, `replay_run`, `screenshot`, `log_tail`, … plus `bridge_status`). Screenshots come back as MCP image content.

```json
{ "mcpServers": { "bulkhead": { "command": "node", "args": ["scripts/mcp-bulkhead.mjs"], "env": { "BULKHEAD_RPC": "http://127.0.0.1:5174/rpc" } } } }
```

### Pairing with browser MCPs

The game still needs a browser tab. Pair this server with a browser-driving MCP:

- **Playwright MCP** (`npx @playwright/mcp@latest`): `browser_navigate` to `http://127.0.0.1:5173/?preset=<id>&test` (`?test` skips pointer lock), click Play, then use `sim_pause` / `sim_step` / `world_query` here for deterministic checks and `browser_take_screenshot` or `screenshot` for visuals.
- **Chrome DevTools MCP** (`npx chrome-devtools-mcp@latest`): same flow; add its performance traces and console messages to `perf_systems` and `log_tail` from here.

A typical agent loop: `sim_pause` → `input_press {key:"KeyW"}` → `sim_step {n:30}` → `entity_get` the player → assert → `screenshot`.
