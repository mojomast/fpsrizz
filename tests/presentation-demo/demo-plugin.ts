// Demo-only plugin: a small two-room map, trivial mode/camera roles and a handful of entities. SDK imports only.
import type { EntityId, Json, PluginManifest, SessionContext, ViewState, WeaponDef } from '../../src/sdk/index.ts';
import { CameraRole, Collider, Enemies, Enemy, Health, Inventory, ModeRole, Pickup, Player, Transform, View, Visual, Weapons, definePlugin, makeTransform } from '../../src/sdk/index.ts';

export const demoManifest = {
  schema: 1, id: 'demo/content', name: 'Presentation demo', version: '1.0.0', kind: 'code', sdk: '^2.0.0',
  dependencies: { 'core/world': '^1.0.0', 'core/presentation': '^1.0.0' }, capabilities: [],
} as unknown as PluginManifest;

export const demoMap: Json = {
  schema: 1,
  format: 'core/grid',
  name: 'Presentation demo',
  legend: {
    '#': { solid: true, wall: 'wall-panel' },
    B: { solid: true, wall: 'wall-brick' },
    T: { solid: true, wall: 'wall-tech' },
    H: { solid: true, wall: 'wall-hazard' },
    M: { solid: true, wall: 'does-not-exist' },
    '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' },
    ',': { floor: 'floor-concrete', ceiling: 'ceiling-panel' },
  },
  grid: [
    '#####TBBBBBB',
    '#....T,,,,,B',
    '#....T,,,,,M',
    '#....T,,,,,B',
    '#.....,,,,,B',
    '#....T,,,,,B',
    '#..H.T,,,,,B',
    '#....T,,,,,B',
    '#....T,,,,,B',
    '#####TBBBBBB',
  ],
  doors: [{ id: 'door-a', cell: [5, 4], surface: 'door', locked: true }],
  triggers: [
    { id: 'sw-a', kind: 'switch', cell: [10, 4], face: 'e', opens: 'door-a' },
    { id: 'exit', kind: 'zone', cell: [9, 7], tags: ['exit'], radius: 0.9 },
  ],
  lights: [
    { id: 'l-cool', cell: [2, 3], color: '#4a80ff', intensity: 1.4, distance: 12 },
    { id: 'l-warm', cell: [8, 2], color: '#ff9a3c', intensity: 1.5, distance: 12 },
    { id: 'l-red', cell: [9, 7], color: '#ff2a2a', intensity: 1.2, distance: 9, y: 1.2 },
  ],
  playerStart: { cell: [2, 4], yaw: -90 },
  ambient: { color: '#8090b0', intensity: 0.32 },
  fog: { color: '#0b0d14', near: 8, far: 36 },
};

export interface DemoControl {
  pose: ViewState;
  ctx: SessionContext | undefined;
  player: EntityId;
  grunt: EntityId;
}

export const createDemoControl = (): DemoControl => ({ pose: { x: 3, y: 1.5, z: 9, yaw: -Math.PI / 2, pitch: 0, roll: 0, fov: 70, entity: 0 }, ctx: undefined, player: 0, grunt: 0 });

const cell = (cx: number, cz: number): [number, number] => [(cx + 0.5) * 2, (cz + 0.5) * 2];

