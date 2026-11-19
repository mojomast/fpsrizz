import test from 'node:test';
import assert from 'node:assert/strict';
// The project maintains a minimal Node shim; these filesystem and process APIs are used only here.
// @ts-expect-error Node's full type declarations are not installed.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error Node's full type declarations are not installed.
import { spawnSync } from 'node:child_process';
// @ts-expect-error Node's full type declarations are not installed.
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function withFixture(run: (root: string) => void): void {
  const temp = existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir();
  const root: string = mkdtempSync(join(temp, 'plugin-scaffold-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(resolve('scripts/new-plugin.mjs'), join(root, 'scripts/new-plugin.mjs'));
    cpSync(resolve('templates'), join(root, 'templates'), { recursive: true });
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function scaffold(root: string, ...args: string[]) {
  return spawnSync('node', [join(root, 'scripts/new-plugin.mjs'), ...args], { encoding: 'utf8' });
}

test('scaffolder safely serializes display names and suggests valid identifiers', () => {
  withFixture((root) => {
    const name = `A "quote", 'apostrophe', \\ slash\n__ID__ \u2028 finish`;
    const result = scaffold(root, '9space/2...--foo_', name);
    assert.equal(result.status, 0, result.stderr);
    const dir = join(root, 'src/plugins/9space-2...--foo_');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.id, '9space/2...--foo_');
    assert.equal(manifest.name, name);
    const reuse = JSON.parse(readFileSync(join(dir, 'reuse.json'), 'utf8'));
    assert.equal(reuse.summary, name);
    assert.equal(reuse.scope, 'unreviewed');
    assert.deepEqual(reuse.entryPoints, []);
    assert.match(result.stdout, /npm run find-reuse/);
    assert.match(result.stdout, /npm run index-reuse/);
    const source: string = readFileSync(join(dir, 'index.ts'), 'utf8');
    const notification = source.match(/\.notify\(([\s\S]+?)\);/);
    assert.ok(notification?.[1]);
    assert.equal(JSON.parse(notification[1]), `${name} is active`);
    const syntax = spawnSync('node', ['--check', join(dir, 'index.ts')], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
    // The catalog is generated, so no hand-written import line (or identifier) is printed any more.
    assert.match(result.stdout, /gen-catalog/);
  });
});

test('scaffolder refuses collisions without changing existing files', () => {
  withFixture((root) => {
    const dir = join(root, 'src/plugins/example-test');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), 'original manifest');
    writeFileSync(join(dir, 'index.ts'), 'original source');
    const result = scaffold(root, 'example/test', 'Changed');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already exists/);
    assert.equal(readFileSync(join(dir, 'manifest.json'), 'utf8'), 'original manifest');
    assert.equal(readFileSync(join(dir, 'index.ts'), 'utf8'), 'original source');
  });
});
