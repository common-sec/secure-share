// Cryptographically secure, unbiased random helpers built on crypto.getRandomValues.

const RANGE = 2 ** 32;
const buf = new Uint32Array(1);

/** Uniform integer in [0, n) using rejection sampling (no modulo bias). */
export function randomInt(n) {
  if (!Number.isInteger(n) || n <= 0 || n > RANGE) throw new RangeError(`randomInt: invalid bound ${n}`);
  const limit = RANGE - (RANGE % n);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function pick(str) {
  return str[randomInt(str.length)];
}

/** In-place Fisher–Yates shuffle. */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
