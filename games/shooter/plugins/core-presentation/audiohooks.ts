import type { AudioService, EntityId, SessionContext, ViewState } from '../../../../src/sdk/index.ts';
import { FlowEnded, Player, View } from '../../../../src/sdk/index.ts';
import { AttackFired, Damaged, DoorChanged, Died, Enemies, Enemy, EnemyAlerted, Impact, PickupCollected, TriggerFired, UseFailed, WeaponDry, WeaponSwitched } from '../../contracts/shooter.ts';

const NEAR = 3;
const FAR = 30;

/** Gain for a sound `d` metres from the listener: full inside NEAR, smoothly zero at FAR. */
export function distanceGain(d: number): number {
  if (d <= NEAR) return 1;
  if (d >= FAR) return 0;
  const k = 1 - (d - NEAR) / (FAR - NEAR);
  return k * k;
}

/** Subscribes the sound hooks. Sound ids are theme keys; the host's audio service resolves them. */
export function installAudioHooks(ctx: SessionContext, audio: AudioService): void {
  const view = (): ViewState | undefined => ctx.services.tryGet(View);

  const flat = (id: string): void => {
    if (id !== '') audio.play(id);
  };
  const at = (id: string, x: number, z: number): void => {
    if (id === '') return;
    const v = view();
    if (!v) return audio.play(id);
    const dx = x - v.x;
    const dz = z - v.z;
    const d = Math.hypot(dx, dz);
    const gain = distanceGain(d);
    if (gain < 0.02) return;
    // Listener's right-hand direction on the XZ plane for a yaw (0 = facing -Z, positive turns left).
    const pan = d < 0.5 ? 0 : Math.max(-1, Math.min(1, ((dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw)) / d) * 0.9));
    audio.play(id, { gain, pan });
  };
  const from = (id: string, source: EntityId, x: number, z: number): void => {
    const v = view();
    if (v && source !== 0 && v.entity === source) flat(id);
    else at(id, x, z);
  };
  const isPlayer = (e: EntityId): boolean => ctx.world.has(e, Player);

  ctx.events.on(AttackFired, (e) => from(e.sound, e.shooter, e.x, e.z));
  ctx.events.on(Impact, (e) => at(e.sound, e.x, e.z));
  ctx.events.on(PickupCollected, (e) => from(e.sound, e.by, e.x, e.z));
  ctx.events.on(DoorChanged, (e) => at(e.open ? 'door-open' : 'door-close', e.x, e.z));
  ctx.events.on(TriggerFired, (e) => {
    if (e.kind === 'switch') at('switch-on', e.x, e.z);
  });
  ctx.events.on(WeaponSwitched, () => flat('weapon-switch'));
  ctx.events.on(WeaponDry, () => flat('weapon-empty'));
  ctx.events.on(EnemyAlerted, (e) => {
    const def = ctx.registries.get(Enemies, e.def);
    if (def) at(def.sounds.alert, e.x, e.z);
  });
  ctx.events.on(Damaged, (e) => {
    if (isPlayer(e.target)) return flat('player-hurt');
    const en = ctx.world.get(e.target, Enemy);
    if (!en || e.lethal) return;
    const def = ctx.registries.get(Enemies, en.def);
    if (def) at(def.sounds.hurt, e.x, e.z);
  });
  ctx.events.on(Died, (e) => {
    const en = ctx.world.get(e.entity, Enemy);
    if (en) {
      const def = ctx.registries.get(Enemies, en.def);
      if (def) at(def.sounds.die, e.x, e.z);
    } else if (isPlayer(e.entity)) flat('player-die');
  });
  ctx.events.on(FlowEnded, (e) => flat(e.outcome === 'victory' ? 'victory' : 'defeat'));
  ctx.events.on(UseFailed, (e) => {
    if (e.reason === 'locked') flat('weapon-empty');
  });
}
