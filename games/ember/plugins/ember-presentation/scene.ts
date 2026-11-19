import type { SessionContext } from '@bulkhead/sdk';
import type { EmberService } from '../../contracts/ember.ts';
import { SessionControl } from '@bulkhead/sdk';
import { THREE } from '@bulkhead/sdk/render.ts';
import type { RenderService } from '@bulkhead/sdk/render.ts';

/** Original volumetric models, fitted to the authored XZ lane and pad bounds. */
export function createScene(ctx: SessionContext, render: RenderService, game: EmberService, hud: () => HTMLElement | undefined) {
  const root = render.createRoot(ctx, 'world');
  render.setEnvironment({ background: 0x100d13, fog: null });
  root.add(new THREE.HemisphereLight(0xffd6a3, 0x2a1b35, 2));
  const sun = new THREE.DirectionalLight(0xffa45b, 3);
  sun.position.set(-5, 12, 8); root.add(sun);
  const rim = new THREE.DirectionalLight(0x8cb6e8, 0.6);
  rim.position.set(4, 8, -10); root.add(rim);

  const points = [...game.config.lane, ...game.config.pads];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const width = maxX - minX + 5, depth = maxZ - minZ + 5;
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
  camera.position.set(cx + 6, 40, cz + 48);
  camera.lookAt(cx, 0, cz); render.setWorldCamera(ctx, camera);

  // Project the complete platform and tower-height envelope into camera space. The host may
  // change the camera aspect on resize, so refit after resize and HUD layout on each frame.
  const corners: THREE.Vector3[] = [];
  for (const x of [cx - width / 2, cx + width / 2]) {
    for (const z of [cz - depth / 2, cz + depth / 2]) {
      for (const y of [-1.1, 2.6]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  const fit = () => {
    const w = Math.max(1, render.width), h = Math.max(1, render.height), aspect = w / h;
    const mobile = w <= 700, ui = hud();
    const header = ui?.querySelector<HTMLElement>('.ember-head')?.getBoundingClientRect();
    const panel = ui?.querySelector<HTMLElement>('.ember-panel')?.getBoundingClientRect();
    const controls = ui?.querySelector<HTMLElement>('.ember-actions')?.getBoundingClientRect();
    const bounds = ui?.getBoundingClientRect();
    const top = mobile && bounds ? Math.max(header?.bottom ?? 0, panel?.bottom ?? 0) - bounds.top + 10 : h * 0.12;
    const bottom = controls && bounds ? controls.top - bounds.top - 10 : h * 0.78;
    const availableHeight = Math.max(h * 0.15, bottom - top);
    const availableWidth = w * (mobile ? 0.92 : 0.82);
    camera.updateMatrixWorld();
    const projected = corners.map(p => p.clone().applyMatrix4(camera.matrixWorldInverse));
    const lowX = Math.min(...projected.map(p => p.x)), highX = Math.max(...projected.map(p => p.x));
    const lowY = Math.min(...projected.map(p => p.y)), highY = Math.max(...projected.map(p => p.y));
    const halfHeight = Math.max((highX - lowX) * h / (2 * availableWidth), (highY - lowY) * h / (2 * availableHeight));
    const targetY = 1 - (top + bottom) / h;
    const centerX = (lowX + highX) / 2, centerY = (lowY + highY) / 2 - targetY * halfHeight;
    camera.left = centerX - halfHeight * aspect; camera.right = centerX + halfHeight * aspect;
    camera.bottom = centerY - halfHeight; camera.top = centerY + halfHeight;
    camera.updateProjectionMatrix();
  };

  const cube = render.own(ctx, new THREE.BoxGeometry(1, 1, 1));
  const cyl = render.own(ctx, new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
  const orb = render.own(ctx, new THREE.IcosahedronGeometry(0.5, 1));
  const mat = (color: number, emissive = 0) => render.own(ctx, new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.65, metalness: 0.25 }));
  const stone = mat(0x28232d), lane = mat(0x514039), copper = mat(0xb66a38), glow = mat(0xff8c29, 0xa83208);
  const enemy = mat(0x873c31, 0x35100b), pale = mat(0xffc579, 0x8d3207), dark = mat(0x16131b);
  const box = (parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number,
    w: number, h: number, d: number, geo: THREE.BufferGeometry = cube) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); parent.add(mesh); return mesh;
  };
  box(root, stone, cx, -0.55, cz, width, 1, depth);
  game.config.lane.slice(1).forEach((b, i) => {
    const a = game.config.lane[i]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    const angle = -Math.atan2(dz, dx);
    const road = box(root, lane, (a.x + b.x) / 2, 0.01, (a.z + b.z) / 2, length, 0.14, 2.3);
    road.rotation.y = angle;
    // Cover the joins between independently oriented road strips.
    box(root, lane, a.x, 0.01, a.z, 2.3, 0.14, 2.3, cyl);
    for (let distance = 1; distance < length; distance += 2) {
      const stripe = box(root, copper, a.x + dx * distance / length, 0.09, a.z + dz * distance / length, 0.06, 0.03, 2.2);
      stripe.rotation.y = angle;
    }
  });
  const start = game.config.lane[0]!, end = game.config.lane[game.config.lane.length - 1]!;
  box(root, lane, end.x, 0.01, end.z, 2.3, 0.14, 2.3, cyl);
  box(root, dark, end.x, 0.8, end.z, 1.5, 1.7, 1.5, cyl);
  box(root, glow, end.x, 1.9, end.z, 0.9, 1.1, 0.9, orb);
  box(root, dark, start.x, 0.7, start.z, 1.2, 1.4, 3);
  box(root, glow, start.x, 1.5, start.z, 0.3, 0.3, 2.5);
  const pads: THREE.Mesh[] = [];
  game.config.pads.forEach((p, i) => {
    const mesh = box(root, copper, p.x, 0.15, p.z, 1.3, 0.3, 1.3, cyl);
    mesh.userData['pad'] = i; pads.push(mesh);
    box(root, glow, p.x, 0.32, p.z, 0.65, 0.04, 0.65, cyl);
    const texture = render.texture(ctx, `ember/pad-number-${i + 1}`, {
      width: 128, height: 128, paint(g) {
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = '#241821'; g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#e7995b'; g.lineWidth = 6; g.stroke();
        g.fillStyle = '#fff0d0'; g.font = 'bold 68px sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), 64, 67);
      },
    });
    const marker = new THREE.Sprite(render.own(ctx, new THREE.SpriteMaterial({ map: texture, transparent: true })));
    marker.position.set(p.x, 0.7, p.z + 0.85); marker.scale.set(0.72, 0.72, 1); root.add(marker);
  });
  const dynamic = new THREE.Group(); root.add(dynamic);
  const update = () => {
    dynamic.clear();
    const state = game.state();
    for (const index of state.towers) {
      const p = game.config.pads[index]!;
      box(dynamic, dark, p.x, 0.75, p.z, 0.75, 0.9, 0.75, cyl);
      box(dynamic, copper, p.x, 1.36, p.z, 0.9, 0.35, 0.9, cyl);
      box(dynamic, glow, p.x, 1.68, p.z, 0.48, 0.5, 0.48, orb);
      box(dynamic, copper, p.x, 1.45, p.z - 0.55, 0.24, 0.24, 0.9);
    }
    for (const e of state.enemies) {
      box(dynamic, enemy, e.x, 0.55, e.z, 0.8, 1, 0.8, orb);
      box(dynamic, pale, e.x, 0.65, e.z + 0.36, 0.25, 0.12, 0.1);
      box(dynamic, dark, e.x, 1.25, e.z, 0.9, 0.1, 0.1);
      box(dynamic, glow, e.x - (1 - e.health / e.maxHealth) * 0.45, 1.26, e.z, 0.9 * e.health / e.maxHealth, 0.11, 0.11);
    }
  };
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const pick = (ev: PointerEvent) => {
    if (ctx.services.tryGet(SessionControl)?.playing === false || ev.button !== 0 || !(ev.target instanceof HTMLCanvasElement)) return;
    const rect = ev.target.getBoundingClientRect();
    mouse.set((ev.clientX - rect.left) / rect.width * 2 - 1, -(ev.clientY - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld(); root.updateMatrixWorld(); ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pads)[0];
    if (hit) game.enqueue({ type: 'build', pad: Number(hit.object.userData['pad']) });
  };
  window.addEventListener('pointerdown', pick);
  ctx.scope.add(() => window.removeEventListener('pointerdown', pick), 'ember-picking');
  return { update, fit };
}
