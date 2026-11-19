import type { Painter } from '@bulkhead/sdk';

// ---------------------------------------------------------------- helpers

type Rng = () => number;
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/** Wraps a draw function: renders into a private canvas then blits, so ImageData post-passes ignore caller transforms. */
function painter(width: number, height: number, seed: number, draw: (c: Ctx, rng: Rng) => void): Painter {
  return {
    width,
    height,
    paint(ctx) {
      const cv = document.createElement('canvas');
      cv.width = width;
      cv.height = height;
      const c = cv.getContext('2d', { willReadFrequently: true });
      if (!c) return;
      c.imageSmoothingEnabled = false;
      draw(c, mulberry32(seed));
      ctx.drawImage(cv, 0, 0);
    },
  };
}

function r(c: Ctx, col: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function rgba(R: number, G: number, B: number, A: number): string {
  return `rgba(${R},${G},${B},${A})`;
}

/** Hard-edged polygon fill (pixel-centre sampling, no antialiasing). */
function poly(c: Ctx, col: string, pts: ReadonlyArray<readonly [number, number]>): void {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  c.fillStyle = col;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const py = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) {
        xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.round(xs[i]!), x1 = Math.round(xs[i + 1]!);
      if (x1 > x0) c.fillRect(x0, y, x1 - x0, 1);
    }
  }
}

/** Per-pixel painter: fn(dx,dy) returns a CSS colour or null. */
function pixels(c: Ctx, x0: number, y0: number, w: number, h: number, fn: (x: number, y: number) => string | null): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      if (col) { c.fillStyle = col; c.fillRect(x0 + x, y0 + y, 1, 1); }
    }
  }
}

function speckle(c: Ctx, rng: Rng, w: number, h: number, n: number, cols: readonly string[]): void {
  for (let i = 0; i < n; i++) {
    r(c, cols[Math.floor(rng() * cols.length)]!, Math.floor(rng() * w), Math.floor(rng() * h), 1, 1);
  }
}

/** Rim-light / shade pass: lit top-left edges, shaded bottom-right edges of opaque shapes within a frame. */
function shade(c: Ctx, ox: number, oy: number, w: number, h: number): void {
  const img = c.getImageData(ox, oy, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3]! > 200;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3]! <= 200) continue;
      const lit = !solid(x - 1, y) || !solid(x, y - 1);
      const dark = (!solid(x + 1, y) || !solid(x, y + 1)) && y < h - 1;
      if (lit && !dark) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, d[i + k]! * 1.3 + 14);
      else if (dark && !lit) for (let k = 0; k < 3; k++) d[i + k] = d[i + k]! * 0.7;
    }
  }
  c.putImageData(img, ox, oy);
}

/** Dark outline on fully transparent pixels touching opaque ones. */
function outline(c: Ctx, ox: number, oy: number, w: number, h: number, col: readonly [number, number, number]): void {
  const img = c.getImageData(ox, oy, w, h);
  const d = img.data;
  const src = new Uint8ClampedArray(d);
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3]! === 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3]! !== 0) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
  }
  c.putImageData(img, ox, oy);
}

/** Snap any partially transparent pixels that are not glow (alpha>=128) to opaque, others kept. */
function disc(c: Ctx, cx: number, cy: number, rad: number, fn: (d: number, dx: number, dy: number) => string | null): void {
  pixels(c, Math.floor(cx - rad), Math.floor(cy - rad), Math.ceil(rad * 2) + 1, Math.ceil(rad * 2) + 1, (x, y) => {
    const px = Math.floor(cx - rad) + x, py = Math.floor(cy - rad) + y;
    const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
    return fn(Math.sqrt(dx * dx + dy * dy), dx, dy);
  });
}

// ---------------------------------------------------------------- tiling textures

const STEEL = { base: '#46525f', hi: '#66758a', lo: '#232b36', mid: '#39434f', rivet: '#8d9bb0' };

function steelBase(c: Ctx, rng: Rng, x: number, y: number, w: number, h: number): void {
  r(c, STEEL.base, x, y, w, h);
  speckle(c, rng, 64, 64, 0, []);
  for (let i = 0; i < w * h * 0.12; i++) {
    r(c, rng() < 0.5 ? '#3f4a57' : '#4e5b69', x + Math.floor(rng() * w), y + Math.floor(rng() * h), 1, 1);
  }
}

function bevelRect(c: Ctx, x: number, y: number, w: number, h: number, hi: string, lo: string): void {
  r(c, hi, x, y, w, 1); r(c, hi, x, y, 1, h);
  r(c, lo, x, y + h - 1, w, 1); r(c, lo, x + w - 1, y, 1, h);
}

function rivet(c: Ctx, x: number, y: number): void {
  r(c, '#1c222b', x + 1, y + 1, 2, 2);
  r(c, STEEL.rivet, x, y, 2, 2);
  r(c, '#c4d0e0', x, y, 1, 1);
}

const wallPanel = painter(64, 64, 101, (c, rng) => {
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const x = px * 32, y = py * 32;
    steelBase(c, rng, x, y, 32, 32);
    if ((px + py) % 2 === 1) r(c, 'rgba(0,0,0,0.12)', x, y, 32, 32);
    bevelRect(c, x, y, 32, 32, STEEL.hi, STEEL.lo);
    bevelRect(c, x + 1, y + 1, 30, 30, '#3a4552', '#52607a');
    rivet(c, x + 3, y + 3); rivet(c, x + 27, y + 3); rivet(c, x + 3, y + 27); rivet(c, x + 27, y + 27);
    for (const rx of [x + 3, x + 27]) for (const ry of [y + 3, y + 27]) {
      r(c, 'rgba(20,24,30,0.35)', rx, ry + 3, 2, 5 + Math.floor(rng() * 3));
    }
  }
  // vent slots on one panel, stencil bar on another
  for (let i = 0; i < 4; i++) { r(c, '#161b22', 9, 10 + i * 3, 14, 1); r(c, '#5d6c80', 9, 11 + i * 3, 14, 1); }
  r(c, '#7a6a3a', 41, 14, 14, 2); r(c, '#7a6a3a', 41, 18, 8, 2);
  r(c, '#7a6a3a', 41, 22, 11, 2);
  // scuffs
  for (let i = 0; i < 6; i++) r(c, '#7e8da2', 4 + Math.floor(rng() * 56), 36 + Math.floor(rng() * 24), 2 + Math.floor(rng() * 3), 1);
});

