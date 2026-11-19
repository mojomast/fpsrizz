/**
 * P3.2: the WebGPU renderer is opt-in per preset. `?renderer=webgpu` (or `webgpu-webgl2` to force WebGPURenderer's
 * WebGL2 backend) is honoured only for presets listed here, which pass the parity suite (tests/webgpu-demo: same tick,
 * pixel diff against WebGLRenderer under the threshold). Add a preset after it passes; `&renderer-force` skips the gate.
 */
export const WEBGPU_PARITY_PRESETS: ReadonlySet<string> = new Set(['sandbox/physics', 'core/default', 'ember/bastion']);

export type RendererChoice = { backend: 'webgl' } | { backend: 'webgpu'; forceWebGL: boolean };

/** Picks the renderer from the page URL. Returns why WebGPU was refused, so the app can log it. */
export function chooseRenderer(search: string): RendererChoice & { refused?: string } {
  const q = new URLSearchParams(search);
  const want = q.get('renderer');
  if (want !== 'webgpu' && want !== 'webgpu-webgl2') return { backend: 'webgl' };
  const preset = q.get('preset') ?? '';
  if (!q.has('renderer-force') && !WEBGPU_PARITY_PRESETS.has(preset)) {
    return { backend: 'webgl', refused: `WebGPU renderer is gated per preset; "${preset || '(menu)'}" has not passed the parity suite (add &renderer-force to try anyway)` };
  }
  return { backend: 'webgpu', forceWebGL: want === 'webgpu-webgl2' };
}
