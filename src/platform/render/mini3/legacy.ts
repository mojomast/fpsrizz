// Isolated pre-migration renderer for historical prototype fixtures only.
// Production and the rendering SDK use index.ts (official Three.js).
export { Vector3, Euler, Object3D, Group, Scene, Fog, Mesh, Light, AmbientLight, PointLight, PerspectiveCamera } from './core.ts';
export { BufferAttribute, Float32BufferAttribute, BufferGeometry, Texture, CanvasTexture, DataTexture, Material,
  MeshBasicMaterial, MeshLambertMaterial,
  FrontSide, BackSide, DoubleSide, NormalBlending, AdditiveBlending,
  RepeatWrapping, ClampToEdgeWrapping, MirroredRepeatWrapping,
  NearestFilter, NearestMipmapNearestFilter, NearestMipmapLinearFilter,
  LinearFilter, LinearMipmapNearestFilter, LinearMipmapLinearFilter } from './resources.ts';
export type { MaterialParameters, AttributeName } from './resources.ts';
export { BoxGeometry, PlaneGeometry, CylinderGeometry } from './geometries.ts';
export { WebGLRenderer, isWebGL2Available } from './renderer.ts';
export type { WebGLRendererParameters } from './renderer.ts';
