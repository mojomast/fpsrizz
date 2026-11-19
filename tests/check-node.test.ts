import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore -- plain .mjs tooling module without types
import { nodeVersionOk } from '../scripts/check-node.mjs';

test('node preflight accepts 22.18+ and rejects older versions', () => {
  for (const v of ['22.18.0', '22.23.5', '23.0.0', '24.1.2']) assert.equal(nodeVersionOk(v), true, v);
  for (const v of ['20.19.2', '22.17.9', '18.20.0', '21.99.0']) assert.equal(nodeVersionOk(v), false, v);
});
