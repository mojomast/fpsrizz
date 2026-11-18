import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PluginHost } from '../src/kernel/host.ts';
import type { CatalogEntry, SessionContext } from '../src/kernel/host.ts';
import { PHASES, Physics, Renderable, RigidBody, SDK_COMPAT, SDK_VERSION, SceneError, SceneNodeInfo, Scenes, Transform3D, importLdtk, importTiled, mergeJson, resolvePrefab, spawnScene, worldPose } from '../src/sdk/index.ts';
import type { PrefabDef, SpawnedScene } from '../src/sdk/index.ts';
import { codePlugin, contentPack, presetOf } from './helpers/host.ts';

const real = (dir: string): CatalogEntry => ({ manifest: JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8') as string), load: () => import(`../${dir}/index.ts`) });

const PACK = [
  { kind: 'prefab', id: 'test/block', data: { components: { renderable: { shape: 'box', color: '#336699' }, 'test/tag': { kind: 'block', hp: 3 } } } },
  { kind: 'prefab', id: 'test/crate', data: { extends: 'test/block', components: { 'test/tag': { kind: 'crate' }, body: { type: 'dynamic' }, collider: { shape: 'box' } } } },
  { kind: 'prefab', id: 'test/lamp', data: { components: { renderable: { shape: 'sphere' } }, children: [{ name: 'bulb', transform: { position: [0, 1, 0] }, overrides: { renderable: { shape: 'sphere', color: '#ffee88' } } }] } },
  { kind: 'scene', id: 'test/room', data: { nodes: [
    { prefab: 'test/crate', name: 'crate-a', transform: { position: [2, 0.5, 0] }, overrides: { renderable: { color: '#ff0000' } } },
    { name: 'shelf', transform: { position: [0, 2, -3], rotation: [0, 90, 0] }, children: [
      { prefab: 'test/block', name: 'book', transform: { position: [1, 0, 0] }, overrides: { 'test/tag': null }, props: { title: 'Atlas' } },
      { prefab: 'test/lamp' },
    ] },
  ] } },
];

async function boot(pack: unknown, activate?: (ctx: SessionContext) => void) {
  const host = new PluginHost({ sdkVersion: SDK_VERSION, sdkCompat: SDK_COMPAT, phases: PHASES });
  const issues = host.setCatalog([real('src/plugins/std-transform'), real('src/plugins/std-physics-rapier'), real('src/plugins/std-scene'),
    contentPack('test/levels', pack, { dependencies: { 'std/scene': '^1.0.0' } }), codePlugin('test/game', { activate }, { sdk: '^3.0.0' })]);
  assert.deepEqual(issues, []);
  const session = await host.apply(presetOf('test/p', ['std/transform', 'std/physics-rapier', 'std/scene', 'test/levels', 'test/game']));
  return { host, session };
}

test('prefabs: extends chains merge components, overrides deep-merge, null removes, cycles are reported', () => {
  const defs: Record<string, PrefabDef> = Object.fromEntries(PACK.filter((p) => p.kind === 'prefab').map((p) => [p.id, p.data as unknown as PrefabDef]));
  const crate = resolvePrefab((id) => defs[id], 'test/crate');
  assert.deepEqual(crate.chain, ['test/crate', 'test/block']);
  assert.deepEqual(crate.components['test/tag'], { kind: 'crate', hp: 3 });
  assert.deepEqual(crate.components['sdk/rigid-body'], { type: 'dynamic' }, 'aliases map to component ids');
  assert.deepEqual(mergeJson({ a: 1, b: { c: 2, d: 3 } }, { b: { c: null, e: [1] }, f: 'x' }), { a: 1, b: { d: 3, e: [1] }, f: 'x' });
  const loop = { 'x/a': { extends: 'x/b', components: {} }, 'x/b': { extends: 'x/a', components: {} } } as Record<string, PrefabDef>;
  assert.throws(() => resolvePrefab((id) => loop[id], 'x/a'), SceneError);
  assert.throws(() => resolvePrefab((id) => defs[id], 'test/missing'), /unknown prefab "test\/missing"/);
});

test('scenes spawn as entities with parents, world-space physics bodies, overrides and SceneNodeInfo', async () => {
  let spawned!: SpawnedScene;
  const { host, session } = await boot(PACK, (ctx) => { spawned = spawnScene(ctx, 'test/room'); });
  const w = session.entities;
  const crate = spawned.byName.get('crate-a')!, book = spawned.byName.get('book')!, bulb = spawned.byName.get('bulb')!, shelf = spawned.byName.get('shelf')!;
  assert.equal(spawned.entities.length, 5, 'crate, shelf, book, lamp, bulb');
  assert.equal(w.get(crate, Renderable)!.color, 0xff0000, 'override replaced the colour ("#rrggbb" becomes a number)');
  assert.equal(w.get(crate, Renderable)!.shape, 'box', 'override merged into the inherited renderable');
  assert.equal(w.get(crate, Transform3D)!.parent, undefined, 'physics bodies are world-space roots');
  assert.equal(w.get(crate, RigidBody)!.type, 'dynamic');
  assert.equal(w.get(book, Transform3D)!.parent, shelf);
  assert.equal(w.has(book, { id: 'test/tag' }), false, 'null override removed the component');
  assert.deepEqual(w.get(book, SceneNodeInfo), { name: 'book', prefab: 'test/block', scene: 'test/room', props: { title: 'Atlas' } });
  const bookWorld = worldPose(w, book)!.position;
  assert.ok(Math.abs(bookWorld.x) < 1e-6 && Math.abs(bookWorld.y - 2) < 1e-6 && Math.abs(bookWorld.z + 4) < 1e-6, `shelf yaw 90° turns +x into -z (${JSON.stringify(bookWorld)})`);
  assert.equal(w.get(bulb, Renderable)!.color, 0xffee88, 'prefab children are spawned');
  session.scheduler.runTick();
  assert.equal(session.services.get(Physics).stats().bodies, 1);
  host.stop();
});

test('std/scene reports bad prefab data and unknown references before the session starts', async () => {
  const bad = [
    { kind: 'prefab', id: 'test/a', data: { components: { colour: {} }, extends: 'test/nope' } },
    { kind: 'scene', id: 'test/s', data: { nodes: [{ prefab: 'test/ghost', transform: { position: [1, 2] } }] } },
  ];
  await assert.rejects(boot(bad), (e: Error) => /unknown component "colour"/.test(e.message) && /expected \[x, y, z\]/.test(e.message));
  await assert.rejects(boot([bad[1]!].map((x) => ({ ...x, data: { nodes: [{ prefab: 'test/ghost' }] } }))), /unknown prefab "test\/ghost"/);
});

const TILED = {
  type: 'map', orientation: 'orthogonal', width: 3, height: 2, tilewidth: 16, tileheight: 16, infinite: false,
  tilesets: [{ firstgid: 1, name: 'terrain', tilecount: 4, tiles: [{ id: 0, type: 'wall' }, { id: 2, properties: [{ name: 'prefab', type: 'string', value: 'test/water' }] }] }],
  layers: [
    { type: 'tilelayer', name: 'ground', width: 3, height: 2, visible: true, data: [1, 0, 3, 2, 1 | 0x80000000, 0] },
    { type: 'objectgroup', name: 'things', visible: true, objects: [
      { id: 7, name: 'spawn', type: 'player', x: 16, y: 8, width: 0, height: 0, rotation: 90, properties: [{ name: 'game/team', type: 'string', value: '{"side":1}' }, { name: 'speed', type: 'float', value: 2 }] },
      { id: 8, name: 'mystery', type: 'unknown', x: 0, y: 0, width: 16, height: 16 },
    ] },
    { type: 'tilelayer', name: 'hidden', width: 1, height: 1, visible: false, data: [1] },
  ],
};

test('Tiled import: tile classes, tile properties, flip flags, objects, props and overrides', () => {
  const { scene, unmapped, errors } = importTiled(TILED, { tiles: { wall: 'test/wall' }, objects: { player: 'test/player' }, cellSize: 2 });
  assert.deepEqual(errors, []);
  const [ground, things] = scene.nodes;
  assert.equal(scene.nodes.length, 2, 'hidden layer skipped');
  assert.deepEqual(ground!.children!.map((n) => [n.prefab, n.transform!.position]), [['test/wall', [1, 0, 1]], ['test/water', [5, 0, 1]], ['test/wall', [3, 0, 3]]]);
  assert.deepEqual(unmapped, { 'tile:terrain:1': 1, 'object:unknown': 1 });
  const spawn = things!.children![0]!;
  assert.deepEqual(spawn.transform, { position: [2, 0, 1], rotation: [0, -90, 0] });
  assert.deepEqual(spawn.overrides, { 'game/team': { side: 1 } });
  assert.deepEqual(spawn.props, { speed: 2 });
  const side = importTiled(TILED, { tiles: { wall: 'test/wall' }, plane: 'xy' }).scene.nodes[0]!.children![0]!;
  assert.deepEqual(side.transform!.position, [0.5, 1.5, 0], 'side-on: the top row is the highest');
  assert.match(importTiled({ ...TILED, layers: [{ type: 'tilelayer', name: 'b', encoding: 'base64', data: 'AAAA' }] }).errors[0]!, /CSV/);
});

const LDTK = {
  defaultGridSize: 16,
  defs: { layers: [{ uid: 5, identifier: 'Collision', intGridValues: [{ value: 1, identifier: 'wall' }, { value: 2, identifier: 'spikes' }] }] },
  levels: [{
    identifier: 'Level_0', iid: 'aaa', worldX: 0, worldY: 0, pxWid: 32, pxHei: 32, fieldInstances: [{ __identifier: 'music', __value: 'cave' }],
    layerInstances: [
      { __identifier: 'Entities', __type: 'Entities', __gridSize: 16, __cWid: 2, __cHei: 2, __pxTotalOffsetX: 0, __pxTotalOffsetY: 0, entityInstances: [
        { __identifier: 'Player', iid: 'p1', px: [8, 16], __pivot: [0.5, 1], width: 16, height: 16, fieldInstances: [{ __identifier: 'hp', __value: 5 }] },
        { __identifier: 'Chest', iid: 'c1', px: [24, 16], __pivot: [0.5, 1], width: 16, height: 16, fieldInstances: [{ __identifier: 'prefab', __value: 'test/chest' }] },
        { __identifier: 'Bat', iid: 'b1', px: [0, 0], __pivot: [0, 0], width: 16, height: 16, fieldInstances: [] },
      ] },
      { __identifier: 'Collision', __type: 'IntGrid', layerDefUid: 5, __gridSize: 16, __cWid: 2, __cHei: 2, __pxTotalOffsetX: 0, __pxTotalOffsetY: 0, intGridCsv: [0, 0, 1, 2] },
    ],
  }],
};

test('LDtk import: entities with pivots and fields, IntGrid identifiers, level fields', () => {
  const { scene, unmapped, errors } = importLdtk(LDTK, { entities: { Player: 'test/player' }, intGrid: { 'Collision.wall': 'test/wall' } });
  assert.deepEqual(errors, []);
  const level = scene.nodes[0]!;
  assert.deepEqual(level.props, { music: 'cave' });
  assert.deepEqual(level.children!.map((l) => l.name), ['Collision', 'Entities'], 'bottom layer first');
  const [collision, entities] = level.children!;
  assert.deepEqual(collision!.children!.map((n) => [n.prefab, n.transform!.position]), [['test/wall', [0.5, 0, 1.5]]]);
  assert.deepEqual(entities!.children!.map((n) => [n.prefab, n.transform!.position, n.props]), [
    ['test/player', [0.5, 0, 0.5], { hp: 5, size: [1, 1] }],
    ['test/chest', [1.5, 0, 0.5], { size: [1, 1] }],
  ]);
  assert.deepEqual(unmapped, { 'entity:Bat': 1, 'intgrid:Collision.spikes': 1 });
  assert.match(importLdtk({ ...LDTK, levels: [{ identifier: 'L', layerInstances: null }] }).errors[0]!, /separate file/);
});

test('tiled-map content registers a spawnable scene', async () => {
  const pack = [
    { kind: 'prefab', id: 'test/wall', data: { components: { renderable: { shape: 'box' }, collider: { shape: 'box' } } } },
    { kind: 'prefab', id: 'test/water', data: { components: { renderable: { shape: 'plane', color: '#2266cc' } } } },
    { kind: 'tiled-map', id: 'test/map', data: { map: TILED, tiles: { wall: 'test/wall', 'terrain:1': 'test/water' } } },
  ];
  let spawned!: SpawnedScene;
  const { host, session } = await boot(pack, (ctx) => { spawned = spawnScene(ctx, 'test/map'); });
  assert.ok(session.registries.get(Scenes, 'test/map'));
  assert.equal(spawned.entities.length, 2 + 4, 'two layer groups and four tiles (objects have no prefabs here)');
  session.scheduler.runTick();
  assert.equal(session.services.get(Physics).stats().bodies, 2, 'walls became fixed bodies');
  host.stop();
});
