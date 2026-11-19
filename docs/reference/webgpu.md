# WebGPU renderer (opt-in)

The default renderer is three.js `WebGLRenderer` (WebGL2). three.js `WebGPURenderer` is available as an opt-in
(roadmap P3.2): it uses WebGPU when the browser gives an adapter and otherwise falls back to its own WebGL2 backend,
so it runs everywhere the default renderer does.

## Turning it on

- `?renderer=webgpu`: WebGPURenderer, WebGPU backend if available (else its WebGL2 backend).
- `?renderer=webgpu-webgl2`: WebGPURenderer forced onto its WebGL2 backend (`forceWebGL`), useful to separate
  renderer differences from backend differences.

It is **gated per preset**: the URL option is honoured only for presets listed in
`WEBGPU_PARITY_PRESETS` (`packages/platform-web/src/render/webgpu-gate.ts`), today `sandbox/physics`, `core/default`
and `ember/bastion`. Other presets stay on WebGL and log why; add `&renderer-force` to try anyway. Add a preset to the
list once it passes the parity suite.

The F3 perf HUD shows the active renderer (`webgl`, `webgpu` or `webgpu-webgl2`); plugins can read
`Render.backend`. `Render.renderer` (the WebGLRenderer, used by KTX2 loaders) is absent under WebGPU, and the GPU timer
query is WebGL-only, so the HUD shows GPU `n/a` there.

## How it is wired

- `scripts/vendor-three.mjs` vendors `three.webgpu.js` and `three.tsl.js` next to the existing `three.core.js`, so both
  renderers share one set of core classes (`Scene`, `Mesh`, materials). A minimal `three.webgpu.d.ts` declares the
  renderer surface the host uses.
- `createWebGpuRenderHost()` in `packages/platform-web/src/render/service.ts` dynamically imports it (its own ~720 KiB
  chunk, budgeted separately in `scripts/bundle-budget.mjs`), awaits `renderer.init()`, and reuses the same render
  host as WebGL. Visitors who don't opt in download nothing extra.
- Built-in materials (`MeshStandardMaterial`, `MeshLambertMaterial`, `MeshBasicMaterial`, sprites, lines) are converted
  to node materials automatically. The engine and the games ship no custom GLSL (`ShaderMaterial`/`onBeforeCompile`),
  so there was nothing to port to TSL. New custom shaders should be written in TSL if they must work on both.

## Parity suite

`tests/webgpu-demo/run.mjs` (in `npm run test:browser`) renders each gated preset at the same held simulation tick
with WebGLRenderer, `?renderer=webgpu` and `?renderer=webgpu-webgl2`, and requires a mean channel difference ≤ 4 and
≤ 3 % of pixels off by more than 48. Results on the CI/headless Chrome (SwiftShader, no WebGPU adapter): WebGPURenderer
runs on its WebGL2 backend with mean differences of 0.000–0.123. The native WebGPU backend needs a browser with a
WebGPU adapter (desktop Chrome/Edge, Safari 26, Firefox 141+ on Windows) and is not covered by CI yet.
