import { test, assert } from './harness.js';
import * as F from '../../build/modules/lib/files.js';
import * as Z from '../../build/modules/lib/zip.js';
// The same openpgp.js the build bundles, from the lockfile-pinned package.
import * as pgp from '../../node_modules/openpgp/dist/openpgp.min.mjs';

const PASSWORD = 'quiet tundra mosaic lantern ripple orbit';
const enc = new TextEncoder();
const bytes = (n, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed * 7) % 251);
const streamOf = (data) => new Blob([data]).stream();
const blobBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function encryptToBlob(data, name, password = PASSWORD) {
  return F.collect(await F.encrypt(pgp, streamOf(data), name, password));
}

async function decryptToBytes(blob, password = PASSWORD) {
  const { data, name } = await F.decrypt(pgp, blob, password);
  return { data: await blobBytes(await F.collect(data)), name };
}

async function reason(promise) {
  try { await promise; } catch (e) { return F.decryptErrorReason(e); }
  return 'opened';
}

/** Reads a ZIP the way unzip does: from the central directory at the end. */
function readZip(zip) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, 'end of central directory');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, 'central directory record');
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLength = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLength));
    assert.equal(v.getUint32(local, true), 0x04034b50, `local header of ${name}`);
    assert.equal(v.getUint16(local + 8, true), 0, 'stored, not compressed');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    assert.equal(v.getUint32(start + size, true), 0x08074b50, `data descriptor of ${name}`);
    assert.equal(Z.crc32(data), crc, `CRC of ${name}`);
    files.push({ name, data, flags: v.getUint16(p + 8, true) });
    p += 46 + nameLength + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return files;
}

// ---------------------------------------------------------------- ZIP packages
test('zip: CRC-32 matches the standard check value, also over several chunks', () => {
  assert.equal(Z.crc32(enc.encode('123456789')), 0xcbf43926);
  assert.equal(Z.crc32(enc.encode('6789'), Z.crc32(enc.encode('12345'))), 0xcbf43926);
  assert.equal(Z.crc32(new Uint8Array(0)), 0);
});

test('zip: files and folders are packaged with their paths, contents and UTF-8 names', async () => {
  const entries = [
    { path: 'report.pdf', file: new Blob([bytes(70_000)]), modified: Date.UTC(2026, 9, 29, 12) },
    { path: 'photos/été/1.jpg', file: new Blob([bytes(3, 2)]) },
    { path: 'empty.txt', file: new Blob([]) },
  ];
  const zip = await blobBytes(await F.collect(Z.zipStream(entries)));
  const files = readZip(zip);
  assert.deepEqual(files.map((f) => f.name), ['report.pdf', 'photos/été/1.jpg', 'empty.txt']);
  assert.ok(sameBytes(files[0].data, bytes(70_000)), 'contents of the first file');
  assert.ok(sameBytes(files[1].data, bytes(3, 2)), 'contents of the second file');
  assert.equal(files[2].data.length, 0);
  assert.ok(files.every((f) => f.flags & 0x0800), 'names are flagged as UTF-8');
  assert.equal(zip.length, Z.zipSize(entries), 'zipSize predicts the size');
});

test('zip: paths can’t climb out of the folder they’re unpacked into', () => {
  assert.equal(Z.zipPath('../../etc/passwd'), 'etc/passwd');
  assert.equal(Z.zipPath('/abs/./file'), 'abs/file');
  assert.equal(Z.zipPath('C:\\Users\\me\\a.txt'), 'C_/Users/me/a.txt');
  assert.equal(Z.zipPath('bad\u0000name?.txt'), 'bad_name_.txt');
  assert.equal(Z.zipPath('..'), 'file');
});

test('zip: duplicate names get a number, case-insensitively', () => {
  assert.deepEqual(Z.uniquePaths(['a.txt', 'A.txt', 'a.txt', 'dir/b', 'dir/b', 'x.y/z']),
    ['a.txt', 'A (2).txt', 'a (3).txt', 'dir/b', 'dir/b (2)', 'x.y/z']);
});

// ---------------------------------------------------------------- encrypted files
test('files: one file round-trips, keeping its name', async () => {
  const data = bytes(200_000);
  const encrypted = await encryptToBlob(data, 'report.pdf');
  const out = await decryptToBytes(encrypted);
  assert.ok(sameBytes(out.data, data), 'same contents');
  assert.equal(out.name, 'report.pdf');
}, { timeout: 60000 });

test('files: the profile is the one GnuPG 2.4 reads (SEIPD v1, AES-256, strongest S2K, no compression)', async () => {
  const encrypted = await blobBytes(await encryptToBlob(bytes(1000), 'a.bin'));
  const message = await pgp.readMessage({ binaryMessage: encrypted });
  const [skesk, seipd] = message.packets;
  assert.equal(skesk.constructor.tag, pgp.enums.packet.symEncryptedSessionKey);
  assert.equal(skesk.version, 4, 'SKESK v4, not v6');
  assert.equal(skesk.sessionKeyEncryptionAlgorithm, pgp.enums.symmetric.aes256);
  assert.equal(skesk.s2k.type, 'iterated');
  assert.equal(skesk.s2k.c, 255, 'the highest iteration count');
  assert.equal(seipd.constructor.tag, pgp.enums.packet.symEncryptedIntegrityProtectedData);
  assert.equal(seipd.version, 1, 'SEIPD v1 (MDC), not AEAD');
  const literal = (await pgp.decrypt({ message, passwords: [PASSWORD], format: 'binary' })).data;
  assert.ok(sameBytes(literal, bytes(1000)), 'decrypts with openpgp.js defaults too');
}, { timeout: 60000 });

