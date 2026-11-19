import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeadlessGame, headlessPreset } from '../../../tests/helpers/game.ts';
import { codePlugin, hostFailure } from '../../../tests/helpers/host.ts';
import { ExperienceRole, SequenceMechanicRole, SequenceProviders } from '../../../src/sdk/index.ts';
import { sequenceProviders } from '../../../tests/helpers/alternate-sequence.ts';
import { Race } from '../contracts/racing.ts';
import racing from '../plugins/vehicle-racing/manifest.json' with { type: 'json' };
import trackManifest from '../plugins/vehicle-track/manifest.json' with { type: 'json' };
import content from '../plugins/vehicle-track/content.json' with { type: 'json' };

for (const selected of sequenceProviders) {
const catalog = [
  selected.entry,
  { manifest: racing, load: () => import('../plugins/vehicle-racing/index.ts') },
  { manifest: trackManifest, content },
];
const preset = headlessPreset({
  plugins: ['vehicle/racing', 'vehicle/track', selected.id],
  roles: { 'sdk/experience': 'vehicle/arcade-race', 'sdk/mechanic-sequence': selected.id },
  options: { track: 'vehicle/neon-circuit' },
});

test(`another experience cannot activate the racing authority, and staging preserves the current session (${selected.id})`, async () => {
  const other = codePlugin('test/other-experience', {
    register(ctx) {
      ctx.provideRole(ExperienceRole, 'test/other', {
        name: 'Other game',
        description: 'A different family',
        pointer: 'free',
      });
    },
  });
  const game = createHeadlessGame([...catalog, other]);
  await game.host.apply(preset);
  const previous = game.session();
  const error = await hostFailure(
    game.host.apply(
      headlessPreset({
        plugins: ['vehicle/racing', 'vehicle/track', 'test/other-experience', selected.id],
        roles: { 'sdk/experience': 'test/other', 'sdk/mechanic-sequence': selected.id },
        options: { track: 'vehicle/neon-circuit' },
      }),
    ),
  );
  assert.equal(error.stage, 'validate');
  assert.ok(
    error.issues.some(
      (issue) => issue.path === 'roles.sdk/experience' && issue.message.includes('vehicle/arcade-race'),
    ),
  );
  assert.equal(game.session(), previous);
  game.ticks(1);
  assert.equal(previous.services.get(Race).elapsed, 1 / 60);
  await game.host.stop();
});

test(`track data reports unknown keys and degenerate centerlines and gates at their paths (${selected.id})`, async () => {
  const invalid = structuredClone(content);
  const data = invalid[0]!.data;
  Object.assign(data, { widht: 8 });
  data.points[1] = { ...data.points[0]! };
  data.gates[1] = { ...data.gates[0]! };
  const game = createHeadlessGame([
    selected.entry,
    { manifest: racing, load: () => import('../plugins/vehicle-racing/index.ts') },
    { manifest: trackManifest, content: invalid },
  ]);
  const error = await hostFailure(game.host.apply(preset));
  for (const path of ['widht', 'points[1]', 'gates[1]']) {
    assert.ok(
      error.issues.some((issue) => issue.path.endsWith(path)),
      `missing issue for ${path}`,
    );
  }
  await game.host.stop();
});

test(`vehicle acceleration, steering, braking, deterministic restart and timeout need no shooter services (${selected.id})`, async () => {
  const game = createHeadlessGame(catalog);
  await game.host.apply(preset);
  let race = game.session().services.get(Race);
  const start = race.x;
  game.input.press('vehicle/gas');
  game.ticks(120);
  assert.ok(race.x > start + 5);
  assert.ok(race.speed > 5);
  assert.equal(race.nextGate, 0);
  const speed = race.speed;
  game.input.release('vehicle/gas');
  game.input.press('vehicle/brake');
  game.ticks(30);
  assert.ok(race.speed < speed);
  game.input.release('vehicle/brake');
  game.input.press('vehicle/gas');
  game.input.press('vehicle/left');
  const yaw = race.yaw;
  game.ticks(30);
  assert.ok(race.yaw > yaw);
  await game.host.restart();
  race = game.session().services.get(Race);
  assert.equal(race.x, start);
  assert.equal(race.elapsed, 0);
  assert.equal(race.nextGate, 0);
  assert.equal(race.status, 'racing');
  game.input.press('vehicle/gas');
  game.ticks(120);
  const sample = [race.x, race.z, race.yaw, race.speed];
  await game.host.restart();
  game.input.press('vehicle/gas');
  game.ticks(120);
  race = game.session().services.get(Race);
  assert.deepEqual([race.x, race.z, race.yaw, race.speed], sample);
  game.input.release('vehicle/gas');
  game.ticks(9001);
  assert.equal(race.status, 'lost');
  await game.host.stop();
});

test(`invalid track and missing track are rejected during staging (${selected.id})`, async () => {
  const game = createHeadlessGame(catalog);
  await assert.rejects(
    game.host.apply(
      headlessPreset({
        plugins: ['vehicle/racing', selected.id],
        roles: { 'sdk/experience': 'vehicle/arcade-race', 'sdk/mechanic-sequence': selected.id },
        options: { track: 'vehicle/missing' },
      }),
    ),
  );
  await game.host.stop();
  const bad = [
    {
      kind: 'vehicle-track',
      id: 'vehicle/bad',
      data: { name: 'Broken', width: -1, laps: 0, timeLimit: 30, start: { x: 0, z: 0, yaw: 0 }, points: [], gates: [] },
    },
  ];
  const malformed = createHeadlessGame([
    selected.entry,
    { manifest: racing, load: () => import('../plugins/vehicle-racing/index.ts') },
    { manifest: trackManifest, content: bad },
  ]);
  await assert.rejects(
    malformed.host.apply(
      headlessPreset({
        plugins: ['vehicle/racing', 'vehicle/track', selected.id],
        roles: { 'sdk/experience': 'vehicle/arcade-race', 'sdk/mechanic-sequence': selected.id },
        options: { track: 'vehicle/bad' },
      }),
    ),
  );
  await malformed.host.stop();
});

test(`drift and off-track drag change the driving state (${selected.id})`, async () => {
  const game = createHeadlessGame(catalog);
  await game.host.apply(preset);
  const race = game.session().services.get(Race);
  game.input.press('vehicle/gas');
  game.ticks(80);
  game.input.press('vehicle/drift');
  game.ticks(1);
  assert.equal(race.drifting, true);
  game.input.release('vehicle/drift');
  game.ticks(250);
  assert.equal(race.offTrack, true);
  assert.ok(race.speed < 8);
  await game.host.stop();
});

test(`the authored circuit can be completed through driving input alone (${selected.id})`, async () => {
  const game = createHeadlessGame(catalog);
  await game.host.apply(preset);
  assert.deepEqual(game.session().registries.ids(SequenceProviders), [selected.id], 'the replacement runs with the default absent');
  const race = game.session().services.get(Race),
    points = race.track.points;
  let next = 1;
  const key = (action: string, on: boolean): void => {
    if (on) game.input.press(action);
    else game.input.release(action);
  };
  for (let i = 0; i < 8500 && race.status === 'racing'; i++) {
    const point = points[next]!;
    if (Math.hypot(point.x - race.x, point.z - race.z) < 3.8) next = (next + 1) % points.length;
    const target = points[next]!;
    const desired = Math.atan2(-(target.x - race.x), -(target.z - race.z));
    const error = Math.atan2(Math.sin(desired - race.yaw), Math.cos(desired - race.yaw));
    key('vehicle/left', error > 0.09);
    key('vehicle/right', error < -0.09);
    key('vehicle/gas', race.speed < (Math.abs(error) > 0.45 ? 7 : 12));
    key('vehicle/brake', race.speed > (Math.abs(error) > 0.45 ? 9 : 14));
    game.ticks(1);
  }
  assert.equal(race.status, 'won');
  assert.equal(race.lap, race.track.laps);
  assert.equal(race.revision, race.track.gates.length * race.track.laps);
  assert.equal(race.nextGate, race.track.gates.length, 'the terminal cursor is one past the final gate');
  await game.host.stop();
});

test(`gates only count in order and in their authored travel direction (${selected.id})`, async () => {
  const custom = [
    {
      kind: 'vehicle-track',
      id: 'vehicle/test-track',
      data: {
        name: 'Gate test',
        width: 10,
        laps: 1,
        timeLimit: 60,
        start: { x: 0, z: 0, yaw: -Math.PI / 2 },
        points: [
          { x: -10, z: 0 },
          { x: 20, z: 0 },
          { x: 20, z: 20 },
          { x: -10, z: 20 },
        ],
        gates: [
          { x: 3, z: 0, dx: 1, dz: 0, width: 8 },
          { x: 1, z: 0, dx: 1, dz: 0, width: 8 },
        ],
      },
    },
  ];
  const game = createHeadlessGame([
    selected.entry,
    { manifest: racing, load: () => import('../plugins/vehicle-racing/index.ts') },
    { manifest: trackManifest, content: custom },
  ]);
  await game.host.apply(
    headlessPreset({
      plugins: ['vehicle/racing', 'vehicle/track', selected.id],
      roles: { 'sdk/experience': 'vehicle/arcade-race', 'sdk/mechanic-sequence': selected.id },
      options: { track: 'vehicle/test-track' },
    }),
  );
  const race = game.session().services.get(Race);
  game.input.press('vehicle/gas');
  for (let i = 0; i < 150 && race.x < 4; i++) game.ticks(1);
  assert.equal(race.nextGate, 1);
  assert.equal(race.status, 'racing');
  game.input.release('vehicle/gas');
  game.input.press('vehicle/brake');
  for (let i = 0; i < 300 && race.x > 0; i++) game.ticks(1);
  assert.ok(race.x <= 0);
  assert.equal(race.nextGate, 1);
  game.input.release('vehicle/brake');
  game.input.press('vehicle/gas');
  for (let i = 0; i < 200 && race.status === 'racing'; i++) game.ticks(1);
  assert.equal(race.status, 'won');
  await game.host.stop();
});

test(`vehicle credits only one directional gate per tick and a final crossing precedes timeout (${selected.id})`, async () => {
  async function drive(gates: number[], timeLimit: number) {
    const game = createHeadlessGame([
      selected.entry,
      { manifest: racing, load: () => import('../plugins/vehicle-racing/index.ts') },
      { manifest: trackManifest, content: [{ kind: 'vehicle-track', id: 'vehicle/straight', data: {
        name: 'Straight boundary route', width: 10, laps: 1, timeLimit,
        start: { x: 0, z: 0, yaw: -Math.PI / 2 },
        points: [{ x: -10, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 20 }, { x: -10, z: 20 }],
        gates: gates.map(x => ({ x, z: 0, dx: 1, dz: 0, width: 8 })),
      } }] },
    ]);
    try {
      await game.host.apply(headlessPreset({
        plugins: ['vehicle/racing', 'vehicle/track', selected.id],
        roles: { 'sdk/experience': 'vehicle/arcade-race', 'sdk/mechanic-sequence': selected.id },
        options: { track: 'vehicle/straight' },
      }));
      const race = game.session().services.get(Race);
      game.input.press('vehicle/gas');
      for (let i = 0; i < 4000 && race.status === 'racing'; i++) game.ticks(1);
      return { status: race.status, elapsed: race.elapsed, nextGate: race.nextGate, revision: race.revision };
    } finally { game.host.stop(); }
  }
  const close = await drive([3, 3.002], 5);
  assert.equal(close.status, 'lost', 'passing the next gate in the same sweep does not count it');
  assert.equal(close.nextGate, 1);
  assert.equal(close.revision, 2, 'one crossing plus the independent timeout revision');
  const reference = await drive([3, 90], 60);
  assert.equal(reference.status, 'won');
  const limit = reference.elapsed - 1 / 120;
  assert.ok(limit >= 5);
  const boundary = await drive([3, 90], limit);
  assert.equal(boundary.status, 'won', 'the final gate is processed before timeout in the same tick');
  assert.equal(boundary.elapsed, reference.elapsed);
  assert.ok(boundary.elapsed > limit);
  assert.equal(boundary.nextGate, 2);
  assert.equal(boundary.revision, 2, 'victory suppresses the timeout revision');
});
}

test('vehicle staging rejects an absent sequence selection or a role without its factory', async () => {
  const metadataOnly = codePlugin('test/sequence-metadata', { register(ctx) {
    ctx.provideRole(SequenceMechanicRole, 'test/sequence-metadata', { name: 'Missing factory', description: 'Role metadata only' });
  } });
  const game = createHeadlessGame([
    metadataOnly,
    { manifest: racing, load: () => import('../plugins/vehicle-racing/index.ts') },
    { manifest: trackManifest, content },
  ]);
  try {
    for (const select of [false, true]) {
      const error = await hostFailure(game.host.apply(headlessPreset({
        plugins: ['vehicle/racing', 'vehicle/track', 'test/sequence-metadata'],
        roles: { 'sdk/experience': 'vehicle/arcade-race', ...(select ? { 'sdk/mechanic-sequence': 'test/sequence-metadata' } : {}) },
        options: { track: 'vehicle/neon-circuit' },
      })));
      assert.equal(error.stage, 'validate');
      assert.ok(error.issues.some(issue => issue.path === 'roles.sdk/mechanic-sequence'));
      if (select) assert.ok(error.issues.some(issue => issue.message.includes('SequenceProviders')));
    }
  } finally { game.host.stop(); }
});
