import { test, assert } from './harness.js';
import { bytesToB64url, b64urlToBytes } from '../../build/modules/lib/encoding.js';

test('base64url round-trips every byte value and length', () => {
  for (let len = 0; len < 70; len++) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    const text = bytesToB64url(bytes);
    assert.match(text, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual([...b64urlToBytes(text)], [...bytes]);
  }
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual([...b64urlToBytes(bytesToB64url(all))], [...all]);
});

test('base64url handles large inputs', () => {
  const big = crypto.getRandomValues(new Uint8Array(200_000).subarray(0, 65536));
  assert.equal(b64urlToBytes(bytesToB64url(big)).length, big.length);
});

test('base64url rejects invalid characters', () => {
  for (const bad of ['a+b', 'a/b', 'abc=', 'ab c', '<x>']) assert.throws(() => b64urlToBytes(bad), bad);
});