export function createDemoPlugin(ctl: DemoControl) {
  const weapon = (slot: number, view: string, flash: string, recoil: number): WeaponDef => ({
    name: view, slot, attack: { behavior: 'x', params: {} }, ammoType: '', ammoPerShot: 0, cooldown: 0.2, auto: false, view, fireSound: 'pistol-fire', recoil, flash, starter: slot === 1,
  });
  return definePlugin({
    register(ctx) {
      ctx.defineContent('map', 'demo/map', demoMap);
      ctx.provideRole(ModeRole, 'demo/mode', { name: 'Demo mode', description: 'Does nothing.', activate() {} });
      ctx.provideRole(CameraRole, 'demo/camera', {
        name: 'Demo camera',
        description: 'Fixed pose driven by the test.',
        activate(c) {
          const view: ViewState = { ...ctl.pose };
          c.services.provide(View, view);
          c.systems.addFrame({ id: 'demo/camera', update() { Object.assign(view, ctl.pose); } });
        },
      });
      ctx.register(Weapons, 'demo/pistol', weapon(1, 'weapon-pistol', '#ffd070', 0.8));
      ctx.register(Weapons, 'demo/launcher', weapon(2, 'weapon-launcher', '#ff7030', 1));
      ctx.register(Weapons, 'demo/ricochet', weapon(3, 'weapon-ricochet', '#c040ff', 0.6));
      ctx.register(Enemies, 'demo/grunt', {
        name: 'Grunt', health: 30, speed: 2, radius: 0.4, sightRange: 20, ai: 'x', aiParams: {}, attack: { behavior: 'x', params: {}, cooldown: 1, range: 2, windup: 0.3, sound: 'enemy-melee' },
        visual: 'enemy-grunt', tint: '', scale: 1, painChance: 0.5, score: 1, sounds: { alert: 'enemy-alert', hurt: 'enemy-hurt', die: 'enemy-die' },
      });
    },

    activate(ctx) {
      ctl.ctx = ctx;
      const mk = (x: number, z: number, yaw = 0): EntityId => {
        const e = ctx.world.create();
        ctx.world.add(e, Transform, makeTransform(x, z, yaw));
        return e;
      };
      const vis = (e: EntityId, key: string, state = 'idle', over: Partial<Visual> = {}): void => {
        ctx.world.add(e, Visual, { key, state, stateAt: 0, y: 0, scale: 1, tint: '', renderer: '', ...over });
      };

      const p = mk(...cell(2, 4), -Math.PI / 2);
      ctx.world.add(p, Player, { kills: 0, hurtAt: -10, speed: 0 });
      ctx.world.add(p, Health, { hp: 100, max: 100, dead: false });
      ctx.world.add(p, Inventory, { weapons: ['demo/pistol', 'demo/launcher', 'demo/ricochet'], current: 'demo/pistol', ammo: {}, ammoMax: {}, nextFireAt: 0, lastFiredAt: -10, switchedAt: -10 });
      ctl.player = p;
      ctl.pose.entity = p;

      // Room B: grunts at z=5 (states idle/walk/attack/hurt), spitters at z=13.
      const states = ['idle', 'walk', 'attack', 'hurt'];
      states.forEach((s, i) => {
        const g = mk(14 + i * 2.2, 5);
        vis(g, 'enemy-grunt', s);
        ctx.world.add(g, Collider, { radius: 0.4, team: 'enemy', solid: true });
        if (i === 0) {
          ctx.world.add(g, Enemy, { def: 'demo/grunt', state: 'idle', target: 0, stateUntil: 0, nextAttackAt: 0, path: [], nextPathAt: 0, memory: {} });
          ctl.grunt = g;
        }
        vis(mk(14 + i * 2.2, 13), 'enemy-spitter', s);
      });
      // items: pickups (bobbing), projectiles, corpses, a tinted/scaled grunt
      ['pickup-health', 'pickup-bullets', 'pickup-cells'].forEach((k, i) => {
        const e = mk(14 + i * 1.2, 16.2);
        ctx.world.add(e, Pickup, { def: k });
        vis(e, k, 'idle', { y: 0.3 });
      });
      ['fx-plasma', 'fx-fireball', 'fx-ricochet'].forEach((k, i) => vis(mk(18 + i * 1.2, 16.2), k, 'fly', { y: 1.0 }));
      vis(mk(14.5, 17.4), 'enemy-grunt-corpse');
      vis(mk(16.5, 17.4), 'enemy-spitter-corpse');
      vis(mk(19, 17.4), 'enemy-grunt', 'idle', { tint: '#6aa0ff', scale: 0.8 });
      // in the doorway line, beyond the (closed) door: occluded until the door opens
      vis(mk(...cell(6, 4)), 'enemy-grunt', 'walk');
      // unknown visual key: warned once, never drawn
      vis(mk(...cell(9, 1)), 'nope');
      vis(mk(...cell(9, 2)), 'nope');
      // room A
      vis(mk(...cell(3, 6)), 'enemy-spitter');
      vis(mk(...cell(1, 1)), 'pickup-health', 'idle', { y: 0.3 });
    },
  });
}
