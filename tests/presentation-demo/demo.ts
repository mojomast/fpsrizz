// Composes a real PluginHost with the real world/theme/presentation plugins plus a demo-only content plugin and exposes a
// small driver API on window.__demo for run.cjs (screenshots, assertions).
import { PluginHost } from '../../src/kernel/host.ts';
import type { Session } from '../../src/kernel/host.ts';
import { createRenderHost } from '../../src/platform/render/service.ts';
import type { RenderHost } from '../../src/platform/render/service.ts';
import { createAudioService } from '../../src/platform/audio.ts';
import { Audio, AttackFired, Damaged, DoorChanged, Died, EnemyAlerted, Impact, Inventory, PHASES, PickupCollected, SDK_VERSION, TriggerFired, UseFailed, World } from '../../src/sdk/index.ts';
import type { AudioService, PlayOptions, ViewState } from '../../src/sdk/index.ts';
import { Render } from '../../src/sdk/render.ts';
import { sounds } from '../../src/plugins/theme-industrial/sounds.ts';
import worldManifest from '../../games/shooter/plugins/core-world/manifest.json';
import themeManifest from '../../src/plugins/theme-industrial/manifest.json';
import presentationManifest from '../../games/shooter/plugins/core-presentation/manifest.json';
import { createDemoControl, createDemoPlugin, demoManifest } from './demo-plugin.ts';

const ctl = createDemoControl();
const canvas = document.createElement('canvas');
canvas.style.cssText = 'width:640px;height:400px;display:block';
document.body.appendChild(canvas);
const renderHost: RenderHost = createRenderHost(canvas, { pixelRatioCap: 1 });
renderHost.resize();

const realAudio = createAudioService((id) => sounds[id]);
const audioCalls: { id: string; gain: number | undefined; pan: number | undefined }[] = [];
const recorder: AudioService = {
  play(id: string, o?: PlayOptions) {
    audioCalls.push({ id, gain: o?.gain, pan: o?.pan });
    realAudio.play(id, o);
  },
  setMasterVolume: (v) => realAudio.setMasterVolume(v),
  getMasterVolume: () => realAudio.getMasterVolume(),
  resume: () => realAudio.resume(),
  get activeVoices() { return realAudio.activeVoices; },
};

let provideRender = true;
const host = new PluginHost({
  sdkVersion: SDK_VERSION,
  phases: PHASES,
  installHostServices(session, scope) {
    if (provideRender) session.services.provide(Render, renderHost.service, 'host', scope);
    session.services.provide(Audio, recorder, 'host', scope);
  },
});
host.setCatalog([
  { manifest: worldManifest, load: () => import('../../games/shooter/plugins/core-world/index.ts') },
  { manifest: themeManifest, load: () => import('../../src/plugins/theme-industrial/index.ts') },
  { manifest: presentationManifest, load: () => import('../../games/shooter/plugins/core-presentation/index.ts') },
  { manifest: demoManifest, load: async () => ({ default: createDemoPlugin(ctl) }) },
]);
const preset = {
  schema: 1, id: 'demo/p', name: 'demo',
  plugins: ['core/world', 'theme/industrial', 'core/presentation', 'demo/content'],
  roles: { 'sdk/theme': 'theme/industrial', 'sdk/mode': 'demo/mode', 'sdk/camera': 'demo/camera' },
  options: { map: 'demo/map' },
};

let session: Session | undefined;
const ctx = () => ctl.ctx!;
const resetPose = (): void => { Object.assign(ctl.pose, { x: 3, y: 1.5, z: 9, yaw: -Math.PI / 2, pitch: 0, roll: 0, fov: 70 }); };

function advance(seconds: number): void {
  const n = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < n; i++) session!.scheduler.advance(1 / 60);
  renderHost.render();
}

