import { AmbientLight, Mesh, PointLight } from './core.ts';
import type { Object3D, PerspectiveCamera, Scene } from './core.ts';
import { invertMatrix } from './math.ts';
import { DataTexture, DoubleSide, BackSide, AdditiveBlending, ClampToEdgeWrapping, MirroredRepeatWrapping,
  LinearFilter, NearestFilter, NearestMipmapLinearFilter, NearestMipmapNearestFilter, LinearMipmapLinearFilter,
  LinearMipmapNearestFilter } from './resources.ts';
import type { AttributeName, BufferGeometry, GpuOwner, Material, Texture } from './resources.ts';
import { FRAG, MAX_LIGHTS, UNIFORMS, VERT } from './shaders.ts';

export function isWebGL2Available(): boolean {
  try {
    return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2');
  } catch { return false; }
}

export interface WebGLRendererParameters { canvas?: HTMLCanvasElement; antialias?: boolean; preserveDrawingBuffer?: boolean }

interface GeoGpu {
  vao: WebGLVertexArrayObject; rev: number;
  bufs: Partial<Record<AttributeName, { buf: WebGLBuffer; version: number }>>;
  idx: WebGLBuffer | null; idxType: number; count: number;
}
interface TexGpu { tex: WebGLTexture; version: number }
interface Prog { prog: WebGLProgram; u: Record<string, WebGLUniformLocation | null>; refs: number; frame: number }

const ATTRS: [AttributeName, number, number][] = [['position', 0, 3], ['normal', 1, 3], ['uv', 2, 2], ['color', 3, 3]];

const byRenderOrder = (a: Object3D, b: Object3D): number => a.renderOrder - b.renderOrder;
const byDepth = (a: Object3D, b: Object3D): number => a.renderOrder - b.renderOrder || b._dist - a._dist;
const byLightDist = (a: Object3D, b: Object3D): number => a._dist - b._dist;

export class WebGLRenderer implements GpuOwner {
  domElement: HTMLCanvasElement;
  autoClear = true;
  info = {
    autoReset: true,
    render: { calls: 0, triangles: 0, frame: 0 },
    memory: { geometries: 0, textures: 0 },
    programs: 0,
    reset(): void { this.render.calls = 0; this.render.triangles = 0; },
  };

  private gl: WebGL2RenderingContext;
  private pixelRatio = 1;
  private clearColor = [0, 0, 0, 1];
  private bgColor = [0, 0, 0, 1];
  private lost = false;
  private geoms = new Map<BufferGeometry, GeoGpu>();
  private texs = new Map<Texture, TexGpu>();
  private mats = new Map<Material, number>(); // material -> bitmask of program variants it has used
  private progs: (Prog | undefined)[] = [];
  private frameId = 0;
  // per-frame scratch (reused, no per-frame allocation)
  private opaque: Mesh[] = [];
  private trans: Mesh[] = [];
  private lights: PointLight[] = [];
  private lp = new Float32Array(MAX_LIGHTS * 3);
  private lc = new Float32Array(MAX_LIGHTS * 3);
  private ld = new Float32Array(MAX_LIGHTS);
  private nLights = 0;
  private amb = [0, 0, 0];
  private cam: PerspectiveCamera | null = null;
  private fogOn = false;
  private fogC = [0, 0, 0];
  private fogN = 0;
  private fogF = 0;

  private onLost = (e: Event): void => { e.preventDefault(); this.lost = true; };
  private onRestored = (): void => { this.dropAll(); this.lost = false; };

