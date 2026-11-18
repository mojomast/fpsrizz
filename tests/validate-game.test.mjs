import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { presets } from '../src/app/catalog.ts';

const run = (...args) => spawnSync(process.execPath, ['scripts/validate-game.mjs', ...args], { encoding: 'utf8' });
const fixture = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'bulkhead-validation-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
};
const write = (dir, name, data) => {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data));
  return path;
};
const preset = () => JSON.parse(readFileSync('games/shooter/presets/default.json', 'utf8'));

test('bundled presets and a file validate with the app catalog', () => {
  const bundled = run('--bundled');
  assert.equal(bundled.status, 0, bundled.stderr);
  const staged = [...bundled.stdout.matchAll(/^OK (.+) \(staged\)$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(staged, presets.map((item) => item.id).sort());
  assert.match(bundled.stdout, /^OK theme\/assetrizz-demo \(staged\)$/m);
  const file = run('games/shooter/presets/default.json');
  assert.equal(file.status, 0, file.stderr);
  assert.match(file.stdout, /OK .*default\.json/);
});

test('reports graph and JSON errors with nonzero exit status', () => fixture((dir) => {
  const bad = preset();
  bad.plugins.push('missing/plugin');
  const result = run(write(dir, 'bad.json', bad));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /graph/);
  assert.match(result.stderr, /missing\/plugin/);
  const malformed = join(dir, 'malformed.json');
  writeFileSync(malformed, '{');
  const json = run(malformed);
  assert.notEqual(json.status, 0);
  assert.match(json.stderr, /Cannot read JSON.*malformed\.json/);
}));

test('validates wrapped external content through the real host and rejects code replacement', () => fixture((dir) => {
  const game = preset();
  game.plugins.push('test/pack');
  const gamePath = write(dir, 'game.json', game);
  const pack = { schema: 1, manifest: { schema: 1, id: 'test/pack', name: 'Test pack', version: '1.0.0', kind: 'content', sdk: '^2.0.0', dependencies: { 'core/combat': '^1.0.0' } }, content: [] };
  const packPath = write(dir, 'pack.json', pack);
  let result = run(gamePath, '--pack', packPath);
  assert.equal(result.status, 0, result.stderr);
  pack.content.push({ kind: 'weapon', id: 'test/bad', data: {} });
  write(dir, 'pack.json', pack);
  result = run(gamePath, '--pack', packPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test\/pack/);
  assert.match(result.stderr, /content\[0\]/);
  pack.manifest.id = 'core/combat';
  write(dir, 'pack.json', pack);
  result = run(gamePath, '--pack', packPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /cannot replace installed code plugin/);
}));

test('missing arguments fail with usage', () => {
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});
