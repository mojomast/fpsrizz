import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, presets } from '../src/app/catalog.ts';
import { PluginHost } from '../src/kernel/host.ts';
import { PHASES, SDK_VERSION, Silt } from '../src/sdk/index.ts';
import type { SiltCommand, SiltState } from '../src/sdk/index.ts';
import preset from '../src/content/presets/silt-archive.json' with { type: 'json' };
import content from '../src/plugins/silt-content/content.json' with { type: 'json' };

const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

async function setup(seed = preset.seed) {
  assert.ok(presets.includes(preset));
  assert.equal(preset.roles['sdk/experience'], 'silt/archive');
  assert.equal(preset.roles['sdk/room-map'], 'mechanics/room-map');
  const host = new PluginHost({ sdkVersion: SDK_VERSION, phases: PHASES });
  assert.deepEqual(host.setCatalog(catalog), []);
  await host.apply({ ...preset, seed, plugins: [...new Set([...preset.plugins, 'mechanics/inventory', 'mechanics/crafting', 'mechanics/progression'])], roles: { ...preset.roles, 'sdk/mechanic-inventory': 'mechanics/inventory', 'sdk/mechanic-crafting': 'mechanics/crafting', 'sdk/mechanic-progression': 'mechanics/progression' } });
  const session = host.session!;
  const service = session.services.get(Silt);
  const act = (command: SiltCommand) => {
    assert.equal(service.enqueue(command), true);
    session.scheduler.runTick();
    return service.state();
  };
  return { host, service, act };
}

/** Breadth-first movement on the actual chamber; avoid flood and occupied cells. */
function path(state: SiltState, goal: (x: number, y: number) => boolean): readonly [number, number] | undefined {
  const todo: { x: number; y: number; first?: readonly [number, number] }[] = [{ x: state.x, y: state.y }];
  const seen = new Set([`${state.x},${state.y}`]);
  for (let i = 0; i < todo.length; i++) {
    const p = todo[i]!;
    if (goal(p.x, p.y)) return p.first;
    for (const [dx, dy] of directions) {
      const x = p.x + dx, y = p.y + dy, cell = state.rows[y]?.[x], key = `${x},${y}`;
      if (!cell || cell === '#' || cell === 'D' || cell === '~' || seen.has(key) || state.enemies.some(e => e.x === x && e.y === y)) continue;
      seen.add(key); todo.push({ x, y, first: p.first ?? [dx, dy] });
    }
  }
  return undefined;
}

test('bundled preset supports early extraction and restart', async () => {
  const { host, service, act } = await setup();
  try {
    const initial = service.state();
    assert.equal(initial.purpose, 'entry');
    assert.equal(act({ type: 'extract' }).status, 'extracted');
    assert.equal(act({ type: 'restart' }).status, 'playing');
    const restarted = service.state();
    assert.equal(restarted.turn, 0);
    assert.equal(restarted.district, 0);
    assert.equal(restarted.health, 24);
    assert.equal(restarted.fragments, 0);
    assert.equal(restarted.register, false);
  } finally { host.stop(); }
});

for (const seed of [19, 7, 42]) test(`bundled expedition reaches victory with seed ${seed}`, async () => {
  const { host, service, act } = await setup(seed);
  const seenDistricts = new Set<number>(), seenPurposes = new Set<string>(), chambers = new Set<string>();
  let attacks = 0, dodges = 0, upgrades = 0, consumables = 0, maxWater = 0, acceptedHit = false;
  try {
    for (let steps = 0; steps < 2500; steps++) {
      const s = service.state();
      assert.notEqual(s.status, 'dead', `died: ${JSON.stringify(s)}`);
      if (s.status === 'victory') break;
      assert.equal(s.status, 'playing');
      seenDistricts.add(s.district); seenPurposes.add(s.purpose); maxWater = Math.max(maxWater, s.water);
      assert.equal(s.districtName, content[0]!.data.districts[s.district]!.name);
      assert.ok(content[0]!.data.districts[s.district]!.chambers.some(c => JSON.stringify(c.rows) === JSON.stringify(s.rows)));
      chambers.add(`${s.district}:${JSON.stringify(s.rows)}`);
      if (s.pendingUpgrades) { act({ type: 'upgrade', upgrade: 'damage' }); upgrades++; continue; }
      if (s.health < s.maxHealth && s.bandages) { act({ type: 'use', item: 'bandage' }); consumables++; continue; }
      if (s.air <= s.maxAir - 5 && s.airSupplies) { act({ type: 'use', item: 'air' }); consumables++; continue; }
      const enemy = s.enemies[0];
      if (enemy) {
        const dist = Math.abs(s.x - enemy.x) + Math.abs(s.y - enemy.y);
        if (enemy.phase === 'windup' && enemy.threat.some(p => p.x === s.x && p.y === s.y)) {
          if (!acceptedHit) {
            const after = act({ type: 'wait' });
            assert.ok(after.health < s.health, 'telegraphed hit should deal damage');
            acceptedHit = true;
            continue;
          }
          const safe = directions.find(([dx, dy]) => {
            const x = s.x + dx, y = s.y + dy, cell = s.rows[y]?.[x];
            return cell && cell !== '#' && cell !== 'D' && cell !== '~' && !(enemy.x === x && enemy.y === y) && !enemy.threat.some(p => p.x === x && p.y === y);
          });
          if (safe) { act({ type: 'move', dx: safe[0], dy: safe[1] }); dodges++; continue; }
        }
        if (dist === 1) { act({ type: 'attack', enemy: enemy.id, style: s.charge >= 2 ? 'heavy' : 'strike' }); attacks++; continue; }
        const step = path(s, (x, y) => Math.abs(x - enemy.x) + Math.abs(y - enemy.y) === 1);
        assert.ok(step, `no path to enemy: ${JSON.stringify(s)}`);
        act({ type: 'move', dx: step[0], dy: step[1] }); continue;
      }
      if (s.purpose === 'fragment' && s.fragments === 0) { act({ type: 'interact' }); continue; }
      if (s.purpose === 'lift' && s.fragments === 2) {
        act({ type: s.district === 2 ? 'extract' : 'descend' }); continue;
      }
      const index = Number(s.room.slice(5));
      const next = s.rooms.find(r => r.id === `room-${index + 1}`);
      const here = s.rooms.find(r => r.id === s.room)!;
      assert.ok(next && here.neighbors.includes(next.id), `backbone not revealed: ${JSON.stringify(s)}`);
      const dx = next.x - here.x, dy = next.y - here.y;
      const doorX = dx === 1 ? 8 : dx === -1 ? 0 : 4, doorY = dy === 1 ? 8 : dy === -1 ? 0 : 4;
      if (s.x === doorX - dx && s.y === doorY - dy) { act({ type: 'move', dx, dy }); continue; }
      const step = path(s, (x, y) => x === doorX - dx && y === doorY - dy);
      assert.ok(step, `no path to door: ${JSON.stringify(s)}`);
      act({ type: 'move', dx: step[0], dy: step[1] });
    }
    assert.equal(service.state().status, 'victory', JSON.stringify(service.state()));
    assert.equal(service.state().register, true);
    assert.deepEqual([...seenDistricts], [0, 1, 2]);
    for (const purpose of ['entry', 'passage', 'fragment', 'boss', 'lift']) assert.ok(seenPurposes.has(purpose));
    assert.ok(chambers.size >= 3);
    assert.ok(attacks > 0 && dodges > 0 && upgrades > 0 && maxWater > 0);
    assert.ok(consumables > 0, 'expedition should use a consumable');
  } finally { host.stop(); }
});
