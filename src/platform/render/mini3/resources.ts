// GPU-backed resources: geometry attributes, textures, materials, plus shared constants.
// Each resource remembers which renderers uploaded it so dispose() can free GPU memory (three-style).

export const FrontSide = 0, BackSide = 1, DoubleSide = 2;
export const NormalBlending = 1, AdditiveBlending = 2;
export const RepeatWrapping = 1000, ClampToEdgeWrapping = 1001, MirroredRepeatWrapping = 1002;
export const NearestFilter = 1003, NearestMipmapNearestFilter = 1004, NearestMipmapLinearFilter = 1005;
export const LinearFilter = 1006, LinearMipmapNearestFilter = 1007, LinearMipmapLinearFilter = 1008;

/** Implemented by renderers; called from resource.dispose(). */
export interface GpuOwner { release(res: object): void }

export class Disposable {
  /** @internal */ _owners = new Set<GpuOwner>();
  dispose(): void {
    const owners = [...this._owners];
    this._owners.clear();
    for (const o of owners) o.release(this);
  }
}

export class BufferAttribute {
  array: Float32Array;
  itemSize: number;
  version = 0;
  constructor(array: Float32Array, itemSize: number) {
    this.array = array;
    this.itemSize = itemSize;
  }
  get count(): number { return this.array.length / this.itemSize; }
  set needsUpdate(v: boolean) { if (v) this.version++; }
}

export class Float32BufferAttribute extends BufferAttribute {
  constructor(array: number[] | Float32Array, itemSize: number) {
    super(array instanceof Float32Array ? array : new Float32Array(array), itemSize);
  }
}

export type AttributeName = 'position' | 'normal' | 'uv' | 'color';

export class BufferGeometry extends Disposable {
  attributes: Partial<Record<AttributeName, BufferAttribute>> = {};
  index: Uint16Array | Uint32Array | null = null;
  /** @internal structural revision; bumps force a full re-upload */
  _rev = 0;
  setAttribute(name: AttributeName, attr: BufferAttribute): this {
    this.attributes[name] = attr;
    this._rev++;
    return this;
  }
  getAttribute(name: AttributeName): BufferAttribute | undefined { return this.attributes[name]; }
  setIndex(array: number[] | Uint16Array | Uint32Array | null): this {
    if (array === null) this.index = null;
    else if (Array.isArray(array)) {
      let max = 0;
      for (const v of array) if (v > max) max = v;
      this.index = max > 65535 ? new Uint32Array(array) : new Uint16Array(array);
    } else this.index = array;
    this._rev++;
    return this;
  }
}

export class Texture extends Disposable {
  magFilter = LinearFilter;
  minFilter = LinearFilter;
  wrapS = ClampToEdgeWrapping;
  wrapT = ClampToEdgeWrapping;
  repeat = { x: 1, y: 1, set(x: number, y: number) { this.x = x; this.y = y; } };
  offset = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; } };
  flipY = true;
  /** @internal */ _version = 0;
  image: TexImageSource | null;
  constructor(image: TexImageSource | null = null) { super(); this.image = image; }
  set needsUpdate(v: boolean) { if (v) this._version++; }
}

export class CanvasTexture extends Texture {
  constructor(canvas: TexImageSource) {
    super(canvas);
    this.needsUpdate = true;
  }
}

export class DataTexture extends Texture {
  data: Uint8Array;
  width: number;
  height: number;
  constructor(data: Uint8Array, width: number, height: number) {
    super(null);
    this.data = data; this.width = width; this.height = height;
    this.flipY = false; // like three: row 0 of the data is v = 0
    this.magFilter = NearestFilter;
    this.minFilter = NearestFilter;
    this.needsUpdate = true;
  }
}

export interface MaterialParameters {
  color?: number; map?: Texture | null; transparent?: boolean; opacity?: number;
  alphaTest?: number; side?: number; depthWrite?: boolean; depthTest?: boolean;
  fog?: boolean; vertexColors?: boolean; emissive?: number; blending?: number;
}

export class Material extends Disposable {
  color = 0xffffff;
  map: Texture | null = null;
  transparent = false;
  opacity = 1;
  alphaTest = 0;
  side = FrontSide;
  depthWrite = true;
  depthTest = true;
  fog = true;
  vertexColors = false;
  emissive = 0x000000;
  blending = NormalBlending;
  /** @internal true for lit (Lambert) */
  _lit = false;
  constructor(params?: MaterialParameters) {
    super();
    if (params) Object.assign(this, params);
  }
}

export class MeshBasicMaterial extends Material {}

export class MeshLambertMaterial extends Material {
  constructor(params?: MaterialParameters) {
    super(params);
    this._lit = true;
  }
}
