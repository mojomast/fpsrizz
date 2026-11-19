import test from 'node:test';
import assert from 'node:assert/strict';
import platformingManifest from '@bulkhead/std/mechanics-platforming/manifest.json' with { type: 'json' };
import capabilitiesManifest from '@bulkhead/std/mechanics-capabilities/manifest.json' with { type: 'json' };
import roomMapManifest from '@bulkhead/std/mechanics-room-map/manifest.json' with { type: 'json' };
import {
  CapabilityRole,
  PlatformerRole,
  RoomMapRole,
  createPlatformerBody,
  definePlugin,
  defineService,
} from '@bulkhead/sdk';
import type { CapabilitySet, PlatformerProvider, RoomMapHandle } from '@bulkhead/sdk';
import { createHeadlessGame } from './helpers/game.ts';

interface Probe {
  platform: PlatformerProvider;
  capabilities: CapabilitySet;
  map: RoomMapHandle;
}
const ProbeService = defineService<Probe>('test/metroidvania-probe');
const probe = definePlugin({ activate(ctx) {
  const platform = ctx.role(PlatformerRole)?.provider;
  const capability = ctx.role(CapabilityRole)?.provider;
  const roomMap = ctx.role(RoomMapRole)?.provider;
  if (!platform || !capability || !roomMap) throw new Error('provider roles were not selected');
  const capabilities = capability.create(ctx, 'test/capabilities', [
    { id: 'jump', label: 'Jump', description: 'Jump', kind: 'movement' },
    { id: 'dash', label: 'Dash', description: 'Dash', kind: 'movement', maxRank: 2 },
  ]);
  const map = roomMap.create(ctx, 'test/map', {
    id: 'test/world', name: 'Test world', start: 'a',
    rooms: [
      { id: 'a', name: 'A', region: 'r', map: { x: 0, y: 0, w: 1, h: 1 } },
      { id: 'b', name: 'B', region: 'r', map: { x: 2, y: 0, w: 1, h: 1 } },
      { id: 'c', name: 'C', region: 'r', map: { x: 4, y: 0, w: 1, h: 1 } },
    ],
    links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
  });
  ctx.services.provide(ProbeService, { platform, capabilities, map });
  ctx.scope.add(() => { capabilities.dispose(); map.dispose(); }, 'test-probe');
} });
const probeManifest = { schema: 1, id: 'test/probe', name: 'Provider probe', version: '1.0.0', kind: 'code', sdk: '^2.0.0', description: 'Provider test probe.', dependencies: {}, capabilities: ['simulation'] } as const;

async function setup() {
  const game = createHeadlessGame([
    { manifest: probeManifest, load: async () => ({ default: probe }) },
    { manifest: platformingManifest, load: () => import('@bulkhead/std/mechanics-platforming/index.ts') },
    { manifest: capabilitiesManifest, load: () => import('@bulkhead/std/mechanics-capabilities/index.ts') },
    { manifest: roomMapManifest, load: () => import('@bulkhead/std/mechanics-room-map/index.ts') },
  ]);
  await game.host.apply({
    schema: 1, id: 'test/providers', name: 'Provider test', seed: 3,
    plugins: ['test/probe', 'mechanics/platforming', 'mechanics/capabilities', 'mechanics/room-map'],
    roles: { 'sdk/platformer': 'mechanics/platforming', 'sdk/capabilities': 'mechanics/capabilities', 'sdk/room-map': 'mechanics/room-map' },
    options: {},
  }, []);
  return { game, probe: game.session().services.get(ProbeService) };
}

test('platforming provider handles jumping, gravity and one-way landing', async () => {
  const { game, probe } = await setup();
  try {
    const platform = probe.platform.create({ runSpeed: 5, jumpSpeed: 10, doubleJumpSpeed: 8, dashSpeed: 12, dashDuration: .1, dashCooldown: .5 });
    const body = createPlatformerBody(0, 0, 1, 1, { grounded: true });
    let result = platform.step(body, { moveX: 1, jumpHeld: true, jumpPressed: true, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: false }, () => 'empty', 1 / 60);
    assert.equal(result.jumped, true);
    assert.ok(body.vy < 0);
    const startX = body.x;
    for (let i = 0; i < 120; i++) platform.step(body, { moveX: 1, jumpHeld: true, jumpPressed: false, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: false }, (x, y, w, h) => y + h >= 5 ? 'solid' : 'empty', 1 / 60);
    assert.ok(body.x > startX, 'air control moves the body');
    assert.equal(body.grounded, true, 'lands on the supplied floor');
    assert.ok(body.y < 5 && body.y + body.h >= 4.9);
    result = platform.step(body, { moveX: 0, jumpHeld: false, jumpPressed: true, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: false }, (x, y, w, h) => y + h >= 5 ? 'solid' : 'empty', 1 / 60);
    assert.equal(result.jumped, true);
    assert.equal(body.grounded, false);
  } finally { game.host.stop(); }
});

