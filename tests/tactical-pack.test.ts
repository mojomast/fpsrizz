import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Flow, Inventory, Player, Transform, WeaponRuntime, World } from '../src/sdk/index.ts';
import manifest from '../games/shooter/plugins/example-tactical-pack/manifest.json' with { type: 'json' };
import content from '../games/shooter/plugins/example-tactical-pack/content.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';
import { hostFailure } from './helpers/host.ts';
import { place } from './helpers/gameplay.ts';

const preset = () => headlessPreset({
  plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/tactical-pack'],
  options: { map: 'example/relay-station' },
});
const entry = { manifest, content };

test('relay mission stages, fires and reloads its carbine, then opens a path to extraction', async () => {
  const game = createHeadlessGame([entry]);
  const session = await game.host.apply(preset());
  const player = session.entities.first(Player)!;
  const inv = session.entities.get(player, Inventory)!;
  const runtime = session.entities.get(player, WeaponRuntime)!;
  const world = session.services.get(World);
  const flow = session.services.get(Flow);
  assert.equal(runtime.loaded['example/relay-carbine'], 6);
  assert.equal(inv.ammo['example/carbine-rounds'], 18);
  const path: number[] = [];
  assert.equal(world.findPath(3, 5, 15, 5, path), false);

  game.input.press('core/weapon-3'); game.ticks(1); game.input.release('core/weapon-3');
  assert.equal(inv.current, 'example/relay-carbine');
  game.ticks(20);
  game.input.press('core/fire'); game.ticks(1); game.input.release('core/fire');
  assert.equal(runtime.loaded['example/relay-carbine'], 5);
  game.input.press('core/reload'); game.ticks(1); game.input.release('core/reload');
  assert.ok(runtime.reload);
  assert.equal(inv.ammo['example/carbine-rounds'], 18);
  game.ticks(60);
  assert.equal(runtime.reload, null);
  assert.equal(runtime.loaded['example/relay-carbine'], 6);
  assert.equal(inv.ammo['example/carbine-rounds'], 17);

  place(session, player, 5, 3, 0);
  game.input.press('core/use'); game.ticks(1); game.input.release('core/use');
  assert.equal(world.door('relay-gate')?.open, true);
  assert.equal(world.findPath(3, 5, 15, 5, path), true);
  assert.match(flow.objective, /Exit unlocked/);
  place(session, player, 7, 5, -Math.PI / 2);
  game.input.press('core/move-forward');
  for (let i = 0; i < 120 && !flow.ended; i++) game.ticks(1);
  game.input.release('core/move-forward');
  assert.equal(flow.result?.outcome, 'victory');
  assert.ok(session.entities.get(player, Transform)!.x > 13);
});

test('invalid tactical content is rejected at its field without replacing a running session', async () => {
  const game = createHeadlessGame([entry]);
  const running = await game.host.apply(preset());
  const broken = JSON.parse(JSON.stringify(content)) as typeof content;
  broken[1]!.data.magazineSize = 0;
  const error = await hostFailure(game.host.apply(preset(), [{ manifest, content: broken }]));
  assert.match(error.message, /magazineSize/);
  assert.equal(game.host.session, running);
});
