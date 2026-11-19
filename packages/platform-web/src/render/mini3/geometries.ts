import { BufferGeometry, Float32BufferAttribute } from './resources.ts';

function fill(g: BufferGeometry, p: number[], n: number[], uv: number[], idx: number[]): void {
  g.setAttribute('position', new Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
}

export class BoxGeometry extends BufferGeometry {
  constructor(width = 1, height = 1, depth = 1) {
    super();
    const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
    const hw = width / 2, hh = height / 2, hd = depth / 2;
    // face: normal, u axis, v axis (all unit vectors), half extents along u / v / normal
    const faces: [number, number, number, number, number, number, number, number, number, number, number, number][] = [
      [1, 0, 0, 0, 0, -1, 0, 1, 0, hd, hh, hw], [-1, 0, 0, 0, 0, 1, 0, 1, 0, hd, hh, hw],
      [0, 1, 0, 1, 0, 0, 0, 0, -1, hw, hd, hh], [0, -1, 0, 1, 0, 0, 0, 0, 1, hw, hd, hh],
      [0, 0, 1, 1, 0, 0, 0, 1, 0, hw, hh, hd], [0, 0, -1, -1, 0, 0, 0, 1, 0, hw, hh, hd],
    ];
    for (const [nx, ny, nz, ux, uy, uz, vx, vy, vz, eu, ev, en] of faces) {
      const base = p.length / 3;
      for (const [su, sv] of [[-1, 1], [-1, -1], [1, -1], [1, 1]] as const) {
        p.push(nx * en + ux * eu * su + vx * ev * sv, ny * en + uy * eu * su + vy * ev * sv, nz * en + uz * eu * su + vz * ev * sv);
        n.push(nx, ny, nz);
        uv.push((su + 1) / 2, (sv + 1) / 2);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    fill(this, p, n, uv, idx);
  }
}

/** XY plane facing +Z, centered at the origin. */
export class PlaneGeometry extends BufferGeometry {
  constructor(width = 1, height = 1) {
    super();
    const x = width / 2, y = height / 2;
    fill(this, [-x, y, 0, -x, -y, 0, x, -y, 0, x, y, 0], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      [0, 1, 0, 0, 1, 0, 1, 1], [0, 1, 2, 0, 2, 3]);
  }
}

/** Y-axis cylinder with caps. */
export class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 8) {
    super();
    const p: number[] = [], n: number[] = [], uv: number[] = [], idx: number[] = [];
    const hh = height / 2, slope = (radiusBottom - radiusTop) / height;
    for (let i = 0; i <= radialSegments; i++) {
      const u = i / radialSegments, s = Math.sin(u * Math.PI * 2), c = Math.cos(u * Math.PI * 2);
      const len = Math.hypot(1, slope);
      p.push(radiusTop * s, hh, radiusTop * c, radiusBottom * s, -hh, radiusBottom * c);
      n.push(s / len, slope / len, c / len, s / len, slope / len, c / len);
      uv.push(u, 1, u, 0);
      if (i < radialSegments) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    for (const top of [true, false]) {
      const r = top ? radiusTop : radiusBottom, y = top ? hh : -hh, ny = top ? 1 : -1;
      const centre = p.length / 3;
      p.push(0, y, 0); n.push(0, ny, 0); uv.push(0.5, 0.5);
      for (let i = 0; i <= radialSegments; i++) {
        const a = (i / radialSegments) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
        p.push(r * s, y, r * c); n.push(0, ny, 0); uv.push(s * 0.5 + 0.5, c * 0.5 * ny + 0.5);
        if (i < radialSegments) {
          const a0 = centre + 1 + i;
          if (top) idx.push(centre, a0, a0 + 1); else idx.push(centre, a0 + 1, a0);
        }
      }
    }
    fill(this, p, n, uv, idx);
  }
}
