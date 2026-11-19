import { Damaged, Flow, FlowEnded, Health, Inventory, PHASES, PickupCollected, SDK_COMPAT, SDK_VERSION, Ui, UseFailed, WeaponDry } from '../../src/sdk/index.ts';
import type { FlowService } from '../../src/sdk/index.ts';
import { PluginHost } from '../../src/kernel/host.ts';
import type { Session } from '../../src/kernel/host.ts';
import { createUiService } from '../../src/platform/ui.ts';
import { createFlow } from '../../src/platform/flow.ts';
import hudManifest from '../../games/shooter/plugins/core-hud/manifest.json';
import hudModule from '../../games/shooter/plugins/core-hud/index.ts';
import demoModule, { demoManifest } from './demo-plugin.ts';

const hud = document.getElementById('hud') as HTMLElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const host = new PluginHost({
  sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT,
  phases: PHASES,
  installHostServices(session, scope) {
    session.services.provide(Ui, createUiService({ hud, overlay }), 'host', scope);
    session.services.provide(Flow, createFlow((r) => session.events.emit(FlowEnded, r), () => session.scheduler.time), 'host', scope);
  },
});
host.setCatalog([
  { manifest: hudManifest, load: async () => ({ default: hudModule }) },
  { manifest: demoManifest, load: async () => ({ default: demoModule }) },
]);
const preset = (withHud: boolean, cfg: Record<string, Record<string, boolean>> = {}) => ({
  schema: 1, id: 'demo/hud-demo', name: 'HUD demo', plugins: withHud ? ['core/hud', 'demo/game'] : ['demo/game'],
  roles: withHud ? { 'sdk/hud': 'core/hud' } : {}, config: cfg, seed: 1,
});

let session: Session | undefined;
let paused = false;
let last = performance.now();
const loop = (t: number): void => {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (!paused && session) session.scheduler.advance(dt);
  requestAnimationFrame(loop);
};

const w = window as unknown as Record<string, unknown>;
const S = (): Session => host.session!;
const P = (): { hp: ReturnType<typeof getHp>; inv: ReturnType<typeof getInv> } => ({ hp: getHp(), inv: getInv() });
const getHp = () => S().entities.get((w.__demo as { player: number }).player, Health)!;
const getInv = () => S().entities.get((w.__demo as { player: number }).player, Inventory)!;
const pid = (): number => (w.__demo as { player: number }).player;
const flow = (): FlowService => S().services.get(Flow);

const hooks = {
  start: async (withHud = true, cfg = {}) => { session = await host.apply(preset(withHud, cfg)); },
  stop: () => { host.stop(); session = undefined; },
  pause: (p: boolean) => { paused = p; },
  advance: (n: number, dt = 1 / 60) => { for (let i = 0; i < n; i++) S().scheduler.advance(dt); },
  setHealth: (hp: number, dead = false) => { const h = P().hp; h.hp = hp; h.dead = dead; },
  setAmmo: (type: string, n: number) => { P().inv.ammo[type] = n; },
  setWeapon: (id: string) => { P().inv.current = id; },
  giveWeapons: (ids: string[]) => { P().inv.weapons = ids; },
  fire: () => { P().inv.lastFiredAt = S().scheduler.time + Math.random() + 1; },
  damage: (amount: number) => S().events.emit(Damaged, { target: pid(), amount, kind: 'bullet', source: 0, x: 0, z: 0, hp: 0, lethal: false }),
  damageOther: (amount: number) => S().events.emit(Damaged, { target: 9999, amount, kind: 'bullet', source: 0, x: 0, z: 0, hp: 0, lethal: false }),
  pickup: (label: string, by = pid()) => S().events.emit(PickupCollected, { pickup: 0, def: 'x', by, x: 0, z: 0, sound: '', label }),
  useFailed: () => S().events.emit(UseFailed, { by: pid(), reason: 'locked' }),
  dry: () => S().events.emit(WeaponDry, { entity: pid(), weapon: 'demo/pistol' }),
  objective: (t: string) => flow().setObjective(t),
  status: (k: string, l: string, v: string) => flow().setStatus(k, l, v),
  notify: (t: string) => flow().notify(t),
  bg: (kind: string) => { document.body.dataset.bg = kind; },
};
w.__hooks = hooks;
w.__ready = true;
requestAnimationFrame(loop);
