import { test, assert } from './harness.js';
import { randomInt, shuffle } from '../src/lib/random.js';

test('randomInt stays in range', () => {
  for (const n of [1, 2, 3, 7, 62, 100, 2 ** 32]) {
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(n);
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `randomInt(${n}) = ${v}`);
    }
  }
});

test('randomInt rejects invalid bounds', () => {
  for (const bad of [0, -1, 1.5, NaN, 2 ** 32 + 1]) assert.throws(() => randomInt(bad), `bound ${bad}`);
});

test('randomInt is uniform (chi-squared, n = 7)', () => {
  // A bound that doesn't divide 2^32 would show modulo bias without rejection sampling.
  const n = 7;
  const samples = 70000;
  const counts = new Array(n).fill(0);
  for (let i = 0; i < samples; i++) counts[randomInt(n)]++;
  const expected = samples / n;
  const chi2 = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
  // 6 degrees of freedom: p = 0.001 critical value is 22.46.
  assert.ok(chi2 < 22.46, `chi2 = ${chi2.toFixed(2)}, counts = ${counts}`);
});

test('shuffle is a permutation', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = shuffle([...input]);
  assert.deepEqual([...out].sort((a, b) => a - b), input);
});
