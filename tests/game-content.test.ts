/**
 * Acceptance 10 (content validation): broken imports are rejected with the pack id and the field path, and a failed
 * import never partially mutates the running game. Plus structural checks of the shipped arena map.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Enemies, Maps, Weapons } from '../src/sdk/index.ts';
import type { CatalogEntry } from '../src/sdk/index.ts';
import type { HostError } from '../src/kernel/host.ts';
import { codePlugin, hostFailure } from './helpers/host.ts';
import { CORE_PLUGINS, HALL, OBJECTIVE_ROOMS, assertHealthy, createHeadlessGame, gridMapData, handles, headlessPreset, testPackManifest } from './helpers/gameplay.ts';
import type { Obj } from './helpers/gameplay.ts';

const PACK = 'bad/pack';
const MAP = 'bad/map';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A valid pack (one map, optionally more entries) that every failing case below breaks in exactly one way. */
function pack(content: unknown[], manifestOver: Obj = {}, id = PACK): CatalogEntry {
  return { manifest: testPackManifest({ id, name: 'Imported pack', dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0', 'core/enemies': '^1.0.0', 'core/content': '^1.0.0' }, ...manifestOver }), content, origin: 'imported' };
}
const mapEntry = (data: Obj, id = MAP): unknown => ({ kind: 'map', id, data });
const validMap = (): Obj => gridMapData({ grid: HALL, spawns: [{ id: 'g1', prefab: 'core/grunt', cell: [9, 3], yaw: 90 }] });
const presetFor = (over: Obj = {}): Obj => headlessPreset({ id: 'test/import', plugins: [...CORE_PLUGINS, PACK], options: { map: MAP }, ...over });

interface Running {
  game: ReturnType<typeof createHeadlessGame>;
}

/** A running arena session plus an installed-but-disabled code plugin (for "dependency not enabled" cases). */
async function running(): Promise<Running> {
  const game = createHeadlessGame([codePlugin('test/idle', {})]);
  await game.host.apply(headlessPreset());
  game.ticks(20);
  return { game };
}

/**
 * Imports `entry` with `preset`, expects a rejection whose message contains every needle, and checks that the running
 * game was not touched at all: same session object still running and ticking, same registries, same catalog.
 */
async function assertRejected(entry: CatalogEntry, preset: Obj, needles: string[], stage?: HostError['stage'], packInMessage = true): Promise<HostError> {
  const { game } = await running();
  const host = game.host;
  const session = host.session!;
  const active = host.active!;
  const totalBefore = active.registries.total();
  const installedBefore = [...host.installed().keys()].sort();
  const reportBefore = JSON.stringify(host.resourceReport());
  const entitiesBefore = JSON.stringify(session.entities.snapshot());
  const tickBefore = session.scheduler.tick;
  const packId = String((entry.manifest as Obj)['id']);

  const err = await hostFailure(host.apply(preset, [entry]));
  for (const n of [...(packInMessage ? [packId] : []), ...needles]) assert.ok(err.message.includes(n), `error should mention ${JSON.stringify(n)}:\n${err.message}`);
  if (stage) assert.equal(err.stage, stage, err.message);

  assert.equal(host.session, session, 'the running session object must be untouched');
  assert.equal(session.state, 'running');
  assert.equal(host.active, active);
  assert.equal(host.active!.registries.total(), totalBefore, 'registries must be unchanged');
  assert.deepEqual([...host.installed().keys()].sort(), installedBefore, 'the pack must not be installed');
  assert.ok(!host.installed().has(packId));
  assert.equal(host.catalogEntry(packId), undefined);
  assert.equal(JSON.stringify(host.resourceReport()), reportBefore, 'no resources leaked or changed');
  assert.equal(JSON.stringify(session.entities.snapshot()), entitiesBefore);
  assert.equal(host.active!.registries.has(Maps, MAP), false);
  game.ticks(10);
  assert.equal(session.scheduler.tick, tickBefore + 10, 'the old session keeps simulating');
  assertHealthy({ session });
  return err;
}

/** A map case: `mutate` breaks a valid map; the error must name the pack and this `path`, plus any extra needles. */
function mapCase(name: string, mutate: (m: Obj) => void, needles: string[], stage: HostError['stage'] = 'register', preset: Obj = presetFor()): void {
  test(`acceptance 10 / content: ${name}`, async () => {
    const m = validMap();
    mutate(m);
    await assertRejected(pack([mapEntry(m)]), preset, needles, stage);
  });
}

const P = `content[0](map "${MAP}").data`;

test('acceptance 10 / content: the baseline valid pack imports and plays (so every failing case below fails for its one defect only)', async () => {
  const { game } = await running();
  const s = await game.host.apply(presetFor(), [pack([mapEntry(validMap())])]);
  assert.equal(s.state, 'running');
  assert.ok(game.host.installed().has(PACK));
  const h = handles(game);
  assert.equal(h.world.desc.id, MAP);
  game.ticks(30);
  assertHealthy(h);
});

// --- map schema / numbers ----------------------------------------------------------------------------------------
mapCase('an unsupported map schema is rejected with the pack id and path', (m) => (m['schema'] = 2), [`${P}.schema`, 'unsupported grid map schema 2']);
mapCase('a missing map schema is rejected', (m) => delete m['schema'], [`${P}.schema`, 'unsupported grid map schema']);
mapCase('a number out of range is rejected with its path', (m) => (m['cellSize'] = 99), [`${P}.cellSize`, 'must be <= 8']);
mapCase('a negative wall height is rejected', (m) => (m['wallHeight'] = -1), [`${P}.wallHeight`, 'must be >= 2']);
mapCase('a string where a number is expected is rejected', (m) => (m['cellSize'] = 'big'), [`${P}.cellSize`, 'expected a finite number']);
mapCase('a non-finite number (Infinity) is rejected before it can reach the world', (m) => (m['cellSize'] = Infinity), [`content[0].data.cellSize`, 'non-finite']);
mapCase('a non-finite number (NaN) inside nested data is rejected', (m) => ((m['playerStart'] as Obj)['yaw'] = NaN), [`content[0].data.playerStart.yaw`, 'non-finite']);
mapCase('an out-of-range cell offset is rejected', (m) => ((m['spawns'] as Obj[])[0]!['offset'] = [0.9, 0]), [`${P}.spawns[0].offset[0]`, 'must be <= 0.45']);
mapCase('a non-integer cell coordinate is rejected', (m) => ((m['spawns'] as Obj[])[0]!['cell'] = [1.5, 1]), [`${P}.spawns[0].cell[0]`, 'expected an integer']);
mapCase('a function value inside the data is rejected (content is data only)', (m) => (m['fog'] = { color: '#000000', near: () => 1, far: 10 }), ['content[0].data.fog.near', 'not allowed']);
mapCase('a bad colour string is rejected', (m) => (m['ambient'] = { color: 'red', intensity: 1 }), [`${P}.ambient.color`, 'not a colour']);

// --- grid size --------------------------------------------------------------------------------------------------
mapCase('an over-size grid (97 rows) is rejected', (m) => (m['grid'] = Array.from({ length: 97 }, () => '#####')), [`${P}.grid`, '97 items', 'limit is 96']);
mapCase('an over-size grid (97 columns) is rejected', (m) => (m['grid'] = ['#'.repeat(97), '#'.repeat(97), '#'.repeat(97)]), [`${P}.grid[0]`, 'must be 3..96 characters wide']);
mapCase('a too small grid (2 rows) is rejected', (m) => (m['grid'] = ['###', '###']), [`${P}.grid`, 'at least 3']);
mapCase('rows of unequal width are rejected', (m) => ((m['grid'] as string[])[2] = '#....#'), [`${P}.grid[2]`, 'all rows must have equal width']);
mapCase('a grid character that is not in the legend is rejected', (m) => ((m['grid'] as string[])[1] = (m['grid'] as string[])[1]!.replace('.', '?')), [`${P}.grid[1]`, 'not in the legend']);

// --- duplicates -------------------------------------------------------------------------------------------------
mapCase(
  'duplicate door ids inside a map are rejected',
  (m) => {
    (m['doors'] as Obj[]).push({ id: 'door1', cell: [6, 3] });
  },
  [`${P}.doors[1].id`, 'duplicate id "door1"'],
);
mapCase('two doors in one cell are rejected', (m) => (m['doors'] as Obj[]).push({ id: 'door2', cell: [6, 3] }), [`${P}.doors[1].cell`, 'two doors share cell']);
mapCase('a spawn id that duplicates a door id is rejected', (m) => ((m['spawns'] as Obj[])[0]!['id'] = 'door1'), [`${P}.spawns[0].id`, 'duplicate id "door1"']);
mapCase('duplicate spawn ids are rejected', (m) => (m['spawns'] as Obj[]).push({ id: 'g1', prefab: 'core/grunt', cell: [10, 3] }), [`${P}.spawns[1].id`, 'duplicate id "g1"']);
mapCase('a light that duplicates the exit trigger id is rejected', (m) => (m['lights'] = [{ id: 'exit', cell: [1, 1], color: '#ffffff' }]), [`${P}.lights[0].id`, 'duplicate id "exit"']);
mapCase('a malformed local id is rejected', (m) => ((m['spawns'] as Obj[])[0]!['id'] = 'Bad Id'), [`${P}.spawns[0].id`, 'lowercase letters']);

test('acceptance 10 / content: duplicate content ids inside one pack are rejected', async () => {
  await assertRejected(pack([mapEntry(validMap()), mapEntry(validMap())]), presetFor(), ['content[1].id', `duplicate map id "${MAP}"`], 'register');
});
test('acceptance 10 / content: an id that already exists in another enabled pack is rejected (registrations never overwrite)', async () => {
  const entry = pack([{ kind: 'weapon', id: 'core/pistol', data: { name: 'Pistol clone', slot: 7, behavior: 'core/hitscan', params: { damage: 1 }, cooldown: 0.2, view: 'weapon-pistol' } }, mapEntry(validMap())]);
  await assertRejected(entry, presetFor(), ['core/pistol', 'Duplicate weapon'], 'register');
});

// --- unresolved references --------------------------------------------------------------------------------------
mapCase('a spawn with an unknown prefab is rejected', (m) => ((m['spawns'] as Obj[])[0]!['prefab'] = 'bad/nothing'), [`map "${MAP}".spawns[0].prefab`, 'unknown prefab "bad/nothing"'], 'validate');
mapCase('a trigger that opens an unknown door is rejected', (m) => (m['triggers'] as Obj[]).push({ id: 'sw', kind: 'switch', cell: [1, 1], face: 'n', opens: 'ghost' }), [`${P}.triggers[1].opens`, 'no door with that id']);
mapCase('a switch mounted on a side with no wall is rejected', (m) => (m['triggers'] as Obj[]).push({ id: 'sw', kind: 'switch', cell: [2, 2], face: 'n' }), [`${P}.triggers[1].face`, 'no wall there']);
mapCase('a door that is not in a one-cell gap is rejected', (m) => (m['doors'] as Obj[]).push({ id: 'door2', cell: [3, 3] }), [`${P}.doors[1].cell`, 'one-cell gap']);
mapCase('an unknown map format is rejected', (m) => (m['format'] = 'bad/format'), [`${P}.format`, 'unknown map format "bad/format"']);

const weaponData = (over: Obj = {}): Obj => ({ name: 'W', slot: 7, behavior: 'core/hitscan', params: { damage: 5 }, ammoType: 'core/bullets-ammo', cooldown: 0.2, view: 'weapon-pistol', ...over });

test('acceptance 10 / content: a weapon with an unknown attack behaviour is rejected', async () => {
  const e = pack([{ kind: 'weapon', id: 'bad/w', data: weaponData({ behavior: 'bad/laser' }) }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['weapon "bad/w".behavior', 'unknown attack behaviour "bad/laser"'], 'validate');
});
test('acceptance 10 / content: a weapon with an unknown ammo type is rejected', async () => {
  const e = pack([{ kind: 'weapon', id: 'bad/w', data: weaponData({ ammoType: 'bad/ammo' }) }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['weapon "bad/w".ammoType', 'unknown ammo type "bad/ammo"'], 'validate');
});
test('acceptance 10 / content: a weapon passing an unknown parameter to its behaviour is rejected', async () => {
  const e = pack([{ kind: 'weapon', id: 'bad/w', data: weaponData({ params: { damage: 5, laserness: 3 } }) }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['weapon "bad/w".params.laserness', 'unknown parameter'], 'validate');
});
test('acceptance 10 / content: a weapon slot already used by another weapon is rejected', async () => {
  const e = pack([{ kind: 'weapon', id: 'bad/w', data: weaponData({ slot: 1 }) }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['weapon "bad/w".slot', 'slot 1 is already used'], 'validate');
});
test('acceptance 10 / content: an enemy with an unknown AI or attack behaviour is rejected', async () => {
  const enemy = (over: Obj): Obj => ({ name: 'E', health: 10, speed: 1, ai: 'core/chaser', attack: { behavior: 'core/melee', params: { damage: 1 }, cooldown: 1, range: 1 }, visual: 'enemy-grunt', ...over });
  await assertRejected(pack([{ kind: 'enemy', id: 'bad/e', data: enemy({ ai: 'bad/ai' }) }, mapEntry(validMap())]), presetFor(), ['enemy "bad/e".ai', 'unknown AI behaviour "bad/ai"'], 'validate');
  const badAttack = enemy({});
  (badAttack['attack'] as Obj)['behavior'] = 'bad/zap';
  await assertRejected(pack([{ kind: 'enemy', id: 'bad/e', data: badAttack }, mapEntry(validMap())]), presetFor(), ['enemy "bad/e".attack.behavior', 'unknown attack behaviour "bad/zap"'], 'validate');
});
test('acceptance 10 / content: a pickup with an unknown effect is rejected', async () => {
  const e = pack([{ kind: 'pickup', id: 'bad/p', data: { name: 'P', effect: 'bad/effect', params: {}, visual: 'pickup-health' } }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['pickup "bad/p".effect', 'unknown pickup effect "bad/effect"'], 'validate');
});
test('acceptance 10 / content: a give-ammo pickup naming an ammo type that does not exist is rejected (otherwise it can never be collected)', async () => {
  const e = pack([{ kind: 'pickup', id: 'bad/p', data: { name: 'P', effect: 'core/give-ammo', params: { ammoType: 'bad/ammo', amount: 5 }, visual: 'pickup-bullets' } }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['pickup "bad/p"', 'bad/ammo'], 'validate');
});
test('acceptance 10 / content: a give-weapon pickup naming a weapon that does not exist is rejected', async () => {
  const e = pack([{ kind: 'pickup', id: 'bad/p', data: { name: 'P', effect: 'core/give-weapon', params: { weapon: 'bad/gun' }, visual: 'pickup-bullets' } }, mapEntry(validMap())]);
  await assertRejected(e, presetFor(), ['pickup "bad/p"', 'bad/gun'], 'validate');
});
test('acceptance 10 / content: a content entry whose kind no enabled plugin defines is rejected, naming the missing dependency', async () => {
  // Without a dependency on core/combat the pack is activated before it and its "weapon" kind is not yet known.
  const e = pack([{ kind: 'weapon', id: 'bad/w', data: weaponData() }, mapEntry(validMap())], { dependencies: { 'core/world': '^1.0.0' } });
  await assertRejected(e, presetFor(), ['content[0](weapon "bad/w").data', 'no enabled plugin understands content kind "weapon"', 'dependencies'], 'register');
  const unknown = pack([{ kind: 'spaceship', id: 'bad/s', data: {} }, mapEntry(validMap())]);
  await assertRejected(unknown, presetFor(), ['content[0](spaceship "bad/s").data', 'no enabled plugin understands content kind "spaceship"'], 'register');
});

// --- player start / spawns --------------------------------------------------------------------------------------
mapCase('a map without playerStart is rejected', (m) => delete m['playerStart'], [`${P}.playerStart`, 'expected an object']);
mapCase('a player start inside a wall cell is rejected', (m) => (m['playerStart'] = { cell: [0, 0], yaw: 0 }), [`${P}.playerStart.cell`, 'is a solid wall']);
mapCase('a player start outside the grid is rejected', (m) => (m['playerStart'] = { cell: [99, 99], yaw: 0 }), [`${P}.playerStart.cell[0]`, 'must be <= 12']);
mapCase('a player start inside a door cell is rejected', (m) => (m['playerStart'] = { cell: [6, 3], yaw: 0 }), [`${P}.playerStart.cell`, 'cannot start inside a door']);
mapCase('a player start whose offset overlaps a wall is rejected', (m) => (m['playerStart'] = { cell: [1, 1], offset: [-0.45, 0], yaw: 0 }), [`map "${MAP}".playerStart`, 'overlaps a wall'], 'validate');
mapCase('a spawn inside a wall cell is rejected', (m) => ((m['spawns'] as Obj[])[0]!['cell'] = [0, 0]), [`${P}.spawns[0].cell`, 'is a solid wall']);
mapCase('a spawn inside a door cell is rejected', (m) => ((m['spawns'] as Obj[])[0]!['cell'] = [6, 3]), [`${P}.spawns[0].cell`, 'inside a door cell']);
mapCase('a spawn whose offset overlaps a wall is rejected', (m) => Object.assign((m['spawns'] as Obj[])[0]!, { cell: [1, 1], offset: [-0.45, -0.45] }), [`map "${MAP}".spawns[0]`, 'spawn "g1" overlaps a wall'], 'validate');

// --- border -----------------------------------------------------------------------------------------------------
mapCase('an unsealed top border is rejected', (m) => ((m['grid'] as string[])[0] = '###.#########'), [`${P}.grid[0]`, 'column 3', 'border must be solid']);
mapCase('an unsealed left border is rejected', (m) => ((m['grid'] as string[])[2] = '.' + (m['grid'] as string[])[2]!.slice(1)), [`${P}.grid[2]`, 'column 0', 'border must be solid']);
mapCase('an unsealed right border is rejected', (m) => ((m['grid'] as string[])[4] = (m['grid'] as string[])[4]!.slice(0, 12) + '.'), [`${P}.grid[4]`, 'column 12', 'border must be solid']);
mapCase('an unsealed bottom border (exit pocket row) is rejected', (m) => ((m['grid'] as string[])[(m['grid'] as string[]).length - 1] = '#E###########'), [`grid[${(validMap()['grid'] as string[]).length - 1}]`, 'border must be solid']);

// --- objective mode ---------------------------------------------------------------------------------------------
mapCase(
  'the objective mode on a map without an "exit" zone is rejected',
  (m) => (m['triggers'] = []),
  [`map "${MAP}".triggers`, 'needs a zone trigger tagged "exit"'],
  'validate',
);
mapCase(
  'an exit zone that is not tagged "exit" does not count',
  (m) => ((m['triggers'] as Obj[])[0]!['tags'] = ['goal']),
  [`map "${MAP}".triggers`, 'tagged "exit"'],
  'validate',
);
test('acceptance 10 / content: a map with no exit zone is fine when the preset does not use the objective mode requirement (map without objective is still selectable by id)', async () => {
  // gridMapData(exit:false) has no zones: selecting it must fail only because the mode demands an exit.
  const m = gridMapData({ grid: OBJECTIVE_ROOMS.map((r) => r.replace('E', '.')), exit: false });
  await assertRejected(pack([mapEntry(m)]), presetFor(), [`map "${MAP}".triggers`, 'exit'], 'validate');
});

// --- preset level -----------------------------------------------------------------------------------------------
test('acceptance 10 / content: a preset selecting an unknown map is rejected', async () => {
  const e = pack([mapEntry(validMap())]);
  const err = await assertRejected(e, presetFor({ options: { map: 'bad/nothing' } }), ['[preset] options.map', 'unknown map "bad/nothing"', MAP], 'validate', false);
  assert.ok(err.issues.some((i) => i.source === 'preset' && i.path === 'options.map'));
});
test('acceptance 10 / content: a preset without any map is rejected', async () => {
  await assertRejected(pack([mapEntry(validMap())]), presetFor({ options: {} }), ['[preset] options.map', 'no map selected'], 'validate', false);
});
test('acceptance 10 / content: a preset whose plugins list names a plugin that is not installed is rejected', async () => {
  const e = pack([mapEntry(validMap())]);
  const err = await assertRejected(e, presetFor({ plugins: [...CORE_PLUGINS, PACK, 'nope/missing'] }), ['preset', 'plugins', 'Plugin "nope/missing" is requested but not installed'], 'graph', false);
  assert.ok(err.issues.some((i) => i.path === 'plugins' && i.message.includes('nope/missing')));
});
test('acceptance 10 / content: a preset listing a plugin twice, or with a role provider nobody offers, is rejected', async () => {
  const e = pack([mapEntry(validMap())]);
  await assertRejected(e, presetFor({ plugins: [...CORE_PLUGINS, PACK, PACK] }), ['[preset] plugins', `"${PACK}" is listed twice`], 'preset', false);
  await assertRejected(e, presetFor({ roles: { 'sdk/controller': 'core/fps-controller', 'sdk/camera': 'core/fp-camera', 'sdk/mode': 'nope/mode' } }), ['preset', 'roles.sdk/mode', 'nope/mode'], 'validate', false);
});
test('acceptance 10 / content: a preset configuring a plugin that is not enabled or a setting that does not exist is rejected', async () => {
  const e = pack([mapEntry(validMap())]);
  await assertRejected(e, presetFor({ config: { 'core/hud': { x: 1 } } }), ['config.core/hud', 'not an enabled plugin'], 'preset', false);
  await assertRejected(e, presetFor({ config: { 'core/player': { jumpHeight: 3 } } }), ['config.core/player.jumpHeight', 'no setting'], 'preset', false);
  await assertRejected(e, presetFor({ config: { 'core/player': { moveSpeed: 9999 } } }), ['config.core/player.moveSpeed', 'must be <= 20'], 'preset', false);
});

// --- manifest / dependencies ------------------------------------------------------------------------------------
test('acceptance 10 / content: a pack depending on an installed plugin that the preset does not enable is rejected', async () => {
  const e = pack([mapEntry(validMap())], { dependencies: { 'core/world': '^1.0.0', 'core/combat': '^1.0.0', 'core/enemies': '^1.0.0', 'core/content': '^1.0.0', 'test/idle': '^1.0.0' } });
  const err = await assertRejected(e, presetFor(), ['dependencies.test/idle', 'requires "test/idle"', 'installed but not enabled'], 'graph');
  assert.ok(err.issues.some((i) => i.source === PACK && i.path === 'dependencies.test/idle'));
});
test('acceptance 10 / content: a pack depending on a plugin that is not enabled in the preset (core/enemies left out) is rejected', async () => {
  const e = pack([mapEntry(validMap())]);
  const plugins = CORE_PLUGINS.filter((p) => p !== 'core/enemies');
  const err = await assertRejected(e, presetFor({ plugins: [...plugins, PACK] }), ['requires "core/enemies"', 'not enabled'], 'graph');
  assert.ok(err.issues.some((i) => i.source === PACK && i.path === 'dependencies.core/enemies'));
});
test('acceptance 10 / content: a pack depending on a plugin that is not installed at all is rejected', async () => {
  const e = pack([mapEntry(validMap())], { dependencies: { 'core/world': '^1.0.0', 'ghost/plugin': '^1.0.0' } });
  await assertRejected(e, presetFor({ plugins: [...CORE_PLUGINS, PACK] }), ['dependencies.ghost/plugin', 'which is not installed'], 'graph');
});
test('acceptance 10 / content: a pack whose dependency version range is not satisfied, or that needs another SDK, is rejected', async () => {
  await assertRejected(pack([mapEntry(validMap())], { dependencies: { 'core/world': '^2.0.0' } }), presetFor(), ['dependencies.core/world', 'requires "core/world" ^2.0.0'], 'graph');
  await assertRejected(pack([mapEntry(validMap())], { sdk: '^3.0.0' }), presetFor(), ['sdk', 'needs SDK ^3.0.0'], 'graph');
});
test('acceptance 10 / content: manifest problems are rejected before anything is imported', async () => {
  const cases: [CatalogEntry, string[]][] = [
    [{ manifest: testPackManifest({ id: PACK, schema: 7 }), content: [] }, ['manifest', 'unsupported manifest schema 7']],
    [{ manifest: testPackManifest({ id: PACK, kind: 'content', version: 'one' }), content: [] }, ['manifest.version', 'semantic version']],
    [{ manifest: testPackManifest({ id: PACK }), content: [], load: async () => ({ default: {} }) }, ['manifest.kind', 'cannot carry executable code']],
    [{ manifest: testPackManifest({ id: PACK, kind: 'code' }), content: [] }, ['manifest.kind', 'must be compiled into the application']],
  ];
  for (const [entry, needles] of cases) {
    const { game } = await running();
    const session = game.host.session!;
    const err = await hostFailure(game.host.apply(presetFor(), [entry]));
    assert.equal(err.stage, 'catalog');
    for (const n of needles) assert.ok(err.message.includes(n), `${n} in:\n${err.message}`);
    assert.equal(game.host.session, session);
    assert.equal(session.state, 'running');
    assert.ok(!game.host.installed().has(PACK));
  }
});
test('acceptance 10 / content: content entries must be an array of well-formed { kind, id, data } objects', async () => {
  const cases: [unknown, string[]][] = [
    [{ nope: 1 }, ['content', 'expected an array']],
    [[{ kind: 'map', id: 'Bad Id', data: {} }], ['content[0].id', 'namespaced id']],
    [[{ kind: 'map', id: MAP }], ['content[0].data', 'not allowed']],
    [['text'], ['content[0]', 'expected an object']],
  ];
  for (const [content, needles] of cases) await assertRejected(pack(content as unknown[]), presetFor(), needles, 'register');
});

// --- failed imports leave NO residue: a later valid import still works ------------------------------------------
test('acceptance 10 / content: after several failed imports the very same pack id can still be imported once fixed', async () => {
  const { game } = await running();
  const host = game.host;
  const session = host.session!;
  const bad = validMap();
  bad['schema'] = 2;
  for (let i = 0; i < 3; i++) await hostFailure(host.apply(presetFor(), [pack([mapEntry(bad)])]));
  assert.equal(host.session, session);
  assert.equal(host.installed().has(PACK), false);
  const s2 = await host.apply(presetFor(), [pack([mapEntry(validMap())])]);
  assert.notEqual(s2, session);
  assert.equal(session.state, 'disposed');
  assert.ok(host.installed().has(PACK));
  game.ticks(10);
  assertHealthy({ session: s2 });
  // The import is permanent: the pack is now in the catalog and survives a restart.
  await host.restart();
  assert.equal(handles(game).world.desc.id, MAP);
});

// ---------------------------------------------------------------------------------------------------------------------
// The shipped arena
// ---------------------------------------------------------------------------------------------------------------------

test('acceptance 10 / arena: every shipped weapon, enemy and map is registered and consistent', async () => {
  const game = createHeadlessGame();
  await game.host.apply(headlessPreset());
  const reg = game.session().registries;
  const slots = reg.entries(Weapons).map((w) => w.value.slot);
  assert.equal(new Set(slots).size, slots.length, 'weapon slots are unique');
  assert.ok(reg.entries(Weapons).some((w) => w.value.starter), 'at least one starter weapon');
  assert.ok(reg.has(Enemies, 'core/grunt') && reg.has(Enemies, 'core/spitter'));
  assert.ok(reg.has(Maps, 'core/arena'));
});

test('acceptance 10 / arena: sealed border, doors in gaps, every spawn on free ground, objective switch and exit reachable', async () => {
  const game = createHeadlessGame();
  await game.host.apply(headlessPreset());
  const { world, player } = handles(game);
  const d = world.desc;
  for (let x = 0; x < d.width; x++) assert.ok(d.cells[x]!.solid && d.cells[(d.height - 1) * d.width + x]!.solid, `border column ${x}`);
  for (let z = 0; z < d.height; z++) assert.ok(d.cells[z * d.width]!.solid && d.cells[z * d.width + d.width - 1]!.solid, `border row ${z}`);
  assert.ok(player > 0);
  // Open every door: spawns must be free, the exit zone and the switch reachable from the start.
  for (const door of world.doors()) world.setDoorOpen(door.desc.id, true, true);
  const path: number[] = [];
  const start = d.playerStart;
  assert.equal(world.isFree(start.x, start.z, 0.35), true);
  for (const s of d.spawns) {
    assert.equal(world.isFree(s.x, s.z, 0.25), true, `spawn ${s.id} is in free space`);
    assert.equal(world.findPath(start.x, start.z, s.x, s.z, path), true, `spawn ${s.id} is reachable`);
  }
  const exit = d.triggers.find((t) => t.kind === 'zone' && t.tags.includes('exit'))!;
  assert.ok(exit);
  assert.equal(world.findPath(start.x, start.z, exit.x, exit.z, path), true, 'exit reachable');
  const sw = d.triggers.find((t) => t.kind === 'switch' && t.tags.includes('objective'))!;
  assert.ok(sw);
  // The switch hangs on a wall: stand 1 m in front of it (along its normal) and it must be reachable.
  const fx = sw.x + sw.nx * 1;
  const fz = sw.z + sw.nz * 1;
  assert.equal(world.isFree(fx, fz, 0.35), true);
  assert.equal(world.findPath(start.x, start.z, fx, fz, path), true, 'switch reachable');
  // The gate that guards the exit is the one the switch opens.
  assert.equal(world.door(sw.opens)!.desc.id, 'exit-gate');
  // With the doors closed again the exit gate is genuinely locked.
  const g = await (async () => {
    const g2 = createHeadlessGame();
    await g2.host.apply(headlessPreset());
    return handles(g2);
  })();
  assert.equal(g.world.door('exit-gate')!.locked, true);
  assert.equal(g.world.setDoorOpen('exit-gate', true), false);
  assert.equal(g.world.findPath(start.x, start.z, exit.x, exit.z, path), false, 'cannot reach the exit before the switch');
});
