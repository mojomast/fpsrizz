import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Flow, Player, Transform, Visual } from '@bulkhead/sdk';
import { Enemy, World } from '../contracts/shooter.ts';
import type { HeadlessGame } from '../../../tests/helpers/game.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import stealthManifest from '../plugins/example-stealth/manifest.json' with { type: 'json' };
import mapManifest from '../plugins/example-stealth-map/manifest.json' with { type: 'json' };
import mapContent from '../plugins/example-stealth-map/content.json' with { type: 'json' };

const preset = headlessPreset({
  plugins: ['core/world', 'core/player', 'core/modes', 'example/stealth', 'example/stealth-map'],
  roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'core/objective' },
  options: { map: 'example/silent-relay' },
});
const game = () => createHeadlessGame([
  { manifest: stealthManifest, load: () => import('../plugins/example-stealth/index.ts') },
  { manifest: mapManifest, content: mapContent },
]);
const flow = (g: HeadlessGame) => g.session().services.get(Flow);
const world = (g: HeadlessGame) => g.session().services.get(World);
const player = (g: HeadlessGame) => g.session().entities.get(g.session().entities.first(Player)!, Transform)!;

// Advance in short, collision-checked steps, allowing vision and trigger systems to run at every step.
function walk(g: HeadlessGame, x: number, z: number): void {
  const p = player(g);
  const dx = x - p.x, dz = z - p.z;
  const steps = Math.ceil(Math.hypot(dx, dz) / 0.075);
  const startX = p.x, startZ = p.z;
  for (let i = 1; i <= steps; i++) {
    const nx = startX + dx * i / steps, nz = startZ + dz * i / steps;
    assert.ok(world(g).isFree(nx, nz, 0.35), `blocked at ${nx},${nz}`);
    const out = { x: p.x, z: p.z };
    world(g).moveCircle(p.x, p.z, 0.35, nx - p.x, nz - p.z, out);
    assert.ok(Math.hypot(out.x - nx, out.z - nz) < 1e-6, 'route crosses no obstacle');
    p.x = nx; p.z = nz;
    g.ticks(1);
    assert.notEqual(flow(g).result?.outcome, 'defeat', `detected at ${nx},${nz}`);
  }
}

test('content stages and a covered route reaches the override and extraction without detection', async () => {
  const g = game();
  try {
    await g.host.apply(preset);
    assert.equal(world(g).desc.id, 'example/silent-relay');
    assert.equal(g.session().entities.count(Enemy), 0);
    assert.equal(g.session().entities.count(Visual), 3);
    assert.equal(flow(g).ended, false);
    // South corridor passes behind the two relay sentries; the east approach is behind the exit sentry.
    walk(g, 13, 15);
    player(g).yaw = Math.PI; // face the south-mounted switch
    g.input.press('core/use');
    g.ticks(1);
    g.input.release('core/use');
    assert.equal(world(g).triggers().find(t => t.desc.id === 'relay-override')?.fired, true);
    assert.equal(flow(g).ended, false);
    walk(g, 23, 15);
    walk(g, 23, 9);
    assert.equal(flow(g).result?.outcome, 'victory');
  } finally { g.host.stop(); }
});

test('exposure to the west sentry causes defeat and restart restores the scenario', async () => {
  const g = game();
  try {
    await g.host.apply(preset);
    const p = player(g);
    // Exposed relay floor north of the west guard, clear of the pillar.
    Object.assign(p, { x: 9, z: 5, prevX: 9, prevZ: 5 });
    g.ticks(35);
    assert.equal(flow(g).ended, false);
    g.ticks(1);
    assert.equal(flow(g).result?.outcome, 'defeat');
    assert.equal(flow(g).result?.title, 'Detected');
    await g.host.restart();
    assert.equal(flow(g).ended, false);
    assert.equal(world(g).triggers().find(t => t.desc.id === 'relay-override')?.fired, false);
    assert.deepEqual([player(g).x, player(g).z], [3, 15]);
    g.ticks(60);
    assert.equal(flow(g).ended, false);
  } finally { g.host.stop(); }
});
