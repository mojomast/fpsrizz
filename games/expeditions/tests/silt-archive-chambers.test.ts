import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Reporter } from '@bulkhead/kernel/validate.ts';
import type { Issue } from '@bulkhead/kernel/validate.ts';
import { loadChamber } from '../plugins/silt-game/chambers.ts';

const rows = [
  '####D####', '#.......#', '#.~~~...#', '#.......#',
  'D.......D', '#...^...#', '#.......#', '#.......#', '####D####',
];

function validate(value: unknown) {
  const issues: Issue[] = [];
  return { chamber: loadChamber(value, new Reporter(issues, 'test')), issues };
}

test('chambers validate detached, frozen geometry with traversable sockets', () => {
  const input = { name: 'Intake', rows: [...rows] };
  const { chamber, issues } = validate(input);
  assert.deepEqual(issues, []);
  assert.ok(chamber);
  input.rows[0] = '#########';
  assert.equal(chamber.rows[0], '####D####');
  assert.ok(Object.isFrozen(chamber.rows));
});

test('chambers reject bad socket placement and disconnected dry paths', () => {
  const badSocket = [...rows]; badSocket[0] = '###D#####';
  assert.ok(validate({ name: 'Bad', rows: badSocket }).issues.some(i => i.message.includes('cardinal')));
  const wetBarrier = [...rows]; wetBarrier[3] = '#~~~~~~~#';
  assert.ok(validate({ name: 'Wet', rows: wetBarrier }).issues.some(i => i.message.includes('dry')));
  const badBoundary = [...rows]; badBoundary[1] = '........#';
  assert.ok(validate({ name: 'Open', rows: badBoundary }).issues.some(i => i.message.includes('boundary')));
});

test('chambers reject malformed values and unknown properties', () => {
  for (const value of [null, {}, { name: '', rows }, { name: 'X', rows: ['D'] }, { name: 'X', rows, script: 'x' }]) {
    const result = validate(value);
    assert.equal(result.chamber, undefined);
    assert.ok(result.issues.length);
  }
});