const wallBrick = painter(64, 64, 202, (c, rng) => {
  r(c, '#241a18', 0, 0, 64, 64);
  const cols = ['#6b2e1e', '#7a3622', '#5c2619', '#843d26', '#6f3020', '#4e2217'];
  for (let row = 0; row < 8; row++) {
    const off = row % 2 === 0 ? 0 : 8;
    for (let b = -1; b < 5; b++) {
      const bx = b * 16 + off, by = row * 8;
      const col = cols[Math.floor(rng() * cols.length)]!;
      for (let yy = 1; yy < 8; yy++) for (let xx = 1; xx < 16; xx++) {
        const X = ((bx + xx) % 64 + 64) % 64;
        let cc = col;
        if (yy === 1) cc = '#94502f'; else if (yy === 7) cc = '#44190f';
        else if (rng() < 0.18) cc = cols[Math.floor(rng() * cols.length)]!;
        r(c, cc, X, by + yy, 1, 1);
      }
    }
  }
  speckle(c, rng, 64, 64, 60, ['#2a1410', '#a8643a', '#3a1c14']);
  // soot streaks
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rng() * 64), y = Math.floor(rng() * 40), l = 8 + Math.floor(rng() * 14);
    for (let k = 0; k < l; k++) r(c, 'rgba(10,6,6,0.28)', x, (y + k) % 64, 1, 1);
  }
});

const wallTech = painter(64, 64, 303, (c, rng) => {
  steelBase(c, rng, 0, 0, 64, 64);
  r(c, STEEL.lo, 0, 0, 64, 1); r(c, STEEL.lo, 0, 63, 64, 1);
  r(c, STEEL.hi, 0, 1, 64, 1);
  // vent grille left
  r(c, '#1a1f27', 4, 6, 24, 24);
  bevelRect(c, 4, 6, 24, 24, '#0f1318', '#6a7a90');
  for (let i = 0; i < 7; i++) { r(c, '#0b0e12', 6, 8 + i * 3, 20, 2); r(c, '#556277', 6, 10 + i * 3, 20, 1); }
  // cable bundle right, wraps vertically
  const cab = ['#c0502a', '#2f6fa8', '#c8a02a', '#3a3f48'];
  for (let i = 0; i < 4; i++) {
    const x = 36 + i * 4;
    for (let y = 0; y < 64; y++) {
      const wob = Math.round(Math.sin((y / 64) * Math.PI * 2 * (i + 1)) * 1.5);
      r(c, cab[i]!, x + wob, y, 3, 1);
      r(c, 'rgba(255,255,255,0.25)', x + wob, y, 1, 1);
      r(c, 'rgba(0,0,0,0.35)', x + wob + 2, y, 1, 1);
    }
  }
  for (let y = 4; y < 64; y += 16) { r(c, '#20262e', 34, y, 20, 3); r(c, '#6a7a90', 34, y, 20, 1); }
  // amber light strip
  r(c, '#14100a', 4, 40, 26, 8);
  for (let i = 0; i < 5; i++) {
    r(c, i === 3 ? '#6a4310' : '#ffb629', 6 + i * 5, 42, 4, 4);
    r(c, i === 3 ? '#6a4310' : '#fff0a0', 6 + i * 5, 42, 4, 1);
  }
  r(c, 'rgba(255,170,40,0.18)', 3, 38, 28, 12);
  // readout box
  r(c, '#161b22', 4, 52, 26, 8); r(c, '#2fa86a', 6, 54, 8, 1); r(c, '#2fa86a', 6, 57, 14, 1);
  rivet(c, 56, 8); rivet(c, 56, 52);
});

const wallHazard = painter(64, 64, 404, (c, rng) => {
  steelBase(c, rng, 0, 0, 64, 64);
  r(c, STEEL.lo, 0, 0, 64, 1); r(c, STEEL.hi, 0, 1, 64, 1);
  for (let y = 12; y < 52; y++) for (let x = 0; x < 64; x++) {
    const stripe = ((x + y) % 16) < 8;
    let col = stripe ? '#e8b414' : '#17181a';
    if (stripe && rng() < 0.12) col = '#c99810';
    if (y === 12 || y === 51) col = '#0d0e10';
    r(c, col, x, y, 1, 1);
  }
  // scuffs/wear
  for (let i = 0; i < 40; i++) r(c, i % 2 ? '#6b5a14' : '#3a3a3a', Math.floor(rng() * 64), 13 + Math.floor(rng() * 38), 1, 1);
  for (const x of [4, 20, 36, 52]) { rivet(c, x, 3); rivet(c, x, 57); }
  r(c, STEEL.lo, 0, 63, 64, 1);
});

const floorPlate = painter(64, 64, 505, (c, rng) => {
  r(c, '#2c333c', 0, 0, 64, 64);
  pixels(c, 0, 0, 64, 64, (x, y) => {
    const xx = (x + (((y >> 4) & 1) ? 8 : 0)) % 16, yy = y % 16;
    const d = Math.abs(xx - 7.5) + Math.abs(yy - 7.5);
    if (d < 4) return xx + yy < 15 ? '#8b99ab' : '#697789';
    if (d < 6) return xx + yy < 15 ? '#5d6b7c' : '#3c4653';
    if (d < 7) return '#1e242b';
    return null;
  });
  speckle(c, rng, 64, 64, 90, ['#222830', '#3a4450', '#505e6f']);
  r(c, '#14181d', 0, 0, 64, 1); r(c, '#14181d', 0, 0, 1, 64);
  r(c, '#59677a', 0, 1, 64, 1); r(c, '#59677a', 1, 1, 1, 62);
});

