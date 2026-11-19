import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, satisfies, isValidRange } from '@bulkhead/kernel/semver.ts';

test('parseVersion accepts x.y.z and rejects everything else', () => {
  assert.deepEqual(parseVersion('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion(' 10.0.12 '), [10, 0, 12]);
  assert.equal(parseVersion('1.2'), undefined);
  assert.equal(parseVersion('1.2.3.4'), undefined);
  assert.equal(parseVersion('a.b.c'), undefined);
  assert.equal(parseVersion(''), undefined);
});

test('compareVersions orders by major, then minor, then patch', () => {
  assert.equal(compareVersions([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(compareVersions([1, 2, 3], [1, 2, 4]), -1);
  assert.equal(compareVersions([1, 10, 0], [1, 9, 9]), 1);
  assert.equal(compareVersions([2, 0, 0], [1, 99, 99]), 1);
});

test('exact version range matches only that version', () => {
  assert.equal(satisfies('1.2.3', '1.2.3'), true);
  assert.equal(satisfies('1.2.4', '1.2.3'), false);
  assert.equal(satisfies('1.2.2', '1.2.3'), false);
});

test('caret on a 1.x version allows minor and patch bumps but not the next major', () => {
  assert.equal(satisfies('1.2.3', '^1.2.3'), true);
  assert.equal(satisfies('1.9.0', '^1.2.3'), true);
  assert.equal(satisfies('1.2.2', '^1.2.3'), false);
  assert.equal(satisfies('2.0.0', '^1.2.3'), false);
});

test('caret on a 0.x version only allows the same minor (0.2.x)', () => {
  assert.equal(satisfies('0.2.3', '^0.2.3'), true);
  assert.equal(satisfies('0.2.99', '^0.2.3'), true);
  assert.equal(satisfies('0.2.2', '^0.2.3'), false);
  assert.equal(satisfies('0.3.0', '^0.2.3'), false);
});

test('tilde allows patch bumps only', () => {
  assert.equal(satisfies('1.2.3', '~1.2.3'), true);
  assert.equal(satisfies('1.2.9', '~1.2.3'), true);
  assert.equal(satisfies('1.2.2', '~1.2.3'), false);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
});

test('space-separated comparators are ANDed', () => {
  assert.equal(satisfies('1.0.0', '>=1.0.0 <2.0.0'), true);
  assert.equal(satisfies('1.9.9', '>=1.0.0 <2.0.0'), true);
  assert.equal(satisfies('2.0.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfies('0.9.9', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfies('1.0.0', '>1.0.0'), false);
  assert.equal(satisfies('1.0.1', '>1.0.0'), true);
  assert.equal(satisfies('1.0.0', '<=1.0.0'), true);
  assert.equal(satisfies('1.0.0', '<1.0.0'), false);
});

test('x-ranges and partial versions', () => {
  assert.equal(satisfies('1.0.0', '1.x'), true);
  assert.equal(satisfies('1.99.5', '1.x'), true);
  assert.equal(satisfies('2.0.0', '1.x'), false);
  assert.equal(satisfies('1.2.0', '1.2.x'), true);
  assert.equal(satisfies('1.3.0', '1.2.x'), false);
});

test('star matches any valid version', () => {
  assert.equal(satisfies('0.0.1', '*'), true);
  assert.equal(satisfies('99.1.0', '*'), true);
  assert.equal(satisfies('3.2.1', 'x'), true);
});

test('|| joins alternatives (OR)', () => {
  assert.equal(satisfies('1.5.0', '^1.0.0 || ^3.0.0'), true);
  assert.equal(satisfies('3.1.0', '^1.0.0 || ^3.0.0'), true);
  assert.equal(satisfies('2.5.0', '^1.0.0 || ^3.0.0'), false);
  assert.equal(satisfies('2.0.0', '1.0.0 || 2.0.0'), true);
});

test('invalid versions never satisfy a range', () => {
  assert.equal(satisfies('1.2', '*'), false);
  assert.equal(satisfies('v1.2.3', '^1.0.0'), false);
  assert.equal(satisfies('', '*'), false);
});

test('invalid ranges are reported by isValidRange and satisfy nothing', () => {
  assert.equal(isValidRange('^1.2.3'), true);
  assert.equal(isValidRange('>=1.0.0 <2.0.0'), true);
  assert.equal(isValidRange('1.x || ~2.0.0'), true);
  assert.equal(isValidRange('1.2.3.4'), false);
  assert.equal(isValidRange('^abc'), false);
  assert.equal(isValidRange('>=1.0.0 foo'), false);
  assert.equal(isValidRange('1.0.0 || 1.2.3.4'), false);
  assert.equal(satisfies('1.0.0', '1.2.3.4'), false);
  assert.equal(satisfies('1.0.0', '>=1.0.0 foo'), false);
});
