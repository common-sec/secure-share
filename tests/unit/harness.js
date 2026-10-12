// Minimal, dependency-free test harness. Runs in a real browser (Web Crypto, IndexedDB, etc.).
const registry = [];
let currentFile = '';

export function setFile(name) { currentFile = name; }

export function test(name, fn, { timeout = 30000 } = {}) {
  registry.push({ file: currentFile, name, fn, timeout });
}

class AssertionError extends Error {}

function fail(msg) { throw new AssertionError(msg); }
const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

export const assert = {
  ok(v, msg = 'expected truthy') { if (!v) fail(`${msg} (got ${show(v)})`); },
  equal(a, b, msg = '') { if (a !== b) fail(`${msg} expected ${show(b)}, got ${show(a)}`); },
  notEqual(a, b, msg = '') { if (a === b) fail(`${msg} expected values to differ, both ${show(a)}`); },
  deepEqual(a, b, msg = '') { if (show(a) !== show(b)) fail(`${msg} expected ${show(b)}, got ${show(a)}`); },
  match(s, re, msg = '') { if (!re.test(s)) fail(`${msg} ${show(s)} does not match ${re}`); },
  atLeast(a, b, msg = '') { if (!(a >= b)) fail(`${msg} expected >= ${b}, got ${a}`); },
  throws(fn, msg = 'expected an exception') {
    try { fn(); } catch { return; }
    fail(msg);
  },
  async rejects(promise, msg = 'expected a rejection') {
    try { await promise; } catch { return; }
    fail(msg);
  },
};

export async function run({ filter = '', onResult = () => {} } = {}) {
  const results = [];
  for (const t of registry) {
    if (filter && !`${t.file} ${t.name}`.includes(filter)) continue;
    const start = performance.now();
    let error = null;
    try {
      await Promise.race([
        t.fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${t.timeout} ms`)), t.timeout)),
      ]);
    } catch (e) {
      error = e?.stack || String(e);
    }
    const result = { file: t.file, name: t.name, ok: !error, error, ms: Math.round(performance.now() - start) };
    results.push(result);
    onResult(result);
  }
  return results;
}
