// Minimal declarations for the opt-in WebGPURenderer (P3.2); see packages/platform-web/src/render/webgpu.ts.
import type { Camera, Object3D, ToneMapping } from './three.module.js';
export interface WebGPURendererParameters { canvas?: HTMLCanvasElement; antialias?: boolean; forceWebGL?: boolean; alpha?: boolean }
export declare class WebGPURenderer {
  constructor(parameters?: WebGPURendererParameters);
  readonly isWebGPURenderer: true;
  readonly backend: { readonly isWebGPUBackend?: boolean; readonly isWebGLBackend?: boolean };
  readonly info: { autoReset: boolean; reset(): void; render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } };
  autoClear: boolean;
  outputColorSpace: string;
  toneMapping: ToneMapping;
  init(): Promise<this>;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Object3D, camera: Camera): void;
  clearDepth(): void;
  dispose(): void;
}