const floorConcrete = painter(64, 64, 606, (c, rng) => {
  r(c, '#6a6d70', 0, 0, 64, 64);
  speckle(c, rng, 64, 64, 900, ['#5e6164', '#76797c', '#6f7276', '#656a6e', '#808386']);
  // stains (wrapping)
  for (let s = 0; s < 4; s++) {
    const cx = Math.floor(rng() * 64), cy = Math.floor(rng() * 64), rad = 5 + Math.floor(rng() * 7);
    const oil = s === 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const d = Math.hypot(dx, dy) + (rng() - 0.5) * 3;
      if (d < rad) r(c, oil ? 'rgba(20,22,26,0.30)' : 'rgba(60,42,28,0.22)', (cx + dx + 64) % 64, (cy + dy + 64) % 64, 1, 1);
    }
  }
  // cracks
  let x = 12, y = 0;
  for (let i = 0; i < 50; i++) {
    r(c, '#34373a', x % 64, y % 64, 1, 1);
    y++; x += rng() < 0.5 ? 0 : (rng() < 0.5 ? 1 : -1);
  }
  // slab seams on tile border
  r(c, '#3d4044', 0, 0, 64, 1); r(c, '#3d4044', 0, 0, 1, 64);
  r(c, '#85888b', 0, 1, 64, 1); r(c, '#85888b', 1, 1, 1, 63);
});

const ceilingPanel = painter(64, 64, 707, (c, rng) => {
  r(c, '#262c35', 0, 0, 64, 64);
  speckle(c, rng, 64, 64, 200, ['#20252d', '#2d343e', '#2a303a']);
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {
    const x = px * 32, y = py * 32;
    bevelRect(c, x, y, 32, 32, '#3c4552', '#12161b');
    // ribs
    for (let i = 0; i < 4; i++) { r(c, '#161a20', x + 3, y + 5 + i * 6, 26, 2); r(c, '#414c5b', x + 3, y + 7 + i * 6, 26, 1); }
    r(c, '#5a6676', x + 2, y + 2, 2, 2); r(c, '#5a6676', x + 28, y + 2, 2, 2);
    r(c, '#5a6676', x + 2, y + 28, 2, 2); r(c, '#5a6676', x + 28, y + 28, 2, 2);
  }
  r(c, '#0e1115', 0, 31, 64, 2); r(c, '#0e1115', 31, 0, 2, 64);
  // dim lamp
  r(c, '#3a3426', 44, 44, 8, 3); r(c, '#7a6a3a', 45, 45, 6, 1);
});

const doorTex = painter(64, 64, 808, (c, rng) => {
  r(c, '#515d6c', 0, 0, 64, 64);
  speckle(c, rng, 64, 64, 300, ['#47525f', '#5a6676', '#4b5664']);
  for (const x0 of [0, 33]) {
    const w = 31;
    bevelRect(c, x0, 0, w, 64, '#7c8ba0', '#222a34');
    bevelRect(c, x0 + 3, 14, w - 6, 36, '#2f3945', '#6e7d92');
    r(c, '#3d4856', x0 + 4, 15, w - 8, 34);
    // red-orange hazard chevrons near top and bottom
    for (let i = 0; i < 4; i++) {
      r(c, '#e0531c', x0 + 4 + i * 7, 4, 4, 6);
      r(c, '#8a2a0c', x0 + 8 + i * 7 - 1, 4, 1, 6);
    }
    for (let i = 0; i < 4; i++) { r(c, '#e0531c', x0 + 4 + i * 7, 54, 4, 6); r(c, '#8a2a0c', x0 + 7 + i * 7, 54, 1, 6); }
    // arrow markings (outward)
    const dir = x0 === 0 ? -1 : 1;
    const cx = x0 + 15;
    for (let k = 0; k < 6; k++) { r(c, '#e0531c', cx + dir * k, 28 + k, 2, 1); r(c, '#e0531c', cx + dir * k, 36 - k, 2, 1); }
    r(c, '#e0531c', cx - 6, 31, 12, 2);
    rivet(c, x0 + 6, 17); rivet(c, x0 + w - 8, 17); rivet(c, x0 + 6, 43); rivet(c, x0 + w - 8, 43);
  }
  // centre seam
  r(c, '#0a0c10', 31, 0, 2, 64);
  r(c, '#242d38', 30, 0, 1, 64); r(c, '#242d38', 33, 0, 1, 64);
  // handles/locks
  r(c, '#c8a02a', 27, 30, 2, 5); r(c, '#c8a02a', 35, 30, 2, 5);
  r(c, '#6a5010', 28, 30, 1, 5); r(c, '#6a5010', 36, 30, 1, 5);
});

const doorSide = painter(64, 64, 909, (c, rng) => {
  r(c, '#3a4450', 0, 0, 64, 64);
  speckle(c, rng, 64, 64, 250, ['#323b46', '#424d5a', '#2e3640']);
  for (let y = 0; y < 64; y += 16) { r(c, '#161b22', 0, y, 64, 2); r(c, '#60708a', 0, y + 2, 64, 1); }
  // central warning stripe, vertical
  for (let y = 0; y < 64; y++) for (let x = 26; x < 38; x++) {
    r(c, ((x + y) % 16) < 8 ? '#d9a514' : '#17181a', x, y, 1, 1);
  }
  r(c, '#0d0e10', 25, 0, 1, 64); r(c, '#0d0e10', 38, 0, 1, 64);
  for (const y of [6, 22, 38, 54]) { rivet(c, 8, y); rivet(c, 54, y); }
  r(c, '#5a6a80', 0, 0, 1, 64); r(c, '#151a20', 63, 0, 1, 64);
});

