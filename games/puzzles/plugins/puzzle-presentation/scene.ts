import type { SessionContext, ThemeProvider } from '@bulkhead/sdk';
import type { PuzzleCell, PuzzleSnapshot, PushPuzzleService } from '../../contracts/puzzle.ts';
import { THREE } from '@bulkhead/sdk/render.ts';
import type { RenderService } from '@bulkhead/sdk/render.ts';

/** Original volumetric models; palette and silhouettes follow the curated voxel explorer, rocks and chalk golem. */
export function createScene(ctx: SessionContext, render: RenderService, puzzle: PushPuzzleService, theme: ThemeProvider | undefined) {
  const root = render.createRoot(ctx, 'world'), chamberRoot = new THREE.Group();
  root.add(chamberRoot);
  render.setEnvironment({ background: 0x111e21, fog: { color: 0x111e21, near: 42, far: 85 } });
  root.add(new THREE.HemisphereLight(0xd7f7ee, 0x253044, 2.1));
  const sun = new THREE.DirectionalLight(0xffd9a1, 3.0);
  sun.position.set(-5, 14, 8); root.add(sun);
  const rim = new THREE.DirectionalLight(0x6fc7c7, 1.6);
  rim.position.set(8, 5, -9); root.add(rim);
  const camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 100);
  render.setWorldCamera(ctx, camera);
  const cube = render.own(ctx, new THREE.BoxGeometry(1, 1, 1));
  const rockGeo = render.own(ctx, new THREE.DodecahedronGeometry(0.48, 0));
  const diskGeo = render.own(ctx, new THREE.CylinderGeometry(0.5, 0.5, 1, 32));
  const ringGeo = render.own(ctx, new THREE.TorusGeometry(0.34, 0.032, 5, 24));
  const coneGeo = render.own(ctx, new THREE.ConeGeometry(0.17, 0.36, 4));
  const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => render.own(ctx, new THREE.MeshStandardMaterial({ color, roughness: 0.87, flatShading: true, ...extra }));
  const stone = mat(0x7c8b85), stoneDark = mat(0x354b4b), stoneTop = mat(0x96a59b), moss = mat(0x465b42);
  const woodPainter = theme?.textures['puzzle-floor'];
  const floor = mat(0x647265, woodPainter ? { map: render.texture(ctx, 'puzzle/floor', {
    width: woodPainter.width, height: woodPainter.height,
    paint(g) {
      woodPainter.paint(g);
      // Weather the curated boardwalk so its fine pattern stays subordinate to the movable pieces.
      g.fillStyle = 'rgba(119,118,89,0.55)'; g.fillRect(0, 0, woodPainter.width, woodPainter.height);
    },
  }) } : {});
  const gold = mat(0xcaa260, { metalness: 0.32, roughness: 0.5 });
  const inactive = mat(0x475c59, { emissive: 0x142f2a, emissiveIntensity: 0.5 });
  const active = mat(0x8affce, { emissive: 0x42eaa1, emissiveIntensity: 1.4 });
  const red = mat(0xff8766, { emissive: 0xd34a26, emissiveIntensity: 1.1 });
  const cloth = mat(0x6f7d47), skin = mat(0xd7b087), leather = mat(0x705338), boots = mat(0x293434), chalk = mat(0xb5b7a7);
  const shadow = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0x071318, transparent: true, opacity: 0.32, depthWrite: false }));
  const selectMaterial = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0xb0ffe2, transparent: true, opacity: 0.65, depthWrite: false }));
  const box = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const m = new THREE.Mesh(cube, material); m.position.set(x, y, z); m.scale.set(w, h, d); parent.add(m); return m;
  };
  const disk = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, size: number, height: number) => {
    const m = new THREE.Mesh(diskGeo, material); m.position.set(x, y, z); m.scale.set(size, height, size); parent.add(m); return m;
  };
  const ground = box(root, mat(0x1b3032), 0, -1.15, 0, 70, 0.1, 70);
  ground.name = 'stonewake-ground';
  const shadowTexture = render.texture(ctx, 'puzzle/soft-shadow', {
    width: 128, height: 128,
    paint(g) {
      const gradient = g.createRadialGradient(64, 64, 20, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(4,15,18,0.55)'); gradient.addColorStop(1, 'rgba(4,15,18,0)');
      g.fillStyle = gradient; g.fillRect(0, 0, 128, 128);
    },
  });
  const islandShadow = new THREE.Mesh(render.own(ctx, new THREE.PlaneGeometry(1, 1)), render.own(ctx,
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })));
  islandShadow.rotation.x = -Math.PI / 2; islandShadow.position.y = -1.08; root.add(islandShadow);
  const selector = new THREE.Mesh(ringGeo, selectMaterial);
  selector.rotation.x = -Math.PI / 2; selector.visible = false; root.add(selector);
  let width = 9, height = 7, currentChamber = -1, yaw = Math.PI / 4, goalYaw = yaw;
  let clock = 0, state: PuzzleSnapshot = puzzle.state();
  const tiles: THREE.Mesh[] = [];
  const plates: { p: PuzzleCell; mesh: THREE.Mesh }[] = [];
  const gateBars: THREE.Mesh[] = [];
  type Piece = { root: THREE.Group; body: THREE.Group; limbs: THREE.Object3D[]; target: THREE.Vector3; yaw: number };
  let explorer: Piece;
  let rocks: Piece[] = [], golems: Piece[] = [];
  const world = (p: PuzzleCell) => new THREE.Vector3(p.x - (width - 1) / 2, 0, p.y - (height - 1) / 2);
  function piece(p: PuzzleCell, kind: 'explorer' | 'golem' | 'rock'): Piece {
    const group = new THREE.Group(), body = new THREE.Group(), limbs: THREE.Object3D[] = [];
    group.add(body); group.position.copy(world(p)); chamberRoot.add(group);
    disk(group, shadow, 0.05, 0.025, 0.05, kind === 'golem' ? 0.95 : 0.8, 0.012);
    if (kind === 'rock') {
      const large = new THREE.Mesh(rockGeo, stoneTop); large.position.set(0, 0.43, 0); large.scale.set(0.92, 0.91, 0.85); large.rotation.set(0.2, 0.5, 0.1); body.add(large);
      const small = new THREE.Mesh(rockGeo, stone); small.position.set(0.24, 0.2, 0.2); small.scale.setScalar(0.42); body.add(small);
      box(body, moss, -0.12, 0.79, 0.03, 0.28, 0.045, 0.22);
      box(body, gold, 0.04, 0.55, 0.36, 0.18, 0.12, 0.06);
    } else if (kind === 'explorer') {
      for (const x of [-0.14, 0.14]) {
        const limb = new THREE.Group(); limb.position.set(x, 0.38, 0); body.add(limb); limbs.push(limb);
        box(limb, leather, 0, -0.1, 0, 0.16, 0.3, 0.18); box(limb, boots, 0, -0.29, -0.04, 0.18, 0.12, 0.26);
      }
      box(body, cloth, 0, 0.62, 0, 0.43, 0.48, 0.29);
      box(body, leather, 0, 0.62, 0.21, 0.32, 0.32, 0.18);
      box(body, gold, -0.15, 0.68, -0.16, 0.045, 0.43, 0.025);
      box(body, skin, 0, 1.0, -0.015, 0.28, 0.29, 0.27);
      box(body, leather, 0, 1.13, 0, 0.43, 0.07, 0.4);
      box(body, cloth, 0, 1.21, 0.02, 0.3, 0.13, 0.28);
      for (const x of [-0.065, 0.065]) box(body, boots, x, 1.02, -0.156, 0.035, 0.038, 0.02);
      for (const x of [-0.28, 0.28]) {
        const limb = new THREE.Group(); limb.position.set(x, 0.78, 0); body.add(limb); limbs.push(limb);
        box(limb, cloth, 0, -0.1, 0, 0.14, 0.31, 0.17); box(limb, skin, 0, -0.28, -0.01, 0.13, 0.13, 0.14);
      }
      const marker = new THREE.Mesh(coneGeo, active); marker.position.y = 1.57; marker.rotation.z = Math.PI; body.add(marker);
    } else {
      for (const x of [-0.21, 0.21]) {
        const limb = new THREE.Group(); limb.position.set(x, 0.43, 0); body.add(limb); limbs.push(limb);
        box(limb, stone, 0, -0.16, 0, 0.27, 0.42, 0.3); box(limb, chalk, 0, -0.33, -0.06, 0.31, 0.17, 0.39);
      }
      box(body, chalk, 0, 0.8, 0, 0.64, 0.62, 0.42);
      box(body, stone, 0, 0.7, -0.22, 0.17, 0.2, 0.035);
      box(body, red, 0, 0.77, -0.25, 0.1, 0.09, 0.025);
      box(body, stoneTop, 0, 1.25, 0, 0.43, 0.39, 0.38);
      for (const x of [-0.1, 0.1]) box(body, red, x, 1.27, -0.2, 0.09, 0.055, 0.025);
      for (const x of [-0.45, 0.45]) {
        const limb = new THREE.Group(); limb.position.set(x, 0.94, 0); body.add(limb); limbs.push(limb);
        box(limb, chalk, 0, -0.12, 0, 0.25, 0.43, 0.29); box(limb, stone, 0, -0.39, -0.01, 0.3, 0.25, 0.32);
      }
    }
    return { root: group, body, limbs, target: world(p), yaw: Math.PI };
  }
  function build(next: PuzzleSnapshot): void {
    currentChamber = next.chamber;
    chamberRoot.clear(); tiles.length = 0; plates.length = 0; gateBars.length = 0;
    const level = puzzle.campaign.chambers[currentChamber]!;
    width = level.rows[0]!.length; height = level.rows.length;
    islandShadow.scale.set(width * 1.75, height * 1.75, 1);
    box(chamberRoot, stoneDark, 0, -0.4, 0, width + 0.35, 0.7, height + 0.35);
    box(chamberRoot, gold, 0, -0.14, 0, width + 0.39, 0.055, height + 0.39);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const tile = level.rows[y]![x]!, p = world({ x, y });
      if (tile === '#') {
        const h = (x === 0 || x === width - 1 || y === 0 || y === height - 1) ? 0.32 : 0.66;
        box(chamberRoot, stone, p.x, h / 2, p.z, 0.96, h, 0.96);
        box(chamberRoot, (x + y) % 4 === 0 ? moss : stoneTop, p.x, h + 0.035, p.z, 0.98, 0.07, 0.98);
        if ((x * 3 + y) % 7 === 0) box(chamberRoot, stoneDark, p.x + 0.14, h + 0.09, p.z, 0.03, 0.045, 0.7);
      } else {
        const mesh = box(chamberRoot, floor, p.x, -0.035, p.z, 0.94, 0.15, 0.94);
        mesh.userData.cell = { x, y }; tiles.push(mesh);
        if (tile === 'O') {
          disk(chamberRoot, gold, p.x, 0.065, p.z, 0.83, 0.08);
          const plate = disk(chamberRoot, inactive, p.x, 0.11, p.z, 0.62, 0.045);
          const ring = new THREE.Mesh(ringGeo, active); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.14, p.z); chamberRoot.add(ring);
          plates.push({ p: { x, y }, mesh: plate });
        }
        if (tile === 'E') {
          disk(chamberRoot, gold, p.x, 0.075, p.z, 0.88, 0.09);
          for (const dx of [-0.43, 0.43]) {
            box(chamberRoot, stoneDark, p.x + dx, 0.78, p.z, 0.18, 1.55, 0.32);
            box(chamberRoot, gold, p.x + dx, 1.5, p.z, 0.25, 0.12, 0.4);
          }
          box(chamberRoot, gold, p.x, 1.65, p.z, 1.1, 0.2, 0.37);
          for (const dx of [-0.24, 0, 0.24]) gateBars.push(box(chamberRoot, gold, p.x + dx, 0.77, p.z, 0.055, 1.4, 0.06));
          const beacon = new THREE.Mesh(coneGeo, active); beacon.position.set(p.x, 2.05, p.z); chamberRoot.add(beacon);
        }
      }
    }
    // North marker is physical geometry, so orientation remains legible after rotating the camera.
    const north = new THREE.Mesh(coneGeo, gold); north.rotation.x = -Math.PI / 2; north.position.set(0, 0.3, -height / 2 - 0.5); north.scale.setScalar(1.5); chamberRoot.add(north);
    explorer = piece(next.player, 'explorer');
    rocks = next.rocks.map(p => piece(p, 'rock')); golems = next.golems.map(p => piece(p, 'golem'));
  }
  function update(next: PuzzleSnapshot): void {
    state = next;
    selector.visible = false;
    if (currentChamber !== next.chamber) build(next);
    const target = (piece: Piece, cell: PuzzleCell) => {
      const p = world(cell), dx = p.x - piece.target.x, dz = p.z - piece.target.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) piece.yaw = Math.atan2(-dx, -dz);
      piece.target.copy(p);
    };
    target(explorer, next.player); rocks.forEach((p, i) => target(p, next.rocks[i]!)); golems.forEach((p, i) => target(p, next.golems[i]!));
    const weighted = (p: PuzzleCell) => next.rocks.some(r => r.x === p.x && r.y === p.y);
    for (const plate of plates) plate.mesh.material = weighted(plate.p) ? active : inactive;
    for (const bar of gateBars) bar.visible = !plates.every(p => weighted(p.p));
  }
  function frame(dt: number): void {
    clock += dt;
    const blend = 1 - Math.exp(-Math.min(dt, 0.1) * 13);
    for (const p of [explorer, ...rocks, ...golems]) {
      const distance = p.root.position.distanceTo(p.target);
      p.root.position.lerp(p.target, blend);
      p.body.position.y = distance > 0.035 ? Math.sin(clock * 18) * 0.045 : 0;
      const difference = Math.atan2(Math.sin(p.yaw - p.body.rotation.y), Math.cos(p.yaw - p.body.rotation.y));
      p.body.rotation.y += difference * blend;
      p.limbs.forEach((limb, i) => { limb.rotation.x = distance > 0.035 ? Math.sin(clock * 18 + i * Math.PI) * 0.42 : 0; });
    }
    yaw += (goalYaw - yaw) * blend;
    camera.position.set(Math.sin(yaw) * 20, 21, Math.cos(yaw) * 20); camera.lookAt(0, 0.3, 0); camera.updateMatrixWorld(true);
    // Fit the entire 3D diorama inside the space actually left by the responsive HUD.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [-width / 2 - 0.4, width / 2 + 0.4]) for (const z of [-height / 2 - 0.6, height / 2 + 0.4]) for (const y of [-0.7, 1.8]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const w = render.width, h = render.height, compact = w < 700;
    const left = compact ? 14 : 24, right = compact ? 14 : w >= 1000 ? 330 : 245;
    const top = compact ? 150 : 108, bottom = compact ? 175 : 100;
    const usableW = Math.max(200, w - left - right), usableH = Math.max(150, h - top - bottom);
    const units = Math.max((maxX - minX) / usableW, (maxY - minY) / usableH) * 1.04;
    camera.left = (minX + maxX) / 2 - (left + usableW / 2) * units;
    camera.right = camera.left + w * units;
    camera.top = (minY + maxY) / 2 + (top + usableH / 2) * units;
    camera.bottom = camera.top - h * units;
    camera.updateProjectionMatrix();
  }
  const raycaster = new THREE.Raycaster();
  function pick(clientX: number, clientY: number): PuzzleCell | undefined {
    raycaster.setFromCamera(new THREE.Vector2(clientX / render.width * 2 - 1, 1 - clientY / render.height * 2), camera);
    const hit = raycaster.intersectObjects(tiles, false)[0];
    return hit?.object.userData.cell as PuzzleCell | undefined;
  }
  function hover(p: PuzzleCell | undefined): void {
    selector.visible = !!p && state.status === 'playing' && Math.abs(p.x - state.player.x) + Math.abs(p.y - state.player.y) === 1;
    if (p) { selector.position.copy(world(p)); selector.position.y = 0.19; }
  }
  update(state); frame(0);
  return { update, frame, pick, hover, rotate: (direction: number) => { goalYaw += direction * Math.PI / 2; } };
}
