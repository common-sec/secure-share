import { test, assert } from './harness.js';
import { generateChars, DEFAULTS } from '../src/tools/password.js';

const base = { ...DEFAULTS, mode: 'chars' };

test('character passwords have the requested length', () => {
  for (const len of [4, 20, 64, 256]) assert.equal(generateChars({ ...base, len }).value.length, len);
});

test('"at least one of each set" is honoured', () => {
  for (let i = 0; i < 500; i++) {
    const { value } = generateChars({ ...base, len: 4 });
    assert.match(value, /[a-z]/);
    assert.match(value, /[A-Z]/);
    assert.match(value, /[0-9]/);
    assert.match(value, /[^A-Za-z0-9]/);
  }
});

test('excluded and look-alike characters never appear', () => {
  for (let i = 0; i < 300; i++) {
    const { value } = generateChars({ ...base, len: 64, amb: true, ex: 'abc{}' });
    assert.ok(!/[Il1|O0oabc{}]/.test(value), value);
  }
});

test('only selected sets are used', () => {
  const { value } = generateChars({ ...base, len: 200, upper: false, symbols: false });
  assert.match(value, /^[a-z0-9]+$/);
});

test('entropy is length × log2(pool)', () => {
  const { bits } = generateChars({ ...base, len: 10, upper: false, symbols: false, digits: false });
  assert.ok(Math.abs(bits - 10 * Math.log2(26)) < 1e-9);
});

test('impossible settings raise an error instead of a weak password', () => {
  assert.throws(() => generateChars({ ...base, lower: false, upper: false, digits: false, symbols: false }));
  assert.throws(() => generateChars({ ...base, len: 3 }), 'shorter than the number of required sets');
});