function switchTex(on: boolean, seed: number): Painter {
  return painter(64, 64, seed, (c, rng) => {
    steelBase(c, rng, 0, 0, 64, 64);
    bevelRect(c, 0, 0, 64, 64, STEEL.hi, STEEL.lo);
    rivet(c, 3, 3); rivet(c, 59, 3); rivet(c, 3, 59); rivet(c, 59, 59);
    // housing
    r(c, '#161b22', 18, 8, 28, 48);
    bevelRect(c, 18, 8, 28, 48, '#0c0f13', '#6a7a90');
    r(c, '#252d37', 20, 10, 24, 44);
    // status lamp
    const lamp = on ? '#2ee86a' : '#e0322a';
    const lampDim = on ? '#128a3c' : '#7a1612';
    r(c, '#0b0e12', 27, 12, 10, 10);
    r(c, lampDim, 28, 13, 8, 8); r(c, lamp, 29, 14, 6, 6); r(c, '#ffffff', 29, 14, 2, 2);
    r(c, on ? 'rgba(46,232,106,0.22)' : 'rgba(224,50,42,0.22)', 24, 9, 16, 16);
    // slot + lever
    r(c, '#0a0c10', 29, 26, 6, 24);
    if (on) {
      r(c, '#8c98a8', 30, 27, 4, 8); r(c, '#2ee86a', 27, 24, 10, 5); r(c, '#b6ffd0', 27, 24, 10, 1);
    } else {
      r(c, '#8c98a8', 30, 41, 4, 8); r(c, '#e0322a', 27, 46, 10, 5); r(c, '#ff9a90', 27, 46, 10, 1);
    }
    r(c, '#d9a514', 22, 52, 20, 1);
  });
}

const exitPad = painter(64, 64, 1010, (c, rng) => {
  r(c, '#20262e', 0, 0, 64, 64);
  speckle(c, rng, 64, 64, 120, ['#1a1f26', '#2a313a']);
  r(c, '#0e1216', 0, 0, 64, 1); r(c, '#0e1216', 0, 0, 1, 64);
  r(c, '#4a5a6e', 0, 1, 64, 1); r(c, '#4a5a6e', 1, 1, 1, 63);
  r(c, 'rgba(46,232,106,0.12)', 4, 4, 56, 56);
  for (let i = 0; i < 3; i++) {
    const y = 12 + i * 16;
    const col = i === 1 ? '#7dffa8' : '#2ee86a';
    for (let k = 0; k < 14; k++) {
      r(c, col, 18 + k, y + 10 - k, 3, 3);
      r(c, col, 43 - k, y + 10 - k, 3, 3);
    }
  }
  for (const x of [6, 54]) for (const y of [6, 54]) r(c, '#2ee86a', x, y, 3, 3);
});

// ---------------------------------------------------------------- characters

const OUT: readonly [number, number, number] = [18, 8, 8];

interface GruntPose { bob: number; legL: number; legR: number; armL: number; armR: number; hurt: boolean; attack: boolean; dx: number }

function drawGrunt(c: Ctx, ox: number, p: GruntPose): void {
  const dark = p.hurt ? '#a85a48' : '#5a1d12';
  const mid = p.hurt ? '#e08a70' : '#a8381f';
  const light = p.hurt ? '#ffc8a8' : '#d4572f';
  const belly = p.hurt ? '#fff0d8' : '#e0693a';
  const bone = '#efe6c4';
  const X = (x: number): number => ox + x + p.dx;
  const b = p.bob;
  // legs
  const leg = (x: number, lift: number): void => {
    r(c, dark, X(x), 46 + b, 11, 17 - lift - b);
    r(c, mid, X(x + 1), 46 + b, 7, 14 - lift - b);
    r(c, '#2c0e08', X(x - 1), 61 - lift, 13, 2);
    r(c, bone, X(x - 1), 61 - lift, 2, 2); r(c, bone, X(x + 5), 61 - lift, 2, 2); r(c, bone, X(x + 10), 61 - lift, 2, 2);
  };
  leg(16, p.legL); leg(37, p.legR);
  // torso
  for (let y = 21; y <= 47; y++) {
    const hw = y < 30 ? 13 + (y - 21) : 22 - Math.floor((y - 30) / 3);
    r(c, y < 25 ? light : mid, X(32 - hw), y + b, hw * 2, 1);
  }
  r(c, belly, X(24), 35 + b, 16, 10);
  for (let i = 0; i < 3; i++) r(c, dark, X(25), 37 + i * 3 + b, 14, 1);
  r(c, dark, X(20), 24 + b, 3, 20); r(c, dark, X(41), 24 + b, 3, 20);
  r(c, '#3a1810', X(23), 45 + b, 18, 3);
  r(c, '#c8a02a', X(30), 45 + b, 4, 3);
  // shoulder spikes
  for (const sx of [10, 50]) { r(c, bone, X(sx), 17 + b, 3, 5); r(c, bone, X(sx + (sx < 32 ? 3 : -3)), 15 + b, 2, 4); }
  // head (sunk)
  const hrows = [4, 6, 8, 8, 8, 8, 8, 8, 8, 7, 6];
  hrows.forEach((hw, i) => r(c, i < 2 ? light : '#8a2d1b', X(32 - hw), 12 + i + b, hw * 2, 1));
  r(c, p.hurt ? '#400' : '#ffe040', X(26), 17 + b, 4, 3); r(c, p.hurt ? '#400' : '#ffe040', X(34), 17 + b, 4, 3);
  r(c, '#1a0604', X(27), 17 + b, 2, 1); r(c, '#1a0604', X(35), 17 + b, 2, 1);
  r(c, '#1a0604', X(26), 21 + b, 12, p.hurt || p.attack ? 4 : 2);
  for (let i = 0; i < 4; i++) r(c, bone, X(27 + i * 3), 21 + b, 1, 2);
  // arms
  const arm = (left: boolean, lift: number): void => {
    const x0 = left ? 2 : 50;
    const top = 23 + b - (p.attack ? 14 : 0) - lift;
    const bot = (p.attack ? 38 : 48) - lift;
    r(c, mid, X(x0), top, 12, bot - top);
    r(c, light, X(x0), top, 4, bot - top);
    r(c, dark, X(x0 + 9), top, 3, bot - top);
    r(c, dark, X(x0), bot - 6, 12, 1);
    // claws
    const cy = p.attack ? top - 9 : bot;
    const cl = p.attack ? top : bot;
    for (let i = 0; i < 3; i++) {
      const cx = x0 + 1 + i * 4;
      if (p.attack) { r(c, mid, X(cx), cl - 2, 3, 2); }
      r(c, bone, X(cx), cy + (p.attack ? 0 : 0), 3, p.attack ? 9 : 9);
      r(c, '#bdb48f', X(cx + 2), cy, 1, 9);
      r(c, bone, X(cx + 1), p.attack ? cy - 2 : cy + 9, 1, 2);
    }
  };
  arm(true, p.armL); arm(false, p.armR);
  shade(c, ox, 0, 64, 64);
  outline(c, ox, 0, 64, 64, OUT);
}

