import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reporter, vNumber, vId, vArray, vJson, vString, formatIssues } from '../src/kernel/validate.ts';
import type { Issue } from '../src/kernel/validate.ts';

test('Reporter builds dotted and indexed paths', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'pack/test');
  assert.equal(r.at('a').at(2).at('b').path, 'a[2].b');
  assert.equal(r.at('a').at(2).at('b').at(0).path, 'a[2].b[0]');
  assert.equal(r.path, '');
});

test('a failure reports the full path and the reporter source', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'pack/test');
  assert.equal(r.at('a').at(2).at('b').error('bad thing'), undefined);
  assert.deepEqual(issues, [{ source: 'pack/test', path: 'a[2].b', message: 'bad thing' }]);
});

test('an error at the root is reported as (root)', () => {
  const issues: Issue[] = [];
  new Reporter(issues, 'pack/test').error('nope');
  assert.equal(issues[0]!.path, '(root)');
});

test('vNumber rejects NaN, Infinity, and strings', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  assert.equal(vNumber(NaN, r.at('n')), undefined);
  assert.equal(vNumber(Infinity, r.at('n')), undefined);
  assert.equal(vNumber(-Infinity, r.at('n')), undefined);
  assert.equal(vNumber('5', r.at('n')), undefined);
  assert.equal(vNumber(undefined, r.at('n')), undefined);
  assert.equal(issues.length, 5);
  assert.equal(vNumber(0, r), 0);
  assert.equal(vNumber(-2.5, r), -2.5);
});

test('vNumber enforces min, max and int', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  assert.equal(vNumber(4, r, { min: 0, max: 10, int: true }), 4);
  assert.equal(vNumber(-1, r.at('lo'), { min: 0 }), undefined);
  assert.equal(vNumber(11, r.at('hi'), { max: 10 }), undefined);
  assert.equal(vNumber(2.5, r.at('i'), { int: true }), undefined);
  assert.equal(issues.length, 3);
  assert.deepEqual(
    issues.map((i) => i.path),
    ['lo', 'hi', 'i'],
  );
  assert.equal(issues[0]!.source, 'src');
});

test('vId accepts namespaced lowercase ids and rejects everything else', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  assert.equal(vId('core/pistol', r), 'core/pistol');
  assert.equal(vId('Pistol', r.at('a')), undefined);
  assert.equal(vId('nopath', r.at('b')), undefined);
  assert.equal(vId('a/B', r.at('c')), undefined);
  assert.equal(vId(42, r.at('d')), undefined);
  assert.equal(issues.length, 4);
  assert.deepEqual(
    issues.map((i) => i.path),
    ['a', 'b', 'c', 'd'],
  );
});

test('vString rejects empty strings by default and enforces max', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  assert.equal(vString('', r), undefined);
  assert.equal(vString('abcd', r, { max: 3 }), undefined);
  assert.equal(vString('', r, { nonEmpty: false }), '');
  assert.equal(issues.length, 2);
});

test('vArray enforces the max size', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  assert.deepEqual(vArray([1, 2], r, { max: 2 }), [1, 2]);
  assert.equal(vArray([1, 2, 3], r.at('list'), { max: 2 }), undefined);
  assert.equal(vArray('nope', r.at('str')), undefined);
  assert.equal(issues.length, 2);
  assert.equal(issues[0]!.path, 'list');
  assert.match(issues[0]!.message, /limit is 2/);
});

test('vJson rejects functions and non-finite numbers', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  assert.equal(vJson(() => 1, r.at('fn')), undefined);
  assert.equal(vJson(NaN, r.at('nan')), undefined);
  assert.equal(vJson(Infinity, r.at('inf')), undefined);
  assert.equal(vJson({ ok: [1, { deep: () => 0 }] }, r.at('obj')), undefined);
  assert.deepEqual(
    issues.map((i) => i.path),
    ['fn', 'nan', 'inf', 'obj.ok[1].deep'],
  );
});

test('vJson accepts plain JSON data and returns it', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'src');
  const value = { a: [1, 'x', true, null], b: { c: -0.5 } };
  assert.deepEqual(vJson(value, r), value);
  assert.equal(issues.length, 0);
});

test('every failure appends an Issue carrying the reporter source', () => {
  const issues: Issue[] = [];
  const r = new Reporter(issues, 'content/weapons.json');
  vId('Bad', r.at('id'));
  vNumber('x', r.at('damage'));
  vArray(null, r.at('list'));
  assert.equal(issues.length, 3);
  for (const i of issues) assert.equal(i.source, 'content/weapons.json');
});

test('formatIssues output contains source, path and message for each issue', () => {
  const text = formatIssues([
    { source: 'pack/guns', path: 'spawns[3].prefab', message: 'expected a string' },
    { source: 'pack/guns', path: '(root)', message: 'expected an object' },
  ]);
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /pack\/guns/);
  assert.match(lines[0]!, /spawns\[3\]\.prefab/);
  assert.match(lines[0]!, /expected a string/);
  assert.match(lines[1]!, /\(root\)/);
  assert.equal(formatIssues([]), '');
});
