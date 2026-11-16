import type { DoorState, SessionContext, TriggerState, WorldDescription, WorldService } from '../../sdk/index.ts';
import { THREE } from '../../sdk/render.ts';
import type { ThemeAssets } from './assets.ts';
import { createQuadGeometry } from './quads.ts';

/** Growable indexed triangle soup. */
class Soup {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /** Quad given as left-bottom, right-bottom, right-top, left-top as seen from the front (normal n). Winding is fixed up from n. */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], n: readonly number[]): void {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0]!, p[1]!, p[2]!);
      this.nrm.push(n[0]!, n[1]!, n[2]!);
    }
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
    const cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
    const cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    if (cx * n[0]! + cy * n[1]! + cz * n[2]! >= 0) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

const UP = [0, 1, 0] as const;
const cross = (a: readonly number[], b: readonly number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

function buildLevelMeshes(desc: WorldDescription): Map<string, Soup> {
  const { width, height, cellSize: cs, wallHeight: H, cells } = desc;
  const soups = new Map<string, Soup>();
  const soup = (key: string): Soup => {
    let s = soups.get(key);
    if (!s) soups.set(key, (s = new Soup()));
    return s;
  };
  const solidAt = (x: number, z: number): boolean | undefined => (x < 0 || z < 0 || x >= width || z >= height ? undefined : cells[z * width + x]!.solid);

  for (let cz = 0; cz < height; cz++) {
    for (let cx = 0; cx < width; cx++) {
      const cell = cells[cz * width + cx]!;
      const x0 = cx * cs, x1 = x0 + cs, z0 = cz * cs, z1 = z0 + cs;
      if (cell.solid) {
        if (!cell.wall) continue;
        const s = soup(cell.wall);
        // A face exists only toward an open neighbour. Corners are listed left->right as seen from the open side.
        if (solidAt(cx, cz - 1) === false) s.quad([x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [0, 0, -1]);
        if (solidAt(cx, cz + 1) === false) s.quad([x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1]);
        if (solidAt(cx - 1, cz) === false) s.quad([x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0]);
        if (solidAt(cx + 1, cz) === false) s.quad([x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [1, 0, 0]);
      } else {
        if (cell.floor) soup(cell.floor).quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0]);
        if (cell.ceiling) soup(cell.ceiling).quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0]);
      }
    }
  }
  return soups;
}

/** Door slab as two meshes' worth of quads, centred on the origin: broad faces (door art) and edges (side art). */
function buildDoorSoups(d: DoorState['desc'], H: number): { faces: Soup; edges: Soup } {
  const alongX = d.axis === 'x';
  const hl = ((alongX ? d.maxX - d.minX : d.maxZ - d.minZ) / 2) - 0.004;
  const ht = (alongX ? d.maxZ - d.minZ : d.maxX - d.minX) / 2;
  const a = alongX ? [1, 0, 0] : [0, 0, 1];
  const t = alongX ? [0, 0, 1] : [1, 0, 0];
  const faces = new Soup();
  const edges = new Soup();
  for (const sgn of [1, -1]) {
    const n = [t[0]! * sgn, 0, t[2]! * sgn];
    const r = cross(UP, n); // "right" as seen from the front
    const c = [n[0]! * ht, 0, n[2]! * ht];
    const bl = [c[0]! - r[0]! * hl, 0, c[2]! - r[2]! * hl];
    const br = [c[0]! + r[0]! * hl, 0, c[2]! + r[2]! * hl];
    faces.quad(bl, br, [br[0]!, H, br[2]!], [bl[0]!, H, bl[2]!], n);
    // end caps (visible while a door slides sideways, never while closed)
    const en = [a[0]! * sgn, 0, a[2]! * sgn];
    const er = cross(UP, en);
    const ec = [en[0]! * hl, 0, en[2]! * hl];
    const ebl = [ec[0]! - er[0]! * ht, 0, ec[2]! - er[2]! * ht];
    const ebr = [ec[0]! + er[0]! * ht, 0, ec[2]! + er[2]! * ht];
    edges.quad(ebl, ebr, [ebr[0]!, H, ebr[2]!], [ebl[0]!, H, ebl[2]!], en);
  }
  const lb = [-a[0]! * hl - t[0]! * ht, 0, -a[2]! * hl - t[2]! * ht];
  const rb = [a[0]! * hl - t[0]! * ht, 0, a[2]! * hl - t[2]! * ht];
  const rf = [a[0]! * hl + t[0]! * ht, 0, a[2]! * hl + t[2]! * ht];
  const lf = [-a[0]! * hl + t[0]! * ht, 0, -a[2]! * hl + t[2]! * ht];
  const up = (p: number[]): number[] => [p[0]!, H, p[2]!];
  edges.quad(lb, rb, rf, lf, [0, -1, 0]);
  edges.quad(up(lb), up(rb), up(rf), up(lf), [0, 1, 0]);
  return { faces, edges };
}