const enemyGrunt = painter(256, 64, 1111, (c) => {
  const base = { bob: 0, legL: 0, legR: 0, armL: 0, armR: 0, hurt: false, attack: false, dx: 0 };
  drawGrunt(c, 0, base);
  drawGrunt(c, 64, { ...base, bob: 1, legL: 4, armL: 3, armR: -2 });
  drawGrunt(c, 128, { ...base, attack: true, bob: 1 });
  drawGrunt(c, 192, { ...base, hurt: true, dx: 1, bob: 1, armL: -2 });
});

interface SpitPose { lean: number; legA: number; legB: number; armsUp: boolean; orb: number; hurt: boolean }

function drawSpitter(c: Ctx, ox: number, p: SpitPose): void {
  const dark = '#12383a', mid = p.hurt ? '#7fd0c4' : '#2a8078', light = p.hurt ? '#d4fff4' : '#5cc7b2';
  const L = p.lean;
  const X = (x: number): number => ox + x;
  // legs: thin, long
  const leg = (x: number, spread: number): void => {
    r(c, mid, X(x + L), 40, 4, 12);
    r(c, mid, X(x + spread + Math.floor(L / 2)), 52, 4, 9);
    r(c, dark, X(x + spread + Math.floor(L / 2) - 1), 61, 7, 2);
    r(c, light, X(x + L), 40, 1, 12);
  };
  leg(25, p.legA); leg(35, p.legB);
  // pelvis + torso
  r(c, dark, X(26 + L), 38, 12, 4);
  for (let y = 22; y < 38; y++) {
    const hw = y < 25 ? 8 : 6;
    r(c, y % 4 === 0 ? dark : mid, X(32 - hw + L), y, hw * 2, 1);
  }
  r(c, light, X(26 + L), 25, 2, 12);
  r(c, '#a8ff80', X(30 + L), 28, 4, 4); r(c, '#2e8a3a', X(31 + L), 29, 2, 2);
  // neck
  r(c, mid, X(30 + L), 14, 4, 9);
  // arms
  const arm = (left: boolean): void => {
    const sx = left ? 22 + L : 39 + L;
    if (p.armsUp) {
      r(c, mid, X(sx + (left ? 1 : 0)), 22, 3, 8);
      r(c, mid, X(sx + (left ? 3 : -3)), 14, 3, 9);
      r(c, light, X(sx + (left ? 5 : -5)), 11, 2, 4);
    } else {
      r(c, mid, X(sx), 23, 3, 18);
      r(c, mid, X(sx + (left ? -1 : 1)), 40, 3, 8);
      for (let i = 0; i < 3; i++) r(c, light, X(sx + (left ? -2 : 0) + i), 48, 1, 4 + (i === 1 ? 1 : 0));
    }
  };
  arm(true); arm(false);
  // spines on back/shoulders
  r(c, light, X(23 + L), 20, 2, 4); r(c, light, X(39 + L), 20, 2, 4);
  shade(c, ox, 0, 64, 64);
  // orb head with glow (drawn after shading so colours stay saturated)
  const cx = 32 + L + (p.hurt ? 1 : 0), cy = 9;
  const R = p.orb;
  disc(c, ox + cx, cy, R + 7, (d) => {
    if (d < R) {
      if (d < R * 0.35) return p.hurt ? '#ffffff' : '#e6ffc8';
      if (d < R * 0.7) return p.hurt ? '#caffc0' : '#8cff4a';
      return p.hurt ? '#7acf6a' : '#3ad020';
    }
    if (d < R + 1) return '#0f5a14';
    if (d < R + 3) return rgba(120, 255, 80, p.orb > 8 ? 0.35 : 0.2);
    if (d < R + 6) return rgba(120, 255, 80, p.orb > 8 ? 0.16 : 0.08);
    return null;
  });
  // eyes slits
  r(c, '#0a3a10', ox + cx - 4, cy - 1, 3, 2); r(c, '#0a3a10', ox + cx + 1, cy - 1, 3, 2);
  outlineSolid(c, ox);
}

/** Outline pass for spitter: only around alpha 255 pixels, leaving glow alone. */
function outlineSolid(c: Ctx, ox: number): void { outline(c, ox, 0, 64, 64, [4, 20, 20]); }

const enemySpitter = painter(256, 64, 1212, (c) => {
  drawSpitter(c, 0, { lean: 0, legA: 0, legB: 0, armsUp: false, orb: 7, hurt: false });
  drawSpitter(c, 64, { lean: 1, legA: -4, legB: 3, armsUp: false, orb: 7, hurt: false });
  drawSpitter(c, 128, { lean: -1, legA: 0, legB: 0, armsUp: true, orb: 9, hurt: false });
  drawSpitter(c, 192, { lean: 3, legA: 1, legB: 2, armsUp: false, orb: 6, hurt: true });
});

