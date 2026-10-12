// Cryptographically secure, unbiased random helpers built on crypto.getRandomValues.

const RANGE = 2 ** 32;
const buf = new Uint32Array(1);

/** Uniform integer in [0, n) using rejection sampling (no modulo bias). */
export function randomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > RANGE) throw new RangeError(`randomInt: invalid bound ${n}`);
  const limit = RANGE - (RANGE % n);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % n;
  }
}

/** A uniformly random element of a string or array. */
export function pick<T>(items: ArrayLike<T>): T {
  return items[randomInt(items.length)]!;
}

/** In-place Fisher–Yates shuffle. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
