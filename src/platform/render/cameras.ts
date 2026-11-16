import * as THREE from './mini3/index.ts';
import type { SessionContext } from '../../kernel/host.ts';

type WorldCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/** Shared resize policy, also applied immediately when a camera becomes active. */
export function resizeCamera(camera: WorldCamera, aspect: number): void {
  if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
  else {
    const center = (camera.left + camera.right) / 2;
    const halfWidth = (camera.top - camera.bottom) * aspect / 2;
    camera.left = center - halfWidth;
    camera.right = center + halfWidth;
  }
  camera.updateProjectionMatrix();
}

/** A stack of live leases, so disposing an older owner cannot steal a newer owner's view. */
export function createWorldCameraSelection(fallback: THREE.PerspectiveCamera, aspect: () => number) {
  const selections: { camera: WorldCamera }[] = [];
  const current = (): WorldCamera => selections.at(-1)?.camera ?? fallback;
  return {
    current,
    set(ctx: SessionContext, camera: WorldCamera): void {
      const lease = { camera };
      selections.push(lease);
      resizeCamera(camera, aspect());
      ctx.scope.add(() => {
        const index = selections.indexOf(lease);
        if (index < 0) return;
        selections.splice(index, 1);
        resizeCamera(current(), aspect());
      }, 'world-camera');
    },
    clear(): void { selections.length = 0; },
  };
}
