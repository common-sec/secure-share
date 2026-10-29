// Lighthouse budgets for the built site (docs/TODO.md I4): every page in pages.mjs is audited in
// headless Chromium, and the run fails if a category scores below its budget in budgets.json.
//
//   docker compose run --rm lighthouse          (run `build` first)
//
// Runs offline, against dist/ served by tools/serve.py on loopback. Lighthouse's default mobile
// profile is used (a mid-range phone on a slow 4G connection, simulated), so scores don't depend
// on the machine's speed. Each page runs RUNS times and the median score counts, as Lighthouse
// recommends for performance. HTML and JSON reports go to $LIGHTHOUSE_OUT (default
// .cache/lighthouse), which CI keeps as an artifact.
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const RUNS = Number(process.env.LIGHTHOUSE_RUNS ?? 3);
const PORT = 8090;
const OUT = resolve(root, process.env.LIGHTHOUSE_OUT ?? '.cache/lighthouse');

// Lighthouse is installed in the image (/opt/lighthouse), or next to this file for a local run.
const modules = process.env.LIGHTHOUSE_MODULES ?? here;
const require = createRequire(join(modules, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
const { default: lighthouse } = await load('lighthouse');
const chromeLauncher = await load('chrome-launcher');

const { PAGES } = await import(pathToFileURL(join(root, 'pages.mjs')).href);
const budgets = JSON.parse(readFileSync(join(here, 'budgets.json'), 'utf8'));

/** Playwright's Chromium, unless CHROME_PATH says otherwise. */
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/ms-playwright';
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) throw new Error(`no Chromium in ${base}; set CHROME_PATH`);
  return join(base, dir, 'chrome-linux64', 'chrome');
}

/** Serves dist/ exactly as `docker compose up web` does, until the returned function is called. */
async function serve() {
  const server = spawn('python3', [join(root, 'tools/serve.py'), String(PORT)], {
    cwd: join(root, 'dist'), stdio: ['ignore', 'pipe', 'ignore'],
  });
  await new Promise((ok, fail) => {
    server.on('exit', (code) => fail(new Error(`serve.py exited (${code})`)));
    server.stdout.on('data', (chunk) => { if (String(chunk).includes('Serving on')) ok(); });
  });
  return () => server.kill();
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const stop = await serve();
const chrome = await chromeLauncher.launch({
  chromePath: chromePath(),
  // No sandbox: the container drops every capability, as for the Playwright tests.
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});
mkdirSync(OUT, { recursive: true });

const failures = [];
try {
  for (const page of PAGES) {
    const url = `http://127.0.0.1:${PORT}/${page.path}`;
    const name = page.path.replace(/\/$/, '') || 'home';
    const want = { ...budgets.default, ...budgets.pages?.[name] };
    const scores = Object.fromEntries(Object.keys(want).map((k) => [k, []]));
    for (let i = 0; i < RUNS; i++) {
      const result = await lighthouse(url, {
        port: chrome.port, output: ['html', 'json'], logLevel: 'error',
        onlyCategories: Object.keys(want),
      });
      for (const k of Object.keys(want)) scores[k].push(result.lhr.categories[k].score * 100);
      if (i === RUNS - 1) {
        writeFileSync(join(OUT, `${name}.html`), result.report[0]);
        writeFileSync(join(OUT, `${name}.json`), result.report[1]);
      }
    }
    const line = Object.entries(want).map(([k, min]) => {
      const got = Math.round(median(scores[k]));
      if (got < min) failures.push(`/${page.path} ${k}: ${got} < ${min}`);
      return `${k} ${got}${got < min ? ` (budget ${min}) ✗` : ''}`;
    });
    console.log(`/${page.path}`.padEnd(16), line.join(' · '));
  }
} finally {
  await chrome.kill();
  stop();
}

console.log(`Reports: ${OUT}`);
if (failures.length) {
  console.error(`\n${failures.length} budget(s) not met:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('All Lighthouse budgets met.');
