import type { RoleInfo, SessionContext, ViewMode, ViewState } from '@bulkhead/sdk';
import {
  CameraRole, Health, Input, InputActions, Player, Transform, View, ViewModeChanged, ViewModes,
  angleDelta, definePlugin,
} from '@bulkhead/sdk';
import { Render, THREE } from '@bulkhead/sdk/render.ts';

const TOGGLE_ACTION = 'presentation/camera-modes.toggle';
const ROTATE_LEFT = 'presentation/camera-modes.rotate-left';
const ROTATE_RIGHT = 'presentation/camera-modes.rotate-right';
const EYE_HEIGHT = 1.6;

/**
 * A scoped orthographic isometric camera layered onto the shooter player. The camera follows the player at a fixed
 * azimuth/elevation; the player yaw still controls aiming and is displayed by a floor marker.
 */
function cameraModes(ctx: SessionContext): void {
  const render = ctx.services.tryGet(Render);
  const input = ctx.services.tryGet(Input);
  const fov = ctx.config['fov'] as number;
  const halfHeight = ctx.config['halfHeight'] as number;
  const height = ctx.config['cameraHeight'] as number;
  const distance = ctx.config['cameraDistance'] as number;
  const rotateStep = ctx.config['rotateStep'] as number;
  let cameraYaw = ctx.config['isometricYaw'] as number;
  const view: ViewState = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0, roll: 0, fov, entity: 0 };
  ctx.services.provide(View, view);

  const modes: readonly ViewMode[] = Object.freeze(['first-person', 'isometric']);
  let mode: ViewMode = 'first-person';
  const isoCamera = render ? new THREE.OrthographicCamera(-halfHeight, halfHeight, halfHeight, -halfHeight, 0.1, 220) : undefined;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  isoCamera?.up.set(0, 1, 0);

  let marker: THREE.Group | undefined;
  if (render) {
    const markerRoot = render.createRoot(ctx, 'world');
    marker = new THREE.Group();
    marker.name = 'camera:player-marker';
    const ringMat = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0xf1d49a, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const ring = new THREE.Mesh(render.own(ctx, new THREE.RingGeometry(0.58, 0.74, 28)), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; marker.add(ring);
    const discMat = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0x352b1c, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const disc = new THREE.Mesh(render.own(ctx, new THREE.CircleGeometry(0.52, 28)), discMat);
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.045; marker.add(disc);
    const arrowMat = render.own(ctx, new THREE.MeshBasicMaterial({ color: 0xf4d89a, depthWrite: false, fog: false }));
    const arrow = new THREE.Mesh(render.own(ctx, new THREE.ConeGeometry(0.2, 0.55, 3)), arrowMat);
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, 0.08, -1.02); marker.add(arrow);
    marker.visible = false;
    markerRoot.add(marker);
  }

  const applyCamera = (): void => {
    if (!render || !isoCamera) return;
    render.setWorldCamera(ctx, mode === 'isometric' ? isoCamera : render.camera);
    if (marker) marker.visible = mode === 'isometric';
    view.yaw = mode === 'isometric' ? cameraYaw : view.yaw;
  };
  const set = (next: ViewMode): boolean => {
    if (!modes.includes(next)) return false;
    if (next !== mode) {
      mode = next; applyCamera(); ctx.events.emit(ViewModeChanged, { mode });
    }
    return true;
  };
  const toggle = (): ViewMode => { set(mode === 'first-person' ? 'isometric' : 'first-person'); return mode; };
  const rotate = (delta: number): void => {
    if (mode !== 'isometric' || !Number.isFinite(delta) || delta === 0) return;
    cameraYaw = ((cameraYaw + delta) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    view.yaw = cameraYaw;
  };
  const pickGround = (x: number, y: number): { x: number; z: number } | null => {
    if (mode !== 'isometric' || !render || !isoCamera || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const width = render.width, height = render.height;
    if (width <= 0 || height <= 0) return null;
    ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    raycaster.setFromCamera(ndc, isoCamera);
    const origin = raycaster.ray.origin, direction = raycaster.ray.direction;
    if (Math.abs(direction.y) < 1e-6) return null;
    const t = -origin.y / direction.y;
    if (!Number.isFinite(t) || t < 0) return null;
    return Object.freeze({ x: origin.x + direction.x * t, z: origin.z + direction.z * t });
  };
  ctx.services.provide(ViewModes, { get mode() { return mode; }, get yaw() { return cameraYaw; }, modes, set, toggle, rotate, pickGround });
  applyCamera();

  if (input) ctx.systems.add({ id: 'presentation/camera-modes.input', phase: 'control', order: -20, update() {
    if (input.tick.pressed(TOGGLE_ACTION)) toggle();
    if (input.tick.pressed(ROTATE_LEFT)) rotate(-rotateStep);
    if (input.tick.pressed(ROTATE_RIGHT)) rotate(rotateStep);
  } });

  let cameraX = 0, cameraZ = 0, initialized = false;
  ctx.systems.addFrame({ id: 'presentation/camera-modes.frame', order: -100, update(alpha, frameDt) {
    const e = ctx.world.first(Player); if (e === undefined) return;
    const t = ctx.world.get(e, Transform); if (!t) return;
    const x = t.prevX + (t.x - t.prevX) * alpha;
    const z = t.prevZ + (t.z - t.prevZ) * alpha;
    const yaw = t.prevYaw + angleDelta(t.prevYaw, t.yaw) * alpha;
    view.entity = e; view.x = x; view.z = z; view.y = ctx.world.get(e, Health)?.dead ? 0.35 : EYE_HEIGHT;
    if (mode === 'first-person') {
      view.yaw = yaw; view.pitch = 0; view.roll = 0; view.fov = fov;
      if (marker) marker.visible = false;
      return;
    }
    if (!render || !isoCamera) { view.yaw = cameraYaw; return; }
    if (!initialized || Math.hypot(x - cameraX, z - cameraZ) > 14) { cameraX = x; cameraZ = z; initialized = true; }
    const follow = Math.min(1, frameDt * 10);
    cameraX += (x - cameraX) * follow; cameraZ += (z - cameraZ) * follow;
    const aspect = render.width / Math.max(1, render.height);
    isoCamera.left = -halfHeight * aspect; isoCamera.right = halfHeight * aspect; isoCamera.top = halfHeight; isoCamera.bottom = -halfHeight;
    isoCamera.near = 0.1; isoCamera.far = 220; isoCamera.updateProjectionMatrix();
    isoCamera.position.set(cameraX + Math.sin(cameraYaw) * distance, height, cameraZ + Math.cos(cameraYaw) * distance);
    isoCamera.up.set(0, 1, 0);
    isoCamera.lookAt(cameraX, 0.35, cameraZ);
    view.yaw = cameraYaw; view.pitch = 0; view.roll = 0; view.fov = fov;
    if (marker) { marker.visible = true; marker.position.set(x, 0.02, z); marker.rotation.y = yaw; }
  } });
}

export default definePlugin({ register(ctx) {
  ctx.register(InputActions, TOGGLE_ACTION, { label: 'Toggle first-person / isometric view', keys: [String(ctx.config['toggleKey'] ?? 'KeyO')] });
  ctx.register(InputActions, ROTATE_LEFT, { label: 'Rotate isometric camera left', keys: [String(ctx.config['rotateLeftKey'] ?? 'KeyZ')] });
  ctx.register(InputActions, ROTATE_RIGHT, { label: 'Rotate isometric camera right', keys: [String(ctx.config['rotateRightKey'] ?? 'KeyX')] });
  const camera: RoleInfo = {
    name: 'First-person / isometric camera',
    description: 'Fixed-eye first-person view or an orthographic isometric follow camera with a player marker.',
    activate: cameraModes,
  };
  ctx.provideRole(CameraRole, 'presentation/camera-modes', camera);
} });