test('platforming provider exposes double jump, dash and wall jump only when allowed', async () => {
  const { game, probe } = await setup();
  try {
    const platform = probe.platform.create({ jumpSpeed: 10, doubleJumpSpeed: 9, dashSpeed: 12, dashDuration: .12, dashCooldown: .2, wallJumpX: 6, wallJumpY: 9 });
    const body = createPlatformerBody(0, 0, 1, 1, { grounded: true });
    const empty = () => 'empty' as const;
    platform.step(body, { moveX: 0, jumpHeld: true, jumpPressed: true, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: false }, empty, 1 / 60);
    platform.step(body, { moveX: 0, jumpHeld: true, jumpPressed: false, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: false }, empty, 1 / 60);
    const noDouble = platform.step(body, { moveX: 0, jumpHeld: true, jumpPressed: true, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: false }, empty, 1 / 60);
    assert.equal(noDouble.doubleJumped, false);
    const withDouble = platform.step(body, { moveX: 0, jumpHeld: true, jumpPressed: true, dashPressed: false, downHeld: false }, { doubleJump: true, dash: false, wallJump: false }, empty, 1 / 60);
    assert.equal(withDouble.doubleJumped, true);
    body.grounded = true;
    const dash = platform.step(body, { moveX: 0, jumpHeld: false, jumpPressed: false, dashPressed: true, downHeld: false }, { doubleJump: true, dash: false, wallJump: false }, empty, 1 / 60);
    assert.equal(dash.dashed, false, 'dash ability is required');
    platform.step(body, { moveX: 0, jumpHeld: false, jumpPressed: false, dashPressed: true, downHeld: false }, { doubleJump: true, dash: true, wallJump: false }, empty, 1 / 60);
    assert.equal(body.dashing, true);
    // A wall to the left: jump away from it with the wall-jump ability.
    const wallBody = createPlatformerBody(1, 4, 1, 1, { grounded: false, wallDir: -1 });
    const wallJump = platform.step(wallBody, { moveX: -1, jumpHeld: true, jumpPressed: true, dashPressed: false, downHeld: false }, { doubleJump: false, dash: false, wallJump: true }, (x) => x <= 0 ? 'solid' : 'empty', 1 / 60);
    assert.equal(wallJump.wallJumped, true);
    assert.ok(wallBody.vx > 0);
  } finally { game.host.stop(); }
});

test('capability ledger unlocks without regression and room map tracks visited/revealed state', async () => {
  const { game, probe } = await setup();
  try {
    assert.equal(probe.capabilities.has('jump'), false);
    assert.equal(probe.capabilities.unlock('jump').ok, true);
    assert.equal(probe.capabilities.rank('jump'), 1);
    const revision = probe.capabilities.revision;
    assert.deepEqual(probe.capabilities.unlock('jump'), { ok: true, changed: false, reason: '' });
    assert.equal(probe.capabilities.revision, revision);
    assert.equal(probe.capabilities.unlock('dash', 2).ok, true);
    assert.equal(probe.capabilities.rank('dash'), 2);
    assert.equal(probe.capabilities.unlock('dash', 1).changed, false);
    assert.equal(probe.capabilities.unlock('unknown').ok, false);
    assert.equal(probe.capabilities.snapshot().find(entry => entry.id === 'dash')?.rank, 2);
    const map = probe.map;
    assert.deepEqual(map.state().visited, ['a']);
    assert.deepEqual(map.state().revealed, ['a', 'b']);
    assert.equal(map.enter('b').ok, true);
    assert.deepEqual(map.state().visited, ['a', 'b']);
    assert.deepEqual(map.state().revealed, ['a', 'b', 'c']);
    assert.equal(map.enter('missing').ok, false);
    assert.equal(map.reveal('c').changed, false);
    assert.deepEqual(map.neighbors('a'), ['b']);
    map.dispose();
    assert.equal(map.active, false);
    assert.equal(map.enter('a').ok, false);
    assert.equal(probe.capabilities.active, true, 'disposing one provider handle does not affect another');
  } finally { game.host.stop(); }
});
