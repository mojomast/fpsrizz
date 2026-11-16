import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE } from '../src/sdk/render.ts';
import { createWorldCameraSelection, resizeCamera } from '../src/platform/render/cameras.ts';
import type { SessionContext } from '../src/kernel/host.ts';
import { codePlugin, newHost, presetOf } from './helpers/host.ts';

test('official Three namespace supports orthographic picking and linear color values', () => {
  assert.equal(THREE.REVISION, '187');
  const color = new THREE.Color(0x808080);
  assert.ok(Math.abs(color.r - 0.21586) < 0.0001);
  assert.equal(color.getHex(), 0x808080);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  assert.ok(ray.intersectObject(mesh).length > 0);
  ray.setFromCamera(new THREE.Vector2(0.9, 0.9), camera);
  assert.equal(ray.intersectObject(mesh).length, 0);
  mesh.geometry.dispose();
  mesh.material.dispose();
});

test('orthographic resize preserves framing and zoom; perspective resize updates projection', () => {
  const camera = new THREE.OrthographicCamera(-3, 7, 9, -1, 0.1, 100);
  camera.zoom = 2;
  resizeCamera(camera, 2);
  assert.deepEqual([camera.left, camera.right, camera.top, camera.bottom, camera.zoom], [-8, 12, 9, -1, 2]);
  // Ten vertical world units, reduced by zoom 2, occupy two NDC units.
  assert.ok(Math.abs(camera.projectionMatrix.elements[5]! - 0.4) < 1e-12);
  resizeCamera(camera, 0.5);
  assert.deepEqual([camera.left, camera.right, camera.top, camera.bottom], [-0.5, 4.5, 9, -1]);
  const perspective = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  const oldX = perspective.projectionMatrix.elements[0]!;
  resizeCamera(perspective, 2);
  assert.equal(perspective.aspect, 2);
  assert.ok(Math.abs(perspective.projectionMatrix.elements[0]! - oldX / 2) < 1e-12);
});

test('world camera leases survive out-of-order cleanup, restore fallback, and reset on restart', async () => {
  const fallback = new THREE.PerspectiveCamera();
  let aspect = 2;
  const selection = createWorldCameraSelection(fallback, () => aspect);
  const a = new THREE.OrthographicCamera(-1, 1, 4, -4);
  const b = new THREE.PerspectiveCamera();
  const contexts = new Map<string, SessionContext>();
  const host = newHost(['test/a', 'test/b'].map(id => codePlugin(id, {
    activate(ctx) { contexts.set(id, ctx); selection.set(ctx, id === 'test/a' ? a : b); },
  })));
  await host.apply(presetOf('test/cameras', ['test/a', 'test/b']));
  assert.equal(selection.current(), b);
  assert.equal(b.aspect, 2);
  contexts.get('test/a')!.scope.dispose();
  assert.equal(selection.current(), b, 'an older owner must not steal the current camera');
  aspect = 0.5;
  contexts.get('test/b')!.scope.dispose();
  assert.equal(selection.current(), fallback);
  assert.equal(fallback.aspect, 0.5);
  selection.set(contexts.get('test/a')!, a);
  assert.equal(selection.current(), fallback, 'dead scopes cannot retain camera ownership');
  await host.restart();
  assert.equal(selection.current(), b);
  contexts.get('test/b')!.scope.dispose();
  assert.equal(selection.current(), a, 'disposing the current owner restores the previous live camera');
  assert.equal((a.right - a.left) / (a.top - a.bottom), 0.5);
  host.stop();
  assert.equal(selection.current(), fallback);
});
