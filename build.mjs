// Reproducible build: TypeScript sources + pinned npm dependencies -> dist/ (what gets deployed).
//
//   npm run build          type-check, then build dist/ (and build/modules/ for the unit tests)
//   npm run build:check    the same, then build again into a temporary folder and fail unless
//                          every file is byte-identical (the reproducibility check CI runs)
//
// dist/ contains index.html, app.js, chunks/ (Trystero and its dependencies, from the lockfile:
// nothing is fetched from a CDN at run time), styles.css, and SHA256SUMS. The build is deterministic: same commit, same
// lockfile -> same bytes. The version shown in the app is package.json's version plus the short
// commit, read straight from .git (no git binary needed) or from $BUILD_COMMIT.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

function gitCommit() {
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;
  try {
    const head = readFileSync('.git/HEAD', 'utf8').trim();
    if (!head.startsWith('ref: ')) return head;
    const ref = head.slice(5);
    if (existsSync(join('.git', ref))) return readFileSync(join('.git', ref), 'utf8').trim();
    const packed = readFileSync('.git/packed-refs', 'utf8');
    const line = packed.split('\n').find((l) => l.endsWith(` ${ref}`));
    if (line) return line.split(' ')[0];
  } catch { /* not a git checkout */ }
  return 'unknown';
}

const commit = gitCommit().slice(0, 7);
const version = `${pkg.version}+${commit}`;

const listFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? listFiles(p) : [p];
}).sort();

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

async function buildApp(outdir) {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  await build({
    entryPoints: { app: 'src/main.ts' },
    outdir,
    // Trystero is imported lazily, so it becomes its own content-hashed chunk, loaded only by the
    // Share and Chat pages.
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: true,
    sourcemap: false,
    charset: 'utf8',
    legalComments: 'eof',
    define: { __APP_VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
  copyFileSync('src/index.html', join(outdir, 'index.html'));
  copyFileSync('assets/styles.css', join(outdir, 'styles.css'));
  const files = listFiles(outdir).filter((f) => !f.endsWith('SHA256SUMS'));
  const sums = files.map((f) => `${sha256(f)}  ${relative(outdir, f).split('\\').join('/')}`).join('\n') + '\n';
  writeFileSync(join(outdir, 'SHA256SUMS'), sums);
  return sums;
}

// The unit tests import the app's modules one by one (no bundling), as plain JavaScript.
async function buildModules(outdir) {
  rmSync(outdir, { recursive: true, force: true });
  await build({
    entryPoints: listFiles('src').filter((f) => f.endsWith('.ts')),
    outdir,
    outbase: 'src',
    bundle: false,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    define: { __APP_VERSION__: JSON.stringify(version) },
    logLevel: 'warning',
  });
}

const sums = await buildApp('dist');
await buildModules('build/modules');
console.log(`built dist/ for ${version}\n${sums}`);

if (process.argv.includes('--check')) {
  const again = mkdtempSync(join(tmpdir(), 'uss-rebuild-'));
  const second = await buildApp(again);
  rmSync(again, { recursive: true, force: true });
  if (second !== sums) {
    console.error('NOT REPRODUCIBLE: a second build produced different files:\n' + second);
    process.exit(1);
  }
  console.log('reproducible: a second build produced byte-identical files');
}
