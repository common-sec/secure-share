// Runs the browser test suite headlessly (used by CI).
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium firefox
//   node tests/run-headless.mjs [chromium|firefox ...]
// Starts tools/serve.py, opens /tests/ in each browser, and exits non-zero on any failure.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import * as playwright from 'playwright';

const PORT = 8765;
const browsers = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox'];
const python = process.platform === 'win32' ? 'python' : 'python3';

const server = spawn(python, ['tools/serve.py', String(PORT)], { stdio: ['ignore', 'inherit', 'inherit'] });
let exitCode = 0;

try {
  await waitForServer(`http://localhost:${PORT}/tests/index.html`);
  for (const name of browsers) {
    const browser = await playwright[name].launch();
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
    await page.goto(`http://localhost:${PORT}/tests/index.html`);
    await page.waitForFunction(() => window.__TEST_RESULTS__?.done, null, { timeout: 300_000 });
    const { passed, failed, results } = await page.evaluate(() => window.__TEST_RESULTS__);
    for (const r of results) {
      console.log(`${r.ok ? '  ✓' : '  ✗'} [${name}] ${r.file} › ${r.name} (${r.ms} ms)`);
      if (!r.ok) console.log(r.error.replace(/^/gm, '      '));
    }
    console.log(`[${name}] ${passed} passed, ${failed} failed\n`);
    if (failed) exitCode = 1;
    await browser.close();
  }
} catch (e) {
  console.error(e);
  exitCode = 1;
} finally {
  server.kill();
}
process.exit(exitCode);

async function waitForServer(url) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`server did not start: ${url}`);
}
