// Symbolon's JavaScript binding (https://github.com/common-sec/symbolon): the WebAssembly library
// that seals the WebRTC offers and answers we publish on Nostr relays and signs those events.
//
// It is not on npm. The build takes it from the Symbolon release named in symbolon-web.sha256 and
// refuses it unless the tarball has exactly that SHA-256, the same pin gum0x/bringmeback uses.
// The tarball is cached in .cache/symbolon/, so later builds need no network:
//
//   node tools/symbolon/symbolon.mjs     download (if needed) and check the pinned release
//
// build.mjs imports loadSymbolon() and bundles the files it returns; nothing is fetched from
// GitHub when the site runs. To update: bump the release in symbolon-web.sha256 with the
// checksum published next to it, and read the release's changes first.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const [sha256, file] = readFileSync(join(here, 'symbolon-web.sha256'), 'utf8').trim().split(/\s+/);
const version = /^symbolon-web-(v\d+\.\d+\.\d+)\.tar\.gz$/.exec(file ?? '')?.[1];
if (!/^[0-9a-f]{64}$/.test(sha256 ?? '') || !version) throw new Error('tools/symbolon/symbolon-web.sha256 is malformed');

export const SYMBOLON_VERSION = version;
const CACHE = join(here, '..', '..', '.cache', 'symbolon', file);
const RELEASE_URL = `https://github.com/common-sec/symbolon/releases/download/${version}/${file}`;

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function tarball() {
  if (existsSync(CACHE)) {
    const cached = readFileSync(CACHE);
    if (digest(cached) === sha256) return cached;
  }
  const res = await fetch(RELEASE_URL);
  if (!res.ok) throw new Error(`could not download ${RELEASE_URL}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (digest(bytes) !== sha256) throw new Error(`${file} does not match tools/symbolon/symbolon-web.sha256: refusing it`);
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, bytes);
  return bytes;
}

/** Reads the regular files of a ustar archive (all the release tarball holds). */
function untar(tar) {
  const files = new Map();
  for (let off = 0; off + 512 <= tar.length;) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) => header.subarray(start, start + len).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join('/');
    const type = field(156, 1) || '0';
    if (type === '0') files.set(name, tar.subarray(off + 512, off + 512 + size));
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** The checked binding: its JavaScript glue and its WebAssembly module. */
export async function loadSymbolon() {
  const files = untar(gunzipSync(await tarball()));
  const js = files.get('symbolon/symbolon_wasm.js');
  const wasm = files.get('symbolon/symbolon_wasm_bg.wasm');
  if (!js || !wasm) throw new Error(`${file} does not hold the expected files`);
  return { version, js: js.toString('utf8'), wasm: Buffer.from(wasm) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { wasm } = await loadSymbolon();
  console.log(`symbolon ${version}: ${file} matches its pinned SHA-256 (wasm ${wasm.length} bytes)`);
}
