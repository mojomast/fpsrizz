import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, Player } from '../../../src/sdk/index.ts';
import { Combat, WeaponRuntime } from '../contracts/shooter.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import { contentPack, hostFailure } from '../../../tests/helpers/host.ts';

const weapon = (slot: number, extra: Record<string, unknown> = {}) => ({
  name: 'Magazine weapon', slot, behavior: 'core/hitscan', params: { damage: 1 },
  ammoType: 'test/rounds', cooldown: 0.1, starter: true, view: 'weapon-pistol',
  magazineSize: 4, reloadTime: 0.5, ...extra,
});
const pack = (extra: Record<string, unknown> = {}) => contentPack('test/magazines', [
  { kind: 'ammo', id: 'test/rounds', data: { name: 'Rounds', max: 20, start: 6 } },
  { kind: 'weapon', id: 'test/first', data: weapon(6, extra) },
  { kind: 'weapon', id: 'test/second', data: weapon(7) },
  { kind: 'weapon', id: 'test/third', data: weapon(8, { starter: false }) },
], { dependencies: { 'core/combat': '^1.0.0' } });
const preset = () => headlessPreset({ plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'test/magazines'] });

test('magazines conserve shared starting ammo, reload on completion, and cancel on switch', async () => {
  const game = createHeadlessGame([pack()]);
  const session = await game.host.apply(preset());
  const player = session.entities.first(Player)!;
  const inv = session.entities.get(player, Inventory)!;
  const runtime = session.entities.get(player, WeaponRuntime)!;
  assert.deepEqual([runtime.loaded['test/first'], runtime.loaded['test/second'], inv.ammo['test/rounds']], [4, 2, 0]);
  inv.current = 'test/first';
  game.input.press('core/fire'); game.ticks(1); game.input.release('core/fire');
  assert.equal(runtime.loaded['test/first'], 3);
  assert.equal(session.services.get(Combat).giveAmmo(player, 'test/rounds', 3), 3);
  game.input.press('core/reload'); game.ticks(1); game.input.release('core/reload');
  assert.equal(runtime.loaded['test/first'], 3);
  assert.equal(inv.ammo['test/rounds'], 3);
  game.ticks(29);
  assert.equal(runtime.loaded['test/first'], 3);
  game.ticks(1);
  assert.equal(runtime.loaded['test/first'], 4);
  assert.equal(inv.ammo['test/rounds'], 2);
  game.input.press('core/weapon-next'); game.ticks(1); game.input.release('core/weapon-next');
  assert.equal(inv.current, 'test/second');
  game.input.press('core/reload'); game.ticks(1); game.input.release('core/reload');
  assert.ok(runtime.reload);
  game.input.press('core/weapon-prev'); game.ticks(1); game.input.release('core/weapon-prev');
  assert.equal(runtime.reload, null);
  game.ticks(40);
  assert.equal(runtime.loaded['test/second'], 2);
  assert.equal(inv.ammo['test/rounds'], 2);
});

test('granting a magazine weapon chambers available reserve without duplicating ammo', async () => {
  const game = createHeadlessGame([pack()]);
  const session = await game.host.apply(preset());
  const player = session.entities.first(Player)!;
  const inv = session.entities.get(player, Inventory)!;
  const runtime = session.entities.get(player, WeaponRuntime)!;
  const combat = session.services.get(Combat);
  assert.equal(runtime.loaded['test/third'], undefined);
  assert.equal(combat.giveAmmo(player, 'test/rounds', 6), 6);
  assert.equal(combat.giveWeapon(player, 'test/third'), true);
  assert.equal(runtime.loaded['test/third'], 4);
  assert.equal(inv.ammo['test/rounds'], 2);
  assert.equal(combat.giveWeapon(player, 'test/third'), false);
  assert.equal(runtime.loaded['test/third'], 4);
  assert.equal(inv.ammo['test/rounds'], 2);
  game.host.stop();
});

test('legacy weapons still consume the shared ammo pool', async () => {
  const game = createHeadlessGame();
  const session = await game.host.apply(headlessPreset());
  const inv = session.entities.get(session.entities.first(Player)!, Inventory)!;
  const before = inv.ammo['core/bullets-ammo']!;
  game.input.press('core/fire'); game.ticks(1);
  assert.equal(inv.ammo['core/bullets-ammo'], before - 1);
});

test('magazine definitions report actionable field errors', async () => {
  for (const [extra, field] of [
    [{ reloadTime: undefined }, 'reloadTime'],
    [{ magazineSize: 0 }, 'magazineSize'],
    [{ ammoType: '' }, 'ammoType'],
    [{ magazineSize: 1, ammoPerShot: 2 }, 'magazineSize'],
  ] as const) {
    const game = createHeadlessGame([pack(extra)]);
    const error = await hostFailure(game.host.apply(preset()));
    assert.ok(error.message.includes(field), error.message);
  }
});
