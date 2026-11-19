import { Audio, AudioSamples, PhysicsCollision, definePlugin, worldPose } from '@bulkhead/sdk';
import type { VoiceHandle } from '@bulkhead/sdk';
import { Render, THREE } from '@bulkhead/sdk/render.ts';
import { Sandbox, SandboxGlow } from '../../contracts/sandbox.ts';

export const SOUNDS = { chime: 'sandbox/chime', thud: 'sandbox/thud', wind: 'sandbox/wind' } as const;

export default definePlugin({
  register(ctx) {
    // Sample-based sounds (SDK 3): decoded in the background through the asset service.
    ctx.register(AudioSamples, SOUNDS.chime, { url: 'sounds/sandbox/chime.wav', bus: 'sfx', gain: 0.8 });
    ctx.register(AudioSamples, SOUNDS.thud, { url: 'sounds/sandbox/thud.wav', bus: 'sfx', rateJitter: [0.85, 1.15], refDistance: 3 });
    ctx.register(AudioSamples, SOUNDS.wind, { url: 'sounds/sandbox/wind.wav', bus: 'ambience', loop: true, gain: 0.25 });
  },
  activate(ctx) {
    const sandbox = ctx.services.get(Sandbox);
    const audio = ctx.services.tryGet(Audio);
    // 3D sound: the pad chimes where it is; crates thud where the hero hits them (rate-limited).
    const crates = new Set(sandbox.crates);
    let lastThud = -1;
    ctx.events.on(PhysicsCollision, (c) => {
      if (!audio || !c.started) return;
      const other = c.a === sandbox.hero ? c.b : c.b === sandbox.hero ? c.a : undefined;
      if (other === undefined) return;
      const at = worldPose(ctx.world, other)?.position;
      if (!at) return;
      if (c.sensor && other === sandbox.pad) audio.play(SOUNDS.chime, { position: at });
      else if (crates.has(other) && ctx.time.now - lastThud > 0.15) { lastThud = ctx.time.now; audio.play(SOUNDS.thud, { position: at }); }
    });
    // Ambience loop on its bus; started once the sample is ready (start() returns undefined until audio is running).
    let wind: VoiceHandle | undefined;
    ctx.systems.addFrame({ id: 'sandbox/ambience', order: 0, update() {
      if (!wind?.playing && (audio?.samples?.loaded ?? 0) > 0) wind = audio?.start?.(SOUNDS.wind);
    } });
    ctx.scope.add(() => wind?.stop(), 'ambience');
    const render = ctx.services.tryGet(Render);
    if (!render) return;
    render.setEnvironment({ background: 0x9fc4e0, fog: { color: 0x9fc4e0, near: 30, far: 80 } });
    const root = render.createRoot(ctx, 'world');
    root.add(new THREE.HemisphereLight(0xdfefff, 0x404830, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2); sun.position.set(-6, 12, 8); root.add(sun);
    // Lamps authored in the glTF level (custom property sandbox/glow) get a point light.
    const glows = ctx.world.query({ with: [SandboxGlow] });
    const lit = new Set<number>();
    const light = (e: number): void => {
      const pose = worldPose(ctx.world, e);
      if (!pose || lit.has(e)) return;
      lit.add(e);
      const l = new THREE.PointLight(0xffd890, (ctx.world.get(e, SandboxGlow)?.intensity ?? 1) * 4, 12);
      l.position.set(pose.position.x, pose.position.y, pose.position.z);
      root.add(l);
    };
    for (const e of glows.ids()) light(e);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    render.setWorldCamera(ctx, camera);
    const target = new THREE.Vector3();
    ctx.systems.addFrame({ id: 'sandbox/camera', order: 200, update(alpha) {
      const pose = worldPose(ctx.world, sandbox.hero, alpha);
      if (!pose) return;
      target.set(pose.position.x, pose.position.y, pose.position.z);
      camera.position.set(target.x, target.y + 6, target.z + 9);
      camera.lookAt(target);
    } });
  },
});