const api = {
  baseline(): { geometries: number; textures: number } {
    renderHost.render();
    const s = renderHost.service.stats;
    return { geometries: s.geometries, textures: s.textures };
  },
  async apply(withRender = true): Promise<void> {
    provideRender = withRender;
    resetPose();
    session = await host.apply(preset);
    audioCalls.length = 0;
    advance(0.1);
  },
  stop(): { roots: number; assets: number; geometries: number; textures: number } {
    host.stop();
    session = undefined;
    renderHost.render();
    const s = renderHost.service.stats;
    return { roots: renderHost.liveRoots(), assets: renderHost.assets.size, geometries: s.geometries, textures: s.textures };
  },
  stats: () => ({ ...renderHost.service.stats }),
  warnings: () => host.log.filter((l) => l.level !== 'info').map((l) => `${l.level} ${l.source}: ${l.message}`),
  pose(p: Partial<ViewState>): void { Object.assign(ctl.pose, p); },
  advance,
  shot(): string {
    renderHost.render();
    return canvas.toDataURL('image/png');
  },
  fire(weapon?: string): void {
    const c = ctx();
    const inv = c.world.get(ctl.player, Inventory)!;
    if (weapon) { inv.current = weapon; inv.switchedAt = c.time.now - 5; }
    inv.lastFiredAt = c.time.now;
    const v = ctl.pose;
    c.events.emit(AttackFired, { shooter: ctl.player, attackId: 'x', behavior: 'x', x: v.x, z: v.z, dirX: 1, dirZ: 0, sound: 'pistol-fire' });
  },
  switchWeapon(id: string): void {
    const c = ctx();
    const inv = c.world.get(ctl.player, Inventory)!;
    inv.current = id;
    inv.switchedAt = c.time.now;
  },
  impacts(): void {
    const c = ctx();
    c.events.emit(Impact, { x: 17, z: 8, y: 1.3, nx: 0, nz: 1, target: 0, effect: 'fx-spark', sound: 'impact-wall' });
    c.events.emit(Impact, { x: 16, z: 8, y: 1.0, nx: 0, nz: 1, target: 0, effect: 'fx-blood', sound: 'impact-flesh' });
    c.events.emit(Impact, { x: 15, z: 8, y: 1.0, nx: 0, nz: 1, target: 0, effect: 'does-not-exist', sound: '' });
  },
  /** Many impacts at once to exercise the 32-quad pool. */
  impactStorm(n: number): number {
    const c = ctx();
    for (let i = 0; i < n; i++) c.events.emit(Impact, { x: 14 + (i % 8) * 0.5, z: 8, y: 0.5 + Math.floor(i / 8) * 0.3, nx: 0, nz: 1, target: 0, effect: i % 2 ? 'fx-spark' : 'fx-blood', sound: '' });
    renderHost.render();
    return renderHost.service.stats.geometries;
  },
  pressSwitch(): void {
    const c = ctx();
    const w = c.services.get(World);
    const sw = w.triggers().find((t) => t.desc.kind === 'switch')!;
    sw.fired = true;
    w.setDoorOpen('door-a', true, true);
    c.events.emit(TriggerFired, { id: sw.desc.id, kind: 'switch', tags: [], by: ctl.player, x: sw.desc.x, z: sw.desc.z });
  },
  doorOpenness: () => ctx().services.get(World).door('door-a')!.openness,
  audio: {
    clear(): void { audioCalls.length = 0; },
    calls: () => audioCalls.map((c) => ({ ...c })),
    /** Emits the full set of events; run.cjs checks the resulting calls. */
    emitAll(): void {
      const c = ctx();
      const v = ctl.pose;
      const p = ctl.player;
      c.events.emit(AttackFired, { shooter: p, attackId: 'x', behavior: 'x', x: v.x, z: v.z, dirX: 1, dirZ: 0, sound: 'pistol-fire' }); // own: flat
      c.events.emit(AttackFired, { shooter: ctl.grunt, attackId: 'x', behavior: 'x', x: v.x + 3, z: v.z, dirX: 1, dirZ: 0, sound: 'enemy-shoot' }); // 3 m ahead: gain 1, pan ~0
      c.events.emit(Impact, { x: v.x + 16.5, z: v.z, y: 1, nx: 0, nz: 1, target: 0, effect: '', sound: 'impact-wall' }); // 16.5 m: partial gain
      c.events.emit(Impact, { x: v.x + 40, z: v.z, y: 1, nx: 0, nz: 1, target: 0, effect: '', sound: 'impact-wall' }); // 40 m: skipped
      c.events.emit(Impact, { x: v.x, z: v.z - 10, y: 1, nx: 0, nz: 1, target: 0, effect: '', sound: 'impact-flesh' }); // 10 m to the east... see run.cjs
      c.events.emit(Impact, { x: v.x, z: v.z, y: 1, nx: 0, nz: 1, target: 0, effect: '', sound: '' }); // empty id skipped
      c.events.emit(PickupCollected, { pickup: 0, def: 'x', by: p, x: v.x, z: v.z, sound: 'pickup-health', label: '' });
      c.events.emit(DoorChanged, { id: 'door-a', open: true, x: v.x + 2, z: v.z });
      c.events.emit(DoorChanged, { id: 'door-a', open: false, x: v.x + 2, z: v.z });
      c.events.emit(TriggerFired, { id: 's', kind: 'switch', tags: [], by: p, x: v.x + 1, z: v.z });
      c.events.emit(TriggerFired, { id: 'z', kind: 'zone', tags: [], by: p, x: v.x + 1, z: v.z });
      c.events.emit(EnemyAlerted, { entity: ctl.grunt, def: 'demo/grunt', x: v.x + 5, z: v.z });
      c.events.emit(Damaged, { target: p, amount: 5, kind: 'x', source: 0, x: v.x, z: v.z, hp: 95, lethal: false });
      c.events.emit(Damaged, { target: ctl.grunt, amount: 5, kind: 'x', source: p, x: v.x + 4, z: v.z, hp: 25, lethal: false });
      c.events.emit(Damaged, { target: ctl.grunt, amount: 50, kind: 'x', source: p, x: v.x + 4, z: v.z, hp: 0, lethal: true }); // lethal: no hurt sound
      c.events.emit(Died, { entity: ctl.grunt, source: p, kind: 'x', x: v.x + 4, z: v.z });
      c.events.emit(Died, { entity: p, source: 0, kind: 'x', x: v.x, z: v.z });
      c.events.emit(UseFailed, { by: p, reason: 'locked' });
      c.events.emit(UseFailed, { by: p, reason: 'nothing' });
    },
  },
};
(window as unknown as { __demo: typeof api }).__demo = api;
