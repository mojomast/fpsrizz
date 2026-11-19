# Performance: HUD, timings, budgets and GPU captures (P2.7)

## Perf HUD

Press **F3** (or add `?perf` to the URL) for a readout in the top-left corner: FPS, CPU ms per frame, GPU ms per
frame, worst frame, ticks per frame, draw calls and triangles, entity count and the four slowest systems. Values are
green under half the 60 Hz budget (8.3 ms), amber under the budget and red over it.

GPU time is measured with `EXT_disjoint_timer_query_webgl2` around the render call, only while the HUD is open. When
the browser does not expose the extension (some mobile GPUs, privacy settings) the HUD shows "n/a". We did not add
stats-gl: the built-in timer covers the same numbers without a dependency and works with both renderers.

## Per-system timings as JSON

- Creator tools > Inspect > **System timings JSON** downloads `{ tick, systems: [{ id, owner, phase, order, ms }] }`.
- Over the [dev protocol](../reference/dev-protocol.md): `perf.systems` (MCP tool `perf_systems`).
- In the console: `(await __bulkhead.dev())['perf.systems']()`.

`ms` is the scheduler's moving average per tick (frame systems per frame).

## Perf report and the optional CI job

```sh
npm run build
npm run perf                 # plays each preset in scripts/perf-budget.json, writes .smoke/perf-report.json
npm run perf -- --enforce    # exit 1 when a preset exceeds its budget
```

`scripts/perf-budget.json` sets per-preset limits (`maxCpuMs`, `maxWorstMs`, `maxSystemMs`). The CI workflow has a
`perf` job that runs `npm run perf -- --enforce` on manual dispatch (Actions > CI > Run workflow) or when a PR has the
`perf` label; it is `continue-on-error`, so it never blocks a merge. GitHub-hosted runners have no GPU (SwiftShader),
so the budgets are loose CPU-side regression guards; switch `runs-on` to a GPU runner for real GPU numbers.

## GPU frame captures with Spector.js

[Spector.js](https://spector.babylonjs.com/) records every WebGL call of one frame, with state, shaders and textures.

1. Install the Spector.js extension for Chrome or Firefox (or, without the extension, run this in the page console:
   `const s = document.createElement('script'); s.src = 'https://spectorcdn.babylonjs.com/spector.bundle.js'; s.onload = () => { const sp = new SPECTOR.Spector(); sp.displayUI(); }; document.head.append(s);`).
2. Open the game with `?test` so pointer lock does not get in the way, start the preset and get to the slow scene.
3. Hold the simulation if you want a stable frame: Inspect > **Hold**, or `sim.pause` over the protocol.
4. Click the Spector icon (or **Capture** in its UI) and pick the game canvas. The capture lists each draw call with its program, uniforms and bound textures.
5. Look for: draw calls that could be instanced (`Renderable.instanced`), redundant state changes, oversized textures, and overdraw from transparent layers. Compare against the HUD's draw-call count.

Spector slows rendering while capturing; read timings from the HUD, not from a capture.
