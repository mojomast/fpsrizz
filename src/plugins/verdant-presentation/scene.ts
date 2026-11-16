import { ThemeRole } from '../../sdk/index.ts';
import type { SessionContext, VerdantService } from '../../sdk/index.ts';
import { THREE } from '../../sdk/render.ts';
import type { RenderService } from '../../sdk/render.ts';

export function createScene(ctx: SessionContext, render: RenderService, game: VerdantService) {
  const root = render.createRoot(ctx, 'world');
  render.setEnvironment({ background: 0xb8d9d2, fog: { color: 0xb8d9d2, near: 50, far: 120 } });
  root.add(new THREE.HemisphereLight(0xf2fff0, 0x426962, 2.2));
  const sun = new THREE.DirectionalLight(0xfff3d7, 2.8);
  sun.position.set(-6, 15, 9);
  root.add(sun);

  const camera = new THREE.OrthographicCamera(-11, 11, 8, -8, 0.1, 150);
  camera.position.set(18, 23, 29);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  render.setWorldCamera(ctx, camera);

  const box = render.own(ctx, new THREE.BoxGeometry(1, 1, 1));
  const cylinder = render.own(ctx, new THREE.CylinderGeometry(1, 1, 1, 8));
  const cone = render.own(ctx, new THREE.ConeGeometry(1, 1, 8));
  const ring = render.own(ctx, new THREE.TorusGeometry(1.55, 0.075, 8, 48));
  const mat = (color: number) => render.own(ctx, new THREE.MeshStandardMaterial({ color, roughness: 0.82, flatShading: true }));
  const water = mat(0x579e9b), earth = mat(0x617c64), grass = mat(0x9bb982);
  const ivory = mat(0xe8e3ca), dark = mat(0x365b50), leaf = mat(0x5fa967);
  const gold = mat(0xe7b95e), off = mat(0x657a70), on = mat(0xa4f5a0);
  const painter = ctx.role(ThemeRole)?.provider.textures['puzzle-floor'];
  const islandTop = painter ? render.own(ctx, new THREE.MeshStandardMaterial({ map: render.texture(ctx, 'verdant/island-floor', painter), color: 0xb8d9a6, roughness: 0.9 })) : grass;
  const selectorMaterial = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0xffef9b }));
  const mesh = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number,
    sx: number, sy: number, sz: number, parent: THREE.Object3D = root) => {
    const result = new THREE.Mesh(geo, material);
    result.position.set(x, y, z);
    result.scale.set(sx, sy, sz);
    parent.add(result);
    return result;
  };
  mesh(box, water, 0, -1.1, 0, 100, 0.15, 100);
  const islands: THREE.Mesh[] = [], crowns: THREE.Object3D[][] = [], lights: THREE.Mesh[] = [];
  for (const station of game.world.stations) {
    const island = new THREE.Group();
    island.position.set(station.x, 0, station.z);
    root.add(island);
    const ground = mesh(cylinder, earth, 0, -0.38, 0, 2.25, 1.05, 1.85, island);
    const top = mesh(cylinder, islandTop, 0, 0.16, 0, 2.18, 0.18, 1.78, island);
    ground.userData.station = station.id;
    top.userData.station = station.id;
    islands.push(ground, top);
    mesh(box, ivory, 0, 0.65, 0, 0.9, 1, 0.9, island);
    mesh(cylinder, dark, 0, 1.36, 0, 0.25, 0.65, 0.25, island);
    mesh(cone, gold, 0, 1.85, 0, 0.55, 0.55, 0.55, island);
    lights.push(mesh(cylinder, off, 0, 1.57, 0, 0.36, 0.18, 0.36, island));
    const trees: THREE.Object3D[] = [];
    for (const x of [-1.15, 1.1]) {
      mesh(cylinder, dark, x, 0.45, 0.65, 0.08, 0.6, 0.08, island);
      trees.push(mesh(cone, leaf, x, 1, 0.65, 0.48, 0.9, 0.48, island));
    }
    crowns.push(trees);
    mesh(box, ivory, -1, 0.4, -0.65, 0.6, 0.45, 0.55, island);
    mesh(cone, dark, -1, 0.8, -0.65, 0.52, 0.45, 0.52, island);
  }
  const selector = new THREE.Mesh(ring, selectorMaterial);
  selector.rotation.x = -Math.PI / 2;
  selector.position.y = 0.29;
  root.add(selector);

  function update(selected: string) {
    const state = game.state();
    game.world.stations.forEach((station, i) => {
      const active = state.restored.includes(station.id);
      lights[i]!.material = active ? on : off;
      for (const crown of crowns[i]!) crown.scale.set(active ? 0.48 : 0.1, active ? 0.9 : 0.1, active ? 0.48 : 0.1);
      if (station.id === selected) selector.position.set(station.x, 0.29, station.z);
    });
  }

  // Fit authored island extents, including their height, inside the rectangle left by the HUD.
  function fit() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const station of game.world.stations) {
      for (const x of [station.x - 2.4, station.x + 2.4]) {
        for (const z of [station.z - 2, station.z + 2]) {
          for (const y of [-1, 2.2]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
            minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
          }
        }
      }
    }
    const w = render.width, h = render.height, compact = w <= 900;
    if (!w || !h) return;
    const left = compact ? 12 : 288, right = compact ? 12 : 288;
    const top = compact ? 142 : 20, bottom = compact ? 280 : 80;
    const usableW = Math.max(1, w - left - right), usableH = Math.max(1, h - top - bottom);
    const units = Math.max((maxX - minX) / usableW, (maxY - minY) / usableH) * 1.06;
    camera.left = (minX + maxX) / 2 - (left + usableW / 2) * units;
    camera.right = camera.left + w * units;
    camera.top = (minY + maxY) / 2 + (top + usableH / 2) * units;
    camera.bottom = camera.top - h * units;
    camera.updateProjectionMatrix();
  }
  const raycaster = new THREE.Raycaster();
  function pick(x: number, y: number): string | undefined {
    raycaster.setFromCamera(new THREE.Vector2(x / render.width * 2 - 1, 1 - y / render.height * 2), camera);
    return raycaster.intersectObjects(islands, false)[0]?.object.userData.station as string | undefined;
  }
  return { update, fit, pick };
}
