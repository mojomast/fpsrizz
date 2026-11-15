// Scene graph: Vector3, Euler, Object3D and friends, lights, camera, Mesh.
import type { BufferGeometry, Material } from './resources.ts';
import { composeMatrix, mat4, multiplyMatrices, perspectiveMatrix } from './math.ts';
import type { Mat4 } from './math.ts';

export class Vector3 {
  x: number; y: number; z: number;
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: { x: number; y: number; z: number }): this { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}

/** Angles in radians. The renderer applies them in order 'YXZ' (R = Ry * Rx * Rz), like three's Euler('YXZ'). */
export class Euler {
  x: number; y: number; z: number;
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
}

export class Object3D {
  position = new Vector3();
  rotation = new Euler();
  scale = new Vector3(1, 1, 1);
  visible = true;
  renderOrder = 0;
  children: Object3D[] = [];
  parent: Object3D | null = null;
  name = '';
  userData: Record<string, unknown> = {};
  /** World matrix; refreshed by the renderer every render() (and by updateWorldMatrix). */
  matrixWorld: Mat4 = mat4();
  /** @internal */ _local: Mat4 = mat4();
  /** @internal scratch distance used for sorting */ _dist = 0;

  add(...objs: Object3D[]): this {
    for (const o of objs) {
      if (o === this) continue;
      o.removeFromParent();
      o.parent = this;
      this.children.push(o);
    }
    return this;
  }
  remove(...objs: Object3D[]): this {
    for (const o of objs) {
      const i = this.children.indexOf(o);
      if (i >= 0) { this.children.splice(i, 1); o.parent = null; }
    }
    return this;
  }
  removeFromParent(): this {
    this.parent?.remove(this);
    return this;
  }
  traverse(cb: (o: Object3D) => void): void {
    cb(this);
    for (let i = 0; i < this.children.length; i++) this.children[i]!.traverse(cb);
  }
  /** Recompute matrixWorld from the parent's current matrixWorld (parent must be up to date). */
  updateMatrixWorld(): void {
    const p = this.position, r = this.rotation, s = this.scale;
    composeMatrix(this._local, p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z);
    if (this.parent) multiplyMatrices(this.matrixWorld, this.parent.matrixWorld, this._local);
    else this.matrixWorld.set(this._local);
  }
  /** Update this object's world matrix including all ancestors. */
  updateWorldMatrix(): void {
    this.parent?.updateWorldMatrix();
    this.updateMatrixWorld();
  }
}

export class Group extends Object3D {}

export class Fog {
  color: number; near: number; far: number;
  constructor(color: number, near = 1, far = 1000) { this.color = color; this.near = near; this.far = far; }
}

export class Scene extends Object3D {
  background: number | null = null;
  fog: Fog | null = null;
}

export class Mesh extends Object3D {
  geometry: BufferGeometry;
  material: Material;
  constructor(geometry: BufferGeometry, material: Material) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

export class Light extends Object3D {
  color: number;
  intensity: number;
  constructor(color = 0xffffff, intensity = 1) { super(); this.color = color; this.intensity = intensity; }
}
export class AmbientLight extends Light {}
export class PointLight extends Light {
  /** Falloff reaches 0 at this distance; 0 means no falloff. */
  distance: number;
  constructor(color = 0xffffff, intensity = 1, distance = 0) { super(color, intensity); this.distance = distance; }
}

export class PerspectiveCamera extends Object3D {
  fov: number; aspect: number; near: number; far: number;
  /** @internal */ _proj: Mat4 = mat4();
  /** @internal */ _view: Mat4 = mat4();
  constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
    super();
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.updateProjectionMatrix();
  }
  updateProjectionMatrix(): void {
    perspectiveMatrix(this._proj, this.fov, this.aspect, this.near, this.far);
  }
}
