import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import { Maps, Inventory, Player } from '../../../src/sdk/index.ts';
import { Enemies, Weapons, Pickups, Enemy } from '../contracts/shooter.ts';
import manifest from '../plugins/example-pack/manifest.json' with { type: 'json' };
import content from '../plugins/example-pack/content.json' with { type: 'json' };

const defaults = ['core/world', 'core/combat', 'core/player', 'core/enemies', 'core/modes', 'core/content'];
const withPack = (map: string) =>
  headlessPreset({ plugins: [...defaults, 'example/pack'], options: { map } });

const clone = (): any => JSON.parse(JSON.stringify(content));
const entry = (c: any[], kind: string, id: string) => {
  const e = c.find((x) => x.kind === kind && x.id === id);
  if (!e) throw new Error(`fixture missing ${kind} ${id}`);
  return e;
};

test('pack installs and its content registers on example/annex', async () => {
  const game = createHeadlessGame([{ manifest, content }]);
  await game.host.apply(withPack('example/annex'));
  const session = game.session();

  assert.ok(session.registries.has(Weapons, 'example/scattergun'));
  assert.equal(session.registries.ownerOf(Weapons, 'example/scattergun'), 'example/pack');
  assert.ok(session.registries.has(Enemies, 'example/brute'));
  assert.ok(session.registries.has(Maps, 'example/annex'));
  assert.ok(session.registries.has(Pickups, 'example/shell-box'));

  const player = session.entities.first(Player);
  assert.ok(player, 'player exists');
  const inv = session.entities.get(player, Inventory)!;
  assert.ok(inv.weapons.includes('example/scattergun'));

  assert.equal(session.entities.count(Enemy), 4);

  game.ticks(120);
  assert.equal(game.session().state, 'running');
});

test('slot 4 selects the scattergun and firing spends 3 bullets', async () => {
  const game = createHeadlessGame([{ manifest, content }]);
  await game.host.apply(withPack('example/annex'));

  game.input.press('core/weapon-4');
  game.ticks(1);
  game.input.release('core/weapon-4');
  game.ticks(30);

  const player = game.session().entities.first(Player)!;
  const inv = game.session().entities.get(player, Inventory)!;
  const before = inv.ammo['core/bullets-ammo'] ?? 0;

  game.input.press('core/fire');
  game.ticks(2);
  game.input.release('core/fire');

  assert.equal(inv.current, 'example/scattergun');
  assert.equal(inv.ammo['core/bullets-ammo'], before - 3);
});

test('pack also works on the original core/arena map', async () => {
  const game = createHeadlessGame([{ manifest, content }]);
  await game.host.apply(withPack('core/arena'));

  const player = game.session().entities.first(Player)!;
  const inv = game.session().entities.get(player, Inventory)!;
  assert.ok(inv.weapons.includes('example/scattergun'));
});

test('baseline preset restores the core content and map set', async () => {
  const game = createHeadlessGame([{ manifest, content }]);
  await game.host.apply(withPack('example/annex'));
  await game.host.apply(headlessPreset());

  const session = game.session();
  assert.equal(session.registries.has(Weapons, 'example/scattergun'), false);
  assert.equal(session.registries.has(Maps, 'example/annex'), false);

  const player = session.entities.first(Player)!;
  const inv = session.entities.get(player, Inventory)!;
  assert.equal(inv.weapons.some((w: string) => w.startsWith('example/')), false);
});

test('broken pack data is rejected and the running game is untouched', async () => {
  const game = createHeadlessGame();
  await game.host.apply(headlessPreset());
  const before = game.session();
  assert.equal(before.state, 'running');

  const cases: Array<[string, () => any, RegExp]> = [
    [
      'unknown attack behaviour',
      () => {
        const c = clone();
        entry(c, 'weapon', 'example/scattergun').data.behavior = 'example/nope';
        return c;
      },
      /example\/nope/,
    ],
    [
      'negative enemy health',
      () => {
        const c = clone();
        entry(c, 'enemy', 'example/brute').data.health = -5;
        return c;
      },
      /health/,
    ],
    [
      'shortened map row',
      () => {
        const c = clone();
        const g = entry(c, 'map', 'example/annex').data.grid;
        g[3] = g[3].slice(0, -1);
        return c;
      },
      /grid/,
    ],
    [
      'missing spawn prefab',
      () => {
        const c = clone();
        entry(c, 'map', 'example/annex').data.spawns[0].prefab = 'example/missing';
        return c;
      },
      /example\/missing/,
    ],
    [
      'switch opens a missing door',
      () => {
        const c = clone();
        entry(c, 'map', 'example/annex').data.triggers[0].opens = 'no-such-door';
        return c;
      },
      /no-such-door/,
    ],
    [
      'string cooldown',
      () => {
        const c = clone();
        entry(c, 'weapon', 'example/scattergun').data.cooldown = 'fast';
        return c;
      },
      /cooldown/,
    ],
  ];

  for (const [name, make, pattern] of cases) {
    await assert.rejects(
      game.host.apply(withPack('example/annex'), [{ manifest, content: make() }]),
      pattern,
      name,
    );
    assert.equal(game.session(), before, `${name}: session replaced`);
    assert.equal(before.state, 'running', `${name}: session not running`);
  }
});
