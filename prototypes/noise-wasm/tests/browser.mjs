// Runs the handshake in Chromium under two Content-Security-Policies:
// the app's current one, and the same plus 'wasm-unsafe-eval'.
// Run with: node tests/browser.mjs (after ./build.sh)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const APP_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' wss:; base-uri 'none'; form-action 'none'; object-src 'none'";
const WASM_CSP = APP_CSP.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'");
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };

const page = `<!doctype html><meta charset="utf-8"><title>noise</title><script type="module" src="/tests/page.mjs"></script>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const csp = url.searchParams.get('csp') === 'wasm' ? WASM_CSP : APP_CSP;
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': csp });
    return res.end(page);
  }
  const path = normalize(join(root, url.pathname));
  if (!path.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
let failed = false;
for (const [csp, expectOk] of [['app', false], ['wasm', true]]) {
  const p = await browser.newPage();
  await p.goto(`${base}?csp=${csp}`);
  const result = await p.waitForFunction(() => window.result, null, { timeout: 15000 }).then((h) => h.jsonValue());
  const ok = result.ok === expectOk;
  failed ||= !ok;
  console.log(`${ok ? 'ok' : 'NOT OK'} - CSP ${csp}: ${JSON.stringify(result)}`);
  await p.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
