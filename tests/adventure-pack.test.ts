import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, Flow, Maps, Player, Transform, World } from '../src/sdk/index.ts';
import manifest from '../games/shooter/plugins/example-adventure-pack/manifest.json' with { type: 'json' };
import content from '../games/shooter/plugins/example-adventure-pack/content.json' with { type: 'json' };
import wardManifest from '../games/shooter/plugins/example-ward/manifest.json' with { type: 'json' };
import { createHeadlessGame, headlessPreset } from './helpers/game.ts';

const plugins = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/ward', 'example/adventure-pack'];

for (const [map, enemies] of [['example/silent-observatory', 0], ['example/blackout-ward', 2]] as const) {
  test(`${map} stages, has a reachable override and gated exit, and completes`, async () => {
    const game = createHeadlessGame([{ manifest, content }, { manifest: wardManifest, load: () => import('../games/shooter/plugins/example-ward/index.ts') }]);
    const preset = headlessPreset({ plugins, options: { map } });
    const staged = await game.host.stage(preset);
    assert.ok(staged.registries.has(Maps, map));
    staged.scope.dispose();
    const session = await game.host.apply(preset);
    const world = session.services.get(World);
    const flow = session.services.get(Flow);
    const player = session.entities.first(Player)!;
    const transform = session.entities.get(player, Transform)!;
    assert.equal(session.entities.count(Enemy), enemies);
    const objective = world.triggers().find((t) => t.desc.tags.includes('objective'))!;
    const exit = world.triggers().find((t) => t.desc.tags.includes('exit'))!;
    const door = world.door(objective.desc.opens)!;
    const switchX = objective.desc.x + objective.desc.nx * world.desc.cellSize / 2;
    const switchZ = objective.desc.z + objective.desc.nz * world.desc.cellSize / 2;
    const start = world.desc.playerStart;
    assert.equal(world.findPath(start.x, start.z, switchX, switchZ, []), true, 'override reachable before opening gate');
    assert.equal(world.findPath(start.x, start.z, exit.desc.x, exit.desc.z, []), false, 'gate blocks exit');

    // Exercise the real input, trigger, door and objective systems at the reachable switch.
    transform.x = switchX;
    transform.z = switchZ;
    transform.yaw = 0;
    game.input.press('core/use');
    game.ticks(1);
    game.input.release('core/use');
    assert.equal(objective.fired, true);
    assert.equal(door.open, true);
    assert.equal(world.findPath(switchX, switchZ, exit.desc.x, exit.desc.z, []), true, 'exit reachable after override');
    transform.x = exit.desc.x;
    transform.z = exit.desc.z;
    game.ticks(1);
    assert.equal(flow.result?.outcome, 'victory');
    assert.equal(session.state, 'running');
  });
}

test('the quiet map has no spawns and the ward contains its three supply pickups', () => {
  const quiet = content.find((entry) => entry.id === 'example/silent-observatory')!;
  const ward = content.find((entry) => entry.id === 'example/blackout-ward')!;
  assert.equal(quiet.data.spawns?.length ?? 0, 0);
  assert.deepEqual(ward.data.spawns?.filter((spawn) => !spawn.tags?.includes('enemy')).map((spawn) => spawn.prefab).sort(), ['core/bullets', 'core/medkit', 'example/ward-pickup']);
});