const enemyCorpse = painter(128, 64, 1313, (c, rng) => {
  // grunt remains
  r(c, '#4a0a0a', 6, 58, 52, 5); r(c, '#6a1010', 10, 56, 44, 3); r(c, '#3a0707', 14, 62, 36, 2);
  for (let y = 49; y < 62; y++) {
    const hw = 16 + Math.floor(Math.sin(((y - 49) / 12) * Math.PI) * 5);
    r(c, y < 52 ? '#d4572f' : '#a8381f', 32 - hw, y, hw * 2, 1);
  }
  r(c, '#7a2a18', 20, 56, 24, 4);
  r(c, '#e0693a', 24, 52, 14, 4);
  r(c, '#8a2d1b', 40, 52, 9, 7); r(c, '#1a0604', 43, 54, 2, 2); r(c, '#efe6c4', 41, 58, 6, 1);
  r(c, '#a8381f', 6, 54, 12, 6); for (let i = 0; i < 3; i++) r(c, '#efe6c4', 2, 54 + i * 2, 5, 1);
  r(c, '#7a2a18', 46, 58, 12, 4); r(c, '#efe6c4', 58, 59, 3, 1); r(c, '#efe6c4', 58, 61, 3, 1);
  r(c, '#a8381f', 22, 47, 4, 3); r(c, '#efe6c4', 15, 47, 3, 4);
  shade(c, 0, 0, 64, 64); outline(c, 0, 0, 64, 64, OUT);
  // spitter remains
  r(c, '#143a14', 70, 61, 50, 3); r(c, '#1c5a20', 74, 60, 40, 2);
  r(c, '#2a8078', 82, 57, 34, 4); r(c, '#5cc7b2', 82, 57, 34, 1); r(c, '#12383a', 82, 60, 34, 1);
  for (let i = 0; i < 5; i++) r(c, '#12383a', 86 + i * 6, 57, 1, 4);
  r(c, '#2a8078', 116, 52, 3, 6); r(c, '#2a8078', 118, 49, 3, 4);
  r(c, '#2a8078', 112, 62, 8, 1);
  r(c, '#5cc7b2', 70, 62, 14, 1); r(c, '#2a8078', 66, 59, 18, 2);
  disc(c, 76, 55, 6, (d) => d < 5.5 ? (d < 2.5 ? '#4a8a3a' : '#2a6a22') : null);
  r(c, '#0a2a0a', 75, 52, 1, 3); r(c, '#0a2a0a', 76, 55, 3, 1);
  shade(c, 64, 0, 64, 64); outline(c, 64, 0, 64, 64, [4, 20, 20]);
  void rng;
});

// ---------------------------------------------------------------- pickups

const pickupHealth = painter(32, 32, 1414, (c) => {
  r(c, '#e8ecf0', 5, 9, 22, 18); r(c, '#ffffff', 5, 9, 22, 2); r(c, '#aab4c0', 5, 25, 22, 2);
  r(c, '#c8d0d8', 25, 9, 2, 18);
  r(c, '#e01818', 14, 12, 4, 12); r(c, '#e01818', 10, 16, 12, 4);
  r(c, '#ff6a60', 14, 12, 4, 1); r(c, '#ff6a60', 10, 16, 12, 1);
  r(c, '#8a8f98', 13, 6, 6, 3); r(c, '#aab4c0', 14, 7, 4, 1);
  outline(c, 0, 0, 32, 32, [20, 24, 30]);
});

const pickupBullets = painter(32, 32, 1515, (c) => {
  r(c, '#5a4a2a', 4, 14, 24, 13); r(c, '#e8a820', 5, 13, 22, 13); r(c, '#ffd860', 5, 13, 22, 2); r(c, '#a8700c', 5, 24, 22, 2);
  r(c, '#2a2418', 8, 17, 16, 5);
  for (let i = 0; i < 4; i++) { r(c, '#fff0a0', 9 + i * 4, 17, 2, 5); r(c, '#c88a10', 9 + i * 4, 17, 1, 5); r(c, '#b87820', 9 + i * 4, 15, 2, 2); }
  r(c, '#7a7468', 4, 11, 24, 3); r(c, '#aaa498', 4, 11, 24, 1);
  outline(c, 0, 0, 32, 32, [30, 20, 6]);
});

const pickupCells = painter(32, 32, 1616, (c) => {
  disc(c, 16, 16, 15, (d) => d < 15 && d > 11 ? rgba(60, 160, 255, 0.18) : d <= 11 ? rgba(60, 160, 255, 0.1) : null);
  r(c, '#6a7686', 10, 5, 12, 4); r(c, '#9aa8ba', 10, 5, 12, 1);
  r(c, '#6a7686', 10, 23, 12, 4); r(c, '#3a4452', 10, 26, 12, 1);
  r(c, '#1858c8', 9, 9, 14, 14); r(c, '#2a8cff', 10, 9, 12, 14); r(c, '#78d0ff', 11, 9, 3, 14);
  r(c, '#d8f6ff', 12, 12, 2, 8); r(c, '#1040a0', 21, 9, 2, 14);
  r(c, '#f0c030', 9, 15, 14, 2);
  outline(c, 0, 0, 32, 32, [6, 16, 50]);
});

// ---------------------------------------------------------------- effects

const fxPlasma = painter(32, 32, 1717, (c) => {
  disc(c, 16, 16, 16, (d, dx, dy) => {
    const spike = Math.min(Math.abs(dx), Math.abs(dy)) < 1 && d < 15;
    if (d < 4) return '#ffffff';
    if (d < 6.5) return '#c8f8ff';
    if (d < 9) return '#38d4ff';
    if (d < 10.5) return '#1a8ad8';
    if (spike) return rgba(120, 230, 255, 0.55);
    if (d < 13) return rgba(56, 212, 255, 0.35);
    if (d < 15.5) return rgba(56, 212, 255, 0.14);
    return null;
  });
});

const fxFireball = painter(32, 32, 1818, (c, rng) => {
  const lobes = Array.from({ length: 8 }, () => 0.6 + rng() * 0.9);
  disc(c, 16, 16, 15, (d, dx, dy) => {
    const a = Math.atan2(dy, dx);
    const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 8;
    const R = 8 + lobes[k]! * 2.5;
    if (d < 3) return '#f8ffd0';
    if (d < 5.5) return '#c4ff50';
    if (d < R - 2) return '#38d818';
    if (d < R) return '#168a14';
    if (d < R + 1) return '#0a4a0c';
    if (d < R + 4) return rgba(80, 255, 60, 0.22);
    return null;
  });
});

const fxRicochetP = painter(32, 32, 1919, (c) => {
  pixels(c, 0, 0, 32, 32, (x, y) => {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16;
    const u = (dx - dy) / Math.SQRT2; // along bolt (top-right to bottom-left)
    const v = (dx + dy) / Math.SQRT2;
    const zig = Math.sin(u * 0.9) * 1.6;
    const w = Math.abs(v - zig);
    const len = Math.abs(u);
    const taper = Math.max(0, 1 - len / 15);
    if (w < 1.0 * taper + 0.4 && len < 14) return '#ffffff';
    if (w < 2.4 * taper + 0.6 && len < 14) return '#ff6ae6';
    if (w < 3.6 * taper + 0.8 && len < 14.5) return '#b8189a';
    if (w < 6 * taper + 1 && len < 15) return rgba(255, 70, 220, 0.25);
    return null;
  });
  disc(c, 16, 16, 6, (d) => d < 2.5 ? '#ffffff' : d < 4.5 ? '#ffa0f0' : d < 5.5 ? rgba(255, 70, 220, 0.5) : null);
});