test('files: several files decrypt to a ZIP package', async () => {
  const entries = [
    { path: 'notes/a.txt', file: new Blob([enc.encode('first')]) },
    { path: 'notes/b.txt', file: new Blob([enc.encode('second')]) },
  ];
  const pkg = F.packageFiles(entries);
  assert.equal(pkg.name, F.PACKAGE_NAME);
  const encrypted = await F.collect(await F.encrypt(pgp, pkg.stream, pkg.name, PASSWORD));
  const out = await decryptToBytes(encrypted);
  assert.equal(out.name, 'files.zip');
  assert.deepEqual(readZip(out.data).map((f) => [f.name, new TextDecoder().decode(f.data)]),
    [['notes/a.txt', 'first'], ['notes/b.txt', 'second']]);
}, { timeout: 60000 });

test('files: a single file isn’t packaged', () => {
  const pkg = F.packageFiles([{ path: 'folder/only.txt', file: new Blob(['x']) }]);
  assert.equal(pkg.name, 'only.txt');
  assert.equal(pkg.size, 1);
  assert.throws(() => F.packageFiles([]));
});

test('files: a wrong password is refused as such', async () => {
  const encrypted = await encryptToBlob(bytes(1000), 'a.bin');
  assert.equal(await reason(decryptToBytes(encrypted, 'quiet tundra mosaic lantern ripple orbiT')), 'password');
}, { timeout: 60000 });

test('files: a flipped byte is detected, and nothing is returned', async () => {
  const encrypted = await blobBytes(await encryptToBlob(bytes(100_000), 'a.bin'));
  encrypted[Math.floor(encrypted.length / 2)] ^= 0x01;
  assert.equal(await reason(decryptToBytes(new Blob([encrypted]))), 'damaged');
}, { timeout: 60000 });

test('files: a cut-off file is detected', async () => {
  const encrypted = await blobBytes(await encryptToBlob(bytes(100_000), 'a.bin'));
  assert.equal(await reason(decryptToBytes(new Blob([encrypted.subarray(0, encrypted.length - 30)]))), 'damaged');
}, { timeout: 60000 });

test('files: something that isn’t OpenPGP is said to be so', async () => {
  assert.equal(await reason(F.decrypt(pgp, new Blob([bytes(5000)]), PASSWORD)), 'not-openpgp');
  assert.equal(await reason(F.decrypt(pgp, new Blob(['hello, plain text']), PASSWORD)), 'not-openpgp');
  assert.equal(await reason(F.decrypt(pgp, new Blob([]), PASSWORD)), 'not-openpgp');
});

test('files: an armored message (.asc) decrypts', async () => {
  const message = await pgp.createMessage({ binary: bytes(5000), filename: 'key.txt' });
  const armored = await pgp.encrypt({ message, passwords: [PASSWORD] });
  assert.match(armored, /^-----BEGIN PGP MESSAGE-----/);
  const out = await decryptToBytes(new Blob([armored]));
  assert.ok(sameBytes(out.data, bytes(5000)));
  assert.equal(out.name, 'key.txt');
}, { timeout: 60000 });

test('files: a compressed message (what gpg writes by default) decrypts', async () => {
  const message = await pgp.createMessage({ binary: enc.encode('compress me '.repeat(1000)), filename: 'c.txt' });
  const encrypted = await pgp.encrypt({ message, passwords: [PASSWORD], format: 'binary', config: { preferredCompressionAlgorithm: pgp.enums.compression.zlib } });
  const out = await decryptToBytes(new Blob([encrypted]));
  assert.equal(new TextDecoder().decode(out.data), 'compress me '.repeat(1000));
}, { timeout: 60000 });

test('files: a file encrypted for a key is recognised, not mistaken for a wrong password', async () => {
  const { publicKey } = await pgp.generateKey({ type: 'curve25519', userIDs: [{ name: 'Test' }], format: 'object' });
  const message = await pgp.createMessage({ binary: bytes(100) });
  const encrypted = await pgp.encrypt({ message, encryptionKeys: publicKey, format: 'binary' });
  assert.equal(await reason(F.decrypt(pgp, new Blob([encrypted]), PASSWORD)), 'public-key');
}, { timeout: 60000 });

test('files: collect() stops at its limit', async () => {
  assert.equal(await reason(F.collect(streamOf(bytes(1000)), undefined, 999)), 'too-large');
  assert.equal((await F.collect(streamOf(bytes(1000)), undefined, 1000)).size, 1000);
});

test('files: collect() folds large streams into one Blob, in order', async () => {
  const chunk = bytes(1024 * 1024);
  let n = 0;
  const stream = new ReadableStream({ pull(c) { if (n++ < 40) c.enqueue(chunk.slice()); else c.close(); } });
  const blob = await F.collect(stream);
  assert.equal(blob.size, 40 * chunk.length);
  assert.ok(sameBytes(await blobBytes(blob.slice(17 * chunk.length, 18 * chunk.length)), chunk));
});

test('files: counted() reports the bytes going through', async () => {
  const seen = [];
  await F.collect(F.counted(streamOf(bytes(10)), (n) => seen.push(n)));
  assert.equal(seen.at(-1), 10);
});

test('files: download names', () => {
  assert.equal(F.encryptedName('report.pdf'), 'report.pdf.gpg');
  assert.equal(F.decryptedName('report.pdf', 'whatever.gpg'), 'report.pdf');
  assert.equal(F.decryptedName('', 'report.pdf.gpg'), 'report.pdf');
  assert.equal(F.decryptedName('', 'notes.ASC'), 'notes');
  assert.equal(F.decryptedName('../../.bashrc', 'x.gpg'), 'bashrc');
  assert.equal(F.decryptedName('C:\\evil\\a<b>.exe', 'x.gpg'), 'a_b_.exe');
  assert.equal(F.decryptedName('', '.gpg'), 'decrypted-file');
});
