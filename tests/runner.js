// Loads every test file, runs them, renders results, and exposes them for CI as
// window.__TEST_RESULTS__ ({ done, passed, failed, results }).
import { run, setFile } from './harness.js';

const FILES = [
  'random.test.js',
  'encoding.test.js',
  'crypto.test.js',
  'password.test.js',
  'passphrase.test.js',
  'room.test.js',
];

window.__TEST_RESULTS__ = { done: false };
const list = document.getElementById('results');
const summary = document.getElementById('summary');
const filter = new URLSearchParams(location.search).get('filter') ?? '';

for (const f of FILES) {
  setFile(f);
  await import(`./${f}`);
}

const results = await run({
  filter,
  onResult(r) {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    const file = document.createElement('span');
    file.className = 'file';
    file.textContent = `${r.file} › `;
    li.append(file, `${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms)`);
    if (!r.ok) {
      const pre = document.createElement('pre');
      pre.textContent = r.error;
      li.append(pre);
    }
    list.append(li);
  },
});

const failed = results.filter((r) => !r.ok).length;
summary.textContent = `${results.length - failed} passed, ${failed} failed`;
summary.className = failed ? 'fail' : 'pass';
document.title = `${failed ? 'FAIL' : 'PASS'} · tests`;
window.__TEST_RESULTS__ = { done: true, passed: results.length - failed, failed, results };
