import { AmmoTypes, Health, Inventory, Player, Transform, Weapons, definePlugin, makeTransform } from '../../src/sdk/index.ts';
import type { EntityId, WeaponDef } from '../../src/sdk/index.ts';

export const demoManifest = { schema: 1, id: 'demo/game', name: 'Demo Game', version: '1.0.0', kind: 'code', sdk: '^2.0.0' };

const weapon = (name: string, slot: number, ammoType: string): WeaponDef => ({
  name, slot, attack: { behavior: 'x', params: {} }, ammoType, ammoPerShot: 1, cooldown: 0.2, auto: false, starter: false, view: '', fireSound: '', recoil: 0.3, flash: '#ffcc66',
});

export interface DemoHooks { player: EntityId }

export default definePlugin({
  register(ctx) {
    ctx.register(AmmoTypes, 'demo/bullets', { name: 'Bullets', max: 200, start: 0 });
    ctx.register(AmmoTypes, 'demo/shells', { name: 'Shells', max: 50, start: 0 });
    ctx.register(Weapons, 'demo/fist', weapon('Crowbar', 1, ''));
    ctx.register(Weapons, 'demo/pistol', weapon('Rivet Pistol', 2, 'demo/bullets'));
    ctx.register(Weapons, 'demo/shotgun', weapon('Pipe Shotgun', 3, 'demo/shells'));
  },
  activate(ctx) {
    const p = ctx.world.create();
    ctx.world.add(p, Player, { kills: 0, hurtAt: -1, speed: 0 });
    ctx.world.add(p, Health, { hp: 100, max: 100, dead: false });
    ctx.world.add(p, Transform, makeTransform(0, 0, 0));
    ctx.world.add(p, Inventory, { weapons: ['demo/fist', 'demo/pistol', 'demo/shotgun'], current: 'demo/pistol', ammo: { 'demo/bullets': 48, 'demo/shells': 0 }, ammoMax: { 'demo/bullets': 200, 'demo/shells': 50 }, nextFireAt: 0, lastFiredAt: -100, switchedAt: 0 });
    (window as unknown as { __demo: DemoHooks }).__demo = { player: p };
  },
});
