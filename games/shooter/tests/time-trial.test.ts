import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Flow, Health, Player, Transform } from '@bulkhead/sdk';
import { Combat, Enemy, World } from '../contracts/shooter.ts';
import type { HeadlessGame } from '../../../tests/helpers/game.ts';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import manifest from '../plugins/example-time-trial/manifest.json' with { type: 'json' };

const id = 'example/time-trial';
const entry = { manifest, load: () => import('../plugins/example-time-trial/index.ts') };
const preset = (seconds = 180) => headlessPreset({
  plugins: ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/content', id],
  roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': id },
  config: { [id]: { seconds } },
});
const flow = (g: HeadlessGame) => g.session().services.get(Flow);
function move(g: HeadlessGame, x: number, z: number, yaw = 0): void {
  const s = g.session();
  const t = s.entities.get(s.entities.first(Player)!, Transform)!;
  Object.assign(t, { x, z, prevX: x, prevZ: z, yaw, prevYaw: yaw });
}
function switchOn(g: HeadlessGame): void {
  const tr = g.session().services.get(World).triggers().find((t) => t.desc.tags.includes('objective'))!;
  move(g, tr.desc.x, tr.desc.z);
  g.input.press('core/use');
  g.ticks(1);
  g.input.release('core/use');
}
function enterExit(g: HeadlessGame): void {
  const tr = g.session().services.get(World).triggers().find((t) => t.desc.tags.includes('exit'))!;
  move(g, tr.desc.x, tr.desc.z);
  g.ticks(1);
}

test('raid requires the real switch before the exit, and restarts cleanly', async () => {
  const g = createHeadlessGame([entry]);
  try {
    await g.host.apply(preset());
    const s = g.session();
    assert.equal(s.entities.count(Player), 1);
    assert.ok(s.entities.count(Enemy) > 0);
    assert.equal(flow(g).status.get('time')?.value, '3:00');
    enterExit(g);
    assert.equal(flow(g).ended, false);
    assert.match(flow(g).notice.text, /sealed/);
    switchOn(g);
    assert.equal(s.services.get(World).door('exit-gate')?.open, true);
    assert.match(flow(g).objective, /Exit unlocked/);
    enterExit(g);
    assert.equal(flow(g).result?.outcome, 'victory');
    assert.equal(Object.fromEntries(flow(g).result!.stats)['Overrides'], '1 / 1');
    await g.host.restart();
    assert.equal(flow(g).ended, false);
    assert.equal(flow(g).status.get('time')?.value, '3:00');
    assert.match(flow(g).objective, /override switch/);
    assert.equal(g.session().services.get(World).door('exit-gate')?.open, false);
    assert.equal(g.session().services.get(World).triggers().find((t) => t.desc.tags.includes('objective'))?.fired, false);
  } finally { g.host.stop(); }
});

test('deadline defeats the player and remains ended on later ticks', async () => {
  const g = createHeadlessGame([entry]);
  try {
    await g.host.apply(preset(1));
    g.ticks(59);
    assert.equal(flow(g).ended, false);
    g.ticks(2);
    assert.equal(flow(g).result?.title, 'Time expired');
    assert.equal(flow(g).result?.outcome, 'defeat');
    assert.equal(flow(g).status.get('time')?.value, '0:00');
    switchOn(g);
    enterExit(g);
    assert.equal(flow(g).result?.outcome, 'defeat');
  } finally { g.host.stop(); }
});

test('reaching the exit exactly at the deadline is too late', async () => {
  const g = createHeadlessGame([entry]);
  try {
    await g.host.apply(preset(1));
    switchOn(g);
    g.ticks(59);
    assert.equal(flow(g).ended, false);
    enterExit(g);
    assert.equal(flow(g).result?.title, 'Time expired');
  } finally { g.host.stop(); }
});

test('combat death ends the raid', async () => {
  const g = createHeadlessGame([entry]);
  try {
    await g.host.apply(preset());
    const s = g.session();
    const player = s.entities.first(Player)!;
    s.services.get(Combat).damage({ target: player, amount: 10000, kind: 'test', source: 0, x: 0, z: 0 });
    g.ticks(1);
    assert.equal(s.entities.get(player, Health)?.dead, true);
    assert.equal(flow(g).result?.title, 'You died');
  } finally { g.host.stop(); }
});

test('invalid config and maps are rejected before replacing the current session', async () => {
  const pack = {
    manifest: { schema: 1, id: 'test/empty-map', name: 'Empty map', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/world': '^1.0.0' } },
    content: [{ kind: 'map', id: 'test/empty', data: { schema: 1, format: 'core/grid', name: 'Empty', cellSize: 2, wallHeight: 3, legend: { '#': { solid: true, wall: 'wall-panel' }, '.': { floor: 'floor-plate', ceiling: 'ceiling-panel' } }, grid: ['#####', '#...#', '#...#', '#####'], playerStart: { cell: [1, 1], yaw: 0 } } }],
  };
  const g = createHeadlessGame([entry, pack]);
  try {
    await g.host.apply(preset());
    const before = g.session();
    await assert.rejects(g.host.apply(preset(0)));
    await assert.rejects(g.host.apply({ ...preset(), config: { [id]: { playerPrefab: 'missing/player' } } }), /missing\/player/);
    await assert.rejects(g.host.apply({ ...preset(), plugins: [...(preset().plugins as string[]), 'test/empty-map'], options: { map: 'test/empty' } }), /objective/);
    assert.equal(g.session(), before);
  } finally { g.host.stop(); }
});