  constructor(params: WebGLRendererParameters = {}) {
    const canvas = params.canvas ?? document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      antialias: params.antialias ?? false, alpha: false, preserveDrawingBuffer: params.preserveDrawingBuffer ?? false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.domElement = canvas;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  setPixelRatio(n: number): void { this.pixelRatio = n; }
  getPixelRatio(): number { return this.pixelRatio; }
  setSize(w: number, h: number, updateStyle = true): void {
    const c = this.domElement;
    c.width = Math.floor(w * this.pixelRatio);
    c.height = Math.floor(h * this.pixelRatio);
    if (updateStyle) { c.style.width = `${w}px`; c.style.height = `${h}px`; }
  }
  setClearColor(color: number, alpha = 1): void { this.setRgb(this.clearColor, color); this.clearColor[3] = alpha; }
  clear(): void {
    if (this.lost) return;
    const gl = this.gl, c = this.clearColor;
    gl.clearColor(c[0]!, c[1]!, c[2]!, c[3]!);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  clearDepth(): void {
    if (this.lost) return;
    this.gl.depthMask(true);
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
  }

  private setRgb(out: number[], c: number): void {
    out[0] = ((c >> 16) & 255) / 255; out[1] = ((c >> 8) & 255) / 255; out[2] = (c & 255) / 255;
  }

  // ---------------------------------------------------------------- render
  render(scene: Scene, camera: PerspectiveCamera): void {
    if (this.lost) return;
    const gl = this.gl, info = this.info;
    if (info.autoReset) info.reset();
    info.render.frame++;
    this.frameId++;
    this.cam = camera;

    camera.updateWorldMatrix();
    invertMatrix(camera._view, camera.matrixWorld);
    this.opaque.length = 0; this.trans.length = 0; this.lights.length = 0;
    this.amb[0] = this.amb[1] = this.amb[2] = 0;
    scene.updateMatrixWorld();
    this.collect(scene);
    this.prepareLights(camera);

    this.fogOn = scene.fog !== null;
    if (scene.fog) { this.setRgb(this.fogC, scene.fog.color); this.fogN = scene.fog.near; this.fogF = scene.fog.far; }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    if (this.autoClear) {
      const saved = this.clearColor;
      if (scene.background !== null) { this.clearColor = this.bgColor; this.setRgb(this.bgColor, scene.background); }
      this.clear();
      this.clearColor = saved;
    }
    this.opaque.sort(byRenderOrder);
    this.trans.sort(byDepth);
    for (let i = 0; i < this.opaque.length; i++) this.draw(this.opaque[i]!);
    for (let i = 0; i < this.trans.length; i++) this.draw(this.trans[i]!);
  }

  private collect(o: Object3D): void {
    if (!o.visible) return;
    if (o instanceof Mesh) {
      (o.material.transparent ? this.trans : this.opaque).push(o);
    } else if (o instanceof PointLight) this.lights.push(o);
    else if (o instanceof AmbientLight) {
      const k = o.intensity;
      this.amb[0]! += (((o.color >> 16) & 255) / 255) * k;
      this.amb[1]! += (((o.color >> 8) & 255) / 255) * k;
      this.amb[2]! += ((o.color & 255) / 255) * k;
    }
    const ch = o.children;
    for (let i = 0; i < ch.length; i++) {
      ch[i]!.updateMatrixWorld();
      this.collect(ch[i]!);
    }
  }

  private prepareLights(cam: PerspectiveCamera): void {
    const m = cam.matrixWorld, cx = m[12]!, cy = m[13]!, cz = m[14]!;
    for (const l of this.lights) {
      const w = l.matrixWorld;
      l._dist = (w[12]! - cx) ** 2 + (w[13]! - cy) ** 2 + (w[14]! - cz) ** 2;
    }
    if (this.lights.length > MAX_LIGHTS) this.lights.sort(byLightDist);
    const n = (this.nLights = Math.min(this.lights.length, MAX_LIGHTS));
    for (let i = 0; i < n; i++) {
      const l = this.lights[i]!, w = l.matrixWorld, k = l.intensity;
      this.lp[i * 3] = w[12]!; this.lp[i * 3 + 1] = w[13]!; this.lp[i * 3 + 2] = w[14]!;
      this.lc[i * 3] = (((l.color >> 16) & 255) / 255) * k;
      this.lc[i * 3 + 1] = (((l.color >> 8) & 255) / 255) * k;
      this.lc[i * 3 + 2] = ((l.color & 255) / 255) * k;
      this.ld[i] = l.distance;
    }
    // transparent sort distances
    for (const o of this.trans) {
      const w = o.matrixWorld;
      o._dist = (w[12]! - cx) ** 2 + (w[13]! - cy) ** 2 + (w[14]! - cz) ** 2;
    }
  }

  private draw(mesh: Mesh): void {
    const gl = this.gl, mat = mesh.material, geo = this.uploadGeometry(mesh.geometry);
    if (geo.count === 0) return;
    const hasUv = !!mesh.geometry.attributes.uv;
    const map = mat.map && hasUv ? mat.map : null;
    const vcol = mat.vertexColors && !!mesh.geometry.attributes.color;
    const fog = this.fogOn && mat.fog;
    const mask = (mat._lit ? 1 : 0) | (map ? 2 : 0) | (vcol ? 4 : 0) | (fog ? 8 : 0) | (mat.alphaTest > 0 ? 16 : 0);
    const p = this.getProgram(mask, mat);
    gl.useProgram(p.prog);
    const u = p.u;

    if (p.frame !== this.frameId) {
      p.frame = this.frameId;
      gl.uniformMatrix4fv(u.uV!, false, this.cam!._view);
      gl.uniformMatrix4fv(u.uP!, false, this.cam!._proj);
      if (mask & 8) { gl.uniform3f(u.uFogColor!, this.fogC[0]!, this.fogC[1]!, this.fogC[2]!); gl.uniform2f(u.uFog!, this.fogN, this.fogF); }
      if (mask & 1) {
        gl.uniform3f(u.uAmbient!, this.amb[0]!, this.amb[1]!, this.amb[2]!);
        gl.uniform1i(u.uNL!, this.nLights);
        gl.uniform3fv(u.uLP!, this.lp); gl.uniform3fv(u.uLC!, this.lc); gl.uniform1fv(u.uLD!, this.ld);
      }
    }
    gl.uniformMatrix4fv(u.uModel!, false, mesh.matrixWorld);
    const c = mat.color;
    gl.uniform3f(u.uColor!, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
    gl.uniform1f(u.uOpacity!, mat.opacity);
    if (mask & 1) { const e = mat.emissive; gl.uniform3f(u.uEmissive!, ((e >> 16) & 255) / 255, ((e >> 8) & 255) / 255, (e & 255) / 255); }
    if (mask & 16) gl.uniform1f(u.uAlphaTest!, mat.alphaTest);
    if (map) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.uploadTexture(map));
      gl.uniform1i(u.uMap!, 0);
      gl.uniform4f(u.uUvT!, map.repeat.x, map.repeat.y, map.offset.x, map.offset.y);
    } else gl.uniform4f(u.uUvT!, 1, 1, 0, 0);

    // fixed-function state
    if (mat.side === DoubleSide) gl.disable(gl.CULL_FACE);
    else { gl.enable(gl.CULL_FACE); gl.cullFace(mat.side === BackSide ? gl.FRONT : gl.BACK); }
    if (mat.depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(mat.depthWrite);
    if (mat.transparent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, mat.blending === AdditiveBlending ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    } else gl.disable(gl.BLEND);

    // missing attributes fall back to constant values
    const a = mesh.geometry.attributes;
    if (!a.normal) gl.vertexAttrib3f(1, 0, 0, 1);
    if (!a.uv) gl.vertexAttrib2f(2, 0, 0);
    if (!a.color) gl.vertexAttrib3f(3, 1, 1, 1);

    gl.bindVertexArray(geo.vao);
    if (geo.idx) gl.drawElements(gl.TRIANGLES, geo.count, geo.idxType, 0);
    else gl.drawArrays(gl.TRIANGLES, 0, geo.count);
    this.info.render.calls++;
    this.info.render.triangles += geo.count / 3;
  }

  // ------------------------------------------------------------ programs
  private getProgram(mask: number, mat: Material): Prog {
    let p = this.progs[mask];
    if (!p) {
      const gl = this.gl;
      let defs = '';
      if (mask & 1) defs += '#define LIT\n';
      if (mask & 2) defs += '#define MAP\n';
      if (mask & 4) defs += '#define VCOL\n';
      if (mask & 8) defs += '#define FOG\n';
      if (mask & 16) defs += '#define ALPHATEST\n';
      const inject = (src: string): string => src.replace('\n', `\n${defs}`); // after #version line
      const prog = gl.createProgram()!;
      const shaders: WebGLShader[] = [];
      for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, inject(src));
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`mini3 shader error: ${gl.getShaderInfoLog(s)}`);
        gl.attachShader(prog, s);
        shaders.push(s);
      }
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`mini3 link error: ${gl.getProgramInfoLog(prog)}`);
      for (const s of shaders) { gl.detachShader(prog, s); gl.deleteShader(s); }
      const u: Record<string, WebGLUniformLocation | null> = {};
      for (const n of UNIFORMS) u[n] = gl.getUniformLocation(prog, n);
      p = { prog, u, refs: 0, frame: -1 };
      this.progs[mask] = p;
      this.info.programs++;
    }
    const bits = this.mats.get(mat) ?? 0;
    if (!(bits & (1 << mask))) {
      this.mats.set(mat, bits | (1 << mask));
      mat._owners.add(this);
      p.refs++;
    }
    return p;
  }

  // ----------------------------------------------------------- resources
  private uploadGeometry(g: BufferGeometry): GeoGpu {
    const gl = this.gl;
    let r = this.geoms.get(g);
    if (r && r.rev !== g._rev) { this.freeGeometry(r); this.geoms.delete(g); this.info.memory.geometries--; r = undefined; }
    if (!r) {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      r = { vao, rev: g._rev, bufs: {}, idx: null, idxType: gl.UNSIGNED_SHORT, count: 0 };
      for (const [name, loc, size] of ATTRS) {
        const attr = g.attributes[name];
        if (!attr) continue;
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, attr.array, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        r.bufs[name] = { buf, version: attr.version };
      }
      if (g.index) {
        r.idx = gl.createBuffer()!;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, r.idx);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.index, gl.STATIC_DRAW);
        r.idxType = g.index instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
        r.count = g.index.length;
      } else r.count = g.attributes.position ? Math.floor(g.attributes.position.count) : 0;
      gl.bindVertexArray(null);
      this.geoms.set(g, r);
      g._owners.add(this);
      this.info.memory.geometries++;
    } else {
      for (const [name] of ATTRS) { // in-place attribute updates (needsUpdate)
        const attr = g.attributes[name], b = r.bufs[name];
        if (attr && b && b.version !== attr.version) {
          gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
          gl.bufferData(gl.ARRAY_BUFFER, attr.array, gl.STATIC_DRAW);
          b.version = attr.version;
        }
      }
    }
    return r;
  }

  private freeGeometry(r: GeoGpu): void {
    const gl = this.gl;
    for (const k of Object.keys(r.bufs) as AttributeName[]) gl.deleteBuffer(r.bufs[k]!.buf);
    if (r.idx) gl.deleteBuffer(r.idx);
    gl.deleteVertexArray(r.vao);
  }

  private uploadTexture(t: Texture): WebGLTexture {
    const gl = this.gl;
    let r = this.texs.get(t);
    if (r && r.version === t._version) return r.tex;
    if (!r) {
      r = { tex: gl.createTexture()!, version: -1 };
      this.texs.set(t, r);
      t._owners.add(this);
      this.info.memory.textures++;
    }
    r.version = t._version;
    gl.bindTexture(gl.TEXTURE_2D, r.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, t.flipY);
    if (t instanceof DataTexture) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.width, t.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.data);
    } else if (t.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.image);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }
    const mips = t.minFilter !== NearestFilter && t.minFilter !== LinearFilter;
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, t.magFilter === NearestFilter ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this.minFilter(t.minFilter));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this.wrap(t.wrapS));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this.wrap(t.wrapT));
    return r.tex;
  }

  private wrap(w: number): number {
    const gl = this.gl;
    return w === ClampToEdgeWrapping ? gl.CLAMP_TO_EDGE : w === MirroredRepeatWrapping ? gl.MIRRORED_REPEAT : gl.REPEAT;
  }
  private minFilter(f: number): number {
    const gl = this.gl;
    switch (f) {
      case NearestFilter: return gl.NEAREST;
      case NearestMipmapNearestFilter: return gl.NEAREST_MIPMAP_NEAREST;
      case NearestMipmapLinearFilter: return gl.NEAREST_MIPMAP_LINEAR;
      case LinearMipmapNearestFilter: return gl.LINEAR_MIPMAP_NEAREST;
      case LinearMipmapLinearFilter: return gl.LINEAR_MIPMAP_LINEAR;
      default: return gl.LINEAR;
    }
  }

  /** Called by resource.dispose(): free whatever this renderer uploaded for `res`. */
  release(res: object): void {
    const gl = this.gl;
    const g = this.geoms.get(res as BufferGeometry);
    if (g) { this.freeGeometry(g); this.geoms.delete(res as BufferGeometry); this.info.memory.geometries--; }
    const t = this.texs.get(res as Texture);
    if (t) { gl.deleteTexture(t.tex); this.texs.delete(res as Texture); this.info.memory.textures--; }
    const bits = this.mats.get(res as Material);
    if (bits !== undefined) {
      this.mats.delete(res as Material);
      for (let m = 0; m < 32; m++) {
        const p = this.progs[m];
        if (p && bits & (1 << m) && --p.refs <= 0) { gl.deleteProgram(p.prog); this.progs[m] = undefined; this.info.programs--; }
      }
    }
  }

  /** Forget every GL object (context lost / dispose) without issuing GL calls. */
  private dropAll(): void {
    this.geoms.clear(); this.texs.clear(); this.mats.clear();
    this.progs.length = 0;
    this.info.memory.geometries = 0; this.info.memory.textures = 0; this.info.programs = 0;
  }

  dispose(): void {
    const gl = this.gl;
    if (!this.lost) {
      for (const g of this.geoms.keys()) { g._owners.delete(this); }
      for (const g of this.geoms.values()) this.freeGeometry(g);
      for (const t of this.texs.values()) gl.deleteTexture(t.tex);
      for (const p of this.progs) if (p) gl.deleteProgram(p.prog);
    }
    for (const t of this.texs.keys()) t._owners.delete(this);
    for (const m of this.mats.keys()) m._owners.delete(this);
    this.dropAll();
    this.domElement.removeEventListener('webglcontextlost', this.onLost);
    this.domElement.removeEventListener('webglcontextrestored', this.onRestored);
  }
}
