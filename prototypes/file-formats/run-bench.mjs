// Speed and memory of each format in Chromium, one fresh browser per measurement.
// Memory is the renderer process's peak RSS above what it used once the input existed.
// Run: node run-bench.mjs [MB]   (after building dist/, see README)
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
// Playwright comes from the environment (the e2e image, or a global install), not this package.
const { chromium } = createRequire(import.meta.url)('playwright');

const MB = Number(process.argv[2] || 100);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const name = req.url.split('?')[0].replace(/^\//, '') || 'bench.html';
  try { res.writeHead(200, { 'content-type': types[extname(name)] || 'application/octet-stream' }).end(readFileSync(join('dist', name))); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/bench.html`;

function rendererRssMb() {
  let max = 0;
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      if (!readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('--type=renderer')) continue;
      const kb = Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1] || 0);
      max = Math.max(max, kb / 1024);
    } catch { /* process ended */ }
  }
  return max;
}

async function measure(fn, arg) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.ready);
    await page.evaluate(([mb, asBlob]) => window.makeInput(mb, asBlob), [MB, fn === 'streaming']);
    await new Promise((r) => setTimeout(r, 300));
    const base = rendererRssMb();
    let peak = base;
    const timer = setInterval(() => { peak = Math.max(peak, rendererRssMb()); }, 20);
    const result = await page.evaluate(([f, a]) => window[f](a), [fn, arg]);
    clearInterval(timer);
    return { ...result, extraMemMb: Math.round(peak - base) };
  } finally {
    await browser.close();
  }
}

const names = ['age', 'openpgp (gpg-compatible)', 'openpgp (RFC 9580)', '7z'];
const rows = [];
// Throughput leaves out the key derivation (scrypt, Argon2, S2K), reported separately as kdfMs:
// it runs once per file, whatever the size.
const mbps = (ms) => Math.round(MB / (ms / 1000));
const kdf = {};
for (const n of names) {
  const r = await measure('inMemory', n);
  kdf[n] = r.kdfMs;
  rows.push({ format: n, mode: 'in memory', kdfMs: Math.round(r.kdfMs), encMBps: mbps(r.encMs - r.kdfMs), decMBps: mbps(r.decMs - r.kdfMs), extraMemMb: r.extraMemMb, overheadBytes: r.overhead, ok: r.ok });
  console.error(n, 'in memory done');
}
for (const n of ['age', 'openpgp (gpg-compatible)']) {
  const r = await measure('streaming', n);
  rows.push({ format: n, mode: 'streaming encrypt', encMBps: mbps(r.encMs - (kdf[n] ?? 0)), extraMemMb: r.extraMemMb });
  console.error(n, 'streaming done');
}
console.table(rows);
console.log(JSON.stringify({ MB, chromium: chromium.name(), rows }));
server.close();