export interface WorldMeshes {
  /** Per-frame animation: doors sliding, switch panels, exit pads. */
  update(time: number): void;
}

export function buildWorldMeshes(ctx: SessionContext, root: THREE.Group, world: WorldService, assets: ThemeAssets): WorldMeshes {
  const render = assets.render;
  const desc = world.desc;
  const H = desc.wallHeight;

  // --- static level: one mesh per distinct surface key
  for (const [key, soup] of buildLevelMeshes(desc)) {
    if (soup.idx.length === 0) continue;
    const mesh = new THREE.Mesh(render.own(ctx, soup.geometry()), assets.surface(key));
    mesh.name = `level:${key}`;
    root.add(mesh);
  }

  // --- doors
  const sideKey = assets.painter('door-side') ? 'door-side' : undefined;
  const doors: { state: DoorState; group: THREE.Group }[] = [];
  for (const state of world.doors()) {
    const d = state.desc;
    const { faces, edges } = buildDoorSoups(d, H);
    const group = new THREE.Group();
    group.name = `door:${d.id}`;
    group.position.set((d.minX + d.maxX) / 2, 0, (d.minZ + d.maxZ) / 2);
    group.add(new THREE.Mesh(render.own(ctx, faces.geometry()), assets.surface(d.surface)));
    group.add(new THREE.Mesh(render.own(ctx, edges.geometry()), assets.surface(sideKey ?? d.surface)));
    root.add(group);
    doors.push({ state, group });
  }

  // --- switches and exit pads share one unit quad
  const unit = render.own(ctx, createQuadGeometry(0.5));
  const switches: { state: TriggerState; mesh: THREE.Mesh; on: boolean }[] = [];
  const pads: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  const offMat = assets.unlit('switch-off');
  const onMat = assets.unlit('switch-on');
  for (const state of world.triggers()) {
    const t = state.desc;
    if (t.kind === 'switch') {
      const mesh = new THREE.Mesh(unit, offMat);
      mesh.name = `switch:${t.id}`;
      mesh.position.set(t.x + t.nx * 0.03, 1.3, t.z + t.nz * 0.03);
      mesh.rotation.y = Math.atan2(t.nx, t.nz);
      mesh.scale.set(0.55, 0.55, 1);
      root.add(mesh);
      switches.push({ state, mesh, on: false });
    } else if (t.tags.includes('exit')) {
      const mat = render.own(ctx, new THREE.MeshBasicMaterial({ map: assets.texture('exit-pad', false) }));
      const mesh = new THREE.Mesh(unit, mat);
      mesh.name = `exit:${t.id}`;
      const side = Math.max(1.2, t.radius * 2);
      mesh.position.set(t.x, 0.03, t.z);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(side, side, 1);
      root.add(mesh);
      pads.push({ mesh, mat });
    }
  }

  return {
    update(time) {
      for (const d of doors) {
        const o = d.state.openness;
        d.group.visible = o < 0.995;
        d.group.position.y = -o * (H + 0.05);
      }
      for (const s of switches) {
        const on = s.state.fired;
        if (on !== s.on) {
          s.on = on;
          s.mesh.material = on ? onMat : offMat;
        }
      }
      if (pads.length > 0) {
        const k = 0.78 + 0.22 * Math.sin(time * 3);
        const c = (Math.round(255 * k) << 16) | (Math.round(255 * k) << 8) | Math.round(255 * k);
        for (const p of pads) p.mat.color.setHex(c);
      }
    },
  };
}