const fxSpark = painter(128, 32, 2020, (c, rng) => {
  const radii = [4, 8, 11, 13];
  for (let f = 0; f < 4; f++) {
    const ox = f * 32;
    if (f < 2) {
      disc(c, ox + 16, 16, radii[f]!, (d) => d < radii[f]! * 0.45 ? '#ffffff' : d < radii[f]! * 0.8 ? '#ffe060' : d < radii[f]! ? '#ff9020' : null);
    }
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.4;
      const rr = radii[f]! + (f === 0 ? 2 : f * 1.5) * (0.6 + rng() * 0.8);
      const x = Math.round(ox + 16 + Math.cos(a) * rr), y = Math.round(16 + Math.sin(a) * rr);
      const col = f === 3 ? '#a85a20' : f === 2 ? '#ff9020' : '#ffe060';
      r(c, col, x, y, f >= 2 ? 1 : 2, f >= 2 ? 1 : 2);
      if (f === 1) r(c, '#ffffff', x, y, 1, 1);
    }
    if (f >= 2) disc(c, ox + 16, 16, radii[f]! - 1, (d) => d > radii[f]! - 4 && d < radii[f]! - 2 && rng() < 0.28 ? '#ff9020' : null);
  }
});

const fxMuzzle = painter(64, 64, 2121, (c) => {
  pixels(c, 0, 0, 64, 64, (x, y) => {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32;
    const d = Math.hypot(dx, dy);
    let best = -1;
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4 + (k % 2 ? 0.0 : 0);
      const len = k % 2 === 0 ? 31 : 19;
      const along = dx * Math.cos(ang) + dy * Math.sin(ang);
      const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
      if (along > 0 && along < len && perp < (1 - along / len) * 4.5 + 0.4) best = Math.max(best, 1 - along / len);
    }
    let q = best;
    if (d < 10) q = Math.max(q, 1 - d / 14);
    if (q < 0) return null;
    if (q > 0.8) return '#ffffff';
    if (q > 0.55) return '#fff4b0';
    if (q > 0.3) return '#ffd23a';
    return '#ff8c1a';
  });
});

const fxBlood = painter(128, 32, 2222, (c, rng) => {
  const spread = [3, 7, 11, 14];
  for (let f = 0; f < 4; f++) {
    const ox = f * 32;
    if (f < 2) disc(c, ox + 16, 16, f === 0 ? 4 : 5, (d) => d < 2.5 ? '#e02a2a' : d < 4.5 ? '#a01010' : d < 5.5 ? '#6a0808' : null);
    const n = f === 0 ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.6;
      const rr = spread[f]! * (0.5 + rng() * 0.7);
      const x = Math.round(ox + 16 + Math.cos(a) * rr), y = Math.round(16 + Math.sin(a) * rr + f * 0.8);
      const s = f === 0 ? 3 : f === 3 ? 1 : 2;
      r(c, rng() < 0.5 ? '#c01818' : '#8a0c0c', x, y, s, s);
      if (s > 1) r(c, '#ff5a50', x, y, 1, 1);
    }
  }
});

// ---------------------------------------------------------------- weapons (128x128, first person)

function glove(c: Ctx): void {
  // fist wrapped around grip, forearm sleeve rising from bottom right
  poly(c, '#4a3a2e', [[40, 100], [54, 94], [90, 98], [96, 112], [96, 128], [38, 128], [36, 112]]);
  poly(c, '#6a5444', [[40, 100], [54, 94], [64, 96], [60, 112], [38, 116]]);
  for (let i = 0; i < 4; i++) { r(c, '#2e231a', 70 + i * 6, 100, 1, 12); r(c, '#7a6452', 66 + i * 6, 99, 5, 1); }
  poly(c, '#3a4a60', [[62, 112], [110, 108], [128, 128], [56, 128]]);
  poly(c, '#566a88', [[62, 112], [110, 108], [112, 112], [64, 118]]);
  r(c, '#1a222e', 70, 120, 56, 1); r(c, '#d9a514', 96, 116, 14, 3);
}

const weaponPistol = painter(128, 128, 2323, (c) => {
  // lower frame / trigger guard
  poly(c, '#3c4654', [[46, 98], [82, 98], [88, 118], [40, 118]]);
  // chunky slide seen from behind and slightly above
  poly(c, '#7d8a9c', [[50, 54], [78, 54], [83, 102], [45, 102]]);
  poly(c, '#566272', [[50, 54], [55, 54], [52, 102], [45, 102]]);
  poly(c, '#566272', [[73, 54], [78, 54], [83, 102], [76, 102]]);
  poly(c, '#b4c0d0', [[57, 56], [71, 56], [73, 100], [55, 100]]);
  poly(c, '#d6e0ec', [[61, 56], [67, 56], [68, 100], [60, 100]]);
  // muzzle end and bore
  r(c, '#2a323e', 50, 47, 28, 8); r(c, '#465264', 50, 47, 28, 2);
  r(c, '#05070a', 59, 49, 10, 5);
  // front sight
  r(c, '#1a2028', 61, 41, 6, 7); r(c, '#e0a020', 63, 42, 2, 3);
  // slide serrations
  for (let i = 0; i < 5; i++) { r(c, '#2c3440', 47 + (i >> 1), 80 + i * 4, 4, 2); r(c, '#2c3440', 77 - (i >> 1), 80 + i * 4, 4, 2); }
  // rear sight
  r(c, '#2c3440', 50, 93, 8, 9); r(c, '#2c3440', 70, 93, 8, 9);
  r(c, '#8a96a8', 50, 93, 8, 1); r(c, '#8a96a8', 70, 93, 8, 1);
  r(c, '#e0a020', 53, 95, 2, 2); r(c, '#e0a020', 73, 95, 2, 2);
  glove(c);
  outline(c, 0, 0, 128, 128, [10, 12, 16]);
});

