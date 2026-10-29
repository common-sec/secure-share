// Reproducible build: TypeScript sources + pinned npm dependencies -> dist/ (what gets deployed).
//
//   npm run build          type-check, then build dist/ (and build/modules/ for the unit tests)
//   npm run build:check    the same, then build again into a temporary folder and fail unless
//                          every file is byte-identical (the reproducibility check CI runs)
//
// dist/ contains one pre-rendered page per tool and content page (index.html, chat/, passwords/,
// how-it-works/, faq/: see pages.mjs), app.js, chunks/ (Trystero and its dependencies, from the
// lockfile: nothing is fetched from a CDN at run time), styles.css, the icons and social image,
// site.webmanifest, robots.txt, sitemap.xml, and SHA256SUMS. The build is deterministic: same commit, same
// lockfile -> same bytes. The version shown in the footer is package.json's version plus the short
// commit, read straight from .git (no git binary needed) or from $BUILD_COMMIT. The footer links it
// to that commit in $BUILD_REPOSITORY (default: this project's GitHub repository), so a fork or a
// self-hosted copy points at its own source. $BUILD_SITE_URL (default: https://share.common-sec.org/)
// is the public address used by canonical URLs, social previews, robots.txt and sitemap.xml.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { writeSite } from './pages.mjs';

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

// Where this build's source lives. Part of the output, so a rebuild must use the same value.
const repository = (process.env.BUILD_REPOSITORY || 'https://github.com/common-sec/secure-share').replace(/\/+$/, '');
if (!/^https:\/\/[^\s"'<>]+$/.test(repository)) {
  console.error(`BUILD_REPOSITORY must be an https:// URL, got: ${repository}`);
  process.exit(1);
}

// The site's public address, for canonical URLs and previews. Part of the output, like the above.
const siteUrl = (process.env.BUILD_SITE_URL || 'https://share.common-sec.org/').replace(/\/*$/, '/');
if (!/^https:\/\/[^\s"'<>#?]+$/.test(siteUrl)) {
  console.error(`BUILD_SITE_URL must be an https:// URL, got: ${siteUrl}`);
  process.exit(1);
}

const define = { __REPOSITORY__: JSON.stringify(repository) };

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
    define,
    logLevel: 'warning',
  });
  writeSite(outdir, { siteUrl, version, repository });
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
    define,
    logLevel: 'warning',
  });
}

const sums = await buildApp('dist');
await buildModules('build/modules');
console.log(`built dist/ for ${version} (source: ${repository}, site: ${siteUrl})\n${sums}`);

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
