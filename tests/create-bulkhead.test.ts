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
    assert.ok(!src.includes('__NS__') && src.includes(`from '@bulkhead/sdk'`), 'placeholders replaced; engine imported by package name');
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

// @ts-expect-error plain ESM script without declarations
import { parseArgs, plan } from '../packages/create-bulkhead/index.mjs';

test('create-bulkhead CLI: parses options and plans checkout vs clone mode', () => {
  const o = parseArgs(['my-game', '--template', 'fps', '--title', 'My Game']);
  assert.equal(o.template, 'fps');
  assert.throws(() => parseArgs(['Bad Name']), /lowercase/);
  assert.throws(() => parseArgs(['x', '--template', 'mmo']), /unknown template/);
  assert.throws(() => parseArgs(['x', '--wat']), /unknown option/);
  const inCheckout = plan(o, `${root}/games`);
  assert.equal(inCheckout.mode, 'checkout');
  assert.equal(inCheckout.engine, root);
  assert.deepEqual(inCheckout.steps[0].args.slice(0, 5), ['scripts/bulkhead.mjs', 'create', 'my-game', '--template', 'fps']);
  const elsewhere = plan(parseArgs(['my-game', '--ref', 'v0.1.0', '--no-install']), '/');
  assert.equal(elsewhere.mode, 'clone');
  assert.deepEqual(elsewhere.steps.map((s: { cmd: string }) => s.cmd), ['git', 'node']);
  assert.ok(elsewhere.steps[0].args.includes('--branch') && elsewhere.steps[0].args.includes('v0.1.0'));
  const pinned = plan(parseArgs(['my-game']), '/');
  assert.deepEqual(pinned.steps[0].args.slice(0, 5), ['clone', '--depth', '1', '--branch', 'v0.1.0'], 'clones the pinned release tag by default');
  assert.ok(plan(parseArgs(['my-game', '--ref', 'main']), '/').steps[0].args.includes('main'));
});

test('create-bulkhead is publish-ready: npm pack contents and package metadata', () => {
  const pkg = JSON.parse(readFileSync('packages/create-bulkhead/package.json', 'utf8') as string);
  assert.equal(pkg.private, undefined, 'publishable');
  assert.ok(pkg.bin['create-bulkhead'] && pkg.license && pkg.repository?.directory === 'packages/create-bulkhead' && pkg.engines?.node);
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: 'packages/create-bulkhead', encoding: 'utf8' });
  if (r.error) return; // npm not on PATH in this environment
  assert.equal(r.status, 0, r.stderr);
  const files = (JSON.parse(r.stdout)[0].files as { path: string }[]).map((f) => f.path).sort();
  assert.deepEqual(files, ['LICENSE', 'README.md', 'index.mjs', 'package.json']);
  const help = spawnSync(process.execPath, ['packages/create-bulkhead/index.mjs', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /npm create bulkhead/);
});

test('create-bulkhead runs when invoked through a bin symlink (how npm create runs it)', async () => {
  const { mkdtempSync, symlinkSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(`${tmpdir()}/cb-bin-`);
  try {
    symlinkSync(`${root}/packages/create-bulkhead/index.mjs`, `${dir}/create-bulkhead`);
    const r = spawnSync(process.execPath, [`${dir}/create-bulkhead`, '--help'], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage: npm create bulkhead/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
