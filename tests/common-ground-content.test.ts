import test from 'node:test';
import assert from 'node:assert/strict';
import { HearthHouseholds } from '../src/sdk/index.ts';
import rules from '../src/plugins/common-ground-game/manifest.json' with { type: 'json' };
import pack from '../src/plugins/common-ground-content/manifest.json' with { type: 'json' };
import content from '../src/plugins/common-ground-content/content.json' with { type: 'json' };
import relationships from '../src/plugins/mechanics-relationships/manifest.json' with { type: 'json' };
import { catalog } from '../src/app/catalog.ts';
import { createHeadlessGame } from './helpers/game.ts';

const mechanics = ['mechanics/resources', 'mechanics/clock', 'mechanics/actions', 'mechanics/objectives', 'mechanics/relationships'];
const preset = { schema: 1, id: 'test/common-content', name: 'Household content', plugins: ['common/game', 'common/content', ...mechanics], roles: {
  'sdk/mechanic-resources': 'mechanics/resources', 'sdk/mechanic-clock': 'mechanics/clock',
  'sdk/mechanic-actions': 'mechanics/actions', 'sdk/mechanic-objectives': 'mechanics/objectives', 'sdk/mechanic-relationships': 'mechanics/relationships',
}, options: { household: 'common/household' }, seed: 1 };
function game(data: unknown = content) {
  return createHeadlessGame([
    ...catalog.filter(entry => mechanics.includes((entry.manifest as { id: string }).id) && (entry.manifest as { id: string }).id !== 'mechanics/relationships'),
    { manifest: relationships, load: () => import('../src/plugins/mechanics-relationships/index.ts') },
    { manifest: rules, load: () => import('../src/plugins/common-ground-game/index.ts') },
    { manifest: pack, content: data as typeof content },
  ]);
}

test('household content stages as detached immutable definitions', async () => {
  const g = game();
  try {
    await g.host.apply(preset);
    const household = g.session().registries.require(HearthHouseholds, 'common/household');
    assert.equal(household.residents.length, 3);
    assert.equal(household.visitors.length, 2);
    assert.equal(household.objects.length, 18);
    assert.equal(Object.isFrozen(household.residents[0]), true);
    assert.equal(Object.isFrozen(household.objects), true);
  } finally { g.host.stop(); }
});

test('duplicate resident IDs are reported at staging', async () => {
  const bad = structuredClone(content);
  bad[0]!.data.residents[1]!.id = bad[0]!.data.residents[0]!.id;
  const g = game(bad);
  try {
    await assert.rejects(() => g.host.apply(preset), /resident IDs must be unique/);
  } finally { g.host.stop(); }
});

test('invalid furnishing categories and prices are reported at staging', async () => {
  const badCategory = structuredClone(content);
  badCategory[0]!.data.objects[0]!.category = 'spaceship';
  const g = game(badCategory);
  try {
    await assert.rejects(() => g.host.apply(preset), /expected sleep, cooking, hygiene, seating, work or decor/);
  } finally { g.host.stop(); }
  const badCost = structuredClone(content);
  badCost[0]!.data.objects[1]!.cost = -1;
  const h = game(badCost);
  try {
    await assert.rejects(() => h.host.apply(preset), /cost/);
  } finally { h.host.stop(); }
});
