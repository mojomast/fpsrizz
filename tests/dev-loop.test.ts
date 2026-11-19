import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOverride, withSeed } from '../src/app/dev-loop.ts';

test('?seed parses to a number and replaces the preset seed without mutating the input', () => {
  assert.equal(seedOverride('?preset=core/default'), undefined);
  assert.equal(seedOverride('?seed='), undefined);
  assert.equal(seedOverride('?seed=42'), 42);
  const preset = { id: 'x', seed: 1 };
  const copy = withSeed(preset, 42) as { seed: number };
  assert.equal(copy.seed, 42);
  assert.equal(preset.seed, 1);
  assert.equal(withSeed(preset, undefined), preset);
  assert.equal(withSeed(null, 3), null);
});