const weaponLauncher = painter(128, 128, 2424, (c) => {
  // main body
  poly(c, '#4c5766', [[42, 40], [86, 40], [100, 104], [28, 104]]);
  poly(c, '#35404e', [[42, 40], [50, 40], [40, 104], [28, 104]]);
  poly(c, '#35404e', [[78, 40], [86, 40], [100, 104], [88, 104]]);
  // side fins
  for (let i = 0; i < 5; i++) { r(c, '#222a35', 34 - i * 2, 54 + i * 9, 6, 3); r(c, '#222a35', 88 + i * 2, 54 + i * 9, 6, 3); r(c, '#7d8a9c', 34 - i * 2, 54 + i * 9, 6, 1); r(c, '#7d8a9c', 88 + i * 2, 54 + i * 9, 6, 1); }
  // glowing centre rail
  r(c, '#0a1c2a', 58, 44, 12, 56);
  for (let i = 0; i < 9; i++) { r(c, i % 2 ? '#38d4ff' : '#c8f8ff', 60, 46 + i * 6, 8, 4); }
  r(c, 'rgba(56,212,255,0.22)', 55, 44, 18, 56);
  // muzzle housing
  poly(c, '#2e3744', [[36, 14], [92, 14], [96, 40], [32, 40]]);
  poly(c, '#6a7686', [[36, 14], [92, 14], [92, 18], [36, 18]]);
  r(c, '#1a212b', 32, 36, 64, 4);
  r(c, '#d9a514', 36, 30, 6, 3); r(c, '#d9a514', 86, 30, 6, 3);
  disc(c, 64, 26, 12, (d) => d < 4 ? '#ffffff' : d < 8 ? '#7ae4ff' : d < 10.5 ? '#1a8ad8' : d < 12 ? '#0a2a44' : null);
  disc(c, 64, 26, 17, (d) => d >= 12 && d < 16 ? rgba(56, 212, 255, 0.18) : null);
  // energy cell on side
  r(c, '#1a222e', 92, 60, 14, 32); r(c, '#2a8cff', 94, 62, 10, 28); r(c, '#9ee8ff', 95, 62, 3, 28);
  r(c, '#6a7686', 92, 58, 14, 3); r(c, '#6a7686', 92, 91, 14, 3);
  // grip block
  poly(c, '#3a4452', [[48, 100], [82, 100], [86, 120], [44, 120]]);
  glove(c);
  outline(c, 0, 0, 128, 128, [8, 10, 14]);
});

const weaponRicochet = painter(128, 128, 2525, (c) => {
  // fork prongs
  poly(c, '#4a5666', [[52, 6], [58, 6], [60, 40], [54, 40]]);
  poly(c, '#4a5666', [[70, 6], [76, 6], [74, 40], [68, 40]]);
  poly(c, '#8a96aa', [[52, 6], [54, 6], [56, 40], [54, 40]]);
  poly(c, '#8a96aa', [[70, 6], [72, 6], [70, 40], [68, 40]]);
  // crackle between prongs
  for (let i = 0; i < 7; i++) r(c, i % 2 ? '#ffffff' : '#ff6ae6', 60 + (i % 3) - 1, 8 + i * 4, 3, 2);
  r(c, 'rgba(255,70,220,0.25)', 58, 6, 12, 34);
  // barrel
  poly(c, '#5a6676', [[58, 38], [70, 38], [72, 76], [56, 76]]);
  poly(c, '#9aa8bc', [[62, 38], [65, 38], [65, 76], [61, 76]]);
  // coils
  for (let i = 0; i < 5; i++) {
    const y = 42 + i * 8;
    r(c, '#1a1020', 52, y, 24, 6);
    r(c, i % 2 ? '#c81aa8' : '#ff3ad0', 53, y + 1, 22, 4);
    r(c, '#ffc0f4', 53, y + 1, 22, 1);
    r(c, '#6a0a58', 53, y + 4, 22, 1);
  }
  r(c, 'rgba(255,58,208,0.18)', 48, 40, 32, 42);
  // angular receiver
  poly(c, '#46526a', [[50, 78], [78, 78], [92, 94], [88, 114], [40, 114], [36, 94]]);
  poly(c, '#2e384c', [[50, 78], [56, 78], [44, 94], [40, 114], [36, 94]]);
  poly(c, '#2e384c', [[72, 78], [78, 78], [92, 94], [88, 114], [84, 94]]);
  poly(c, '#7a88a4', [[56, 78], [72, 78], [78, 84], [50, 84]]);
  // power core window
  r(c, '#14081a', 56, 88, 16, 16); r(c, '#ff3ad0', 58, 90, 12, 12); r(c, '#ffc0f4', 60, 92, 5, 5); r(c, '#ffffff', 61, 93, 2, 2);
  r(c, 'rgba(255,58,208,0.22)', 53, 85, 22, 22);
  r(c, '#d9a514', 42, 100, 8, 3); r(c, '#d9a514', 78, 100, 8, 3);
  glove(c);
  outline(c, 0, 0, 128, 128, [10, 6, 14]);
});

// ---------------------------------------------------------------- exports

export const textures: Record<string, Painter> = {
  'wall-panel': wallPanel,
  'wall-brick': wallBrick,
  'wall-tech': wallTech,
  'wall-hazard': wallHazard,
  'floor-plate': floorPlate,
  'floor-concrete': floorConcrete,
  'ceiling-panel': ceilingPanel,
  door: doorTex,
  'door-side': doorSide,
  'switch-off': switchTex(false, 1001),
  'switch-on': switchTex(true, 1002),
  'exit-pad': exitPad,
  'enemy-grunt': enemyGrunt,
  'enemy-spitter': enemySpitter,
  'enemy-corpse': enemyCorpse,
  'pickup-health': pickupHealth,
  'pickup-bullets': pickupBullets,
  'pickup-cells': pickupCells,
  'fx-plasma': fxPlasma,
  'fx-fireball': fxFireball,
  'fx-ricochet': fxRicochetP,
  'fx-spark': fxSpark,
  'fx-muzzle': fxMuzzle,
  'fx-blood': fxBlood,
  'weapon-pistol': weaponPistol,
  'weapon-launcher': weaponLauncher,
  'weapon-ricochet': weaponRicochet,
};
