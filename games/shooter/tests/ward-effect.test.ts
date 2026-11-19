import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Health, Player, Transform, definePlugin, spawnPrefab } from '../../../src/sdk/index.ts';
import { Combat, PickupCollected } from '../contracts/shooter.ts';
import type { CatalogEntry, SessionContext } from '../../../src/sdk/index.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import manifest from '../plugins/example-ward/manifest.json' with { type: 'json' };

const plugins = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content', 'example/ward', 'test/wards', 'test/probe'];

function pack(params: Record<string, unknown>): CatalogEntry {
  return {
    manifest: { schema: 1, id: 'test/wards', name: 'Wards', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/combat': '^1.0.0', 'example/ward': '^1.0.0' } },
    content: [
      { kind: 'pickup', id: 'test/ward', data: { name: 'Ward', effect: 'example/ward', params, visual: 'pickup-health' } },
      { kind: 'pickup', id: 'test/strong-ward', data: { name: 'Strong ward', effect: 'example/ward', params: { duration: 1, multiplier: 0.25 }, visual: 'pickup-health' } },
    ],
  } as CatalogEntry;
}

function setup(params: Record<string, unknown> = { duration: 1, multiplier: 0.5 }) {
  let ctx: SessionContext;
  const probe = {
    manifest: { schema: 1, id: 'test/probe', name: 'Probe', version: '1.0.0', kind: 'code', sdk: '^2.0.0' },
    load: async () => ({ default: definePlugin({ activate(c) { ctx = c; } }) }),
  } as CatalogEntry;
  const game = createHeadlessGame([{ manifest, load: () => import('../plugins/example-ward/index.ts') }, pack(params), probe]);
  return { game, context: () => ctx!, preset: headlessPreset({ plugins }) as never };
}

test('pickup acquisition, scaling, replacement, expiry and restart use session-local state', async () => {
  const s = setup();
  try {
  await s.game.host.apply(s.preset);
  const player = () => s.context().world.first(Player)!;
  const health = () => s.context().world.get(player(), Health)!;
  health().hp = health().max = 1000;
  let collected = 0;
  s.context().events.on(PickupCollected, () => collected++);
  const pickup = (id: string) => {
    const tr = s.context().world.get(player(), Transform)!;
    const entity = spawnPrefab(s.context(), id, { x: tr.x, z: tr.z, yaw: 0 });
    s.game.ticks(1);
    assert.equal(s.context().world.isAlive(entity), false);
  };
  const hit = () => {
    const before = health().hp;
    s.context().services.get(Combat).damage({ target: player(), amount: 20, kind: 'test', source: 0, x: 0, z: 0 });
    s.game.ticks(1);
    return before - health().hp;
  };
  assert.equal(hit(), 20);
  pickup('test/ward');
  assert.equal(hit(), 10);
  s.game.ticks(30);
  pickup('test/strong-ward');
  assert.equal(collected, 2);
  assert.equal(hit(), 5, 'new ward replaces rather than stacks');
  s.game.ticks(32);
  assert.equal(hit(), 5, 'replacement refreshes duration');
  s.game.ticks(30);
  assert.equal(hit(), 20, 'expired ward no longer scales damage');
  pickup('test/ward');
  assert.equal(hit(), 10);
  await s.game.host.restart();
  health().hp = health().max = 1000;
  assert.equal(hit(), 20, 'restart does not retain the old ward');
  } finally {
    s.game.host.stop();
  }
});

test('ward content validation reports invalid and unknown parameters at their paths', async () => {
  const s = setup({ duration: 0, multiplier: 2, extra: true });
  try {
  await assert.rejects(s.game.host.apply(s.preset), (error: unknown) => {
    const issues = (error as { issues: { path: string; message: string }[] }).issues;
    assert.ok(issues.some((i) => i.path.endsWith('params.duration') && i.message.includes('between')));
    assert.ok(issues.some((i) => i.path.endsWith('params.multiplier') && i.message.includes('between')));
    assert.ok(issues.some((i) => i.path.endsWith('params.extra') && i.message.includes('unknown')));
    return true;
  });
  } finally {
    s.game.host.stop();
  }
});
