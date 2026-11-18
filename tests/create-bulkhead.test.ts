import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// @ts-expect-error plain ESM script without declarations
import { TEMPLATES, scaffoldGame } from '../scripts/scaffold-lib.mjs';

const root = process.cwd();
// A child `node --test` inside a test run reports to the parent runner unless this variable is removed.
const childEnv: Record<string, string | undefined> = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
const out = `.build/scaffold-${process.pid}`;
after(() => rmSync(out, { recursive: true, force: true }));

for (const template of Object.keys(TEMPLATES as Record<string, string>)) {
  if (!existsSync(`templates/games/${template}/plugins/game/index.ts`)) continue;
  test(`create-bulkhead: the "${template}" template scaffolds a runnable, tested game`, () => {
    const name = `${template}-demo`;
    const files: string[] = scaffoldGame({ engineRoot: root, name, template, gamesDir: `${out}/games` });
    assert.ok(files.some((f) => f.endsWith('AGENTS.md')), 'ships agent instructions');
    const manifest = JSON.parse(readFileSync(`${out}/games/${name}/plugins/game/manifest.json`, 'utf8') as string);
    assert.equal(manifest.id, `${name}/game`);
    assert.equal(manifest.$schema, '../../../../../../schemas/plugin-manifest.schema.json');
    const src = readFileSync(`${out}/games/${name}/plugins/game/index.ts`, 'utf8') as string;
    assert.ok(!src.includes('__NS__') && src.includes(`'../../../../../../src/sdk/index.ts'`), 'placeholders and engine imports rewritten');
    const tests = readdirSync(`${out}/games/${name}/tests`).map((f) => `${out}/games/${name}/tests/${f}`);
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], { encoding: 'utf8', env: childEnv });
    assert.equal(r.status, 0, `${template} tests failed:\n${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /# pass [1-9]/, 'the scaffolded tests ran');
  });
}

test('create-bulkhead: rejects bad names, unknown templates and existing games', () => {
  assert.throws(() => scaffoldGame({ engineRoot: root, name: 'My Game', gamesDir: `${out}/games` }), /lowercase/);
  assert.throws(() => scaffoldGame({ engineRoot: root, name: 'x', template: 'mmo', gamesDir: `${out}/games` }), /unknown template/);
  assert.throws(() => scaffoldGame({ engineRoot: root, name: 'sandbox' }), /already exists/);
});
