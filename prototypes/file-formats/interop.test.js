// Interoperability: what the browser libraries write must open with the reference command-line
// tools, and the other way round. Also checks that a wrong passphrase and a flipped byte are refused.
// Run: node --test interop.test.js  (needs age, age-keygen, gpg and 7z on the PATH)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ageFormat, pgpGnupg, pgpRfc9580, sevenZip } from './formats.js';

const PASS = 'quiet tundra mosaic lantern ripple orbit';
const dir = mkdtempSync(join(tmpdir(), 'formats-'));
const path = (name) => join(dir, name);
const plain = new Uint8Array(randomBytes(3 * 1024 * 1024 + 17)); // several chunks, odd size
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const withPassphrase = (times, cmd, args) => run('python3', ['-I', 'pty-pass.py', PASS, String(times), '--', cmd, ...args]);
const gpg = (args) => run('gpg', ['--homedir', path('gnupg'), '--batch', '--yes', '--pinentry-mode', 'loopback', ...args]);
run('mkdir', ['-m', '700', path('gnupg')]);

function flipMiddleByte(bytes) {
  const copy = new Uint8Array(bytes);
  copy[Math.floor(copy.length / 2)] ^= 0x01;
  return copy;
}

async function refused(promise) {
  try { await promise; } catch { return true; }
  return false;
}

for (const f of [ageFormat, pgpGnupg, pgpRfc9580, sevenZip]) {
  test(`${f.name}: round trip, wrong passphrase, tampering`, async () => {
    const enc = await f.encrypt(plain, PASS);
    assert.deepEqual(new Uint8Array(await f.decrypt(enc, PASS)), plain);
    assert.ok(await refused(f.decrypt(enc, 'wrong words entirely')), 'wrong passphrase accepted');
    assert.ok(await refused(f.decrypt(flipMiddleByte(enc), PASS)), 'flipped byte not detected');
  });
}

test('age: library → CLI and CLI → library (passphrase)', async () => {
  writeFileSync(path('a.age'), await ageFormat.encrypt(plain, PASS));
  withPassphrase(1, 'age', ['-d', '-o', path('a.out'), path('a.age')]);
  assert.deepEqual(new Uint8Array(readFileSync(path('a.out'))), plain);

  writeFileSync(path('b.bin'), plain);
  withPassphrase(2, 'age', ['-p', '-o', path('b.age'), path('b.bin')]);
  assert.deepEqual(await ageFormat.decrypt(readFileSync(path('b.age')), PASS), plain);
});

test('age: library → CLI and CLI → library (X25519 keys)', async () => {
  run('age-keygen', ['-o', path('id.txt')]);
  const identity = readFileSync(path('id.txt'), 'utf8').split('\n').find((l) => l.startsWith('AGE-SECRET-KEY-'));
  const recipient = run('age-keygen', ['-y', path('id.txt')]).toString().trim();
  writeFileSync(path('c.age'), await ageFormat.encryptToKey(plain, recipient));
  run('age', ['-d', '-i', path('id.txt'), '-o', path('c.out'), path('c.age')]);
  assert.deepEqual(new Uint8Array(readFileSync(path('c.out'))), plain);

  writeFileSync(path('d.bin'), plain);
  run('age', ['-r', recipient, '-o', path('d.age'), path('d.bin')]);
  assert.deepEqual(await ageFormat.decryptWithKey(readFileSync(path('d.age')), identity), plain);
});

test('openpgp (gpg-compatible): library → gpg and gpg → library (passphrase)', async () => {
  writeFileSync(path('e.gpg'), await pgpGnupg.encrypt(plain, PASS));
  gpg(['--passphrase', PASS, '-o', path('e.out'), '-d', path('e.gpg')]);
  assert.deepEqual(new Uint8Array(readFileSync(path('e.out'))), plain);

  writeFileSync(path('f.bin'), plain);
  gpg(['--passphrase', PASS, '--symmetric', '--cipher-algo', 'AES256', '-o', path('f.gpg'), path('f.bin')]);
  assert.deepEqual(new Uint8Array(await pgpGnupg.decrypt(readFileSync(path('f.gpg')), PASS)), plain);
});

test('openpgp (gpg-compatible): library → gpg and gpg → library (keys)', async () => {
  gpg(['--passphrase', '', '--quick-gen-key', 'Spike <spike@example.invalid>', 'ed25519', 'default', 'never']);
  gpg(['--quick-add-key', '--passphrase', '', run('gpg', ['--homedir', path('gnupg'), '--list-keys', '--with-colons']).toString().split('\n').find((l) => l.startsWith('fpr:')).split(':')[9], 'cv25519', 'encr', 'never']);
  const pub = gpg(['--armor', '--export']).toString();
  const priv = gpg(['--passphrase', '', '--armor', '--export-secret-keys']).toString();
  writeFileSync(path('g.gpg'), await pgpGnupg.encryptToKey(plain, pub));
  gpg(['-o', path('g.out'), '-d', path('g.gpg')]);
  assert.deepEqual(new Uint8Array(readFileSync(path('g.out'))), plain);

  writeFileSync(path('h.bin'), plain);
  gpg(['--trust-model', 'always', '-r', 'spike@example.invalid', '-o', path('h.gpg'), '--encrypt', path('h.bin')]);
  assert.deepEqual(new Uint8Array(await pgpGnupg.decryptWithKey(readFileSync(path('h.gpg')), priv)), plain);
});

test('openpgp (RFC 9580): GnuPG 2.4 cannot open it', async () => {
  writeFileSync(path('i.gpg'), await pgpRfc9580.encrypt(plain, PASS));
  assert.throws(() => gpg(['--passphrase', PASS, '-o', path('i.out'), '-d', path('i.gpg')]));
});

test('7z: library → 7-Zip and 7-Zip → library', async () => {
  writeFileSync(path('j.7z'), await sevenZip.encrypt(plain, PASS));
  run('7z', ['x', `-p${PASS}`, `-o${path('j')}`, '-y', path('j.7z')]);
  assert.deepEqual(new Uint8Array(readFileSync(path('j/in.bin'))), plain);
  // File names are encrypted (-mhe=on): listing without the passphrase fails.
  assert.throws(() => run('7z', ['l', '-p', path('j.7z')]));

  writeFileSync(path('k.bin'), plain);
  run('7z', ['a', '-t7z', '-mhe=on', `-p${PASS}`, path('k.7z'), path('k.bin')]);
  assert.deepEqual(new Uint8Array(await sevenZip.decrypt(readFileSync(path('k.7z')), PASS)), plain);
});
