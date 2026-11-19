import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collider, Flow, Player, SequenceProviders, Transform, angleDelta, yawOf } from '@bulkhead/sdk';
import { World } from '../contracts/shooter.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import { sequenceProviders } from '../../../tests/helpers/alternate-sequence.ts';
import racing from '../plugins/example-racing/manifest.json' with { type: 'json' };
import manifest from '../plugins/example-race-track/manifest.json' with { type: 'json' };
import content from '../plugins/example-race-track/content.json' with { type: 'json' };

for (const selected of sequenceProviders) test(`Foundry Circuit is sealed and the real driving controller can complete its ordered loop (${selected.id})`, async () => {
  const game = createHeadlessGame([
    selected.entry,
    { manifest: racing as never, load: () => import('../plugins/example-racing/index.ts') },
    { manifest: manifest as never, content: content as never },
  ]);
  try {
    await game.host.apply(headlessPreset({
      plugins: ['core/world', 'core/combat', 'core/player', 'example/racing', 'example/race-track', selected.id],
      roles: { 'sdk/controller': 'example/racing-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'example/race', 'sdk/mechanic-sequence': selected.id },
      options: { map: 'example/foundry-circuit' },
    }) as never);
    const session = game.session(), world = session.services.get(World), flow = session.services.get(Flow);
    assert.deepEqual(session.registries.ids(SequenceProviders), [selected.id], 'the replacement runs with the default absent');
    const id = session.entities.first(Player)!;
    const pose = session.entities.get(id, Transform)!;
    const radius = session.entities.get(id, Collider)!.radius;
    const { width, height, cells } = world.desc;
    for (let x = 0; x < width; x++) {
      assert.ok(cells[x]!.solid && cells[(height - 1) * width + x]!.solid);
    }
    for (let z = 0; z < height; z++) {
      assert.ok(cells[z * width]!.solid && cells[z * width + width - 1]!.solid);
    }
    // Targets run clockwise from start, with an extra waypoint at each turn.
    const points = [[5, 11], [5, 5], [11, 5], [23, 5], [29, 5], [29, 13], [29, 21], [23, 21], [11, 21]] as const;
    let next = 0;
    const set = (action: string, held: boolean): void => held ? game.input.press(action) : game.input.release(action);
    for (let i = 0; i < 60 * 85 && !flow.ended; i++) {
      const target = points[next]!;
      const dx = target[0] - pose.x, dz = target[1] - pose.z;
      if (Math.hypot(dx, dz) < 1 && next < points.length - 1) next++;
      const current = points[next]!;
      const error = angleDelta(pose.yaw, yawOf(current[0] - pose.x, current[1] - pose.z));
      const speed = session.entities.get(id, Player)!.speed * 12;
      set('example/racing-left', error > 0.025);
      set('example/racing-right', error < -0.025);
      set('example/racing-gas', speed < 3.8);
      set('example/racing-brake', speed > 4.2);
      game.ticks(1);
      assert.ok(world.isFree(pose.x, pose.z, radius), `collision clearance at tick ${i}`);
    }
    assert.equal(flow.result?.outcome, 'victory', `waypoint ${next}, pose ${pose.x.toFixed(1)},${pose.z.toFixed(1)}, status ${flow.status.get('race-checkpoints')?.value}`);
    assert.equal(flow.status.get('race-checkpoints')?.value, '5 / 5');
  } finally {
    game.host.stop();
  }
});
